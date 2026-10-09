import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SiteNameService } from '@/chatbotLeads/siteNameService';
import { DataSource, Repository } from 'typeorm';
import {
  ChatbotLead,
  ChatbotSession,
  ChatbotMessage,
  ChatbotAppointment,
  ChatbotLeadProfileChange,
  ChatbotReturnRequest,
} from '@/schema';
import {
  IAppendChatbotMessageData,
  IChatbotAppointment,
  IChatbotLead,
  IChatbotLeadProfileChange,
  IProfileSummary,
  IProfileSnapshot,
  IProfileHistorySession,
  ChatbotLeadProfileField,
  IChatbotLeadSearchParams,
  IChatbotLeadService,
  IChatbotLeadStartResult,
  IChatbotMessage,
  IChatbotReturnRequest,
  IChatbotSession,
  ICreateChatbotAppointmentData,
  ICreateChatbotLeadData,
  ICreateChatbotReturnRequestData,
  IEndSessionData,
  IPreviousSessionInfo,
  ISetSessionConversationData,
  ISubmitChatbotSessionFeedbackData,
  IUpdateChatbotLeadData,
  ChatbotSentiment,
  ChatbotSessionEndReason,
} from '@/types';
import { EmailService } from '@/helper/email-service';

/** One Chat History admin row (session joined with its lead). */
export interface AdminSessionRow {
  id: string;
  leadId: string;
  siteId: string | null;
  /**
   * Always null from this service.
   *
   * `siteId` is a cuid belonging to the smartcaller database, so the `sites`
   * table here can never resolve it — and joining the two made Postgres reject
   * the whole query ("operator does not exist: uuid = character varying"),
   * which emptied Chat History. Kept on the row so the admin panel's contract
   * is unchanged; resolving the name needs a call to the owning service.
   */
  siteName: string | null;
  leadName: string;
  leadEmail: string;
  leadContact: string | null;
  conversationId: string | null;
  status: string;
  endReason: string | null;
  startedAt: Date;
  endedAt: Date | null;
  lastActivityAt: Date;
  feedbackRating: number | null;
  sentiment: ChatbotSentiment | null;
  createdAt: Date;
}

@Injectable()
export class ChatbotLeadsService implements IChatbotLeadService {
  private readonly logger = new Logger(ChatbotLeadsService.name);

  /**
   * Correlated subquery: the id of the latest message in the session row
   * being updated. Used in bulk UPDATEs (supersede / cron expiry) so each
   * session records the exact message it ended after. References the outer
   * "chatbot_sessions" table by name (TypeORM emits an unaliased UPDATE).
   */
  private static readonly LAST_MESSAGE_SUBQUERY =
    '(SELECT m."id" FROM "chatbot_messages" m ' +
    'WHERE m."sessionId" = "chatbot_sessions"."id" ' +
    'ORDER BY m."createdAt" DESC LIMIT 1)';

  constructor(
    @InjectRepository(ChatbotLead)
    private readonly chatbotLeadRepository: Repository<ChatbotLead>,
    @InjectRepository(ChatbotSession)
    private readonly chatbotSessionRepository: Repository<ChatbotSession>,
    private readonly siteNameService: SiteNameService,
    @InjectRepository(ChatbotMessage)
    private readonly chatbotMessageRepository: Repository<ChatbotMessage>,
    @InjectRepository(ChatbotAppointment)
    private readonly chatbotAppointmentRepository: Repository<ChatbotAppointment>,
    @InjectRepository(ChatbotLeadProfileChange)
    private readonly profileChangeRepository: Repository<ChatbotLeadProfileChange>,
    @InjectRepository(ChatbotReturnRequest)
    private readonly chatbotReturnRequestRepository: Repository<ChatbotReturnRequest>,
    private readonly dataSource: DataSource,
    private readonly emailService: EmailService,
  ) {}

  private normalizeEmail(email?: string | null): string | null {
    const value = (email ?? '').toLowerCase().trim();
    return value.length > 0 ? value : null;
  }

  /** Trimmed display form of the phone, as the user entered it. */
  private normalizeContact(contact?: string | null): string | null {
    const value = (contact ?? '').trim();
    return value.length > 0 ? value : null;
  }

