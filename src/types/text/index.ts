export interface IText {
  id: string;
  content: string;
  userId: string;
  documentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITextResponse {
  id: string;
  content: string;
  userId: string;
  documentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITextService {
  create(createData: Partial<IText>): Promise<IText>;
  findAll(userId: string): Promise<IText[]>;
  update(
    id: string,
    updateData: Partial<IText>,
    userId: string,
  ): Promise<IText>;
}
