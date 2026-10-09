import { Module } from '@nestjs/common';
import { ChatbotReportController } from '@/chatbotReport/chatbotReportController';
import { ReportDateResolverService } from '@/chatbotReport/reportDateResolverService';
import { ReportEntityMatcherService } from '@/chatbotReport/reportEntityMatcherService';
import { ReportLookupService } from '@/chatbotReport/reportLookupService';
import { ReportResolverService } from '@/chatbotReport/reportResolverService';
import { ReportTypeMapperService } from '@/chatbotReport/reportTypeMapperService';

/**
 * Natural-language report grounding.
 *
 * Translates the words a user types into a validated payload for the existing
 * Smart-Caller report API. `ReportResolverService` is exported so the widget
 * flow and any future voice agent can reuse it directly.
 */
@Module({
  controllers: [ChatbotReportController],
  providers: [
    ReportResolverService,
    ReportLookupService,
    ReportEntityMatcherService,
    ReportDateResolverService,
    ReportTypeMapperService,
  ],
  exports: [ReportResolverService],
})
export class ChatbotReportModule {}
