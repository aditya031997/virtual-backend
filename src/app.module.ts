import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '@/auth';
import { SupportTypeModule } from '@/supportType/supportType.module';
import { DepartmentTypeModule } from '@/departmentType/departmentType.module';
import { HumanAgentModule } from '@/humanAgent/humanAgentModule';
import { ParentCompanyModule } from '@/parentCompany/parentCompanyModule';
import { SiteModule } from '@/site/siteModule';
import { AvailabilityModule } from '@/availability';
import { DealerModule } from '@/dealer';
import { KnowledgeBaseModule } from '@/knowledgeBase/knowledgeBaseModule';
import { DocumentModule } from '@/document/documentModule';
import { FolderModule } from '@/folder/folderModule';
import { FaqModule } from '@/FAQ/faqModule';
import { LinkModule } from '@/links/linkModule';
import { TextModule } from '@/text/textModule';
import { WebhookModule } from '@/webhooks/webhookModule';
import { CallHistoryModule } from '@/callHistory/callHistoryModule';
import { CallTranscriptModule } from '@/callTranscript/callTranscriptModule';
import { SSEModule } from '@/sse';
import { SupportEmailModule } from '@/supportEmail/supportEmailModule';
import { EmailReplyModule } from '@/emailReply/emailReplyModule';
import { HubspotModule } from '@/hubspot/hubspotModule';
import { ElevenLabsChatbotModule } from '@/elevenlabsChatbot/elevenlabsChatbotModule';
import { ChatbotLeadsModule } from '@/chatbotLeads/chatbotLeadsModule';
import { ChatbotIntentModule } from '@/chatbotIntent/chatbotIntentModule';
import { ChatbotReportModule } from '@/chatbotReport/chatbotReportModule';
import { ChatbotAppointmentModule } from '@/chatbotAppointment/chatbotAppointmentModule';
import { SitemapSyncModule } from '@/knowledgeBase/sitemapSync.module';
import { getDatabaseConfig } from '@/config/database.config';
import { AuditLogModule } from '@/auditLog';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuditLogModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => getDatabaseConfig(configService),
      inject: [ConfigService],
    }),
    AuthModule,
    SupportTypeModule,
    DepartmentTypeModule,
    HumanAgentModule,
    ParentCompanyModule,
    SiteModule,
    AvailabilityModule,
    KnowledgeBaseModule,
    DealerModule,
    DocumentModule,
    FolderModule,
    FaqModule,
    LinkModule,
    TextModule,
    WebhookModule,
    CallHistoryModule,
    CallTranscriptModule,
    SSEModule,
    SupportEmailModule,
    EmailReplyModule,
    HubspotModule,
    ElevenLabsChatbotModule,
    ChatbotLeadsModule,
    ChatbotIntentModule,
    ChatbotReportModule,
    ChatbotAppointmentModule,
    SitemapSyncModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
