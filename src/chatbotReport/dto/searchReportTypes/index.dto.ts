import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Query for the report-type picker.
 *
 * Paginated and searchable even though the catalogue is currently small, so the
 * widget contract does not have to change as templates are added.
 */
export class SearchReportTypesDto {
  @ApiPropertyOptional({ description: 'Free text matched against the label' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: '1-based page number', default: 1 })
  @IsOptional()
  @Type((): NumberConstructor => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Page size (max 100)', default: 50 })
  @IsOptional()
  @Type((): NumberConstructor => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
