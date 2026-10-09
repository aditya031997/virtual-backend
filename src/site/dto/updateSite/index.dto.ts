import { PartialType } from '@nestjs/swagger';
import { CreateSiteDto } from '@/site/dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSiteDto extends PartialType(CreateSiteDto) {
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}