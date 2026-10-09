import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const agentQueryApi = {
  description: 'Agent query: JSON array or stringified JSON (same shape as transfer-call)',
};

export type AgentQueryInput = Array<{
  contactNumber: string;
  priority?: number | string;
  priorityIndex?: number;
  name?: string;
}> | string;

/** All fields optional on create; omitted values are stored as null. query_status defaults to pending. */
export class CreateUserTransferQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  current_call_sid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conversation_id?: string;

  @ApiPropertyOptional(agentQueryApi)
  @IsOptional()
  agent_query?: AgentQueryInput;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caller_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caller_email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caller_phone?: string;

  @ApiPropertyOptional({
    description:
      'Alternate callback number provided by the user during the conversation. Send only when the user explicitly gave a different number; otherwise omit.',
  })
  @IsOptional()
  @IsString()
  call_back_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caller_query?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  site_name?: string;
}

export class UpdateUserTransferQueryStatusDto {
  @ApiProperty({ enum: ['pending', 'resolved', 'escalated'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['pending', 'resolved', 'escalated'])
  query_status: 'pending' | 'resolved' | 'escalated';
}

/** Partial update: only send fields to change. */
export class UpdateUserTransferQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'resolved', 'escalated'] })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'resolved', 'escalated'])
  query_status?: 'pending' | 'resolved' | 'escalated';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  current_call_sid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conversation_id?: string;

  @ApiPropertyOptional(agentQueryApi)
  @IsOptional()
  agent_query?: AgentQueryInput;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caller_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caller_email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caller_phone?: string;

  @ApiPropertyOptional({
    description:
      'Alternate callback number provided by the user during the conversation. Send only when the user explicitly gave a different number; otherwise omit.',
  })
  @IsOptional()
  @IsString()
  call_back_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caller_query?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  site_name?: string;
}
