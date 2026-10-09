import { IsString, IsOptional, IsArray, IsUUID, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AgentAssignmentDto {
  @IsUUID()
  humanAgentId: string;

  @IsString()
  priority: string;
}

export class CreateCareFacilityDto {
  @IsString()
  facilityCode: string;

  @IsString()
  facilityName: string;

  @IsString()
  reseller: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentAssignmentDto)
  agentAssignments?: AgentAssignmentDto[];

  @IsUUID()
  userId: string;
}