import { User } from '@/schema/user/user.entity';

export interface IDealer {
  id: string;
  dealerCode: string;
  dealerName: string;
  phone: string;
  email: string;
  businessAddress: string;
  state?: string;
  stateCode?: string;
  city?: string;
  description?: string;
  userId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  user?: User;
}

export interface ICreateDealerData {
  dealerCode?: string;
  dealerName: string;
  phone: string;
  email: string;
  businessAddress: string;
  state?: string;
  stateCode?: string;
  city?: string;
  description?: string;
  userId: string;
  isActive?: boolean;
}

export interface IUpdateDealerData {
  dealerName?: string;
  phone?: string;
  email?: string;
  businessAddress?: string;
  state?: string;
  stateCode?: string;
  city?: string;
  description?: string;
  isActive?: boolean;
}

export interface IDealerWithAgents {
  success: boolean;
  dealerName: string;
  dealerEmail: string;
  dealerPhone: string;
  primaryAgent: {
    name: string;
    contactNumber: string;
    priority: 'P1' | 'P2' | 'P3';
  } | null;
  fallbackAgents: Array<{
    name: string;
    contactNumber: string;
    priority: 'P1' | 'P2' | 'P3';
  }>;
}

export interface IDealerService {
  create(createData: ICreateDealerData): Promise<IDealer>;
  findAll(): Promise<IDealer[]>;
  findOne(id: string): Promise<IDealer>;
  findByDealerCode(dealerCode: string): Promise<IDealer>;
  update(id: string, updateData: IUpdateDealerData): Promise<IDealer>;
  remove(id: string): Promise<{ message: string }>;
  search(params: {
    query?: string;
    name?: string;
    email?: string;
    dealerCode?: string;
  }): Promise<IDealer[]>;
}
