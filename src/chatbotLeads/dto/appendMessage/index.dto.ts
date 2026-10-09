import { IsString, IsIn, IsOptional, IsObject, IsUUID } from 'class-validator';
import type { ChatbotMessageRole, IAppendChatbotMessageData } from '@/types';

export class AppendChatbotMessageDto implements IAppendChatbotMessageData {
  @IsUUID()
  sessionId!: string;

  @IsIn(['user', 'bot', 'system'])
  role!: ChatbotMessageRole;

  @IsString()
  content!: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown> | null;
}
