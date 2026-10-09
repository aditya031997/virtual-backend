import {
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

/**
 * Query params for GET /availability/current-day.
 *
 * All params are optional. With none supplied the endpoint answers for TODAY
 * (unchanged, backward-compatible). To ask about another day the caller named,
 * the AI passes ONE of the following and the BACKEND does the date math (the AI
 * never computes dates):
 *   - `dayOffset` — 0 = today, 1 = tomorrow, 2 = day after tomorrow, … (0..14).
 *   - `weekday`   — the NEXT occurrence of that weekday (e.g. "monday").
 *   - `date`      — an explicit ISO date (YYYY-MM-DD).
 *
 * Precedence when more than one is sent: date > weekday > dayOffset > today.
 * The service validates the resolved date is today or within the look-ahead cap.
 */
export class CurrentDayQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format (e.g., 2026-07-25)',
  })
  date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'dayOffset must be an integer' })
  @Min(0, { message: 'dayOffset must be 0 or greater (0 = today)' })
  @Max(14, { message: 'dayOffset must be 14 or less' })
  dayOffset?: number;

  @IsOptional()
  @IsString()
  @IsIn(WEEKDAYS, {
    message: 'weekday must be a day name (e.g., monday, tuesday, …)',
  })
  weekday?: string;
}
