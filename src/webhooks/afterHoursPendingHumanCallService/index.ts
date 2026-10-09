import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dealer, UserTransferQuery } from '@/schema';
import { SiteService } from '@/site/siteService';
import { UserTransferQueryService } from '@/webhooks/userTransferQueryService';
import { ElevenLabsOutboundHelper } from '@/helper/elevenlabs-outbound';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '@/helper/email-service';
import type { IWebhookDealerWithAgents } from '@/types/webhook';

export type AfterHoursHumanCallOutcome =
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'connected'; agentName: string; toNumber: string }
  | { outcome: 'scheduled'; agentName: string; toNumber: string; delayMs: number }
  | { outcome: 'all_failed'; message: string }
  | { outcome: 'error'; message: string };

export interface AgentQueueEntry {
  id: string;
  name: string;
  phone: string;
  email: string;
  priority: string;
}

@Injectable()
export class AfterHoursPendingHumanCallService {
  private readonly logger = new Logger(AfterHoursPendingHumanCallService.name);
  private readonly countryCode: string;
  private readonly countryCodeNumber: string;
  private readonly localDigits: number;

  // Delay between subsequent attempts to a technician (retry the same agent, or
  // advance to the next priority agent). Client requirement: 5 minutes between
  // each attempt. Overridable via ESCALATION_RETRY_DELAY_MS (e.g. for testing).
  private readonly retryDelayMs: number;

  constructor(
    private readonly siteService: SiteService,
    private readonly userTransferQueryService: UserTransferQueryService,
    private readonly elevenLabsOutboundHelper: ElevenLabsOutboundHelper,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    @InjectRepository(Dealer)
    private readonly dealerRepository: Repository<Dealer>,
    @InjectRepository(UserTransferQuery)
    private readonly transferQueryRepository: Repository<UserTransferQuery>,
  ) {
    this.countryCode = this.configService.get<string>('COUNTRY_CODE') || '+61';
    this.countryCodeNumber = this.countryCode.replace(/^\+/, '');
    this.localDigits = this.countryCodeNumber === '91' ? 10 : 9;

    const parsedDelay = Number(this.configService.get<string>('ESCALATION_RETRY_DELAY_MS'));
    this.retryDelayMs =
      Number.isFinite(parsedDelay) && parsedDelay >= 0 ? parsedDelay : 5 * 60 * 1000; // default: 5 minutes
    this.logger.log(
      `[AFTER_HOURS] escalation retry delay = ${this.retryDelayMs}ms (${(this.retryDelayMs / 1000).toFixed(0)}s)`,
    );
  }

  async runForConversation(conversationId: string): Promise<AfterHoursHumanCallOutcome> {
    const conv = (conversationId || '').trim();
    this.logger.log(
      `[AFTER_HOURS] runForConversation start | conversation_id="${conv}" | countryCode=${this.countryCode} localDigits=${this.localDigits}`,
    );
    if (!conv) {
      this.logger.warn('[AFTER_HOURS] aborting: empty conversation_id');
      return { outcome: 'skipped', reason: 'empty_conversation_id' };
    }

    const pending = await this.userTransferQueryService.findPendingByConversationId(conv);
    if (!pending) {
      this.logger.warn(`[AFTER_HOURS] aborting: no pending row for conversation_id="${conv}"`);
      return { outcome: 'skipped', reason: 'no_pending_transfer_query' };
    }
    this.logger.log(
      `[AFTER_HOURS] found pending row id=${pending.id} siteName="${pending.siteName}" callerName="${pending.callerName}"`,
    );

    const siteNameRaw = pending.siteName?.trim();
    if (!siteNameRaw) {
      this.logger.warn(`After-hours outbound: pending row ${pending.id} has no siteName`);
      return { outcome: 'skipped', reason: 'no_site_name_on_pending_row' };
    }

    let sites: Awaited<ReturnType<SiteService['findByName']>>;
    try {
      sites = await this.siteService.findByName(siteNameRaw);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`After-hours outbound: site lookup failed: ${msg}`);
      return { outcome: 'error', message: msg };
    }

    const site =
      sites.find((s) => s.siteName?.trim().toLowerCase() === siteNameRaw.toLowerCase()) ??
      sites[0];
    this.logger.log(
      `[AFTER_HOURS] resolved site id=${site.id} siteName="${site.siteName}" (from lookup="${siteNameRaw}", ${sites.length} match(es)) | assignedDealer=${
        site.assignedDealer
          ? `code=${site.assignedDealer.dealerCode}`
          : 'NULL'
      }`,
    );

