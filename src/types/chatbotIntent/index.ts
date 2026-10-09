/**
 * Intent classification contracts for the conversational chatbot.
 *
 * The chatbot used to route by menu selection ("General Query" / "Report
 * Generation" / "Appointment Booking"). These types back the replacement: the
 * user writes freely and the server infers which capability they want, plus any
 * detail slots it can already read out of the sentence.
 */

/**
 * Capabilities the chatbot can route a message to.
 *
 * Kept as a const object (not a TS `enum`) so the values can be reused directly
 * as a runtime array for validating model output — an LLM returning anything
 * outside this set is rejected rather than trusted.
 */
export const CHATBOT_INTENT = {
  GENERAL_QUERY: 'general_query',
  REPORT_GENERATION: 'report_generation',
  APPOINTMENT_BOOKING: 'appointment_booking',
  HUMAN_CALLBACK: 'human_callback',
  RETURN_REQUEST: 'return_request',
  /** Message carries no actionable intent (greeting, gibberish, empty). */
  UNKNOWN: 'unknown',
} as const;

export type ChatbotIntent =
  (typeof CHATBOT_INTENT)[keyof typeof CHATBOT_INTENT];

export const CHATBOT_INTENT_VALUES: readonly ChatbotIntent[] =
  Object.values(CHATBOT_INTENT);

/**
 * Slots the classifier may extract for a report request.
 *
 * Everything here is the user's own words, NOT resolved database ids. Grounding
 * free text against real locations/clients/alarm types happens in Phase 2 —
 * keeping raw text separate from resolved ids is what stops a hallucinated
 * entity name from reaching the report API.
 */
export interface IReportIntentSlots {
  /** Free-text description of the report wanted, e.g. "calls over 5 minutes". */
  reportDescription?: string;
  /** Raw date phrase as written, e.g. "yesterday", "last 30 days". */
  dateRangeText?: string;
  /** Location/room/wing as written, e.g. "Room 5", "Wing A". */
  locationText?: string;
  /** Alarm type as written, e.g. "fall alarms". */
  alarmTypeText?: string;
  /** Shift as written, e.g. "night shift". */
  shiftText?: string;
  /** Duration filter as written, e.g. "longer than 5 minutes". */
  durationText?: string;
  /** Requested output format as written, e.g. "PDF", "excel". */
  fileFormatText?: string;
}

/** Slots the classifier may extract for an appointment request. */
export interface IAppointmentIntentSlots {
  /** Date phrase as written, e.g. "next week", "Tuesday". */
  dateText?: string;
  /** Time phrase as written, e.g. "morning", "3pm". */
  timeText?: string;
  /** Team/department as written, e.g. "sales team". */
  departmentText?: string;
  /** Facility or site as written. */
  facilityText?: string;
  /** Why they want the meeting. */
  natureOfRequest?: string;
  /** Phone number as written, when the user volunteers one. */
  contactText?: string;
}

/** Union of per-intent slot bags. Empty for intents that carry no slots. */
export interface IChatbotIntentSlots {
  report?: IReportIntentSlots;
  appointment?: IAppointmentIntentSlots;
}

/** Raw shape we ask the model to return. Validated before use. */
export interface IRawIntentClassification {
  intent?: unknown;
  confidence?: unknown;
  slots?: unknown;
  clarifyingQuestion?: unknown;
}

/** Validated classification result returned to the caller. */
export interface IChatbotIntentResult {
  intent: ChatbotIntent;
  /** Model self-reported confidence, clamped to 0..1. */
  confidence: number;
  /**
   * True when confidence cleared the routing threshold. When false the caller
   * must ask `clarifyingQuestion` instead of acting on `intent`.
   */
  isConfident: boolean;
  slots: IChatbotIntentSlots;
  /**
   * Question to ask when intent is ambiguous or required detail is missing.
   * Always present when `isConfident` is false.
   */
  clarifyingQuestion: string | null;
  /** True when the classifier fell back to heuristics (LLM unavailable). */
  usedFallback: boolean;
}

/** One prior turn of conversation, used to disambiguate follow-up messages. */
export interface IIntentConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}
