import { IsUUID, IsOptional, IsIn } from 'class-validator';
import type { ClientSessionEndReason, IEndSessionData } from '@/types';

export class EndSessionDto implements IEndSessionData {
  @IsUUID()
  sessionId!: string;

  @IsUUID()
  @IsOptional()
  leadId?: string;

  // Only client-driven reasons are accepted; 'superseded'/'expired' are
  // server-set and cannot be supplied by the client.
  @IsIn([
    'manual',
    'inactivity',
    'tab_close',
    'feedback_given',
    'neutral_timeout',
  ])
  reason!: ClientSessionEndReason;
}
