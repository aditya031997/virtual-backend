export interface ISupportEmail {
  id: string;
  uid: number;
  messageId: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string | null;
  emailDate: Date;
  bodyText: string | null;
  bodyHtml: string | null;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateSupportEmail {
  uid: number;
  messageId?: string | null;
  fromEmail: string;
  fromName?: string | null;
  toEmails?: string[];
  subject?: string | null;
  emailDate: Date;
  bodyText?: string | null;
  bodyHtml?: string | null;
  isRead?: boolean;
}

export interface ISupportEmailResponse {
  success: boolean;
  data: ISupportEmail | ISupportEmail[] | null;
  total?: number;
  newEmails?: number;
  message: string;
}

export interface IImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  tlsOptions: { rejectUnauthorized: boolean };
}
