import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * Authenticates ElevenLabs server-tool calls by a shared secret header.
 *
 * AuthGuard cannot be used on these routes: it verifies a user's JWT, and the
 * agent has no user session — applying it would turn every tool call into a
 * 401. This guard checks a static secret configured on both sides instead: in
 * the tool's header config in the ElevenLabs dashboard, and in
 * CHATBOT_TOOL_SECRET here.
 *
 * This authenticates the *caller*, not the customer. It establishes that a
 * request came from our agent rather than from anyone who knows the URL. It is
 * not an entitlement check and must not be treated as one.
 */
@Injectable()
export class ToolSecretGuard implements CanActivate {
  private readonly logger = new Logger(ToolSecretGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('CHATBOT_TOOL_SECRET');

    // Fail closed. An unset secret means the deployment is misconfigured, and
    // treating that as "allow everyone" would silently restore the open
    // endpoint this guard exists to close.
    if (!expected) {
      this.logger.error(
        'CHATBOT_TOOL_SECRET is not configured — rejecting tool call.',
      );
      throw new UnauthorizedException('Tool authentication is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-tool-secret'];

    if (typeof provided !== 'string' || !this.matches(provided, expected)) {
      this.logger.warn(
        'Rejected tool call with missing or invalid x-tool-secret',
      );
      throw new UnauthorizedException('Invalid tool secret');
    }

    return true;
  }

  /**
   * Compared in constant time. Lengths are checked first because
   * timingSafeEqual throws on a length mismatch, and that check leaks only the
   * secret's length rather than its contents.
   */
  private matches(provided: string, expected: string): boolean {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
  }
}
