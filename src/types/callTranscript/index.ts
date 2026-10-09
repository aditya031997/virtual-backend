export interface ITranscriptMessage {
  role: 'agent' | 'user';
  message: string;
  timeInCallSecs: string;
}

export type Transcript = ITranscriptMessage[];

export interface ICallTranscript {
  id: string;
  conversationId: string;
  transcript: Transcript;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateCallTranscript {
  conversationId: string;
  transcript: Transcript;
}

export interface IUpdateCallTranscript {
  conversationId?: string;
  transcript?: Transcript;
}

export interface ICallTranscriptResponse {
  id: string;
  conversationId: string;
  transcript: Transcript;
  createdAt: Date;
  updatedAt: Date;
}
