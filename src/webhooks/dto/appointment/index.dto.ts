import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body for the agent-callable appointment webhook (POST /webhooks/appointment).
 *
 * Snake_case to match the ElevenLabs server-tool convention, like the return
 * request and department callback tools. The agent passes the ElevenLabs
 * conversation_id — it cannot know our internal leadId — and the handler
 * resolves the lead from the chatbot session.
 *
 * The agent is responsible for gathering and sanity-checking these in
 * conversation; the format rules here are a last line of defence, not the
 * user-facing validation.
 */
export class CreateWebhookAppointmentDto {
  @ApiProperty({
    description: 'ElevenLabs conversation id used to resolve the lead/session.',
  })
  @IsString()
  @IsNotEmpty()
  conversation_id!: string;

  @ApiProperty({
    description: 'Preferred date as ISO "YYYY-MM-DD". Must not be in the past.',
    example: '2026-08-20',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'preferred_date must be YYYY-MM-DD',
  })
  preferred_date!: string;

  @ApiProperty({
    description: 'Preferred time in 24-hour "HH:MM".',
    example: '14:00',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'preferred_time must be HH:MM in 24-hour form',
  })
  preferred_time!: string;

  @ApiProperty({
    description: 'Number the team should call back on.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  contact_number!: string;

  @ApiPropertyOptional({
    description: 'Team the meeting is with.',
    enum: ['sales', 'service', 'account', 'support'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['sales', 'service', 'account', 'accounts', 'support'])
  department?: string;

  @ApiPropertyOptional({
    description: "What the meeting should cover, in the user's words.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  nature_of_request?: string;

  @ApiPropertyOptional({
    description: 'Care facility or site the meeting relates to.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  care_facility_location?: string;
}
