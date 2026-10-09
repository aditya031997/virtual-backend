import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Link } from '@/schema';
import { CreateLinkDto, UpdateLinkDto } from '@/links/dto';
import { ILink, ILinkService } from '@/types';

@Injectable()
export class LinkService implements ILinkService {
    constructor(
        @InjectRepository(Link)
        private readonly linkRepository: Repository<Link>,
    ) { }

    async create(createData: CreateLinkDto & { userId: string }): Promise<ILink> {
        const link = this.linkRepository.create(createData);
        const savedLink = await this.linkRepository.save(link);
        return savedLink as ILink;
    }

    async findAll(userId: string): Promise<ILink[]> {
        return await this.linkRepository.find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
    }

    async findById(id: string, userId: string): Promise<ILink> {
        const link = await this.linkRepository.findOne({
            where: { id },
        });

        if (!link) {
            throw new NotFoundException(`Link with ID ${id} not found`);
        }

        if (link.userId !== userId) {
            throw new ForbiddenException('You do not have permission to access this link');
        }

        return link;
    }

    async update(id: string, updateData: UpdateLinkDto, userId: string): Promise<ILink> {
        const link = await this.findById(id, userId);
        Object.assign(link, updateData);
        return await this.linkRepository.save(link);
    }

    async delete(id: string, userId: string): Promise<void> {
        // Verify the link exists and user has permission
        await this.findById(id, userId);
        
        // Delete using the ID
        const result = await this.linkRepository.delete(id);
        
        // Verify deletion was successful
        if (result.affected === 0) {
            throw new NotFoundException(`Failed to delete link with ID ${id}`);
        }
    }
}