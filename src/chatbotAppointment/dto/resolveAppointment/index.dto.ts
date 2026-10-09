import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  APPOINTMENT_DEPARTMENT_VALUES,
  type AppointmentDepartment,
} from '@/types/chatbotAppointment';

const MAX_SLOT_LENGTH = 500;

/** Raw appointment slots as extracted by intent classification. */
export class AppointmentSlotsDto {
  @ApiPropertyOptional({ description: 'Date phrase, e.g. "next week"' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SLOT_LENGTH)
  dateText?: string;

  @ApiPropertyOptional({ description: 'Time phrase, e.g. "morning", "3pm"' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SLOT_LENGTH)
  timeText?: string;

  @ApiPropertyOptional({ description: 'Team as written, e.g. "sales team"' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SLOT_LENGTH)
  departmentText?: string;

  @ApiPropertyOptional({ description: 'Facility or site as written' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SLOT_LENGTH)
  facilityText?: string;

  @ApiPropertyOptional({ description: 'Reason for the meeting' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SLOT_LENGTH)
  natureOfRequest?: string;

  @ApiPropertyOptional({ description: 'Phone number as written' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactText?: string;
}

/** Answers gathered across clarifying turns. */
export class AppointmentOverridesDto {
  @ApiPropertyOptional({ description: 'ISO YYYY-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'preferredDate must be in YYYY-MM-DD format',
  })
  preferredDate?: string;

  @ApiPropertyOptional({ description: '24h HH:MM' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'preferredTime must be in HH:MM (24h) format',
  })
  preferredTime?: string;

  @ApiPropertyOptional({ enum: APPOINTMENT_DEPARTMENT_VALUES })
  @IsOptional()
  @IsIn(APPOINTMENT_DEPARTMENT_VALUES, {
    message: 'department must be sales, service, account, or support',
  })
  department?: AppointmentDepartment;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  careFacilityLocation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SLOT_LENGTH)
  natureOfRequest?: string;

  @ApiPropertyOptional({ description: 'Number the team should call back on' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactNumber?: string;
}

export class ResolveAppointmentDto {
  @ApiPropertyOptional({
    description:
      'Number already on file for a signed-in user, offered for confirmation',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  registeredContact?: string;

  @ApiProperty({ type: AppointmentSlotsDto })
  @ValidateNested()
  @Type((): typeof AppointmentSlotsDto => AppointmentSlotsDto)
  slots!: AppointmentSlotsDto;

  @ApiPropertyOptional({
    description: 'IANA timezone of the user',
    default: 'UTC',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional({ type: AppointmentOverridesDto })
  @IsOptional()
  @ValidateNested()
  @Type((): typeof AppointmentOverridesDto => AppointmentOverridesDto)
  overrides?: AppointmentOverridesDto;
}
