import { PartialType } from '@nestjs/swagger';
import { CreateDepartmentTypeDto } from '@/departmentType/dto/createDepartment.dto';

export class UpdateDepartmentTypeDto extends PartialType(CreateDepartmentTypeDto) {}