  /**
   * Digits-only canonical form used for duplicate detection and the UNIQUE
   * constraint. "+1 555 123-4567", "15551234567" and "(555) 123 4567" all
   * compare equal once non-digits are stripped. Returns null when empty.
   * NOTE: cannot infer a missing country code (a local-format number without
   * the country prefix is a different canonical value).
   */
  private normalizePhone(contact?: string | null): string | null {
    const digits = (contact ?? '').replace(/\D/g, '');
    return digits.length > 0 ? digits : null;
  }

  /**
   * Create-or-resume a chatbot lead, keyed solely by EMAIL.
   *
   * - New email  -> create the lead.
   * - Existing email -> reuse the SAME lead id (no duplicate). The name and
   *   phone are updated to the latest values; every change is recorded in
   *   chatbot_lead_profile_changes (audit). Chat history/sessions stay linked
   *   to the unchanged lead id. The widget's prior history is returned and a
   *   fresh session is started (prior open session is superseded).
   *
   * Phone is NOT a unique key — it is a mutable, audited attribute of the
   * email-keyed user.
   */
  async create(
    createData: ICreateChatbotLeadData,
  ): Promise<IChatbotLeadStartResult> {
    try {
      return await this.createOrResume(createData);
    } catch (error) {
      // Concurrent insert with the same NEW email won the race: the row now
      // exists, so resume it instead of failing.
      if (this.isUniqueViolation(error)) {
        return await this.createOrResume(createData);
      }
      throw error;
    }
  }

  private async createOrResume(
    createData: ICreateChatbotLeadData,
  ): Promise<IChatbotLeadStartResult> {
    const email = this.normalizeEmail(createData.email);
    const contactDisplay = this.normalizeContact(createData.contact);
    const contactNormalized = this.normalizePhone(createData.contact);

    const result = await this.dataSource.transaction(async (manager) => {
      const leadRepo = manager.getRepository(ChatbotLead);
      const sessionRepo = manager.getRepository(ChatbotSession);
      const auditRepo = manager.getRepository(ChatbotLeadProfileChange);

      const existing = email
        ? await leadRepo
            .createQueryBuilder('lead')
            .where('LOWER(lead.email) = :email', { email })
            .getOne()
        : null;

      let lead: ChatbotLead;
      let isReturning: boolean;

      // Audits are collected here and inserted AFTER the session is created
      // so each row can be tagged with the session it happened in.
      type PendingAudit = Pick<
        ChatbotLeadProfileChange,
        'field' | 'oldValue' | 'newValue' | 'changeType'
      >;
      const pendingAudits: PendingAudit[] = [];

      if (existing) {
        isReturning = true;

        const newName = (createData.name ?? '').trim();
        if (newName && newName !== existing.name) {
          pendingAudits.push({
            field: 'name',
            oldValue: existing.name,
            newValue: newName,
            changeType: 'update',
          });
          existing.name = newName;
        }

        // Only treat phone as changed when a new phone is actually supplied
        // (an absent phone field must NOT wipe the stored number).
        if (
          contactNormalized &&
          contactNormalized !== existing.contactNormalized
        ) {
          pendingAudits.push({
            field: 'contact',
            oldValue: existing.contact,
            newValue: contactDisplay,
            changeType: 'update',
          });
          existing.contact = contactDisplay;
          existing.contactNormalized = contactNormalized;
        }

        if (createData.chatStatus) {
          existing.chatStatus = createData.chatStatus;
        }

        lead = await leadRepo.save(existing);
      } else {
        isReturning = false;
        lead = await leadRepo.save(
          leadRepo.create({
            ...createData,
            email: email ?? createData.email,
            contact: contactDisplay,
            contactNormalized,
          }),
        );

        // First-session baseline: the ORIGINAL name / email / phone.
        pendingAudits.push(
          {
            field: 'name',
            oldValue: null,
            newValue: lead.name,
            changeType: 'initial',
          },
          {
            field: 'email',
            oldValue: null,
            newValue: lead.email,
            changeType: 'initial',
          },
        );
        if (lead.contact) {
          pendingAudits.push({
            field: 'contact',
            oldValue: null,
            newValue: lead.contact,
            changeType: 'initial',
          });
        }
      }

      // Most recent prior session (if any) for the "previous session" signal.
      const previousSession = await sessionRepo.findOne({
        where: { leadId: lead.id },
        order: { createdAt: 'DESC' },
      });

      // A new visit supersedes any still-open prior session.
      const now = new Date();
      await sessionRepo
        .createQueryBuilder()
        .update(ChatbotSession)
        .set({
          status: 'ended',
          endReason: 'superseded',
          endedAt: now,
          endedAfterMessageId: () => ChatbotLeadsService.LAST_MESSAGE_SUBQUERY,
        })
        .where('leadId = :leadId AND status = :status', {
          leadId: lead.id,
          status: 'active',
        })
        .execute();

      const session = await sessionRepo.save(
        sessionRepo.create({
          leadId: lead.id,
          status: 'active',
          // Trimmed to null, not passed through: the column is uuid, and an
          // empty string fails the cast — which aborted the whole lead
          // creation, so no session was recorded at all.
          siteId: createData.siteId?.trim() || null,
        }),
      );

      // Tag every audit row with the session it belongs to.
      if (pendingAudits.length > 0) {
        await auditRepo.insert(
          pendingAudits.map((a) => ({
            leadId: lead.id,
            sessionId: session.id,
            field: a.field,
            oldValue: a.oldValue,
            newValue: a.newValue,
            changeType: a.changeType,
          })),
        );
      }

      return { lead, session, isReturning, previousSession };
    });

    const history = await this.getHistory(result.lead.id);

    // Profile change trail (baseline + edits), oldest-first, so the widget
    // can show the original vs current name/email/phone.
    const profileHistory = (await this.profileChangeRepository.find({
      where: { leadId: result.lead.id },
      order: { changedAt: 'ASC' },
    })) as IChatbotLeadProfileChange[];

    const profile = this.buildProfileSummary(
      result.lead as IChatbotLead,
      profileHistory,
    );
    const profileHistoryBySession =
      this.groupProfileHistoryBySession(profileHistory);

    // Re-read prior session AFTER the supersede UPDATE for its final state.
    let previousSession: IPreviousSessionInfo | null = null;
    if (result.previousSession) {
      const fresh = await this.chatbotSessionRepository.findOne({
        where: { id: result.previousSession.id },
      });
      if (fresh) {
        previousSession = {
          id: fresh.id,
          endReason: fresh.endReason as ChatbotSessionEndReason | null,
          endedAt: fresh.endedAt,
          endedAfterMessageId: fresh.endedAfterMessageId,
        };
      }
    }

    return {
      ...(result.lead as IChatbotLead),
      isReturning: result.isReturning,
      sessionId: result.session.id,
      sessionStatus: 'new',
      previousSessionEnded: result.previousSession !== null,
      endedReason: previousSession ? previousSession.endReason : null,
      previousSessionId: result.previousSession
        ? result.previousSession.id
        : null,
      previousSession,
      history,
      profileHistory,
      profile,
      profileHistoryBySession,
    };
  }

