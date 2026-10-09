import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body for the agent-callable return-request webhook (POST /webhooks/return-request).
 * Snake_case to match the ElevenLabs server-tool convention (like CreateUserTransferQueryDto).
 * The agent passes the ElevenLabs conversation_id (it cannot know the internal leadId); the
 * handler resolves the lead from the chatbot session. Optional fields default to "Not provided"
 * downstream so the underlying CreateChatbotReturnRequestDto (@MinLength(1)) still validates.
 */
export class CreateWebhookReturnRequestDto {
  @ApiProperty({
    description: 'ElevenLabs conversation id used to resolve the lead/session.',
  })
  @IsString()
  @IsNotEmpty()
  conversation_id!: string;

  @ApiPropertyOptional({
    description:
      'Optional department the user mentioned. All returns are emailed to the same return inbox; this only adds a subject prefix.',
    enum: ['sales', 'service', 'account'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['sales', 'service', 'account', 'accounts'])
  department_type?: string;

  @ApiProperty({ description: 'Product name (or model) being returned.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  product_name!: string;

  @ApiPropertyOptional({
    description: 'Order ID. Omit if the user does not have it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  order_id?: string;

  @ApiPropertyOptional({ description: 'Reason for the return.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason_for_return?: string;

  @ApiPropertyOptional({
    description: 'Address the product will be sent back from.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  return_address?: string;

  @ApiPropertyOptional({
    description:
      'Alternate contact number for this return, if the user provided one (separate from their registered phone). Not stored — included in the notification emails only.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  alternate_number?: string;
}
