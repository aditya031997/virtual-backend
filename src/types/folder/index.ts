export interface IFolder {
  id: string;
  folderName: string;
  section: string;
  userId: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateFolder {
  folderName: string;
  section: string;
  parentId?: string | null;
}

export interface IUpdateFolder {
  folderName?: string;
}

export interface IFolderQuery {
  section?: string;
  parentId?: string | null;
}

export interface IFolderResponse {
  success: boolean;
  message: string;
  data?: IFolder | IFolder[];
}

export interface IFolderDeleteResponse {
  success: boolean;
  message: string;
  data?: {
    deletedDocuments: number;
    deletedFaqs: number;
    deletedFromKnowledgeBase: number;
    errors?: string[];
  };
}
