import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DepartmentTypeService } from '@/departmentType/departmentType.service';
import { CreateDepartmentTypeDto } from '@/departmentType/dto/createDepartment.dto';
import { UpdateDepartmentTypeDto } from '@/departmentType/dto/updateDepartment.dto';
import { DepartmentTypeResponseDto } from '@/departmentType/dto/department-type-response.dto';
import { AuthGuard } from '@/common/guards/auth.guard';

@Controller('department')
@UseGuards(AuthGuard)
export class DepartmentTypeController {
  constructor(private readonly departmentTypeService: DepartmentTypeService) {}

  @Post('add')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDepartmentTypeDto: CreateDepartmentTypeDto): Promise<DepartmentTypeResponseDto> {
    return await this.departmentTypeService.create(createDepartmentTypeDto);
  }

  @Get('allDepartment')
  @HttpCode(HttpStatus.OK)
  async getAll(): Promise<DepartmentTypeResponseDto[]> {
    return await this.departmentTypeService.findAll();
  }

  @Get('DepartmentById/:id')
  @HttpCode(HttpStatus.OK)
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<DepartmentTypeResponseDto> {
    return await this.departmentTypeService.findOne(id);
  }

  @Patch('updateDepartment/:id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDepartmentTypeDto: UpdateDepartmentTypeDto,
  ): Promise<DepartmentTypeResponseDto> {
    return await this.departmentTypeService.update(id, updateDepartmentTypeDto);
  }

  @Delete('deleteDepartment/:id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return await this.departmentTypeService.remove(id);
  }
}