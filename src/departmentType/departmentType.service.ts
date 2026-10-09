
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentType } from '@/schema';
import { CreateDepartmentTypeDto } from '@/departmentType/dto/createDepartment.dto';
import { UpdateDepartmentTypeDto } from '@/departmentType/dto/updateDepartment.dto';

@Injectable()
export class DepartmentTypeService {
  constructor(
    @InjectRepository(DepartmentType)
    private readonly departmentTypeRepository: Repository<DepartmentType>,
  ) {}

  async create(createDepartmentTypeDto: CreateDepartmentTypeDto): Promise<DepartmentType> {
    // Check if department type with same name already exists
    const existingType = await this.departmentTypeRepository.findOne({
      where: { name: createDepartmentTypeDto.name },
    });

    if (existingType) {
      throw new ConflictException('Department type with this name already exists');
    }

    const departmentType = this.departmentTypeRepository.create(createDepartmentTypeDto);
    return await this.departmentTypeRepository.save(departmentType);
  }

  async findAll(): Promise<DepartmentType[]> {
    return await this.departmentTypeRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<DepartmentType> {
    const departmentType = await this.departmentTypeRepository.findOne({
      where: { id },
    });

    if (!departmentType) {
      throw new NotFoundException('Department type not found');
    }

    return departmentType;
  }

  async update(id: string, updateDepartmentTypeDto: UpdateDepartmentTypeDto): Promise<DepartmentType> {
    const departmentType = await this.findOne(id);

    // Check for name conflict if name is being updated
    if (updateDepartmentTypeDto.name && updateDepartmentTypeDto.name !== departmentType.name) {
      const existingType = await this.departmentTypeRepository.findOne({
        where: { name: updateDepartmentTypeDto.name },
      });

      if (existingType) {
        throw new ConflictException('Department type with this name already exists');
      }
    }

    await this.departmentTypeRepository.update(id, updateDepartmentTypeDto);
    return await this.findOne(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const departmentType = await this.findOne(id);
    
    // Instead of hard delete, set isActive to false
    await this.departmentTypeRepository.update(id, { isActive: false });
    
    return { message: 'Department type deactivated successfully' };
  }
}