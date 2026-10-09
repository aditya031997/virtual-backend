import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatbotSession, ChatbotLead } from '@/schema';
import { EmailService } from '@/helper/email-service';
import { CreateWebhookDepartmentCallbackDto } from '@/webhooks/dto/departmentCallback/index.dto';

export type WebhookDepartmentCallbackResult =
  | { success: true; message: string }
  | { success: false; message: string };

/**
 * Agent-callable business-hours department callback. The ElevenLabs agent calls
 * this (submit_department_callback) with the chosen department and the caller
 * details from USER CONTEXT, and we email the department inbox plus the user.
 * conversation_id is used only for best-effort lead/session enrichment — the
 * callback is NEVER blocked on a session being linked (self-sufficient, like
 * get_user_detail_chat).
 */
@Injectable()
export class DepartmentCallbackService {
  private readonly logger = new Logger(DepartmentCallbackService.name);

  constructor(
    @InjectRepository(ChatbotSession)
    private readonly sessionRepo: Repository<ChatbotSession>,
    @InjectRepository(ChatbotLead)
    private readonly leadRepo: Repository<ChatbotLead>,
    private readonly emailService: EmailService,
  ) {}

  async submitFromConversation(
    dto: CreateWebhookDepartmentCallbackDto,
  ): Promise<WebhookDepartmentCallbackResult> {
    // Caller details from the agent (USER CONTEXT) are the primary source.
    let callerName = dto.caller_name?.trim() || '';
    let callerEmail = dto.caller_email?.trim() || '';
    let callerPhone = dto.caller_phone?.trim() || '';

    // Best-effort: fill any missing detail from the linked session's lead.
    const conversationId = dto.conversation_id?.trim();
    if (conversationId && (!callerName || !callerEmail || !callerPhone)) {
      const session = await this.sessionRepo.findOne({
        where: { conversationId },
        order: { createdAt: 'DESC' },
      });
      if (session) {
        const lead = await this.leadRepo.findOne({
          where: { id: session.leadId },
        });
        if (lead) {
          callerName = callerName || (lead.name ?? '');
          callerEmail = callerEmail || (lead.email ?? '');
          callerPhone = callerPhone || (lead.contact ?? '');
        }
      }
    }

    // The agent is required to send a concern on every call. If it arrives
    // empty the request is still delivered, but surface it — a silent gap here
    // is what made callbacks land in the portal with a blank Concern field.
    if (!dto.concern?.trim()) {
      this.logger.warn(
        `[DEPT_CALLBACK] missing concern department="${dto.department}" conversation_id="${conversationId ?? ''}"`,
      );
    }

    try {
      const result = await this.emailService.sendDepartmentCallbackEmail({
        department: dto.department.trim().toLowerCase(),
        callerName,
        callerEmail,
        callerPhone,
        callbackNumber: dto.call_back_number?.trim() || undefined,
        // The receiving team sees only this field, so an empty concern reads as
        // lost data rather than "the caller didn't give one". Make the absence
        // explicit instead of rendering a bare dash.
        concern: dto.concern?.trim() || 'Not specified',
      });

      if (!result.success) {
        return {
          success: false,
          message: 'Failed to send department callback',
        };
      }

      this.logger.log(
        `[DEPT_CALLBACK] sent department="${dto.department}" conversation_id="${conversationId ?? ''}"`,
      );
      return { success: true, message: 'Department callback submitted' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[DEPT_CALLBACK] failed: ${message}`);
      return {
        success: false,
        message: 'Failed to submit department callback',
      };
    }
  }
}
