import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Transcript } from '@/types/callTranscript';

export class CreateCallTranscriptDto {
  @ApiProperty({ description: 'Conversation ID from ElevenLabs' })
  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @ApiProperty({ description: 'Transcript data from conversation' })
  @IsArray()
  transcript: Transcript;
}

export class UpdateCallTranscriptDto {
  @ApiPropertyOptional({ description: 'Conversation ID from ElevenLabs' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({ description: 'Transcript data from conversation' })
  @IsOptional()
  @IsArray()
  transcript?: Transcript;
}

