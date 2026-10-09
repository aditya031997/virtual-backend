import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { CurrentDayAvailabilityResponse } from '@/types';
import { BusinessHoursService } from '@/availability/businessHoursService';
import { PublicHolidaysService } from '@/availability/publicHolidayService';
import { AuditFileLoggerService } from '@/auditLog';

const DAYS: readonly string[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];
const DEFAULT_BUSINESS_TIMEZONE = 'Australia/Melbourne';
/** How many days ahead a caller may ask about (0 = today). Beyond this, schedules/holidays may not be set, so we refuse rather than give a misleading answer. */
const MAX_LOOKAHEAD_DAYS = 14;
/** luxon weekday numbers are 1=Monday..7=Sunday. */
const WEEKDAY_NUMBER: Readonly<Record<string, number>> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

/** How the caller referred to the day they're asking about. All optional; none = today. */
export interface AvailabilityDayQuery {
  date?: string;
  dayOffset?: number;
  weekday?: string;
}

/** True if time is in [start, end) (start inclusive, end exclusive). */
function isInWindow(time: string, start: string, end: string): boolean {
  return time >= start && time < end;
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly businessHoursService: BusinessHoursService,
    private readonly publicHolidaysService: PublicHolidaysService,
    private readonly configService: ConfigService,
    private readonly auditFileLogger: AuditFileLoggerService,
  ) {}

  /**
   * Availability for a given day. With no query it answers for TODAY (unchanged
   * behaviour). Otherwise it answers for the day the caller named — via an
   * explicit `date`, a `weekday` (next occurrence), or a `dayOffset`
   * (0=today, 1=tomorrow, …). The BACKEND does all date math. The resolved date
   * must be today or within MAX_LOOKAHEAD_DAYS.
   */
  async getCurrentDayAvailability(
    query: AvailabilityDayQuery = {},
  ): Promise<CurrentDayAvailabilityResponse> {
    const timezone =
      this.configService.get<string>('BUSINESS_TIMEZONE') ||
      DEFAULT_BUSINESS_TIMEZONE;
    const zonedNow = DateTime.now().setZone(timezone);
    if (!zonedNow.isValid) {
      throw new BadRequestException(
        `Invalid BUSINESS_TIMEZONE: ${timezone}. Use IANA name (e.g. Australia/Melbourne, Asia/Kolkata).`,
      );
    }

    const todayStart = zonedNow.startOf('day');

    // Resolve the day being asked about. Precedence: date > weekday > dayOffset
    // > today. Everything is computed in the business timezone so "tomorrow"
    // aligns with the business calendar, not the server's.
    let target = todayStart;
    if (query.date !== undefined) {
      const parsed = DateTime.fromFormat(query.date, 'yyyy-MM-dd', {
        zone: timezone,
      });
      if (!parsed.isValid) {
        throw new BadRequestException(
          `Invalid date: ${query.date}. Use YYYY-MM-DD.`,
        );
      }
      target = parsed.startOf('day');
    } else if (query.weekday !== undefined) {
      const wanted = WEEKDAY_NUMBER[query.weekday.toLowerCase()];
      if (wanted === undefined) {
        throw new BadRequestException(`Invalid weekday: ${query.weekday}.`);
      }
      // Next occurrence of that weekday. If today IS that weekday, treat it as
      // today (offset 0), not 7 days out — "our Monday hours" on a Monday means
      // today.
      const delta = (wanted - todayStart.weekday + 7) % 7;
      target = todayStart.plus({ days: delta });
    } else if (query.dayOffset !== undefined) {
      target = todayStart.plus({ days: query.dayOffset });
    }

    const daysAhead = Math.round(target.diff(todayStart, 'days').days);
    if (daysAhead < 0) {
      throw new BadRequestException(
        `Requested day is in the past; only today or a future date within ${MAX_LOOKAHEAD_DAYS} days is supported.`,
      );
    }
    if (daysAhead > MAX_LOOKAHEAD_DAYS) {
      throw new BadRequestException(
        `Requested day is more than ${MAX_LOOKAHEAD_DAYS} days ahead; only dates within ${MAX_LOOKAHEAD_DAYS} days are supported.`,
      );
    }

    const isToday = target.hasSame(todayStart, 'day');
    const currentTimeForCheck = zonedNow.toFormat('HH:mm:ss');
    const currentDateTime = zonedNow.toFormat('yyyy-MM-dd HH:mm:ss');
    const targetIso = target.toISODate();
    const dayOfWeek = DAYS[target.weekday === 7 ? 0 : target.weekday];

    const [businessHours, holidaysOnDay] = await Promise.all([
      this.businessHoursService.findByDay(dayOfWeek),
      this.publicHolidaysService.findByDateRange(targetIso, targetIso),
    ]);

    const bh = businessHours
      ? { startTime: businessHours.startTime, endTime: businessHours.endTime }
      : null;
    // "currently open" only makes sense for today. A future day is never open
    // "now", so currentMode is afterHours for any non-today date.
    const isWithinBusinessHours =
      isToday &&
      bh != null &&
      businessHours?.isAvailable === true &&
      isInWindow(currentTimeForCheck, bh.startTime, bh.endTime);
    const currentMode: 'businessHours' | 'afterHours' = isWithinBusinessHours
      ? 'businessHours'
      : 'afterHours';

    const holiday = holidaysOnDay.length > 0;
    const close = !businessHours || businessHours.isAvailable === false;

    const response = {
      date: targetIso,
      isToday,
      dayOfWeek,
      currentTime: currentDateTime,
      currentMode,
      holiday,
      close,
      businessHours: bh,
      afterHours: null,
    };

    this.auditFileLogger.logApiCurrentDay({
      action: 'API_CALL',
      response,
    });

    return response;
  }
}
