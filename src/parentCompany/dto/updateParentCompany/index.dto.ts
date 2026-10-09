import { PartialType } from '@nestjs/swagger';
import { CreateParentCompanyDto } from '@/parentCompany/dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateParentCompanyDto extends PartialType(CreateParentCompanyDto) {
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
