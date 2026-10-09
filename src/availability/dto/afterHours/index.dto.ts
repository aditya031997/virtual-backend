import {
  IsString,
  IsBoolean,
  IsOptional,
  IsUUID,
  IsIn,
  Matches,
  ValidateNested,
  IsArray,
  IsNotEmpty
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType, OmitType } from '@nestjs/swagger';

export class CreateAfterHoursDto {
  @IsString()
  @IsIn(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  dayOfWeek: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime must be in HH:mm format (e.g., 08:00, 18:30)'
  })
  startTime: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime must be in HH:mm format (e.g., 08:00, 18:30)'
  })
  endTime: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsUUID(4, { message: 'userId must be a valid UUID' })
  userId: string;
}

export class UpdateAfterHoursDto extends PartialType(
  OmitType(CreateAfterHoursDto, ['userId'] as const)
) {}

export class ToggleAfterHoursAvailabilityDto {
  @IsBoolean()
  @IsNotEmpty()
  isAvailable: boolean;

  @IsString()
  @IsOptional()
  @IsIn(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  dayOfWeek?: string;
}

export class AfterHoursResponseDto {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class SmartAfterHoursItemDto {
  @IsOptional()
  @IsUUID(4, { message: 'id must be a valid UUID' })
  id?: string;

  @IsString()
  @IsIn(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  dayOfWeek: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime must be in HH:mm format (e.g., 08:00, 18:30)'
  })
  startTime: string;

  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime must be in HH:mm format (e.g., 08:00, 18:30)'
  })
  endTime: string;

  @IsBoolean()
  isAvailable: boolean;
}

export class BulkUpdateAfterHoursDto {
  @IsOptional()
  @IsUUID(4, { message: 'userId must be a valid UUID' })
  userId?: string;

  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SmartAfterHoursItemDto)
  schedules: SmartAfterHoursItemDto[];
}