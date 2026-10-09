// Agent Assignment Interface
export interface IAgentAssignment {
  humanAgentId: string;
  priority: string;
}

// Care Facility Response Interface
export interface ICareFacilityResponse {
  id: string;
  facilityCode: string;
  facilityName: string;
  reseller: string;
  agentAssignments: IAgentAssignment[];
  userId: string;
  user?: {
    id: string;
    name?: string;
    email?: string;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Paginated Response Interface
export interface IPaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Search Filters Interface
export interface ISearchFilters {
  facilityCode?: string;
  facilityName?: string;
  reseller?: string;
  isActive?: boolean;
  userId?: string;
}

// Service Response Interface
export interface IServiceResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

// Agent with Details Interface (for joining with HumanAgent data)
export interface IAgentWithDetails extends IAgentAssignment {
  agentName?: string;
  email?: string;
  phone?: string;
  isAvailable?: boolean;
}
