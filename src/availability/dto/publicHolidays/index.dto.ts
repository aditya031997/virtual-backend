// public-holidays.dto.ts
import {
   IsString,
   IsBoolean,
   IsOptional,
   IsUUID,
   Matches,
  IsDateString
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PartialType, OmitType } from '@nestjs/swagger';

export class CreatePublicHolidayDto {
  @IsString()
  holidayName: string;

  @IsDateString({}, { message: 'startDate must be a valid date in YYYY-MM-DD format' })
  startDate: Date;

  @IsDateString({}, { message: 'endDate must be a valid date in YYYY-MM-DD format' })
  endDate: Date;

  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/, {
    message: 'startTime must be in HH:mm or HH:mm:ss format (e.g., 08:00, 18:30:45)'
  })
  @Transform(({ value }) => value || '00:00')
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/, {
    message: 'endTime must be in HH:mm or HH:mm:ss format (e.g., 08:00, 18:30:45)'
  })
  @Transform(({ value }) => value || '23:59')
  endTime?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value !== undefined ? value : true)
  isActive?: boolean;

  @IsUUID(4, { message: 'userId must be a valid UUID' })
  userId: string;
}

export class UpdatePublicHolidayDto extends PartialType(
  OmitType(CreatePublicHolidayDto, ['userId'] as const)
) {}

export class PublicHolidayResponseDto {
  id: string;
  holidayName: string;
  startDate: Date;
  endDate: Date;
  startTime?: string;
  endTime?: string;
  isActive: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}