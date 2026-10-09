import { Controller, Get, Res, Query, UnauthorizedException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { SSEService } from '@/sse/sseService';
import { v4 as uuidv4 } from 'uuid';

/**
 * SSE Controller
 * Handles Server-Sent Events connections
 */
@Controller('sse')
export class SSEController {
  private readonly logger = new Logger(SSEController.name);

  constructor(
    private readonly sseService: SSEService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * SSE Stream Endpoint
   * GET /api/sse/stream?token=JWT_TOKEN
   */
  @Get('stream')
  async streamEvents(
    @Query('token') token: string,
    @Res() response: Response,
  ): Promise<void> {
    // Validate token
    if (!token) {
      throw new UnauthorizedException('Access token is required');
    }

    try {
      // Verify JWT token
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'your-secret-key',
      });

      const clientId = uuidv4();
      const userId = payload?.sub;

      this.logger.log(`New SSE connection: client=${clientId}, user=${userId}`);

      // Add client to SSE service
      this.sseService.addClient(clientId, response, userId);

      // Keep connection alive with periodic heartbeat
      const heartbeatInterval = setInterval(() => {
        try {
          if (!response.destroyed) {
            response.write(': heartbeat\n\n');
          } else {
            clearInterval(heartbeatInterval);
          }
        } catch (error) {
          this.logger.error(`Error sending heartbeat to ${clientId}:`, error);
          clearInterval(heartbeatInterval);
          this.sseService.removeClient(clientId);
        }
      }, 30000); // Send heartbeat every 30 seconds

      // Clean up on client disconnect
      response.on('close', () => {
        clearInterval(heartbeatInterval);
        this.sseService.removeClient(clientId);
      });
    } catch (error) {
      this.logger.error(`SSE authentication failed: ${error.message}`);
      if (!response.headersSent) {
        response.status(401).json({ message: 'Invalid token' });
      }
    }
  }
}

