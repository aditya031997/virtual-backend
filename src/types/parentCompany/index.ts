export interface IParentCompany {
  id: string;
  companyName: string;
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

export interface IParentCompanyResponse {
  id: string;
  companyName: string;
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
