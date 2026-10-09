export interface ISite {
  id: string;
  siteName: string;
  parentCompanyId: string | null;
  assignedDealerId: string | null;
  email: string;
  contactNumber: string;
  businessAddress: string;
  state: string | null;
  stateCode: string | null;
  city: string | null;
  description: string | null;
  userId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISiteResponse {
  id: string;
  siteName: string;
  parentCompanyId: string | null;
  assignedDealerId: string | null;
  email: string;
  contactNumber: string;
  businessAddress: string;
  state: string | null;
  stateCode: string | null;
  city: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISiteWithRelations extends ISite {
  parentCompany?: {
    id: string;
    companyName: string;
  };
  assignedDealer?: {
    id: string;
    dealerName: string;
  };
}
