/**
 * Contracts for turning a natural-language report request into a validated
 * payload for the Smart-Caller report API (`POST /reports/chatbot/generate`).
 *
 * Phase 1 (intent classification) extracts the user's raw words. This layer
 * grounds those words against real site data and resolves them into the ids,
 * enum values and ISO dates the report API requires.
 */

/**
 * Report types supported by the Smart-Caller report API.
 *
 * Mirrors REPORT_TYPE in the smartcaller backend
 * (`report-data.interface.ts`). Duplicated rather than imported because the two
 * services are separate deployables with no shared package — the spec file
 * asserts the values stay in step.
 */
export const REPORT_TYPE = {
  SUMMARY: 1,
  DETAILED_EVENT: 2,
  RESPONSE_TIME_BY_SHIFT: 3,
  EXCESSIVE_RESPONSE: 4,
  CARE_MINUTES: 5,
  ALARMS_BY_TYPE: 6,
  ALARMS_BY_ID: 7,
  LIST_OF_ALARMS: 8,
  LOW_BATTERY: 9,
} as const;

export type ReportType = (typeof REPORT_TYPE)[keyof typeof REPORT_TYPE];

export const REPORT_TYPE_LABELS: Readonly<Record<ReportType, string>> = {
  [REPORT_TYPE.SUMMARY]: 'Summary Report',
  [REPORT_TYPE.DETAILED_EVENT]: 'Detailed Alarm History',
  [REPORT_TYPE.RESPONSE_TIME_BY_SHIFT]: 'Response Time by Shift',
  [REPORT_TYPE.EXCESSIVE_RESPONSE]: 'Excessive Response Duration',
  [REPORT_TYPE.CARE_MINUTES]: 'Care Minutes Report',
  [REPORT_TYPE.ALARMS_BY_TYPE]: 'Alarms by Type',
  [REPORT_TYPE.ALARMS_BY_ID]: 'Alarms by ID',
  [REPORT_TYPE.LIST_OF_ALARMS]: 'List of Alarms',
  [REPORT_TYPE.LOW_BATTERY]: 'Low Battery Report',
};

/** Output formats accepted by the report API. Note: 2 is intentionally unused. */
export const REPORT_FILE_FORMAT = {
  CSV: 1,
  EXCEL: 3,
  PDF: 4,
} as const;

export type ReportFileFormat =
  (typeof REPORT_FILE_FORMAT)[keyof typeof REPORT_FILE_FORMAT];

/**
 * Report types that additionally require a threshold, in seconds.
 * Submitting these without `thresholdSeconds` is a 400 from the report API.
 */
export const REPORT_TYPES_REQUIRING_THRESHOLD: readonly ReportType[] = [
  REPORT_TYPE.EXCESSIVE_RESPONSE,
];

/**
 * Report types that additionally require target A and target B, in seconds.
 * Submitting these without both is a 400 from the report API.
 */
export const REPORT_TYPES_REQUIRING_SUMMARY_TARGETS: readonly ReportType[] = [
  REPORT_TYPE.SUMMARY,
];

export function reportTypeRequiresThreshold(type: ReportType): boolean {
  return REPORT_TYPES_REQUIRING_THRESHOLD.includes(type);
}

export function reportTypeRequiresSummaryTargets(type: ReportType): boolean {
  return REPORT_TYPES_REQUIRING_SUMMARY_TARGETS.includes(type);
}

/** A selectable entity on a site, as returned by the lookup endpoints. */
export interface IReportLookupOption {
  id: string;
  label: string;
}

/** All lookup lists for one site. */
export interface IReportLookups {
  locations: IReportLookupOption[];
  clients: IReportLookupOption[];
  alarmTypes: IReportLookupOption[];
  shifts: IReportLookupOption[];
}

/** Outcome of matching one piece of user text against a lookup list. */
export interface IEntityMatch {
  /** The user's original words. */
  text: string;
  /** Matched option, or null when nothing matched confidently. */
  matched: IReportLookupOption | null;
  /**
   * Options offered when the text was ambiguous or unmatched, so the chatbot
   * can ask the user to choose rather than guessing.
   */
  candidates: IReportLookupOption[];
}

/** A resolved, absolute date range in ISO-8601 UTC. */
export interface IResolvedDateRange {
  startDate: string;
  endDate: string;
  /** Human-readable description for the confirmation message. */
  description: string;
}

/**
 * Payload accepted by `POST /reports/chatbot/generate`.
 *
 * Field-for-field mirror of `ChatbotGenerateReportDto` in the smartcaller
 * backend. Conditional fields are optional here and enforced by
 * `validateReportPayload` before the request is sent.
 */
export interface IReportPayload {
  siteId: string;
  name: string;
  type: ReportType;
  fileFormat: ReportFileFormat;
  startDate: string;
  endDate: string;
  locationIds?: string[];
  clientIds?: string[];
  alarmTypeIds?: string[];
  shiftIds?: string[];
  thresholdSeconds?: number;
  targetASeconds?: number;
  targetBSeconds?: number;
  timezone?: string;
  showAlarmsBetweenDates?: boolean;
  fromTime?: string;
  toTime?: string;
}

/** Why a report request could not be completed from what the user said. */
export const REPORT_SLOT_ISSUE = {
  MISSING_REPORT_TYPE: 'missing_report_type',
  MISSING_DATE_RANGE: 'missing_date_range',
  UNRESOLVED_DATE_RANGE: 'unresolved_date_range',
  UNRESOLVED_LOCATION: 'unresolved_location',
  UNRESOLVED_ALARM_TYPE: 'unresolved_alarm_type',
  UNRESOLVED_SHIFT: 'unresolved_shift',
  MISSING_THRESHOLD: 'missing_threshold',
  MISSING_SUMMARY_TARGETS: 'missing_summary_targets',
} as const;

export type ReportSlotIssue =
  (typeof REPORT_SLOT_ISSUE)[keyof typeof REPORT_SLOT_ISSUE];

/**
 * A searchable catalogue the client should render as a dropdown.
 *
 * Used instead of `candidates` when the option set is open-ended: rendering one
 * button per report is fine at nine entries and unusable at a hundred, so the
 * client fetches pages from `endpoint` as the user types and scrolls.
 */
export interface IReportSlotPicker {
  /** Relative path to search, e.g. "/chatbot-report/types". */
  endpoint: string;
  /** Placeholder for the search box. */
  searchPlaceholder: string;
}

/** One thing the chatbot still needs before it can generate the report. */
export interface IReportSlotGap {
  issue: ReportSlotIssue;
  /** Question to put to the user. */
  question: string;
  /**
   * A short, closed set of options to offer inline — typically the near-misses
   * from a failed entity match. Omitted when `picker` is present.
   */
  candidates?: IReportLookupOption[];
  /** Set when the answer comes from a searchable catalogue instead. */
  picker?: IReportSlotPicker;
}

/**
 * Result of grounding a natural-language report request.
 *
 * Either the payload is complete (`isComplete` true, `payload` set) or the
 * chatbot must ask about `gaps` first. Never both.
 */
export interface IReportResolution {
  isComplete: boolean;
  payload: IReportPayload | null;
  gaps: IReportSlotGap[];
  /**
   * One-sentence read-back of what will be generated, shown to the user for
   * confirmation before anything runs.
   */
  summary: string | null;
}
