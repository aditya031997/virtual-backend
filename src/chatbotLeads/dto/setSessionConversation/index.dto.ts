import { IsString, IsUUID, IsOptional, MaxLength } from 'class-validator';
import type { ISetSessionConversationData } from '@/types';

export class SetSessionConversationDto implements ISetSessionConversationData {
  @IsUUID()
  sessionId!: string;

  // ElevenLabs conversation id (e.g. "conv_3301krxd0ab0fzqtt34m3hyk8r6j")
  @IsString()
  @MaxLength(255)
  conversationId!: string;

  @IsUUID()
  @IsOptional()
  leadId?: string;
}
