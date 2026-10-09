import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FAQ } from '@/schema';
import { CreateFaqDto, UpdateFaqDto, FaqQueryDto } from '@/FAQ/dto';
import { IFaq } from '@/types';

@Injectable()
export class FaqService {
    constructor(
        @InjectRepository(FAQ)
        private readonly faqRepository: Repository<FAQ>,
    ) { }

    async create(createFaqDto: CreateFaqDto & { userId: string }): Promise<FAQ> {
        const faq = this.faqRepository.create(createFaqDto);
        return await this.faqRepository.save(faq);
    }

    async findByFolder(folderId: string, userId: string): Promise<IFaq[]> {
        const faqs = await this.faqRepository.find({
            where: {
                folderId,
                userId,
            },
            order: {
                createdAt: 'DESC',
            },
        });

        return faqs;
    }

    async findByDocument(documentId: string, userId: string): Promise<IFaq[]> {
        const faqs = await this.faqRepository.find({
            where: {
                documentId,
                userId,
            },
            order: {
                createdAt: 'DESC',
            },
        });

        return faqs;
    }

    async findAll(userId: string): Promise<FAQ[]> {
        return await this.faqRepository.find({
            where: { userId },
            relations: ['folder'],
            order: { createdAt: 'DESC' },
        });
    }

    async findById(id: string, userId: string): Promise<FAQ> {
        const faq = await this.faqRepository.findOne({
            where: { id },
            relations: ['folder'],
        });

        if (!faq) {
            throw new NotFoundException(`FAQ with ID ${id} not found`);
        }

        if (faq.userId !== userId) {
            throw new ForbiddenException('You do not have permission to access this FAQ');
        }

        return faq;
    }

    async update(id: string, updateFaqDto: UpdateFaqDto, userId: string): Promise<FAQ> {
        const faq = await this.findById(id, userId);

        Object.assign(faq, updateFaqDto);

        return await this.faqRepository.save(faq);
    }

    async delete(id: string, userId: string): Promise<void> {
        await this.findById(id, userId);
        await this.faqRepository.delete({ id });
    }
}