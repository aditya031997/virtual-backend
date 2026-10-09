import { Module } from '@nestjs/common';
import { ChatbotIntentController } from '@/chatbotIntent/chatbotIntentController';
import { IntentClassifierService } from '@/chatbotIntent/intentClassifierService';
import { IntentRateLimiterService } from '@/chatbotIntent/intentRateLimiterService';

/**
 * Natural-language intent routing for the chatbot widget.
 *
 * `IntentClassifierService` is exported so Phase 2 (report slot grounding) and
 * Phase 3 (conversational appointment booking) can reuse it without going back
 * out through HTTP.
 */
@Module({
  controllers: [ChatbotIntentController],
  providers: [IntentClassifierService, IntentRateLimiterService],
  exports: [IntentClassifierService],
})
export class ChatbotIntentModule {}
