import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Upper bound on a single chat message. Long enough for a detailed report
 * request, short enough that a pasted document cannot be used to run up LLM
 * spend or smuggle in a large injection payload.
 */
const MAX_MESSAGE_LENGTH = 1000;

/** How many prior turns the caller may send for disambiguation. */
const MAX_HISTORY_TURNS = 10;

export class IntentConversationTurnDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'], {
    message: 'role must be either "user" or "assistant"',
  })
  role!: 'user' | 'assistant';

  @ApiProperty({ description: 'Text of the prior turn' })
  @IsString({ message: 'content must be a string' })
  @MaxLength(MAX_MESSAGE_LENGTH, {
    message: `content cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
  })
  content!: string;
}

export class ClassifyIntentDto {
  @ApiProperty({
    description: 'The user message to classify',
    maxLength: MAX_MESSAGE_LENGTH,
  })
  @IsString({ message: 'message must be a string' })
  @MinLength(1, { message: 'message is required' })
  @MaxLength(MAX_MESSAGE_LENGTH, {
    message: `message cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
  })
  message!: string;

  @ApiPropertyOptional({
    description:
      'Recent conversation turns, oldest first. Used to resolve follow-up ' +
      'messages such as "make it PDF instead".',
    type: [IntentConversationTurnDto],
    maxItems: MAX_HISTORY_TURNS,
  })
  @IsOptional()
  @IsArray({ message: 'history must be an array' })
  @ValidateNested({ each: true })
  @Type((): typeof IntentConversationTurnDto => IntentConversationTurnDto)
  history?: IntentConversationTurnDto[];

  @ApiPropertyOptional({
    description:
      'Chatbot session id. Used to scope rate limiting per conversation.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'sessionId must be a valid UUID' })
  sessionId?: string;
}

export { MAX_MESSAGE_LENGTH, MAX_HISTORY_TURNS };
