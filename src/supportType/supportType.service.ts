import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportType } from '@/schema';
import { CreateSupportTypeDto } from '@/supportType/dto/createSupport.dto';
import { UpdateSupportTypeDto } from '@/supportType/dto/updateSupport.dto';

@Injectable()
export class SupportTypeService {
  constructor(
    @InjectRepository(SupportType)
    private readonly supportTypeRepository: Repository<SupportType>,
  ) {}

  async create(createSupportTypeDto: CreateSupportTypeDto): Promise<SupportType> {
    // Check if support type with same name already exists
    const existingType = await this.supportTypeRepository.findOne({
      where: { name: createSupportTypeDto.name },
    });

    if (existingType) {
      throw new ConflictException('Support type with this name already exists');
    }

    const supportType = this.supportTypeRepository.create(createSupportTypeDto);
    return await this.supportTypeRepository.save(supportType);
  }

  async findAll(): Promise<SupportType[]> {
    return await this.supportTypeRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<SupportType> {
    const supportType = await this.supportTypeRepository.findOne({
      where: { id },
    });

    if (!supportType) {
      throw new NotFoundException('Support type not found');
    }

    return supportType;
  }

  async update(id: string, updateSupportTypeDto: UpdateSupportTypeDto): Promise<SupportType> {
    const supportType = await this.findOne(id);

    // Check for name conflict if name is being updated
    if (updateSupportTypeDto.name && updateSupportTypeDto.name !== supportType.name) {
      const existingType = await this.supportTypeRepository.findOne({
        where: { name: updateSupportTypeDto.name },
      });

      if (existingType) {
        throw new ConflictException('Support type with this name already exists');
      }
    }

    await this.supportTypeRepository.update(id, updateSupportTypeDto);
    return await this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const supportType = await this.findOne(id);
    
    // Instead of hard delete, set isActive to false
    await this.supportTypeRepository.update(id, { isActive: false });
    
    return { message: 'Support type deactivated successfully' };
  }
}