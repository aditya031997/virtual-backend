import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ShareCallerDetailsDto {
  @ApiProperty({
    description: 'Inbound ElevenLabs conversation_id stored on user_transfer_query.conversationId',
  })
  @IsString()
  @IsNotEmpty()
  conversation_id: string;

  @ApiProperty({
    description: 'Email of the human agent currently on the outbound call (recipient).',
  })
  @IsEmail()
  @IsNotEmpty()
  agent_email: string;
}
