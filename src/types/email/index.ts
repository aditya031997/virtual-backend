export interface IEmailParams {
  to: string | string[];
  subject: string;
  body: {
    text?: string;
    html?: string;
  };
  from?: string; // Optional, uses default if not provided
  replyTo?: string;
}

export interface IEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface IAppointmentEmailData {
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  // Optional: conversational booking may omit a facility or a time, whereas
  // the old widget form always collected both. The template already renders
  // a placeholder for blanks.
  careFacilityLocation?: string | null;
  preferredTime?: string | null;
  /** Preferred date as ISO "YYYY-MM-DD", when the user gave one. */
  preferredDate?: string | null;
  /** Team the user asked for, e.g. "sales". */
  department?: string | null;
  natureOfRequest: string;
}

export interface IReturnRequestEmailData {
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  productName: string;
  orderId: string;
  reasonForReturn: string;
  returnAddress: string;
  /** Optional alternate contact number for this return (not persisted). */
  alternateNumber?: string | null;
  /** Department the user chose (sales | service | account) — routes the email
   *  to that department's inbox. Not persisted. */
  departmentType?: string | null;
}

export interface IEscalationEmailData {
  callerName: string;
  callerEmail: string;
  callerPhone: string;
  callbackNumber?: string;
  dealerCode?: string;
  callSummary?: string;
  callTranscript?: string;
  siteInfo?: {
    siteName?: string | null;
    email?: string | null;
    contactNumber?: string | null;
    assignedDealer?: {
      dealerCode?: string | null;
      dealerName?: string | null;
      phone?: string | null;
      email?: string | null;
    } | null;
  };
}
