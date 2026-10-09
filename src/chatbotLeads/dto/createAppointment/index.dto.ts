import {
  IsString,
  IsUUID,
  IsOptional,
  MaxLength,
  Matches,
} from 'class-validator';
import type { ICreateChatbotAppointmentData } from '@/types';

export class CreateChatbotAppointmentDto
  implements ICreateChatbotAppointmentData
{
  @IsUUID()
  leadId!: string;

  @IsUUID()
  @IsOptional()
  sessionId?: string | null;

  // Optional since conversational booking may omit it. The widget form always
  // sent a value, so existing callers are unaffected.
  @IsString()
  @MaxLength(255)
  @IsOptional()
  careFacilityLocation?: string | null;

  // 24h "HH:MM". Optional: a user may name a date without a time.
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'preferredTime must be in HH:MM (24h) format',
  })
  @IsOptional()
  preferredTime?: string | null;

  // ISO "YYYY-MM-DD", resolved from phrases such as "next Tuesday".
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'preferredDate must be in YYYY-MM-DD format',
  })
  @IsOptional()
  preferredDate?: string | null;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  department?: string | null;

  // Number the person gave in conversation. Distinct from the lead's stored
  // contact, which is empty for an anonymous visitor.
  @IsString()
  @MaxLength(50)
  @IsOptional()
  contactNumber?: string | null;

  @IsString()
  natureOfRequest!: string;
}
