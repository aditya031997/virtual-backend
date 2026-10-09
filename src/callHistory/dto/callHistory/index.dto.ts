import { IsString, IsNotEmpty, IsDateString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCallHistoryDto {
  @ApiPropertyOptional({ description: 'Conversation ID from ElevenLabs' })
  @IsOptional()
  @IsString()
  conversationId?: string | null;

  @ApiPropertyOptional({ description: 'Name of the caller' })
  @IsOptional()
  @IsString()
  callerName?: string | null;

  @ApiPropertyOptional({ description: 'Phone number of the caller' })
  @IsOptional()
  @IsString()
  phoneNumber?: string | null;

  @ApiProperty({ description: 'Date and time of the call' })
  @IsDateString()
  @IsNotEmpty()
  callDateTime: string;

  @ApiPropertyOptional({ description: 'Duration of the call' })
  @IsOptional()
  @IsString()
  duration?: string | null;

  @ApiPropertyOptional({ description: 'Whether the call was made after hours' })
  @IsOptional()
  @IsString()
  afterHours?: string | null;

  @ApiPropertyOptional({ description: 'Status of the call' })
  @IsOptional()
  @IsString()
  callStatus?: string | null;

  @ApiPropertyOptional({ description: 'Facility associated with the call' })
  @IsOptional()
  @IsString()
  facility?: string | null;

  @ApiPropertyOptional({
    description: 'Site the caller identified, verified via get_site_info',
  })
  @IsOptional()
  @IsString()
  siteName?: string | null;

  @ApiPropertyOptional({ 
    description: 'Feedback on the call', 
    enum: ['Positive', 'Neutral', 'Negative'],
  })
  @IsOptional()
  @IsEnum(['Positive', 'Neutral', 'Negative'])
  feedback?: 'Positive' | 'Neutral' | 'Negative';

  @ApiPropertyOptional({ description: 'Who handled the call (AI-agent or human agent name)' })
  @IsOptional()
  @IsString()
  handledBy?: string | null;

  @ApiPropertyOptional({ description: 'Whether the call was transferred to a human agent' })
  @IsOptional()
  @IsBoolean()
  isTransferred?: boolean;

  @ApiPropertyOptional({ description: 'Name of the human agent who picked up the call' })
  @IsOptional()
  @IsString()
  humanAgentName?: string | null;

  @ApiPropertyOptional({ description: 'Caller number from external_number in metadata.phone_call' })
  @IsOptional()
  @IsString()
  callerNumber?: string | null;

  @ApiPropertyOptional({ description: 'Caller email from data collection results' })
  @IsOptional()
  @IsString()
  callerEmail?: string | null;

  @ApiPropertyOptional({ 
    description: 'Escalation status: not-requested (default), successful (agent picked up), unsuccessful (no agent picked up)', 
    enum: ['not-requested', 'successful', 'unsuccessful'],
  })
  @IsOptional()
  @IsEnum(['not-requested', 'successful', 'unsuccessful'])
  isEscalation?: 'not-requested' | 'successful' | 'unsuccessful';

  @ApiPropertyOptional({ description: 'Rationale from feedback analysis' })
  @IsOptional()
  @IsString()
  rationale?: string | null;

  @ApiPropertyOptional({ description: 'Summary of the call transcript from AI analysis' })
  @IsOptional()
  @IsString()
  callSummary?: string | null;
}

export class UpdateCallHistoryDto {
  @ApiPropertyOptional({ description: 'Conversation ID from ElevenLabs' })
  @IsOptional()
  @IsString()
  conversationId?: string | null;

  @ApiPropertyOptional({ description: 'Name of the caller' })
  @IsOptional()
  @IsString()
  callerName?: string;

  @ApiPropertyOptional({ description: 'Phone number of the caller' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'Date and time of the call' })
  @IsOptional()
  @IsDateString()
  callDateTime?: string;

  @ApiPropertyOptional({ description: 'Duration of the call' })
  @IsOptional()
  @IsString()
  duration?: string | null;

  @ApiPropertyOptional({ description: 'Whether the call was made after hours' })
  @IsOptional()
  @IsString()
  afterHours?: string | null;

  @ApiPropertyOptional({ description: 'Status of the call' })
  @IsOptional()
  @IsString()
  callStatus?: string | null;

  @ApiPropertyOptional({ description: 'Facility associated with the call' })
  @IsOptional()
  @IsString()
  facility?: string | null;

  @ApiPropertyOptional({
    description: 'Site the caller identified, verified via get_site_info',
  })
  @IsOptional()
  @IsString()
  siteName?: string | null;

  @ApiPropertyOptional({ 
    description: 'Feedback on the call', 
    enum: ['Positive', 'Neutral', 'Negative'],
  })
  @IsOptional()
  @IsEnum(['Positive', 'Neutral', 'Negative'])
  feedback?: 'Positive' | 'Neutral' | 'Negative';

  @ApiPropertyOptional({ description: 'Who handled the call (AI-agent or human agent name)' })
  @IsOptional()
  @IsString()
  handledBy?: string | null;

  @ApiPropertyOptional({ description: 'Whether the call was transferred to a human agent' })
  @IsOptional()
  @IsBoolean()
  isTransferred?: boolean;

  @ApiPropertyOptional({ description: 'Name of the human agent who picked up the call' })
  @IsOptional()
  @IsString()
  humanAgentName?: string | null;

  @ApiPropertyOptional({ description: 'Caller number from external_number in metadata.phone_call' })
  @IsOptional()
  @IsString()
  callerNumber?: string | null;

  @ApiPropertyOptional({ description: 'Caller email from data collection results' })
  @IsOptional()
  @IsString()
  callerEmail?: string | null;

  @ApiPropertyOptional({ 
    description: 'Escalation status: not-requested (default), successful (agent picked up), unsuccessful (no agent picked up)', 
    enum: ['not-requested', 'successful', 'unsuccessful'],
  })
  @IsOptional()
  @IsEnum(['not-requested', 'successful', 'unsuccessful'])
  isEscalation?: 'not-requested' | 'successful' | 'unsuccessful';

  @ApiPropertyOptional({ description: 'Rationale from feedback analysis' })
  @IsOptional()
  @IsString()
  rationale?: string | null;

  @ApiPropertyOptional({ description: 'Summary of the call transcript from AI analysis' })
  @IsOptional()
  @IsString()
  callSummary?: string | null;
}

