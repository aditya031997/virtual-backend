import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatbotSession } from '@/schema';
import { ChatbotLeadsService } from '@/chatbotLeads/chatbotLeadsService';
import { CreateWebhookReturnRequestDto } from '@/webhooks/dto/returnRequest/index.dto';

export type WebhookReturnRequestResult =
  | { success: true; message: string; id: string }
  | { success: false; message: string };

/** Fields the agent may omit are stored as this placeholder so the underlying
 *  CreateChatbotReturnRequestDto (@MinLength(1)) still validates. Mirrors the
 *  RMA prompt's "Not provided" behaviour. */
const NOT_PROVIDED = 'Not provided';

function valueOrNotProvided(s: string | undefined): string {
  const t = (s ?? '').trim();
  return t === '' ? NOT_PROVIDED : t;
}

/**
 * Agent-callable return-request submission. The ElevenLabs agent calls this
 * (via a server tool) with the conversation_id + return details — it cannot know
 * the internal leadId. We resolve the lead/session from the conversation_id (set
 * on the chatbot session when the widget links the ElevenLabs conversation) and
 * delegate to the existing createReturnRequest, which persists the row AND emails
 * the support inbox. Mirrors the callback pattern (get_user_detail_chat →
 * /webhooks/transfer-query).
 */
@Injectable()
export class ReturnRequestService {
  private readonly logger = new Logger(ReturnRequestService.name);

  constructor(
    @InjectRepository(ChatbotSession)
    private readonly sessionRepo: Repository<ChatbotSession>,
    private readonly chatbotLeadsService: ChatbotLeadsService,
  ) {}

  async submitFromConversation(
    dto: CreateWebhookReturnRequestDto,
  ): Promise<WebhookReturnRequestResult> {
    const conversationId = dto.conversation_id?.trim();
    if (!conversationId) {
      return { success: false, message: 'conversation_id is required' };
    }

    // Resolve the lead/session from the conversation id (newest first).
    const session = await this.sessionRepo.findOne({
      where: { conversationId },
      order: { createdAt: 'DESC' },
    });

    if (!session) {
      this.logger.warn(
        `[RETURN_REQUEST] no session found for conversation_id="${conversationId}"`,
      );
      return { success: false, message: 'no_session_for_conversation' };
    }

    try {
      const created = await this.chatbotLeadsService.createReturnRequest({
        leadId: session.leadId,
        sessionId: session.id,
        productName: valueOrNotProvided(dto.product_name),
        orderId: valueOrNotProvided(dto.order_id),
        reasonForReturn: valueOrNotProvided(dto.reason_for_return),
        returnAddress: valueOrNotProvided(dto.return_address),
        // Not persisted — surfaced in the notification emails only.
        alternateNumber: dto.alternate_number?.trim() || null,
        // Routes the support email to the chosen department inbox.
        departmentType: dto.department_type?.trim().toLowerCase() || null,
      });

      this.logger.log(
        `[RETURN_REQUEST] submitted id=${created.id} leadId=${session.leadId} conversation_id="${conversationId}"`,
      );
      return {
        success: true,
        message: 'Return request submitted',
        id: created.id,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[RETURN_REQUEST] failed for conversation_id="${conversationId}": ${message}`,
      );
      return { success: false, message: 'Failed to submit return request' };
    }
  }
}
