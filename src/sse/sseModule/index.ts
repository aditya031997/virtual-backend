import { Module } from '@nestjs/common';
import { SSEController } from '@/sse/sseController';
import { SSEService } from '@/sse/sseService';

/**
 * SSE Module
 * Completely isolated module for Server-Sent Events
 */
@Module({
  controllers: [SSEController],
  providers: [SSEService],
  exports: [SSEService], // Export so other modules can use it
})
export class SSEModule {}

