import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { SSEClient } from '@/types/sse';

/**
 * SSE Service
 * Manages Server-Sent Events connections and broadcasting
 */
@Injectable()
export class SSEService {
  private readonly logger = new Logger(SSEService.name);
  private clients: Map<string, SSEClient> = new Map();

  /**
   * Add a new SSE client connection
   */
  addClient(clientId: string, response: Response, userId?: string): void {
    // Set SSE headers
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Store client
    this.clients.set(clientId, {
      id: clientId,
      response,
      userId,
    });

    this.logger.log(`SSE client connected: ${clientId} (Total: ${this.clients.size})`);

    // Send initial connection message
    this.sendToClient(clientId, {
      type: 'connected',
      message: 'SSE connection established',
      timestamp: new Date().toISOString(),
    });

    // Handle client disconnect
    response.on('close', () => {
      this.removeClient(clientId);
    });
  }

  /**
   * Remove a client connection
   */
  removeClient(clientId: string): void {
    if (this.clients.has(clientId)) {
      this.clients.delete(clientId);
      this.logger.log(`SSE client disconnected: ${clientId} (Total: ${this.clients.size})`);
    }
  }

  /**
   * Send event to a specific client
   */
  sendToClient(clientId: string, data: any): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    try {
      const eventData = `data: ${JSON.stringify(data)}\n\n`;
      client.response.write(eventData);
      return true;
    } catch (error) {
      this.logger.error(`Error sending SSE to client ${clientId}:`, error);
      this.removeClient(clientId);
      return false;
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(data: any): number {
    let sentCount = 0;
    const disconnectedClients: string[] = [];

    this.clients.forEach((client, clientId) => {
      try {
        const eventData = `data: ${JSON.stringify(data)}\n\n`;
        client.response.write(eventData);
        sentCount++;
      } catch (error) {
        this.logger.error(`Error broadcasting to client ${clientId}:`, error);
        disconnectedClients.push(clientId);
      }
    });

    // Clean up disconnected clients
    disconnectedClients.forEach((clientId) => this.removeClient(clientId));

    if (sentCount > 0) {
      this.logger.log(`Broadcasted event to ${sentCount} client(s)`);
    }

    return sentCount;
  }

  /**
   * Emit call history created event
   */
  emitCallHistoryCreated(conversationId: string, callHistoryData?: any): void {
    const event = {
      type: 'call-history-created',
      conversationId,
      callHistory: callHistoryData,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(`Emitting call-history-created event: ${conversationId}`);
    this.broadcast(event);
  }

  /**
   * Emit support email fetched event
   */
  emitSupportEmailFetched(newEmailsCount: number, emailData?: any): void {
    const event = {
      type: 'support-email-fetched',
      newEmailsCount,
      emails: emailData,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(`Emitting support-email-fetched event: ${newEmailsCount} new email(s)`);
    this.broadcast(event);
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }
}

