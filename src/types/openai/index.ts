export interface IGenerateReplyParams {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  subject: string;
  transcript?: string;
  emailBody?: string;
  dealerCode?: string;
}

export interface IGenerateReplyResult {
  success: boolean;
  generatedReply?: string;
  error?: string;
}
