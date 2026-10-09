export interface IEmailReply {
  id: string;
  supportEmailId: string;
  fromEmail: string;
  toEmail: string;
  subject: string | null;
  replyContent: string;
  status: 'draft' | 'sent';
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateEmailReply {
  supportEmailId: string;
  fromEmail: string;
  toEmail: string;
  subject?: string | null;
  replyContent: string;
  status?: 'draft' | 'sent';
}

export interface IUpdateEmailReply {
  subject?: string | null;
  replyContent?: string;
  status?: 'draft' | 'sent';
}

export interface IEmailReplyResponse {
  success: boolean;
  data: IEmailReply | IEmailReply[] | null;
  total?: number;
  message: string;
}

export interface IEmailReplyWithOriginal extends IEmailReply {
  originalEmail?: {
    id: string;
    subject: string | null;
    fromEmail: string;
    fromName: string | null;
  };
}
