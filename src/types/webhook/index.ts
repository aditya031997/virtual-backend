export interface IConversation {
  id: string;
  agentId?: string;
  agentName?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, any>;
  messages?: IConversationMessage[];
  [key: string]: any; // Allow for additional properties from ElevenLabs API
}

export interface IConversationMessage {
  id?: string;
  role?: 'user' | 'assistant' | 'system';
  content?: string;
  timestamp?: string;
  [key: string]: any; // Allow for additional properties from ElevenLabs API
}

export interface IConversationResponse {
  success: boolean;
  message: string;
  conversation: IConversation;
}

export interface IConversationError {
  success: boolean;
  message: string;
  error?: string;
  statusCode?: number;
}

export interface IWebhookDealerWithAgents {
  success: boolean;
  dealerName: string;
  dealerEmail: string;
  dealerPhone: string;
  totalAgents: number;
  agents: Array<{
    id: string;
    name: string;
    contactNumber: string;
    email: string;
    priority: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
    priorityIndex: number;
  }>;
}
