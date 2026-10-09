import type { Response } from 'express';

/**
 * SSE Client Interface
 */
export interface SSEClient {
  id: string;
  response: Response;
  userId?: string;
}
