import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ChatbotLead,
  ChatbotSession,
  ChatbotMessage,
  ChatbotAppointment,
  ChatbotLeadProfileChange,
  ChatbotReturnRequest,
} from '@/schema';
import { SiteNameService } from '@/chatbotLeads/siteNameService';
import { ChatbotLeadsService } from '@/chatbotLeads/chatbotLeadsService';
import { ChatbotLeadsController } from '@/chatbotLeads/chatbotLeadsController';
import { EmailService } from '@/helper/email-service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatbotLead,
      ChatbotSession,
      ChatbotMessage,
      ChatbotAppointment,
      ChatbotLeadProfileChange,
      ChatbotReturnRequest,
    ]),
  ],
  controllers: [ChatbotLeadsController],
  providers: [ChatbotLeadsService, SiteNameService, EmailService],
  exports: [ChatbotLeadsService],
})
export class ChatbotLeadsModule {}