    const dealerCode = site.assignedDealer?.dealerCode?.trim();
    if (!dealerCode) {
      this.logger.warn(
        `[AFTER_HOURS] site "${site.siteName}" has no assigned dealer code → aborting, no agent can be called`,
      );
      return { outcome: 'error', message: 'site_has_no_assigned_dealer_code' };
    }

    let dealerPayload: IWebhookDealerWithAgents;
    try {
      dealerPayload = await this.fetchDealerWithAgentsByCode(dealerCode);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`After-hours outbound: dealer lookup failed: ${msg}`);
      return { outcome: 'error', message: msg };
    }

    const agents = dealerPayload.agents || [];
    this.logger.log(
      `[AFTER_HOURS] dealer="${dealerCode}" has ${agents.length} active/available agent(s): ${agents
        .map((a) => `${a.name}<${a.priority}>(${a.contactNumber})`)
        .join(', ') || '(none)'}`,
    );
    if (agents.length === 0) {
      this.logger.warn(`[AFTER_HOURS] dealer ${dealerCode} has no active/available agents → escalated`);
      await this.userTransferQueryService.updateStatusById(pending.id, 'escalated');
      return { outcome: 'all_failed', message: 'no_agents_for_dealer' };
    }

    // Build the priority queue once, with E.164-normalized + format-validated phones only.
    const phoneRegex = new RegExp(`^\\${this.countryCode}\\d{${this.localDigits}}$`);
    this.logger.log(
      `[AFTER_HOURS] phone validation config → countryCode=${this.countryCode} localDigits=${this.localDigits} regex=${phoneRegex}`,
    );
    const queue: AgentQueueEntry[] = [];
    for (const agent of agents) {
      const e164 = this.normalizeToE164(agent.contactNumber);
      const regexOk = !!e164 && phoneRegex.test(e164);
      this.logger.log(
        `[AFTER_HOURS] agent="${agent.name}" phone raw="${agent.contactNumber}" → normalized="${e164}" → ${
          regexOk ? 'ACCEPTED' : 'REJECTED'
        }`,
      );
      if (!regexOk) {
        this.logger.warn(
          `[AFTER_HOURS] SKIP queueing agent="${agent.name}" — phone "${agent.contactNumber}" → "${e164}" does not match ${phoneRegex}`,
        );
        continue;
      }
      queue.push({
        id: agent.id,
        name: agent.name,
        phone: e164,
        email: agent.email,
        priority: agent.priority,
      });
    }

    if (queue.length === 0) {
      this.logger.warn(`[AFTER_HOURS] no valid-phone agents for dealer ${dealerCode} → escalated`);
      await this.userTransferQueryService.updateStatusById(pending.id, 'escalated');
      return { outcome: 'all_failed', message: 'no_valid_phone_agents' };
    }

    this.logger.log(
      `[AFTER_HOURS] built priority queue (${queue.length}): ${queue
        .map((q) => `${q.name}<${q.priority}>(${q.phone})`)
        .join(', ')}`,
    );

    // Persist the queue + currentIndex + currentPhone + currentAttempts + dealer
    // info on the row, BEFORE placing the call. currentAttempts starts at 1
    // because the first call to queue[0] is the first attempt for that agent.
    const first = queue[0];
    pending.agentQuery = {
      queue,
      currentIndex: 0,
      currentPhone: first.phone,
      currentAttempts: 1,
      dealerEmail: dealerPayload.dealerEmail,
      dealerName: dealerPayload.dealerName,
    };
    await this.transferQueryRepository.save(pending);

    this.logger.log(
      `[AFTER_HOURS] placing first outbound call to ${first.phone} (agent="${first.name}", email="${first.email}")`,
    );
    const result = await this.elevenLabsOutboundHelper.placeOutboundCall(first.phone, {
      dynamicVariables: {
        agent_name: first.name,
        caller_name: pending.callerName?.trim() || 'a customer',
        conversation_id: pending.conversationId || '',
        agent_email: first.email,
        caller_email: pending.callerEmail || '',
        caller_phone: pending.callerPhone || '',
        caller_query: pending.callerQuery || '',
        call_back_number: pending.callBackNumber || '',
        site_name: pending.siteName?.trim() || '',
      },
    });
    this.logger.log(
      `[AFTER_HOURS] outbound result for ${first.phone}: apiSuccess=${result.apiSuccess} httpStatus=${result.statusCode} body=${JSON.stringify(result.body)}`,
    );

    if (result.treatedAsPickedUp) {
      this.logger.log(
        `[AFTER_HOURS] connected → agent="${first.name}" toNumber=${first.phone}; row stays pending until email-send confirms or failure event arrives`,
      );
      return { outcome: 'connected', agentName: first.name, toNumber: first.phone };
    }

    this.logger.warn(
      `[AFTER_HOURS] ElevenLabs did not accept first call to ${first.phone}; row left pending — failure event handler will not fire (no Twilio call was placed)`,
    );
    return { outcome: 'all_failed', message: 'first_agent_call_not_accepted' };
  }

  private static readonly MAX_ATTEMPTS_PER_AGENT = 3;

  /**
   * Called when an outbound attempt to a human agent did not deliver (either
   * the call never connected — `call_initiation_failure` — or the agent picked
   * up but didn't engage / said no — `post_call_transcription` with row still
   * pending).
   *
   * Behavior:
   *   - If `skipRetry` is false (default, used for no-answer / failure events):
   *       - Retry the SAME agent up to MAX_ATTEMPTS_PER_AGENT total times.
   *       - When that agent's attempts are exhausted, advance to the next agent.
   *   - If `skipRetry` is true (used for "agent declined" events):
   *       - Advance to the next agent immediately, no retries.
   *   - When the entire queue is exhausted: email the dealer and mark escalated.
   */
  async advanceToNextAgentByPhone(
    failedAgentPhone: string,
    failureReason: string,
    options: { skipRetry?: boolean } = {},
  ): Promise<AfterHoursHumanCallOutcome> {
    const skipRetry = !!options.skipRetry;
    this.logger.log(
      `[AFTER_HOURS_ADVANCE] start | failedAgentPhone="${failedAgentPhone}" reason="${failureReason}" skipRetry=${skipRetry}`,
    );

    const pending = await this.transferQueryRepository
      .createQueryBuilder('utq')
      .where('utq.queryStatus = :status', { status: 'pending' })
      .andWhere(`utq."agentQuery"->>'currentPhone' = :phone`, {
        phone: failedAgentPhone,
      })
      .orderBy('utq.createdAt', 'DESC')
      .getOne();

    if (!pending) {
      this.logger.warn(
        `[AFTER_HOURS_ADVANCE] no pending row found whose agentQuery.currentPhone="${failedAgentPhone}"`,
      );
      return { outcome: 'skipped', reason: 'no_pending_row_for_phone' };
    }

    const aq = (pending.agentQuery || {}) as {
      queue?: AgentQueueEntry[];
      currentIndex?: number;
      currentPhone?: string;
      currentAttempts?: number;
      dealerEmail?: string;
      dealerName?: string;
    };
    const queue = Array.isArray(aq.queue) ? aq.queue : [];
    const currentIndex = typeof aq.currentIndex === 'number' ? aq.currentIndex : 0;
    const currentAttempts =
      typeof aq.currentAttempts === 'number' && aq.currentAttempts > 0
        ? aq.currentAttempts
        : 1;
    if (queue.length === 0) {
      this.logger.warn(
        `[AFTER_HOURS_ADVANCE] pending row ${pending.id} has empty queue → cannot advance`,
      );
      return { outcome: 'error', message: 'empty_queue' };
    }
    const currentAgent = queue[currentIndex];

    // Retry path: same agent didn't pick up but still has attempts left.
    if (
      !skipRetry &&
      currentAgent &&
      currentAttempts < AfterHoursPendingHumanCallService.MAX_ATTEMPTS_PER_AGENT
    ) {
      const newAttempts = currentAttempts + 1;
      this.logger.log(
        `[AFTER_HOURS_ADVANCE] 🔁 retrying SAME agent="${currentAgent.name}" priority=${currentAgent.priority} (attempt ${newAttempts}/${AfterHoursPendingHumanCallService.MAX_ATTEMPTS_PER_AGENT}) reason="${failureReason}" — after ${(this.retryDelayMs / 1000).toFixed(0)}s delay`,
      );

      // Persist the incremented attempt count NOW, then place the retry call
      // after the 5-minute interval (in-memory delay).
      pending.agentQuery = { ...aq, currentAttempts: newAttempts };
      await this.transferQueryRepository.save(pending);

      this.scheduleDelayedCall(
        currentAgent,
        pending,
        `retry attempt ${newAttempts}/${AfterHoursPendingHumanCallService.MAX_ATTEMPTS_PER_AGENT} for agent="${currentAgent.name}"`,
      );

      return {
        outcome: 'scheduled',
        agentName: currentAgent.name,
        toNumber: currentAgent.phone,
        delayMs: this.retryDelayMs,
      };
    }

    // Advance path: either skipRetry is true (declined), or attempts exhausted.
    if (skipRetry) {
      this.logger.log(
        `[AFTER_HOURS_ADVANCE] skipRetry=true (agent declined) → advancing without retry`,
      );
    } else {
      this.logger.log(
        `[AFTER_HOURS_ADVANCE] agent="${currentAgent?.name}" exhausted ${AfterHoursPendingHumanCallService.MAX_ATTEMPTS_PER_AGENT} attempts → advancing`,
      );
    }

    const newIndex = currentIndex + 1;
    if (newIndex >= queue.length) {
      this.logger.warn(
        `[AFTER_HOURS_ADVANCE] ❌ ALL AGENTS UNAVAILABLE for row ${pending.id} — every agent in the priority queue (${queue.length}) failed to pick up`,
      );

      await this.notifyDealerNoAgentsAvailable(pending, aq.dealerEmail, aq.dealerName);

      this.logger.warn(
        `[AFTER_HOURS_ADVANCE] marking row ${pending.id} as escalated; conversation_id="${pending.conversationId}" callerName="${pending.callerName}"`,
      );
      await this.userTransferQueryService.updateStatusById(pending.id, 'escalated');
      return { outcome: 'all_failed', message: 'all_agents_unavailable' };
    }

    const next = queue[newIndex];
    this.logger.log(
      `[AFTER_HOURS_ADVANCE] advancing row ${pending.id} from index ${currentIndex} → ${newIndex} | next agent="${next.name}" priority=${next.priority} phone=${next.phone} — after ${(this.retryDelayMs / 1000).toFixed(0)}s delay`,
    );

    // Persist the advance (new index / reset attempts) NOW, then place the call
    // to the next-priority agent after the 5-minute interval (in-memory delay).
    pending.agentQuery = {
      ...aq,
      queue,
      currentIndex: newIndex,
      currentPhone: next.phone,
      currentAttempts: 1,
    };
    await this.transferQueryRepository.save(pending);

    this.scheduleDelayedCall(
      next,
      pending,
      `advance to next agent="${next.name}" priority=${next.priority}`,
    );

    return {
      outcome: 'scheduled',
      agentName: next.name,
      toNumber: next.phone,
      delayMs: this.retryDelayMs,
    };
  }

  /**
   * Places an outbound call to a technician after `retryDelayMs` (5 minutes by
   * default), instead of immediately. Used between subsequent attempts so the
   * client's "5-minute interval between each attempt" requirement is honoured.
   *
   * IMPORTANT: this is an in-memory timer. It does NOT survive a process
   * restart — if the service is redeployed/restarted while a delay is pending,
   * that scheduled attempt is lost and the escalation for that row will stall.
   * (Chosen deliberately for simplicity; a DB-backed poller would be needed for
   * restart-durable scheduling.)
   *
   * The DB row has already been updated by the caller (attempt count / index),
   * so state is persisted before we return; only the phone call itself waits.
   */
  private scheduleDelayedCall(
    agent: AgentQueueEntry,
    pending: UserTransferQuery,
    label: string,
  ): void {
    const delayMs = this.retryDelayMs;
    this.logger.log(
      `[AFTER_HOURS_DELAY] ${label}: scheduling call to ${agent.phone} (agent="${agent.name}") in ${(delayMs / 1000).toFixed(0)}s`,
    );

    const timer = setTimeout(() => {
      void (async (): Promise<void> => {
        try {
          this.logger.log(
            `[AFTER_HOURS_DELAY] ${label}: delay elapsed → placing call to ${agent.phone} (agent="${agent.name}")`,
          );
          const result = await this.elevenLabsOutboundHelper.placeOutboundCall(
            agent.phone,
            {
              dynamicVariables: {
                agent_name: agent.name,
                caller_name: pending.callerName?.trim() || 'a customer',
                conversation_id: pending.conversationId || '',
                agent_email: agent.email,
                caller_email: pending.callerEmail || '',
                caller_phone: pending.callerPhone || '',
                caller_query: pending.callerQuery || '',
                call_back_number: pending.callBackNumber || '',
                site_name: pending.siteName?.trim() || '',
              },
            },
          );
          this.logger.log(
            `[AFTER_HOURS_DELAY] ${label}: delayed call result for ${agent.phone}: apiSuccess=${result.apiSuccess} httpStatus=${result.statusCode}`,
          );
          if (!result.treatedAsPickedUp) {
            this.logger.warn(
              `[AFTER_HOURS_DELAY] ${label}: ElevenLabs did not accept delayed call to ${agent.phone}; no Twilio call placed — escalation for row ${pending.id} may stall until next event`,
            );
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `[AFTER_HOURS_DELAY] ${label}: delayed call to ${agent.phone} threw: ${msg}`,
          );
        }
      })();
    }, delayMs);

    // NOTE: intentionally NOT calling timer.unref() here. The NestJS HTTP server
    // keeps the event loop alive, so the timer will fire; unref'ing risks the
    // delayed call being dropped if the loop ever goes briefly idle.
    void timer;
  }

  /**
   * Sends an email to the dealer when the entire agent priority queue has been
   * exhausted (no human agent picked up / nobody was available). Includes the
   * caller's full details so the dealer can follow up directly.
   */
  private async notifyDealerNoAgentsAvailable(
    pending: UserTransferQuery,
    dealerEmail: string | undefined,
    dealerName: string | undefined,
  ): Promise<void> {
    if (!dealerEmail || !dealerEmail.trim()) {
      this.logger.warn(
        `[AFTER_HOURS_ADVANCE] cannot email dealer — no dealerEmail on agentQuery for row ${pending.id}`,
      );
      return;
    }

    const dName = (dealerName && dealerName.trim()) || 'team';

    this.logger.log(
      `[AFTER_HOURS_ADVANCE] sending no-agents-available email to dealer="${dealerEmail}" for row ${pending.id}`,
    );
    const result = await this.emailService.sendDealerNoAgentsAvailableEmail({
      to: dealerEmail,
      dealerName: dName,
      callerName: pending.callerName || 'a customer',
      callerEmail: pending.callerEmail,
      callerPhone: pending.callerPhone,
      callBackNumber: pending.callBackNumber,
      callerQuery: pending.callerQuery,
      siteName: pending.siteName,
    });

    if (result.success) {
      this.logger.log(
        `[AFTER_HOURS_ADVANCE] dealer email sent successfully | messageId=${result.messageId}`,
      );
    } else {
      this.logger.error(
        `[AFTER_HOURS_ADVANCE] dealer email FAILED | error=${result.error}`,
      );
    }
  }

  private async fetchDealerWithAgentsByCode(dealerCode: string): Promise<IWebhookDealerWithAgents> {
    if (!dealerCode || dealerCode.trim() === '') {
      throw new BadRequestException('Dealer code is required');
    }

    this.logger.log(
      `[FETCH_AGENTS] querying active+available human agents for dealerCode="${dealerCode}"`,
    );

    const dealer = await this.dealerRepository
      .createQueryBuilder('dealer')
      .select(['dealer.dealerName', 'dealer.email', 'dealer.phone'])
      .leftJoinAndSelect(
        'dealer.humanAgents',
        'agent',
        'agent.isActive = :isActive AND agent.isAvailable = :isAvailable',
        { isActive: true, isAvailable: true },
      )
      .addSelect(['agent.id', 'agent.agentName', 'agent.phone', 'agent.email', 'agent.priority'])
      .where('dealer.dealerCode = :dealerCode', { dealerCode })
      .getOne();

    if (!dealer) {
      throw new NotFoundException(`Dealer with code ${dealerCode} not found`);
    }

    const rawAgents = dealer.humanAgents || [];
    this.logger.log(
      `[FETCH_AGENTS] dealer="${dealer.dealerName}" code="${dealerCode}" → fetched ${rawAgents.length} agent(s)`,
    );

    const sortedAgents = rawAgents
      .map((a) => ({
        id: a.id,
        name: a.agentName,
        contactNumber: a.phone || '',
        email: a.email,
        priority: a.priority as IWebhookDealerWithAgents['agents'][0]['priority'],
      }))
      .sort((a, b) => a.priority.localeCompare(b.priority));

    const agents = sortedAgents.map((a, index) => ({
      id: a.id,
      name: a.name,
      contactNumber: a.contactNumber,
      email: a.email,
      priority: a.priority,
      priorityIndex: index,
    }));

    return {
      success: true,
      dealerName: dealer.dealerName,
      dealerEmail: dealer.email,
      dealerPhone: dealer.phone || '',
      totalAgents: agents.length,
      agents,
    };
  }

  private normalizeToE164(phone: string): string {
    const rawPhone = phone?.trim() || '';
    const digitsOnly = rawPhone.replace(/\D/g, '');

    if (!digitsOnly) {
      return '';
    }

    if (
      digitsOnly.startsWith(this.countryCodeNumber) &&
      digitsOnly.length === this.countryCodeNumber.length + this.localDigits
    ) {
      return `+${digitsOnly}`;
    }

    if (digitsOnly.length === this.localDigits + 1 && digitsOnly.startsWith('0')) {
      return this.countryCode + digitsOnly.slice(1);
    }

    if (digitsOnly.length === this.localDigits) {
      return this.countryCode + digitsOnly;
    }

    return rawPhone.replace(/[\s()-]/g, '');
  }
}
