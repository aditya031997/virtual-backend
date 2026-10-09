import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateCareFacilityDto, AgentAssignmentDto } from '@/careFacility/dto/CreateCareFacilityDto';
import { IsBoolean, IsOptional } from 'class-validator';

// Re-export AgentAssignmentDto for use in other files
export { AgentAssignmentDto };

export class UpdateCareFacilityDto extends PartialType(
  OmitType(CreateCareFacilityDto, ['userId'] as const)
) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}