  /** Postgres unique_violation (SQLSTATE 23505) detection. */
  private isUniqueViolation(error: unknown): boolean {
    const e = error as {
      code?: string;
      driverError?: { code?: string };
    };
    return e?.code === '23505' || e?.driverError?.code === '23505';
  }

  async findAll(): Promise<IChatbotLead[]> {
    const leads = await this.chatbotLeadRepository.find({
      order: { createdAt: 'DESC' },
    });
    return leads as IChatbotLead[];
  }

  async search(params: IChatbotLeadSearchParams): Promise<IChatbotLead[]> {
    const { query, name, email, chatStatus, isActive } = params;
    const qb = this.chatbotLeadRepository
      .createQueryBuilder('lead')
      .orderBy('lead.createdAt', 'DESC');

    if (query) {
      qb.where(
        'LOWER(lead.name) LIKE LOWER(:query) OR LOWER(lead.email) LIKE LOWER(:query) OR LOWER(lead.contact) LIKE LOWER(:query)',
        { query: `%${query}%` },
      );
    } else {
      const conditions: string[] = [];
      const parameters: Record<string, string | boolean> = {};

      if (name) {
        conditions.push('LOWER(lead.name) LIKE LOWER(:name)');
        parameters.name = `%${name}%`;
      }
      if (email) {
        conditions.push('LOWER(lead.email) LIKE LOWER(:email)');
        parameters.email = `%${email}%`;
      }
      if (chatStatus) {
        conditions.push('lead.chatStatus = :chatStatus');
        parameters.chatStatus = chatStatus;
      }
      if (typeof isActive === 'boolean') {
        conditions.push('lead.isActive = :isActive');
        parameters.isActive = isActive;
      }
      if (conditions.length > 0) {
        qb.where(conditions.join(' AND '), parameters);
      }
    }

    const leads = await qb.getMany();
    return leads as IChatbotLead[];
  }

