import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HumanAgent, SupportType } from '@/schema';
import { User } from '@/schema/user/user.entity';
import { Dealer } from '@/schema';
import { CreateHumanAgentDto, UpdateHumanAgentDto, SearchHumanAgentDto, HumanAgentResponseDto } from '@/humanAgent/dto';
import { AuditFileLoggerService } from '@/auditLog';

@Injectable()
export class HumanAgentService {
    constructor(
        @InjectRepository(HumanAgent)
        private readonly humanAgentRepository: Repository<HumanAgent>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Dealer)
        private readonly dealerRepository: Repository<Dealer>,
        @InjectRepository(SupportType)
        private readonly supportTypeRepository: Repository<SupportType>,
        private readonly auditFileLogger: AuditFileLoggerService,
    ) { }

    async create(createHumanAgentDto: CreateHumanAgentDto, userId: string): Promise<HumanAgentResponseDto> {
        // Normalize email
        const normalizedEmail = createHumanAgentDto.email?.toLowerCase().trim();
        if (!normalizedEmail) {
            throw new BadRequestException('Email is required');
        }

        // Resolve supportTypeId: use provided value or first active support type
        let supportTypeId = createHumanAgentDto.supportTypeId;
        if (!supportTypeId) {
            const defaultSupportType = await this.supportTypeRepository.findOne({
                where: { isActive: true },
                order: { createdAt: 'ASC' }
            });
            if (!defaultSupportType) {
                throw new BadRequestException('No support type available. Please add a support type first.');
            }
            supportTypeId = defaultSupportType.id;
        } else {
            const supportType = await this.supportTypeRepository.findOne({
                where: { id: supportTypeId, isActive: true }
            });
            if (!supportType) {
                throw new BadRequestException('Invalid or inactive support type');
            }
        }

        // Validate dealer
        const dealer = await this.dealerRepository.findOne({
            where: { id: createHumanAgentDto.dealerId }
        });

        if (!dealer) {
            throw new BadRequestException('Dealer not found');
        }

        // Validate user
        const user = await this.userRepository.findOne({
            where: { id: userId }
        });

        if (!user) {
            throw new BadRequestException('User not found');
        }

        try {
            const humanAgent = this.humanAgentRepository.create({
                ...createHumanAgentDto,
                supportTypeId,
                email: normalizedEmail,
                userId,
            });

            const savedAgent = await this.humanAgentRepository.save(humanAgent);
            const created = await this.findOne(savedAgent.id);
            this.auditFileLogger.logHumanAgent({
                action: 'CREATE',
                userId,
                entityId: created.id,
                after: created,
            });
            return created;
        } catch (error) {
            if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
                throw new BadRequestException('Human agent with this Email already exists');
            }
            throw error;
        }
    }

    async findAll(): Promise<HumanAgentResponseDto[]> {
        return await this.humanAgentRepository.find({
            where: { isActive: true },
            relations: ['dealer', 'user', 'supportType'],
            order: { createdAt: 'DESC' },
        });
    }

    async findOne(id: string): Promise<HumanAgentResponseDto> {
        const humanAgent = await this.humanAgentRepository.findOne({
            where: { id },
            relations: ['dealer', 'user', 'supportType'],
        });
        
        if (!humanAgent) {
            throw new NotFoundException('Human agent not found');
        }
        
        return humanAgent;
    }

    async update(id: string, updateHumanAgentDto: UpdateHumanAgentDto): Promise<HumanAgentResponseDto> {
        const humanAgent = await this.findOne(id);
        const before = { ...humanAgent };

        // Validate dealer if provided
        if (updateHumanAgentDto.dealerId) {
            const dealer = await this.dealerRepository.findOne({ 
                where: { id: updateHumanAgentDto.dealerId } 
            });
            if (!dealer) {
                throw new BadRequestException('Dealer not found');
            }
        }

        // Validate supportType if provided
        if (updateHumanAgentDto.supportTypeId) {
            const supportType = await this.supportTypeRepository.findOne({
                where: { 
                    id: updateHumanAgentDto.supportTypeId,
                    isActive: true
                }
            });
            if (!supportType) {
                throw new BadRequestException('Invalid or inactive support type');
            }
        }

        if (updateHumanAgentDto.email) {
            const normalizedEmail = updateHumanAgentDto.email.toLowerCase().trim();
            if (normalizedEmail !== humanAgent.email.toLowerCase().trim()) {
                updateHumanAgentDto.email = normalizedEmail;
            }
        }

        await this.humanAgentRepository.update(id, updateHumanAgentDto);
        const updated = await this.findOne(id);
        this.auditFileLogger.logHumanAgent({
            action: 'UPDATE',
            entityId: id,
            before,
            after: updated,
        });
        return updated;
    }

    async remove(id: string): Promise<{ message: string }> {
        const humanAgent = await this.humanAgentRepository.findOne({ where: { id } });

        if (!humanAgent) {
            throw new NotFoundException('Human agent not found');
        }

        const before = { ...humanAgent };
        await this.humanAgentRepository.delete(id);
        this.auditFileLogger.logHumanAgent({
            action: 'DELETE',
            entityId: id,
            before,
        });
        return { message: 'Human agent deleted successfully' };
    }

    async updateAvailability(id: string, isAvailable: boolean): Promise<{ message: string }> {
        const humanAgent = await this.humanAgentRepository.findOne({ where: { id } });
        
        if (!humanAgent) {
            throw new NotFoundException('Human agent not found');
        }

        const before = { isAvailable: humanAgent.isAvailable };
        await this.humanAgentRepository.update(id, { isAvailable });
        this.auditFileLogger.logHumanAgent({
            action: 'AVAILABILITY_TOGGLE',
            entityId: id,
            before,
            after: { isAvailable },
        });
        return { message: `Human agent is now ${isAvailable ? 'available' : 'unavailable'}` };
    }

    async search(searchDto: SearchHumanAgentDto): Promise<HumanAgentResponseDto[]> {
        const queryBuilder = this.humanAgentRepository.createQueryBuilder('agent')
            .leftJoinAndSelect('agent.dealer', 'dealer')
            .leftJoinAndSelect('agent.user', 'user')
            .leftJoinAndSelect('agent.supportType', 'supportType')
            .where('agent.isActive = :isActive', { isActive: true })
            .andWhere('agent.isAvailable = :isAvailable', { isAvailable: true });

        if (searchDto.query && searchDto.query.trim() !== '') {
            const term = `%${searchDto.query.trim().toLowerCase()}%`;
            queryBuilder.andWhere(
                '(LOWER(agent.agentName) LIKE :term OR LOWER(agent.email) LIKE :term OR LOWER(agent.phone) LIKE :term)',
                { term }
            );
        }

        queryBuilder.orderBy('agent.agentName', 'ASC');
        return await queryBuilder.getMany();
    }
}