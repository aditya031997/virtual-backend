import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Dealer } from '@/schema';
import { IDealerService, IDealer, ICreateDealerData, IUpdateDealerData } from '@/types';
import { AuditFileLoggerService } from '@/auditLog';

@Injectable()
export class DealerService implements IDealerService {
  constructor(
    @InjectRepository(Dealer)
    private readonly dealerRepository: Repository<Dealer>,
    private readonly auditFileLogger: AuditFileLoggerService,
  ) { }

  private generateDealerCode(): string {
    const code = Math.floor(1000 + Math.random() * 9000);
    return code.toString();
  }

  async create(createData: ICreateDealerData & { userId: string }): Promise<IDealer> {
    try {
      // Convert email to lowercase before saving
      if (createData.email) {
        createData.email = createData.email.toLowerCase().trim();
      }

      if (!createData.dealerCode) {
        createData.dealerCode = this.generateDealerCode();
      }

      const dealer = this.dealerRepository.create(createData);
      const savedDealer = await this.dealerRepository.save(dealer);
      this.auditFileLogger.logDealer({
        action: 'CREATE',
        userId: createData.userId,
        entityId: savedDealer.id,
        after: savedDealer as unknown as Record<string, unknown>,
      });
      return savedDealer as IDealer;
    } catch (error) {
      // If it's already a ConflictException from email validation, re-throw it
      if (error instanceof ConflictException) {
        throw error;
      }
      
      if (error.code === '23505') {
        // Check both constraint name and detail message
        const constraintName = error.constraint || '';
        const errorDetail = error.detail || '';

        if (constraintName.includes('email') || errorDetail.toLowerCase().includes('email')) {
          throw new ConflictException('Dealer with this Email already exists. Please use a different Email address.');
        }
        throw new ConflictException('A unique constraint violation occurred');
      }
      throw error;
    }
  }

  async findAll(): Promise<IDealer[]> {
    const dealers = await this.dealerRepository.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
    return dealers as IDealer[];
  }

  async search(params: { query?: string; name?: string; email?: string; dealerCode?: string }): Promise<IDealer[]> {
    const { query, name, email, dealerCode } = params;
    const queryBuilder = this.dealerRepository.createQueryBuilder('dealer')
      .leftJoinAndSelect('dealer.user', 'user')
      .orderBy('dealer.createdAt', 'DESC');

    if (query) {
      queryBuilder.where(
        'LOWER(dealer.dealerName) LIKE LOWER(:query) OR LOWER(dealer.email) LIKE LOWER(:query) OR LOWER(dealer.dealerCode) LIKE LOWER(:query)',
        { query: `%${query}%` }
      );
    } else {
      const conditions: string[] = [];
      const parameters: Record<string, string> = {};

      if (name) {
        conditions.push('LOWER(dealer.dealerName) LIKE LOWER(:name)');
        parameters.name = `%${name}%`;
      }

      if (email) {
        conditions.push('LOWER(dealer.email) LIKE LOWER(:email)');
        parameters.email = `%${email}%`;
      }

      if (dealerCode) {
        conditions.push('LOWER(dealer.dealerCode) LIKE LOWER(:dealerCode)');
        parameters.dealerCode = `%${dealerCode}%`;
      }

      if (conditions.length > 0) {
        queryBuilder.where(conditions.join(' AND '), parameters);
      }
    }

    const dealers = await queryBuilder.getMany();
    return dealers as IDealer[];
  }

  async findOne(id: string): Promise<IDealer> {
    const dealer = await this.dealerRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!dealer) {
      throw new NotFoundException(`Dealer with ID ${id} not found`);
    }

    return dealer as IDealer;
  }

  async findByDealerCode(dealerCode: string): Promise<IDealer> {
    const dealer = await this.dealerRepository.findOne({
      where: { dealerCode },
      relations: ['user'],
    });

    if (!dealer) {
      throw new NotFoundException(`Dealer with code ${dealerCode} not found`);
    }

    return dealer as IDealer;
  }

  async update(id: string, updateData: IUpdateDealerData): Promise<IDealer> {
    const dealer = await this.dealerRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!dealer) {
      throw new NotFoundException(`Dealer with ID ${id} not found`);
    }

    const before = { ...dealer };

    try {
      if (updateData.email && updateData.email.toLowerCase().trim() !== dealer.email.toLowerCase().trim()) {
        updateData.email = updateData.email.toLowerCase().trim();
      }

      Object.assign(dealer, updateData);
      const updatedDealer = await this.dealerRepository.save(dealer);
      this.auditFileLogger.logDealer({
        action: 'UPDATE',
        entityId: id,
        before,
        after: updatedDealer as unknown as Record<string, unknown>,
      });
      return updatedDealer as IDealer;
    } catch (error) {
      // If it's already a ConflictException from email validation, re-throw it
      if (error instanceof ConflictException) {
        throw error;
      }
      
      if (error.code === '23505') {
        if (error.constraint?.includes('email')) {
          throw new ConflictException('Email already exists');
        }
        throw new ConflictException('A unique constraint violation occurred');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<{ message: string }> {
    const dealer = await this.dealerRepository.findOne({
      where: { id },
      // Load relations to get counts for the success message (optional)
      relations: ['humanAgents', 'sites']
    });

    if (!dealer) {
      throw new NotFoundException(`Dealer with ID ${id} not found`);
    }

    try {
      const before = { ...dealer };
      // The cascade delete will automatically remove all associated human agents and sites
      await this.dealerRepository.remove(dealer);
      this.auditFileLogger.logDealer({
        action: 'DELETE',
        entityId: id,
        before,
      });

      return {
        message: `Dealer ${dealer.dealerCode} deleted successfully along with ${dealer.humanAgents?.length || 0} agent(s) and ${dealer.sites?.length || 0} site(s)`
      };
    } catch (error) {
      throw error;
    }
  }
}