  async findOne(id: string): Promise<IChatbotLead> {
    const lead = await this.chatbotLeadRepository.findOne({ where: { id } });

    if (!lead) {
      throw new NotFoundException(`Chatbot lead with ID ${id} not found`);
    }

    return lead as IChatbotLead;
  }

  async update(
    id: string,
    updateData: IUpdateChatbotLeadData,
  ): Promise<IChatbotLead> {
    return await this.dataSource.transaction(async (manager) => {
      const leadRepo = manager.getRepository(ChatbotLead);
      const auditRepo = manager.getRepository(ChatbotLeadProfileChange);

      const lead = await leadRepo.findOne({ where: { id } });
      if (!lead) {
        throw new NotFoundException(`Chatbot lead with ID ${id} not found`);
      }

      // Admin edits have no widget session context -> sessionId null.
      const audits: Array<
        Pick<
          ChatbotLeadProfileChange,
          'leadId' | 'field' | 'oldValue' | 'newValue' | 'changeType'
        >
      > = [];

      if (updateData.name !== undefined) {
        const newName = (updateData.name ?? '').trim();
        if (newName && newName !== lead.name) {
          audits.push({
            leadId: lead.id,
            field: 'name',
            oldValue: lead.name,
            newValue: newName,
            changeType: 'update',
          });
          lead.name = newName;
        }
      }

      if (updateData.email !== undefined) {
        const newEmail = (updateData.email ?? '').toLowerCase().trim();
        if (newEmail && newEmail !== lead.email.toLowerCase()) {
          audits.push({
            leadId: lead.id,
            field: 'email',
            oldValue: lead.email,
            newValue: newEmail,
            changeType: 'update',
          });
          lead.email = newEmail;
        }
      }

      if (updateData.contact !== undefined) {
        const newContact = this.normalizeContact(updateData.contact);
        const newNormalized = this.normalizePhone(updateData.contact);
        if (newNormalized !== lead.contactNormalized) {
          audits.push({
            leadId: lead.id,
            field: 'contact',
            oldValue: lead.contact,
            newValue: newContact,
            changeType: 'update',
          });
          lead.contact = newContact;
          lead.contactNormalized = newNormalized;
        }
      }

      if (updateData.chatStatus !== undefined) {
        lead.chatStatus = updateData.chatStatus;
      }
      if (updateData.isActive !== undefined) {
        lead.isActive = updateData.isActive;
      }

      try {
        const updated = await leadRepo.save(lead);
        if (audits.length > 0) {
          await auditRepo.insert(audits);
        }
        return updated as IChatbotLead;
      } catch (error) {
        // Email is the only unique key; a duplicate email is a real conflict.
        if (this.isUniqueViolation(error)) {
          throw new ConflictException(
            'Another lead with this email already exists.',
          );
        }
        throw error;
      }
    });
  }

  /**
   * Profile change audit trail for a lead (name/email/phone history),
   * oldest first. Lets the admin UI display "previous → updated" history.
   */
  async getProfileChangeHistory(
    leadId: string,
  ): Promise<IChatbotLeadProfileChange[]> {
    const lead = await this.chatbotLeadRepository.findOne({
      where: { id: leadId },
    });
    if (!lead) {
      throw new NotFoundException(`Chatbot lead with ID ${leadId} not found`);
    }

    const changes = await this.profileChangeRepository.find({
      where: { leadId },
      order: { changedAt: 'ASC' },
    });
    return changes as IChatbotLeadProfileChange[];
  }

  /**
   * Pre-compute initial / previous / current snapshots so the frontend can
   * render "previous vs current" with no logic. `rows` must be oldest-first.
   */
  private buildProfileSummary(
    lead: IChatbotLead,
    rows: IChatbotLeadProfileChange[],
  ): IProfileSummary {
    const fields: ChatbotLeadProfileField[] = ['name', 'email', 'contact'];
    const current: IProfileSnapshot = {
      name: lead.name ?? null,
      email: lead.email ?? null,
      contact: lead.contact ?? null,
    };
    const initial: IProfileSnapshot = {
      name: null,
      email: null,
      contact: null,
    };
    const previous: IProfileSnapshot = { ...current };
    const changedFields: ChatbotLeadProfileField[] = [];

    for (const field of fields) {
      const fieldRows = rows.filter((r) => r.field === field);
      const baseline = fieldRows.find((r) => r.changeType === 'initial');
      initial[field] = baseline
        ? baseline.newValue
        : (fieldRows[0]?.oldValue ?? current[field]);

      const updates = fieldRows.filter((r) => r.changeType === 'update');
      if (updates.length > 0) {
        changedFields.push(field);
        // Value right before the most recent change of this field.
        previous[field] = updates[updates.length - 1].oldValue;
      }
    }

    return {
      initial,
      previous,
      current,
      changedFields,
      hasChanges: changedFields.length > 0,
    };
  }

