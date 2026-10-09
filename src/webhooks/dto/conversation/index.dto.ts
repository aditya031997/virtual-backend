import { IsString, IsNotEmpty, IsNumber, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ElevenLabsWebhookDto {
  @ApiProperty({
    description: 'Webhook event type'
  })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({
    description: 'Event timestamp in Unix seconds'
  })
  @IsNumber()
  event_timestamp: number;

  @ApiProperty({
    description: 'Webhook data containing conversation details'
  })
  @IsObject()
  data: any; 
}