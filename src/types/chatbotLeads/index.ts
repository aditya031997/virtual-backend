export interface IChatbotLead {
  id: string;
  name: string;
  email: string;
  contact: string | null;
  chatStatus: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateChatbotLeadData {
  name: string;
  email: string;
  contact?: string | null;
  chatStatus?: string;
  isActive?: boolean;
  /** Site the widget was embedded on. Recorded per session, not per lead — a
   *  returning visitor can start sessions from more than one site. */
  siteId?: string | null;
}

export interface IUpdateChatbotLeadData {
  name?: string;
  email?: string;
  contact?: string | null;
  chatStatus?: string;
  isActive?: boolean;
}

export interface IChatbotLeadSearchParams {
  query?: string;
  name?: string;
  email?: string;
  chatStatus?: string;
  isActive?: boolean;
}

export type ChatbotMessageRole = 'user' | 'bot' | 'system';

export interface IChatbotMessage {
  id: string;
  sessionId: string;
  role: ChatbotMessageRole;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export type ChatbotLeadProfileField = 'name' | 'email' | 'contact';
export type ChatbotLeadProfileChangeType = 'initial' | 'update';

export interface IChatbotLeadProfileChange {
  id: string;
  leadId: string;
  /** Session the change happened in; null for admin edits / legacy rows. */
  sessionId: string | null;
  /** 'initial' = creation baseline snapshot, 'update' = a later edit. */
  changeType: ChatbotLeadProfileChangeType;
  field: ChatbotLeadProfileField;
  oldValue: string | null;
  newValue: string | null;
  changedAt: Date;
}

/** A name/email/phone snapshot. */
export interface IProfileSnapshot {
  name: string | null;
  email: string | null;
  contact: string | null;
}

/**
 * Pre-computed profile summary so the frontend can render "previous vs
 * current" boxes with zero logic.
 */
export interface IProfileSummary {
  /** Values captured at first creation (the 'initial' baseline). */
  initial: IProfileSnapshot;
  /** Values just before the most recent change of each field. */
  previous: IProfileSnapshot;
  /** Current values on the lead. */
  current: IProfileSnapshot;
  /** Fields that have ever been updated after creation. */
  changedFields: ChatbotLeadProfileField[];
  hasChanges: boolean;
}

/** Profile changes grouped by the session they occurred in. */
export interface IProfileHistorySession {
  sessionId: string | null;
  changeType: ChatbotLeadProfileChangeType;
  changedAt: Date;
  changes: IChatbotLeadProfileChange[];
}

export type ChatbotSessionStatus = 'active' | 'ended' | 'expired';

/** Reasons a session ended. Client-driven ones are restricted via DTO. */
export type ChatbotSessionEndReason =
  | 'manual'
  | 'inactivity'
  | 'tab_close'
  | 'superseded'
  | 'expired'
  | 'feedback_given'
  | 'neutral_timeout';

/** End-of-session sentiment derived from the 1-10 feedback rating. */
export type ChatbotSentiment = 'Positive' | 'Neutral' | 'Negative';

export interface IChatbotSession {
  id: string;
  leadId: string;
  status: string;
  endReason: string | null;
  conversationId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  endedAfterMessageId: string | null;
  lastActivityAt: Date;
  feedbackRating: number | null;
  sentiment: ChatbotSentiment | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISetSessionConversationData {
  sessionId: string;
  conversationId: string;
  leadId?: string;
}

/** Reasons the client is allowed to send to /session/end. */
export type ClientSessionEndReason =
  | 'manual'
  | 'inactivity'
  | 'tab_close'
  | 'feedback_given'
  | 'neutral_timeout';

export interface ISubmitChatbotSessionFeedbackData {
  sessionId: string;
  leadId?: string;
  /** 1-10 rating; sentiment is derived server-side. */
  rating: number;
}

export interface IEndSessionData {
  sessionId: string;
  leadId?: string;
  reason: ClientSessionEndReason;
}

export interface IAppendChatbotMessageData {
  sessionId: string;
  role: ChatbotMessageRole;
  content: string;
  metadata?: Record<string, unknown> | null;
}

export interface ICreateChatbotAppointmentData {
  leadId: string;
  sessionId?: string | null;
  // Optional since conversational booking may omit them; the widget form
  // always supplied both.
  careFacilityLocation?: string | null;
  preferredTime?: string | null;
  /** Preferred date as ISO "YYYY-MM-DD", resolved from phrases like "next Tuesday". */
  preferredDate?: string | null;
  /** Team the user asked for, e.g. "sales". */
  department?: string | null;
  /** Number given in conversation, when the lead's own contact is unknown. */
  contactNumber?: string | null;
  natureOfRequest: string;
}

export interface IChatbotAppointment {
  id: string;
  leadId: string;
  sessionId: string | null;
  name: string;
  email: string;
  contact: string | null;
  careFacilityLocation: string | null;
  preferredTime: string | null;
  preferredDate: string | null;
  department: string | null;
  natureOfRequest: string;
  status: string;
  emailSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateChatbotReturnRequestData {
  leadId: string;
  sessionId?: string | null;
  productName: string;
  orderId: string;
  reasonForReturn: string;
  returnAddress: string;
  /** Optional alternate contact number — NOT persisted; included in the
   *  notification emails only. */
  alternateNumber?: string | null;
  /** Department (sales | service | account) — NOT persisted; routes the
   *  return email to that department inbox. */
  departmentType?: string | null;
}

export interface IChatbotReturnRequest {
  id: string;
  leadId: string;
  sessionId: string | null;
  name: string;
  email: string;
  contact: string | null;
  productName: string;
  orderId: string;
  reasonForReturn: string;
  returnAddress: string;
  status: string;
  emailSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Backward-compatible superset returned by POST /chatbot-leads/create.
 * Spreads the lead so existing consumers reading name/email/etc. keep working,
 * while adding the active session id and prior history for the widget.
 */
/**
 * Final state of the most recent prior session. The frontend renders the
 * "Previous session ended" divider immediately AFTER the history message whose
 * id === endedAfterMessageId (or before the new session if it is null).
 */
export interface IPreviousSessionInfo {
  id: string;
  endReason: ChatbotSessionEndReason | null;
  endedAt: Date | null;
  endedAfterMessageId: string | null;
}

export interface IChatbotLeadStartResult extends IChatbotLead {
  isReturning: boolean;
  sessionId: string;
  /** Always 'new' in this model — a fresh session is created per visit. */
  sessionStatus: 'new';
  /** True if the lead had at least one prior session before this one. */
  previousSessionEnded: boolean;
  /** End reason of the most recent prior session, or null if none. */
  endedReason: ChatbotSessionEndReason | null;
  /** Id of the most recent prior session, or null if none. */
  previousSessionId: string | null;
  /** Full final state of the most recent prior session, or null if none. */
  previousSession: IPreviousSessionInfo | null;
  history: IChatbotMessage[];
  /**
   * Flat profile change audit, oldest-first. Each row carries sessionId +
   * changeType ('initial' | 'update') so the frontend can identify origin.
   */
  profileHistory: IChatbotLeadProfileChange[];
  /** Pre-computed initial / previous / current snapshots for easy rendering. */
  profile: IProfileSummary;
  /** Same audit grouped by the session each change happened in. */
  profileHistoryBySession: IProfileHistorySession[];
}

export interface IChatbotLeadService {
  create(createData: ICreateChatbotLeadData): Promise<IChatbotLeadStartResult>;
  findAll(): Promise<IChatbotLead[]>;
  findOne(id: string): Promise<IChatbotLead>;
  search(params: IChatbotLeadSearchParams): Promise<IChatbotLead[]>;
  update(id: string, updateData: IUpdateChatbotLeadData): Promise<IChatbotLead>;
  remove(id: string): Promise<{ message: string }>;
  appendMessage(data: IAppendChatbotMessageData): Promise<IChatbotMessage>;
  getHistory(leadId: string): Promise<IChatbotMessage[]>;
  createAppointment(
    data: ICreateChatbotAppointmentData,
  ): Promise<IChatbotAppointment>;
  createReturnRequest(
    data: ICreateChatbotReturnRequestData,
  ): Promise<IChatbotReturnRequest>;
  submitSessionFeedback(
    data: ISubmitChatbotSessionFeedbackData,
  ): Promise<IChatbotSession>;
  setSessionConversationId(
    data: ISetSessionConversationData,
  ): Promise<IChatbotSession>;
  endSession(data: IEndSessionData): Promise<IChatbotSession>;
  touchSessionActivity(sessionId: string): Promise<IChatbotSession>;
  expireInactiveSessions(ttlMinutes: number): Promise<number>;
  getProfileChangeHistory(leadId: string): Promise<IChatbotLeadProfileChange[]>;
}
