import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepartmentTypeService } from '@/departmentType/departmentType.service';
import { DepartmentTypeController } from '@/departmentType/departmentType.controller';
import { DepartmentType } from '@/schema';

@Module({
  imports: [TypeOrmModule.forFeature([DepartmentType])],
  controllers: [DepartmentTypeController],
  providers: [DepartmentTypeService],
  exports: [DepartmentTypeService],
})
export class DepartmentTypeModule {}
