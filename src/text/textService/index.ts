import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Text } from '@/schema';
import { CreateTextDto, UpdateTextDto } from '@/text/dto';
import { IText, ITextService } from '@/types';

@Injectable()
export class TextService implements ITextService {
    constructor(
        @InjectRepository(Text)
        private readonly textRepository: Repository<Text>,
    ) {}

    async create(createData: CreateTextDto & { userId: string }): Promise<IText> {
        const text = this.textRepository.create(createData);
        const savedText = await this.textRepository.save(text);
        return savedText as IText;
    }

    async findAll(userId: string): Promise<IText[]> {
        return await this.textRepository.find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
    }

    async update(id: string, updateData: UpdateTextDto, userId: string): Promise<IText> {
        const text = await this.textRepository.findOne({
            where: { id },
        });

        if (!text) {
            throw new NotFoundException(`Text with ID ${id} not found`);
        }

        if (text.userId !== userId) {
            throw new ForbiddenException('You do not have permission to access this text');
        }

        Object.assign(text, updateData);

        return await this.textRepository.save(text);
    }

    async delete(id: string, userId: string): Promise<void> {
        const text = await this.textRepository.findOne({
            where: { id },
        });

        if (!text) {
            throw new NotFoundException(`Text with ID ${id} not found`);
        }

        if (text.userId !== userId) {
            throw new ForbiddenException('You do not have permission to delete this text');
        }

        await this.textRepository.remove(text);
    }
}