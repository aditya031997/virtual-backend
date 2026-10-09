import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import type { ISubmitChatbotSessionFeedbackData } from '@/types';

export class SubmitSessionFeedbackDto
  implements ISubmitChatbotSessionFeedbackData
{
  @IsUUID()
  sessionId!: string;

  @IsUUID()
  @IsOptional()
  leadId?: string;

  // 1-10 inclusive. Sentiment is derived server-side:
  // 1-4 = Negative, 5-7 = Neutral, 8-10 = Positive.
  @IsInt()
  @Min(1)
  @Max(10)
  rating!: number;
}
