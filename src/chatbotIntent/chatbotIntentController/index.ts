import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  HttpException,
  Ip,
  Post,
} from '@nestjs/common';
import { IntentClassifierService } from '@/chatbotIntent/intentClassifierService';
import { IntentRateLimiterService } from '@/chatbotIntent/intentRateLimiterService';
import { ClassifyIntentDto } from '@/chatbotIntent/dto/classifyIntent/index.dto';
import type {
  IChatbotIntentResult,
  IIntentConversationTurn,
} from '@/types/chatbotIntent';

/**
 * Intent classification for the conversational chatbot widget.
 *
 * Public, like the other widget-facing endpoints in `/chatbot-leads` — the user
 * is a website visitor with no account, so there is no session to authenticate
 * against. Because it is public AND costs an LLM call per request, every call
 * passes through a rate limiter first.
 */
@Controller('chatbot-intent')
export class ChatbotIntentController {
  constructor(
    private readonly intentClassifierService: IntentClassifierService,
    private readonly intentRateLimiterService: IntentRateLimiterService,
  ) {}

  /**
   * Classify a chat message and extract any detail slots it contains.
   *
   * Returns 200 with an `unknown` intent (rather than an error) when the
   * message carries no actionable request, so the widget can simply ask the
   * clarifying question it gets back.
   */
  @Post('classify')
  @HttpCode(HttpStatus.OK)
  async classify(
    @Body() classifyDto: ClassifyIntentDto,
    @Ip() ip: string,
  ): Promise<IChatbotIntentResult> {
    // Prefer the session id so a shared NAT egress IP cannot exhaust quota for
    // every user behind it; fall back to IP when the widget has no session yet.
    const rateLimitKey = classifyDto.sessionId
      ? `session:${classifyDto.sessionId}`
      : `ip:${ip}`;

    if (!this.intentRateLimiterService.consume(rateLimitKey)) {
      const retryAfter =
        this.intentRateLimiterService.getRetryAfterSeconds(rateLimitKey);

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please wait a moment and try again.',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const history: IIntentConversationTurn[] =
      classifyDto.history?.map(
        (turn): IIntentConversationTurn => ({
          role: turn.role,
          content: turn.content,
        }),
      ) ?? [];

    return await this.intentClassifierService.classify(
      classifyDto.message,
      history,
    );
  }
}
