export interface ILink {
  id: string;
  url: string;
  userId: string;
  documentId?: string;
  createdAt: Date;
}

export interface ILinkResponse {
  id: string;
  title: string;
  url: string;
  description?: string;
  userId: string;
  documentId?: string;
  createdAt: Date;
}

export interface IApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

export interface ILinkService {
  create(createData: Partial<ILink>, userId: string): Promise<ILink>;
  findAll(userId: string): Promise<ILink[]>;
  findById(id: string, userId: string): Promise<ILink>;
  update(
    id: string,
    updateData: Partial<ILink>,
    userId: string,
  ): Promise<ILink>;
  delete(id: string, userId: string): Promise<void>;
}
