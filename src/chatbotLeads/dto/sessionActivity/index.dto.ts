import { IsUUID } from 'class-validator';

/** Idempotent heartbeat — bumps lastActivityAt for an active session. */
export class SessionActivityDto {
  @IsUUID()
  sessionId!: string;
}
