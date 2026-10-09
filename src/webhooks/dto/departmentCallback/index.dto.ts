import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body for the agent-callable department-callback webhook
 * (POST /webhooks/department-callback) used by the BUSINESS-HOURS path.
 * Snake_case to match the ElevenLabs server-tool convention. The agent passes
 * the conversation_id (it cannot know the internal leadId); the handler resolves
 * the lead/session from it. Mirrors the return-request webhook.
 */
export class CreateWebhookDepartmentCallbackDto {
  @ApiProperty({
    description: 'Department the user chose; routes the email to that inbox.',
    enum: ['sales', 'service', 'account', 'support'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['sales', 'service', 'account', 'accounts', 'support'])
  department!: string;

  // Caller details are passed by the agent (from USER CONTEXT) so the callback
  // emails even when no chatbot session is linked yet. conversation_id is used
  // only for best-effort lead/session enrichment, not as a hard requirement.
  @ApiPropertyOptional({ description: "The caller's name." })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  caller_name?: string;

  @ApiPropertyOptional({ description: "The caller's email." })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  caller_email?: string;

  @ApiPropertyOptional({ description: "The caller's registered phone." })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  caller_phone?: string;

  @ApiPropertyOptional({
    description:
      'ElevenLabs conversation id (best-effort lead/session lookup).',
  })
  @IsOptional()
  @IsString()
  conversation_id?: string;

  @ApiPropertyOptional({
    description:
      'Alternate callback number, if the user gave one. Omit to use their registered phone.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  call_back_number?: string;

  @ApiPropertyOptional({ description: "The user's concern, if known." })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  concern?: string;
}
