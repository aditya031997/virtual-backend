/**
 * Contracts for conversational appointment booking.
 *
 * The widget used to collect facility / hour / minute / nature through a form.
 * These types back the replacement: the user says "can I schedule a meeting
 * with the sales team next week?" and the server works out what it has, what it
 * still needs, and asks for the rest.
 */

/** Departments a meeting can be booked with. */
export const APPOINTMENT_DEPARTMENT = {
  SALES: 'sales',
  SERVICE: 'service',
  ACCOUNT: 'account',
  SUPPORT: 'support',
} as const;

export type AppointmentDepartment =
  (typeof APPOINTMENT_DEPARTMENT)[keyof typeof APPOINTMENT_DEPARTMENT];

export const APPOINTMENT_DEPARTMENT_VALUES: readonly AppointmentDepartment[] =
  Object.values(APPOINTMENT_DEPARTMENT);

/** Why an appointment request cannot yet be submitted. */
export const APPOINTMENT_SLOT_ISSUE = {
  MISSING_DATE: 'missing_date',
  UNRESOLVED_DATE: 'unresolved_date',
  DATE_IN_PAST: 'date_in_past',
  MISSING_TIME: 'missing_time',
  UNRESOLVED_TIME: 'unresolved_time',
  MISSING_NATURE: 'missing_nature',
  /** The chosen day is closed or a public holiday. */
  DAY_UNAVAILABLE: 'day_unavailable',
  /** No usable phone number for the team to call back on. */
  MISSING_CONTACT: 'missing_contact',
  UNRESOLVED_DEPARTMENT: 'unresolved_department',
} as const;

export type AppointmentSlotIssue =
  (typeof APPOINTMENT_SLOT_ISSUE)[keyof typeof APPOINTMENT_SLOT_ISSUE];

/** One thing still needed before the appointment can be booked. */
export interface IAppointmentSlotGap {
  issue: AppointmentSlotIssue;
  /** Question to put to the user. */
  question: string;
  /** Options to offer, when the gap is a choice rather than free text. */
  candidates?: string[];
}

/** A fully resolved appointment request, ready to persist. */
export interface IResolvedAppointment {
  /** ISO "YYYY-MM-DD". */
  preferredDate: string;
  /** 24h "HH:MM". */
  preferredTime: string;
  department: AppointmentDepartment | null;
  careFacilityLocation: string | null;
  natureOfRequest: string;
  /** Number the team should call back on. */
  contactNumber: string;
}

/**
 * Result of grounding a natural-language appointment request.
 *
 * Either complete (`isComplete` true, `appointment` set) or the chatbot must
 * ask about `gaps` first. Never both.
 */
export interface IAppointmentResolution {
  isComplete: boolean;
  appointment: IResolvedAppointment | null;
  gaps: IAppointmentSlotGap[];
  /** Read-back of the booking for the user to confirm before submitting. */
  summary: string | null;
}
