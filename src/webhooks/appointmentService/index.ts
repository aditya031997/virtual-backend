import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatbotSession } from '@/schema';
import { ChatbotLeadsService } from '@/chatbotLeads/chatbotLeadsService';
import { CreateWebhookAppointmentDto } from '@/webhooks/dto/appointment/index.dto';

export type WebhookAppointmentResult =
  | { success: true; message: string; id: string }
  | { success: false; message: string };

/**
 * Agent-callable appointment booking.
 *
 * The ElevenLabs agent gathers the date, time, department and callback number
 * in conversation and calls this as a server tool. It passes the ElevenLabs
 * conversation_id rather than our internal leadId, which it has no way of
 * knowing; the lead and session are resolved from the chatbot session the
 * widget linked that conversation to.
 *
 * Delegates to the existing createAppointment, which persists the row and
 * emails the appointment inbox. Mirrors ReturnRequestService exactly.
 */
@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    @InjectRepository(ChatbotSession)
    private readonly sessionRepo: Repository<ChatbotSession>,
    private readonly chatbotLeadsService: ChatbotLeadsService,
  ) {}

  async submitFromConversation(
    dto: CreateWebhookAppointmentDto,
  ): Promise<WebhookAppointmentResult> {
    const conversationId = dto.conversation_id?.trim();
    if (!conversationId) {
      return { success: false, message: 'conversation_id is required' };
    }

    const session = await this.sessionRepo.findOne({
      where: { conversationId },
      order: { createdAt: 'DESC' },
    });

    if (!session) {
      this.logger.warn(
        `[APPOINTMENT] no session found for conversation_id="${conversationId}"`,
      );
      return { success: false, message: 'no_session_for_conversation' };
    }

    // "accounts" is accepted from the agent because the prompt uses both
    // spellings; the rest of the platform stores "account".
    const department =
      dto.department === 'accounts' ? 'account' : (dto.department ?? null);

    try {
      const created = await this.chatbotLeadsService.createAppointment({
        leadId: session.leadId,
        sessionId: session.id,
        preferredDate: dto.preferred_date,
        preferredTime: dto.preferred_time,
        contactNumber: dto.contact_number,
        department,
        natureOfRequest: dto.nature_of_request?.trim() || 'Not specified',
        careFacilityLocation: dto.care_facility_location?.trim() || null,
      });

      this.logger.log(
        `[APPOINTMENT] booked ${created.id} for lead ${session.leadId} on ${dto.preferred_date} ${dto.preferred_time}`,
      );

      return {
        success: true,
        message: 'Appointment request submitted',
        id: created.id,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[APPOINTMENT] submission failed: ${message}`);
      return { success: false, message: 'submission_failed' };
    }
  }
}
