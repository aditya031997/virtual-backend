import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransferRequestDto {
  @ApiProperty({
    description: 'The SID of the current active call to transfer'
  })
  @IsString()
  @IsNotEmpty()
  current_call_sid: string;

  @ApiProperty({
    description: 'Conversation ID from ElevenLabs'
  })
  @IsString()
  @IsNotEmpty()
  conversation_id: string;

  @ApiProperty({
    description: 'Phone number to transfer the call to'
  })
  @IsString()
  @IsNotEmpty()
  transfer_phone_number: string;

  @ApiPropertyOptional({
  description: 'Array of agent phone numbers with priority (can be JSON string or array)'
})
@IsOptional()
agent_queue?: Array<{ contactNumber: string; priority: number | string; priorityIndex?: number; name?: string }> | string;

  // Caller information for escalation email
  @ApiPropertyOptional({
    description: 'Name of the caller'
  })
  @IsOptional()
  @IsString()
  caller_name?: string;

  @ApiPropertyOptional({
    description: 'Email of the caller'
  })
  @IsOptional()
  @IsString()
  caller_email?: string;

  @ApiPropertyOptional({
    description: 'Phone number of the caller'
  })
  @IsOptional()
  @IsString()
  caller_phone?: string;

  @ApiPropertyOptional({
    description: 'Dealer code associated with the call'
  })
  @IsOptional()
  @IsString()
  dealer_code?: string;
}
