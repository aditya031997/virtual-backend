export interface ICallHistory {
  id: string;
  conversationId: string | null;
  callerName: string | null;
  phoneNumber: string | null;
  callDateTime: Date;
  duration: string | null;
  afterHours: string | null;
  callStatus: string | null;
  facility: string | null;
  siteName: string | null;
  feedback: 'Positive' | 'Neutral' | 'Negative';
  handledBy: string | null;
  isTransferred: boolean;
  humanAgentName: string | null;
  callerNumber: string | null;
  callerEmail: string | null;
  isEscalation: 'not-requested' | 'successful' | 'unsuccessful';
  rationale: string | null;
  callSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateCallHistory {
  conversationId?: string | null;
  callerName?: string | null;
  phoneNumber?: string | null;
  callDateTime: Date;
  duration?: string | null;
  afterHours?: string | null;
  callStatus?: string | null;
  facility?: string | null;
  feedback?: 'Positive' | 'Neutral' | 'Negative';
  handledBy?: string | null;
  isTransferred?: boolean;
  humanAgentName?: string | null;
  callerNumber?: string | null;
  callerEmail?: string | null;
  isEscalation?: 'not-requested' | 'successful' | 'unsuccessful';
  rationale?: string | null;
  callSummary?: string | null;
}

export interface IUpdateCallHistory {
  conversationId?: string | null;
  callerName?: string;
  phoneNumber?: string;
  callDateTime?: Date;
  duration?: string | null;
  afterHours?: string | null;
  callStatus?: string | null;
  facility?: string | null;
  feedback?: 'Positive' | 'Neutral' | 'Negative';
  handledBy?: string | null;
  isTransferred?: boolean;
  humanAgentName?: string | null;
  callerNumber?: string | null;
  callerEmail?: string | null;
  isEscalation?: 'not-requested' | 'successful' | 'unsuccessful';
  rationale?: string | null;
  callSummary?: string | null;
}

export interface ICallHistoryResponse {
  id: string;
  conversationId: string | null;
  callerName: string | null;
  phoneNumber: string | null;
  callDateTime: Date;
  duration: string | null;
  afterHours: string | null;
  callStatus: string | null;
  facility: string | null;
  siteName: string | null;
  feedback: 'Positive' | 'Neutral' | 'Negative';
  handledBy: string | null;
  isTransferred: boolean;
  humanAgentName: string | null;
  callerNumber: string | null;
  callerEmail: string | null;
  isEscalation: 'not-requested' | 'successful' | 'unsuccessful';
  rationale: string | null;
  callSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}
