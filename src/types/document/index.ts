/**
 * Who a document may be disclosed to.
 *
 * Ordered least to most restrictive. SITE is the default everywhere — a
 * document with no explicit visibility must never be treated as public, so
 * anything uploaded before this field existed (and anything uploaded by a
 * caller that omits it) stays restricted until an admin widens it.
 */
export enum DocumentVisibility {
  PUBLIC = 'public',
  DEALER = 'dealer',
  SITE = 'site',
}

export const DEFAULT_DOCUMENT_VISIBILITY = DocumentVisibility.SITE;

export interface IDocument {
  id: string;
  documentId?: string;
  status?: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  folderId: string;
  userId: string;
  visibility: DocumentVisibility;
  createdAt: Date;
}

export interface IDocumentResponse {
  id: string;
  documentId?: string;
  status?: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  folderId: string;
  userId: string;
  visibility: DocumentVisibility;
  createdAt: Date;
  folder?: {
    id: string;
    name: string;
  };
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface IDocumentQuery {
  folderId?: string;
  userId?: string;
  fileType?: string;
  documentId?: string;
}
export interface IDocumentApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  count?: number;
}
