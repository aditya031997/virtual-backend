import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { REPORT_TYPE, type ReportType } from '@/types/chatbotReport';

const MAX_SLOT_LENGTH = 200;
const MAX_IDS = 50;

/** Report type values accepted from the client. */
const REPORT_TYPE_VALUES: readonly ReportType[] = Object.values(REPORT_TYPE);

/**
 * Raw slots as extracted by intent classification. All free text — never ids.
 */
export class ReportSlotsDto {
  @ApiPropertyOptional({
    description: 'What the user asked for, in their words',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SLOT_LENGTH)
  reportDescription?: string;

  @ApiPropertyOptional({ description: 'Date phrase, e.g. "last 30 days"' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SLOT_LENGTH)
  dateRangeText?: string;

  @ApiPropertyOptional({ description: 'Location as written, e.g. "Wing A"' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SLOT_LENGTH)
  locationText?: string;

  @ApiPropertyOptional({ description: 'Alarm type as written' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SLOT_LENGTH)
  alarmTypeText?: string;

  @ApiPropertyOptional({ description: 'Shift as written' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SLOT_LENGTH)
  shiftText?: string;

  @ApiPropertyOptional({ description: 'Duration filter as written' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SLOT_LENGTH)
  durationText?: string;

  @ApiPropertyOptional({ description: 'Requested output format as written' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SLOT_LENGTH)
  fileFormatText?: string;
}

/**
 * Answers collected over clarifying turns.
 *
 * Ids here are echoed back from candidates this API previously offered, so they
 * are validated for shape and then re-checked against real site data during
 * resolution.
 */
export class ReportOverridesDto {
  @ApiPropertyOptional({ enum: REPORT_TYPE_VALUES })
  @IsOptional()
  @IsInt()
  @IsIn(REPORT_TYPE_VALUES, { message: 'type must be a valid report type' })
  type?: ReportType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  locationIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  alarmTypeIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  shiftIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  clientIds?: string[];

  @ApiPropertyOptional({ description: 'Explicit ISO-8601 UTC start' })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Explicit ISO-8601 UTC end' })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @ApiPropertyOptional({ minimum: 60 })
  @IsOptional()
  @IsInt()
  @Min(60)
  thresholdSeconds?: number;

  @ApiPropertyOptional({ minimum: 60 })
  @IsOptional()
  @IsInt()
  @Min(60)
  targetASeconds?: number;

  @ApiPropertyOptional({ minimum: 60 })
  @IsOptional()
  @IsInt()
  @Min(60)
  targetBSeconds?: number;
}

export class ResolveReportDto {
  @ApiProperty({ description: 'Site the report is for' })
  @IsString()
  @MinLength(1, { message: 'siteId is required' })
  @MaxLength(100)
  siteId!: string;

  @ApiProperty({ type: ReportSlotsDto })
  @ValidateNested()
  @Type((): typeof ReportSlotsDto => ReportSlotsDto)
  slots!: ReportSlotsDto;

  @ApiPropertyOptional({
    description: 'IANA timezone of the user, e.g. "Australia/Sydney"',
    default: 'UTC',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional({ type: ReportOverridesDto })
  @IsOptional()
  @ValidateNested()
  @Type((): typeof ReportOverridesDto => ReportOverridesDto)
  overrides?: ReportOverridesDto;
}

export { MAX_IDS };
