export interface IFaq {
  id: string;
  question: string;
  answer: string;
  folderId: string;
  documentId?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
