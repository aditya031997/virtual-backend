import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AfterHoursPendingHumanCallDto {
  @ApiProperty({ description: 'ElevenLabs conversation_id matching user_transfer_query.conversationId' })
  @IsString()
  @IsNotEmpty()
  conversation_id: string;
}