  /** Group the (oldest-first) audit rows by the session they happened in. */
  private groupProfileHistoryBySession(
    rows: IChatbotLeadProfileChange[],
  ): IProfileHistorySession[] {
    const groups: IProfileHistorySession[] = [];
    const indexByKey = new Map<string, number>();

    for (const row of rows) {
      const key = row.sessionId ?? '__none__';
      let idx = indexByKey.get(key);
      if (idx === undefined) {
        idx =
          groups.push({
            sessionId: row.sessionId,
            changeType: row.changeType,
            changedAt: row.changedAt,
            changes: [],
          }) - 1;
        indexByKey.set(key, idx);
      }
      groups[idx].changes.push(row);
    }
    return groups;
  }

  async remove(id: string): Promise<{ message: string }> {
    const lead = await this.chatbotLeadRepository.findOne({ where: { id } });

    if (!lead) {
      throw new NotFoundException(`Chatbot lead with ID ${id} not found`);
    }

    await this.chatbotLeadRepository.remove(lead);
    return { message: `Chatbot lead ${id} deleted successfully` };
  }

  /** Append a single chat message to an existing session. */
  async appendMessage(
    data: IAppendChatbotMessageData,
  ): Promise<IChatbotMessage> {
    const session = await this.chatbotSessionRepository.findOne({
      where: { id: data.sessionId },
    });

    if (!session) {
      throw new NotFoundException(
        `Chatbot session with ID ${data.sessionId} not found`,
      );
    }

    const message = await this.chatbotMessageRepository.save(
      this.chatbotMessageRepository.create({
        sessionId: data.sessionId,
        role: data.role,
        content: data.content,
        metadata: data.metadata ?? null,
      }),
    );

    // A message is activity — keep the session alive for the TTL job.
    await this.chatbotSessionRepository.update(
      { id: data.sessionId },
      { lastActivityAt: new Date() },
    );

    return message as IChatbotMessage;
  }

  /**
   * Full chat history for a lead across all of its sessions, ordered oldest
   * first so the widget can replay the conversation.
   */
  async getHistory(leadId: string): Promise<IChatbotMessage[]> {
    const messages = await this.chatbotMessageRepository
      .createQueryBuilder('message')
      .innerJoin(ChatbotSession, 'session', 'session.id = message.sessionId')
      .where('session.leadId = :leadId', { leadId })
      .orderBy('message.createdAt', 'ASC')
      .getMany();

    return messages as IChatbotMessage[];
  }

