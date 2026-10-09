export class HumanAgentResponseDto {
  id: string;
  agentName: string;
  phone: string;
  email: string;

  dealerId: string;
  dealer: {
    id: string;
    dealerName: string;
    phone: string;
    email: string;
    businessAddress: string;
    isActive: boolean;
  };
  
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };

  isActive: boolean;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}