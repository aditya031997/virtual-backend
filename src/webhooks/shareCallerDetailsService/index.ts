import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HumanAgent, UserTransferQuery } from '@/schema';
import { EmailService } from '@/helper/email-service';

export type ShareCallerDetailsOutcome =
  | { success: true; message: 'sent' | 'already_shared' }
  | { success: false; message: string };

@Injectable()
export class ShareCallerDetailsService {
  private readonly logger = new Logger(ShareCallerDetailsService.name);

  constructor(
    @InjectRepository(UserTransferQuery)
    private readonly transferQueryRepo: Repository<UserTransferQuery>,
    @InjectRepository(HumanAgent)
    private readonly humanAgentRepo: Repository<HumanAgent>,
    private readonly emailService: EmailService,
  ) {}

  async share(
    conversationId: string,
    agentEmail: string,
  ): Promise<ShareCallerDetailsOutcome> {
    const cid = conversationId?.trim();
    const recipient = agentEmail?.trim().toLowerCase();

    if (!cid) {
      return { success: false, message: 'conversation_id is required' };
    }
    if (!recipient) {
      return { success: false, message: 'agent_email is required' };
    }

    const row = await this.transferQueryRepo.findOne({
      where: { conversationId: cid },
    });

    if (!row) {
      this.logger.warn(`share-caller-details: no row for conversation_id=${cid}`);
      return { success: false, message: 'transfer_query_not_found' };
    }

    if (row.queryStatus !== 'pending') {
      this.logger.log(
        `share-caller-details: row ${row.id} already ${row.queryStatus}, skipping send`,
      );
      return { success: true, message: 'already_shared' };
    }

    const agent = await this.humanAgentRepo.findOne({
      where: { email: recipient },
    });
    if (!agent) {
      this.logger.warn(`share-caller-details: no human agent for email=${recipient}`);
      return { success: false, message: 'human_agent_not_found' };
    }

    const sendResult = await this.emailService.sendHumanAgentCallerDetailsEmail({
      to: agent.email,
      agentName: agent.agentName,
      callerName: row.callerName || 'a customer',
      callerEmail: row.callerEmail,
      callerPhone: row.callerPhone,
      callBackNumber: row.callBackNumber,
      callerQuery: row.callerQuery,
      siteName: row.siteName,
    });

    if (!sendResult.success) {
      this.logger.error(
        `share-caller-details: SES send failed for row ${row.id}: ${sendResult.error}`,
      );
      return { success: false, message: sendResult.error || 'send_failed' };
    }

    row.queryStatus = 'resolved';
    await this.transferQueryRepo.save(row);

    this.logger.log(
      `share-caller-details: emailed ${agent.email} for row ${row.id}, messageId=${sendResult.messageId}`,
    );
    return { success: true, message: 'sent' };
  }

}