  /**
   * Persist an appointment request and notify the support inbox
   * (SES_SUPPORT_EMAIL). The request is persisted regardless of email
   * delivery; `emailSent` reflects the delivery outcome.
   */
  async createAppointment(
    data: ICreateChatbotAppointmentData,
  ): Promise<IChatbotAppointment> {
    const lead = await this.chatbotLeadRepository.findOne({
      where: { id: data.leadId },
    });

    if (!lead) {
      throw new NotFoundException(
        `Chatbot lead with ID ${data.leadId} not found`,
      );
    }

    const appointment = await this.chatbotAppointmentRepository.save(
      this.chatbotAppointmentRepository.create({
        leadId: lead.id,
        sessionId: data.sessionId ?? null,
        name: lead.name,
        email: lead.email,
        // A number given in conversation wins: an anonymous visitor has no
        // contact on the lead, and a stale one helps nobody.
        contact: data.contactNumber ?? lead.contact,
        careFacilityLocation: data.careFacilityLocation ?? null,
        preferredTime: data.preferredTime ?? null,
        preferredDate: data.preferredDate ?? null,
        department: data.department ?? null,
        natureOfRequest: data.natureOfRequest,
        status: 'requested',
        emailSent: false,
      }),
    );

    try {
      const emailResult = await this.emailService.sendAppointmentRequestEmail({
        customerName: lead.name,
        customerEmail: lead.email,
        customerPhone: data.contactNumber ?? lead.contact,
        careFacilityLocation: data.careFacilityLocation,
        preferredTime: data.preferredTime,
        preferredDate: data.preferredDate,
        department: data.department,
        natureOfRequest: data.natureOfRequest,
      });

      if (emailResult.success) {
        appointment.emailSent = true;
        await this.chatbotAppointmentRepository.save(appointment);
      } else {
        this.logger.warn(
          `Appointment ${appointment.id} saved but email failed: ${emailResult.error}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Appointment ${appointment.id} saved but email threw: ${message}`,
      );
    }

    return appointment as IChatbotAppointment;
  }

  /**
   * Persist a return / RMA request and notify the support inbox
   * (SES_SUPPORT_EMAIL). The request is persisted regardless of email
   * delivery; `emailSent` reflects the delivery outcome.
   */
  async createReturnRequest(
    data: ICreateChatbotReturnRequestData,
  ): Promise<IChatbotReturnRequest> {
    const lead = await this.chatbotLeadRepository.findOne({
      where: { id: data.leadId },
    });

    if (!lead) {
      throw new NotFoundException(
        `Chatbot lead with ID ${data.leadId} not found`,
      );
    }

    const returnRequest = await this.chatbotReturnRequestRepository.save(
      this.chatbotReturnRequestRepository.create({
        leadId: lead.id,
        sessionId: data.sessionId ?? null,
        name: lead.name,
        email: lead.email,
        contact: lead.contact,
        productName: data.productName,
        orderId: data.orderId,
        reasonForReturn: data.reasonForReturn,
        returnAddress: data.returnAddress,
        status: 'requested',
        emailSent: false,
      }),
    );

    const emailData = {
      customerName: lead.name,
      customerEmail: lead.email,
      customerPhone: lead.contact,
      productName: data.productName,
      orderId: data.orderId,
      reasonForReturn: data.reasonForReturn,
      returnAddress: data.returnAddress,
      alternateNumber: data.alternateNumber ?? null,
      departmentType: data.departmentType ?? null,
    };

    // Notify the support inbox. emailSent tracks THIS email (the team's copy).
    try {
      const emailResult =
        await this.emailService.sendReturnRequestEmail(emailData);

      if (emailResult.success) {
        returnRequest.emailSent = true;
        await this.chatbotReturnRequestRepository.save(returnRequest);
      } else {
        this.logger.warn(
          `Return request ${returnRequest.id} saved but support email failed: ${emailResult.error}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Return request ${returnRequest.id} saved but support email threw: ${message}`,
      );
    }

    // Also send the customer a confirmation (different template). Best-effort:
    // a failure here does not affect the saved request or the support email.
    try {
      const confirmResult =
        await this.emailService.sendReturnRequestConfirmationEmail(emailData);
      if (!confirmResult.success) {
        this.logger.warn(
          `Return request ${returnRequest.id}: customer confirmation email not sent: ${confirmResult.error}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Return request ${returnRequest.id}: customer confirmation email threw: ${message}`,
      );
    }

    return returnRequest as IChatbotReturnRequest;
  }

  /**
   * Bind the ElevenLabs conversation id to an existing session so the
   * post-call webhook transcript can later be correlated with this
   * session/lead. Idempotent — safe to call again if it changes.
   */
  async setSessionConversationId(
    data: ISetSessionConversationData,
  ): Promise<IChatbotSession> {
    const session = await this.chatbotSessionRepository.findOne({
      where: { id: data.sessionId },
    });

    if (!session) {
      throw new NotFoundException(
        `Chatbot session with ID ${data.sessionId} not found`,
      );
    }

    if (data.leadId && data.leadId !== session.leadId) {
      throw new NotFoundException(
        `Session ${data.sessionId} does not belong to lead ${data.leadId}`,
      );
    }

    session.conversationId = data.conversationId;
    session.lastActivityAt = new Date();
    const saved = await this.chatbotSessionRepository.save(session);
    return saved as IChatbotSession;
  }

  /**
   * End a session (manual button / tab-close beacon / client inactivity).
   * Idempotent: if the session is already ended/expired it is returned as-is
   * without error, so duplicate or lost-then-retried signals never corrupt
   * state. Best-effort by contract — the client must not block on this.
   */
  async endSession(data: IEndSessionData): Promise<IChatbotSession> {
    const session = await this.chatbotSessionRepository.findOne({
      where: { id: data.sessionId },
    });

    if (!session) {
      throw new NotFoundException(
        `Chatbot session with ID ${data.sessionId} not found`,
      );
    }

    if (data.leadId && data.leadId !== session.leadId) {
      throw new NotFoundException(
        `Session ${data.sessionId} does not belong to lead ${data.leadId}`,
      );
    }

    // Already terminal — idempotent no-op, return current state.
    if (session.status !== 'active') {
      return session as IChatbotSession;
    }

    session.status = 'ended';
    session.endReason = data.reason;
    session.endedAt = new Date();
    session.endedAfterMessageId = await this.getLastMessageId(session.id);
    const saved = await this.chatbotSessionRepository.save(session);
    return saved as IChatbotSession;
  }

  /**
   * Map a 1-10 rating to a sentiment bucket. Pure function, exported for tests.
   */
  private static ratingToSentiment(rating: number): ChatbotSentiment {
    if (rating <= 4) return 'Negative';
    if (rating <= 7) return 'Neutral';
    return 'Positive';
  }

  /**
   * Persist end-of-session feedback (1-10) + derived sentiment, and close the
   * session with reason='feedback_given' if it is still active. Idempotent:
   * re-submitting on an already-ended session updates the feedback columns
   * but does not change the end reason or timestamps.
   */
  async submitSessionFeedback(
    data: ISubmitChatbotSessionFeedbackData,
  ): Promise<IChatbotSession> {
    const session = await this.chatbotSessionRepository.findOne({
      where: { id: data.sessionId },
    });

    if (!session) {
      throw new NotFoundException(
        `Chatbot session with ID ${data.sessionId} not found`,
      );
    }

    if (data.leadId && data.leadId !== session.leadId) {
      throw new NotFoundException(
        `Session ${data.sessionId} does not belong to lead ${data.leadId}`,
      );
    }

    const sentiment = ChatbotLeadsService.ratingToSentiment(data.rating);

    session.feedbackRating = data.rating;
    session.sentiment = sentiment;

    if (session.status === 'active') {
      session.status = 'ended';
      session.endReason = 'feedback_given';
      session.endedAt = new Date();
      session.endedAfterMessageId = await this.getLastMessageId(session.id);
    }

    const saved = await this.chatbotSessionRepository.save(session);
    return saved as IChatbotSession;
  }

  /** Latest message id in a session, or null if it had no messages. */
  private async getLastMessageId(sessionId: string): Promise<string | null> {
    const last = await this.chatbotMessageRepository.findOne({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      select: { id: true },
    });
    return last ? last.id : null;
  }

  /**
   * Idempotent activity heartbeat. Bumps lastActivityAt only while the session
   * is still active (a terminal session is never silently revived).
   */
  async touchSessionActivity(sessionId: string): Promise<IChatbotSession> {
    const session = await this.chatbotSessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(
        `Chatbot session with ID ${sessionId} not found`,
      );
    }

    if (session.status === 'active') {
      session.lastActivityAt = new Date();
      const saved = await this.chatbotSessionRepository.save(session);
      return saved as IChatbotSession;
    }

    return session as IChatbotSession;
  }

  /**
   * Server-side inactivity expiry. Marks every still-active session whose
   * lastActivityAt is older than the TTL as expired. This is the authoritative
   * safety net — it works even if the browser never reports a tab-close.
   * Returns the number of sessions expired.
   */
  async expireInactiveSessions(ttlMinutes: number): Promise<number> {
    const cutoff = new Date(Date.now() - ttlMinutes * 60_000);

    const res = await this.chatbotSessionRepository
      .createQueryBuilder()
      .update(ChatbotSession)
      .set({
        status: 'expired',
        endReason: 'inactivity',
        // The session ended when the user stopped using it, NOT when this
        // sweep happened to notice. Stamping `new Date()` here inflated every
        // duration by however long the row sat idle before the cron ran — a
        // chat the user left after 2 minutes was reported as the full TTL,
        // well past any limit the widget itself enforces.
        endedAt: () => '"lastActivityAt"',
        endedAfterMessageId: () => ChatbotLeadsService.LAST_MESSAGE_SUBQUERY,
      })
      .where('status = :status AND lastActivityAt < :cutoff', {
        status: 'active',
        cutoff,
      })
      .execute();

    return res.affected ?? 0;
  }

  /**
   * Admin: list all chatbot sessions with their owning lead's name/email/phone
   * inlined. One row per session — used by the Chat History admin page,
   * mirroring how Call History shows one row per voice conversation.
   * Returns newest sessions first by startedAt.
   */
  async findAllSessionsForAdmin(): Promise<AdminSessionRow[]> {
    const rows = await this.chatbotSessionRepository
      .createQueryBuilder('session')
      .innerJoin(ChatbotLead, 'lead', 'lead.id = session.leadId')
      .select([
        'session.id AS id',
        'session.leadId AS "leadId"',
        'session."siteId" AS "siteId"',
        'lead.name AS "leadName"',
        'lead.email AS "leadEmail"',
        'lead.contact AS "leadContact"',
        'session.conversationId AS "conversationId"',
        'session.status AS status',
        'session.endReason AS "endReason"',
        'session.startedAt AS "startedAt"',
        'session.endedAt AS "endedAt"',
        'session.lastActivityAt AS "lastActivityAt"',
        'session.feedbackRating AS "feedbackRating"',
        'session.sentiment AS "sentiment"',
        'session.createdAt AS "createdAt"',
      ])
      .orderBy('session.startedAt', 'DESC')
      .getRawMany<AdminSessionRow>();

    // Resolved from the owning service, not joined: the id is a cuid from the
    // smartcaller database and has no row here. Deduplicated across the whole
    // page, so a few hundred sessions cost a handful of lookups.
    const names = await this.siteNameService.resolveMany(
      rows.map((row) => row.siteId),
    );

    // No feedback submitted → treat the session as Neutral for the admin view.
    return rows.map((row) => ({
      ...row,
      siteName: row.siteId ? (names.get(row.siteId) ?? null) : null,
      sentiment: row.sentiment ?? 'Neutral',
    }));
  }

  /**
   * Admin: fetch a single session with the owning lead and ordered messages.
   * Powers the Chat History detail page.
   */
  async findSessionByIdForAdmin(
    sessionId: string,
  ): Promise<AdminSessionRow & { messages: IChatbotMessage[] }> {
    const row = await this.chatbotSessionRepository
      .createQueryBuilder('session')
      .innerJoin(ChatbotLead, 'lead', 'lead.id = session.leadId')
      .select([
        'session.id AS id',
        'session.leadId AS "leadId"',
        'session."siteId" AS "siteId"',
        'lead.name AS "leadName"',
        'lead.email AS "leadEmail"',
        'lead.contact AS "leadContact"',
        'session.conversationId AS "conversationId"',
        'session.status AS status',
        'session.endReason AS "endReason"',
        'session.startedAt AS "startedAt"',
        'session.endedAt AS "endedAt"',
        'session.lastActivityAt AS "lastActivityAt"',
        'session.feedbackRating AS "feedbackRating"',
        'session.sentiment AS "sentiment"',
        'session.createdAt AS "createdAt"',
      ])
      .where('session.id = :sessionId', { sessionId })
      .getRawOne<AdminSessionRow>();

    if (!row) {
      throw new NotFoundException(
        `Chatbot session with ID ${sessionId} not found`,
      );
    }

    const messages = await this.chatbotMessageRepository.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });

    // No feedback submitted → treat the session as Neutral for the admin view.
    return {
      ...row,
      siteName: row.siteId
        ? await this.siteNameService.resolve(row.siteId)
        : null,
      sentiment: row.sentiment ?? 'Neutral',
      messages: messages as IChatbotMessage[],
    };
  }

  /**
   * Admin: delete one session and its messages. Hard delete in a transaction
   * so we never end up with orphaned messages if the session row deletion
   * fails halfway.
   */
  async removeSession(sessionId: string): Promise<{ message: string }> {
    return await this.dataSource.transaction(async (manager) => {
      const sessionRepo = manager.getRepository(ChatbotSession);
      const messageRepo = manager.getRepository(ChatbotMessage);

      const session = await sessionRepo.findOne({ where: { id: sessionId } });
      if (!session) {
        throw new NotFoundException(
          `Chatbot session with ID ${sessionId} not found`,
        );
      }

      await messageRepo.delete({ sessionId });
      await sessionRepo.remove(session);

      return { message: `Chatbot session ${sessionId} deleted successfully` };
    });
  }
}
