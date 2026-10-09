import type { IUser } from '@/types/auth';
import type { IDealer } from '@/types/dealer';

export interface IUpdateAvailabilityRequest {
  isAvailable: boolean;
}

export interface IMessageResponse {
  message: string;
}

export interface ISupportType {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IHumanAgent {
  id: string;
  agentName: string;
  phone: string;
  email: string;
  priority: 'P1' | 'P2' | 'P3';
  description?: string;
  state?: string;
  stateCode?: string;
  city?: string;
  isActive: boolean;
  isAvailable: boolean;
  dealerId: string;
  userId: string;
  supportTypeId: string;
  dealer?: IDealer;
  user?: IUser;
  supportType?: ISupportType;
  createdAt: Date;
  updatedAt: Date;
}
