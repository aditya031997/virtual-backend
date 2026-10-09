import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookController } from '@/webhooks/webhookController';
import { WebhookService } from '@/webhooks/webhookService';
import { CallTransferService } from '@/webhooks/callTransferService';
import { UserTransferQueryService } from '@/webhooks/userTransferQueryService';
import { AfterHoursPendingHumanCallService } from '@/webhooks/afterHoursPendingHumanCallService';
import { ShareCallerDetailsService } from '@/webhooks/shareCallerDetailsService';
import { ReturnRequestService } from '@/webhooks/returnRequestService';
import { AppointmentService } from '@/webhooks/appointmentService';
import { DepartmentCallbackService } from '@/webhooks/departmentCallbackService';
import {
  Dealer,
  HumanAgent,
  UserTransferQuery,
  ChatbotSession,
  ChatbotLead,
} from '@/schema';
import { CallHistoryModule } from '@/callHistory/callHistoryModule';
import { CallTranscriptModule } from '@/callTranscript/callTranscriptModule';
import { ChatbotLeadsModule } from '@/chatbotLeads/chatbotLeadsModule';
import { SSEModule } from '@/sse';
import { EmailService } from '@/helper/email-service';
import { TTSService } from '@/helper/tts-service';
import { S3Service } from '@/helper/s3-bucket';
import { ElevenLabsOutboundHelper } from '@/helper/elevenlabs-outbound';
import { SiteModule } from '@/site/siteModule';
import { AvailabilityModule } from '@/availability';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dealer,
      HumanAgent,
      UserTransferQuery,
      ChatbotSession,
      ChatbotLead,
    ]),
    SiteModule,
    CallHistoryModule,
    CallTranscriptModule,
    ChatbotLeadsModule,
    SSEModule,
    AvailabilityModule,
  ],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    CallTransferService,
    UserTransferQueryService,
    AfterHoursPendingHumanCallService,
    ShareCallerDetailsService,
    ReturnRequestService,
    AppointmentService,
    DepartmentCallbackService,
    ElevenLabsOutboundHelper,
    EmailService,
    TTSService,
    S3Service,
  ],
  exports: [WebhookService],
})
export class WebhookModule {}
