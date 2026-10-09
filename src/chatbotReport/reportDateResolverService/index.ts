import { Injectable } from '@nestjs/common';
import type { IResolvedDateRange } from '@/types/chatbotReport';

/** Calendar day expressed in a specific timezone. */
interface ICalendarDay {
  year: number;
  month: number;
  day: number;
}

/**
 * Turns date phrases ("yesterday", "last week", "last 30 days") into absolute
 * ISO-8601 UTC ranges.
 *
 * Deliberately rule-based rather than LLM-driven: date maths is exactly the
 * kind of thing a language model gets subtly wrong, and a report covering the
 * wrong week is a silent, plausible-looking error. Everything here is
 * deterministic and unit-tested.
 *
 * All ranges are computed in the USER's timezone, then converted to UTC.
 * "Yesterday" for a user in Sydney is a different absolute window than for a
 * user in London, and the report API expects UTC instants.
 */
@Injectable()
export class ReportDateResolverService {
  /** Cap on look-back windows, so "last 10 years" cannot melt the database. */
  private static readonly MAX_RANGE_DAYS = 366;

  private static readonly DAY_NAMES: readonly string[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];

  private static readonly MONTH_NAMES: readonly string[] = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];

  /**
   * Resolve a date phrase into an absolute UTC range.
   *
   * @param text     The user's words, e.g. "last 30 days". Empty returns null.
   * @param timezone IANA timezone of the user, e.g. "Australia/Sydney".
   * @param now      Injectable clock for deterministic tests.
   * @returns The range, or null when the phrase is not understood — the caller
   *          then asks the user rather than assuming a default window.
   */
  resolve(
    text: string,
    timezone: string,
    now: Date = new Date(),
  ): IResolvedDateRange | null {
    const normalised = ReportDateResolverService.correctTypos(
      text.trim().toLowerCase(),
    );
    if (!normalised) return null;

    const today = this.toCalendarDay(now, timezone);

    return (
      this.resolveKeyword(normalised, today, timezone) ??
      this.resolveLastNUnits(normalised, today, timezone) ??
      this.resolveNamedWeekday(normalised, today, timezone) ??
      this.resolveNamedMonth(normalised, today, timezone) ??
      this.resolveExplicitDate(normalised, timezone)
    );
  }

  /** Fixed phrases with no numeric component. */
  /** Words a date phrase is built from, for typo correction. */
  private static readonly DATE_WORDS: readonly string[] = [
    'today',
    'tomorrow',
    'yesterday',
    'week',
    'month',
    'year',
    'next',
    'last',
    'past',
    'previous',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];

  /**
   * Repair obvious misspellings of the words a date phrase is made of.
   *
   * "tomorrw", "tommorow" and "tuesdy" are common enough that rejecting them
   * makes the bot look broken: it asks for a day, the user gives one, and it
   * says it could not work out a date. The knowledge-base search already
   * tolerates typos; dates should too.
   *
   * Only whole words are considered, and only within one or two edits of a
   * known date word, so ordinary text is left untouched.
   */
  private static correctTypos(text: string): string {
    return text.replace(/[a-z]{3,}/g, (word): string => {
      if (ReportDateResolverService.DATE_WORDS.includes(word)) return word;

      let best: string | null = null;
      let bestDistance = Infinity;

      for (const candidate of ReportDateResolverService.DATE_WORDS) {
        // A word can only be a typo of a similar-length one; this also keeps
        // the edit-distance work small.
        if (Math.abs(candidate.length - word.length) > 2) continue;

        const distance = ReportDateResolverService.editDistance(
          word,
          candidate,
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }

      // Longer words tolerate two edits ("tommorow"); short ones only one,
      // otherwise "week" would swallow unrelated four-letter words.
      const allowed = word.length >= 7 ? 2 : 1;
      return best !== null && bestDistance <= allowed ? best : word;
    });
  }

  /**
   * Damerau-Levenshtein distance: like Levenshtein, but a swap of two adjacent
   * characters costs 1 rather than 2.
   *
   * Transposition is the most common typing error, and under plain Levenshtein
   * it was the one class of typo the budget above could never forgive on a short
   * word. "todya" is two edits from "today", so at five characters it scored 2
   * against a budget of 1 and reached the parser uncorrected — the bot then read
   * a report request for "today" as carrying no date at all. Long words hid the
   * problem, because their budget of 2 already absorbed a swap.
   *
   * Counting a swap as one edit fixes that without widening the budget, which is
   * the safer half of the trade: raising `allowed` for short words would let
   * "today" start capturing unrelated five-letter words like "total".
   */
  private static editDistance(a: string, b: string): number {
    // Two rows back, as a transposition compares against the row before last.
    let beforePrevious: number[] = [];
    let previous = Array.from({ length: b.length + 1 }, (_, i): number => i);

    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= b.length; j += 1) {
        const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;

        current[j] = Math.min(
          (previous[j] ?? 0) + 1,
          (current[j - 1] ?? 0) + 1,
          (previous[j - 1] ?? 0) + substitutionCost,
        );

        // Adjacent pair swapped: charge a single edit for the pair.
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          current[j] = Math.min(current[j], (beforePrevious[j - 2] ?? 0) + 1);
        }
      }
      beforePrevious = previous;
      previous = current;
    }

    return previous[b.length] ?? 0;
  }

  private resolveKeyword(
    text: string,
    today: ICalendarDay,
    timezone: string,
  ): IResolvedDateRange | null {
    if (/\b(so far today|today)\b/.test(text)) {
      return this.buildRange(today, today, timezone, 'today');
    }

    if (/\byesterday\b/.test(text)) {
      const yesterday = this.addDays(today, -1);
      return this.buildRange(yesterday, yesterday, timezone, 'yesterday');
    }

    if (/\bthis week\b/.test(text)) {
      const start = this.startOfWeek(today);
      return this.buildRange(start, today, timezone, 'this week');
    }

    if (/\b(last|past|previous) week\b/.test(text)) {
      const thisWeekStart = this.startOfWeek(today);
      const start = this.addDays(thisWeekStart, -7);
      const end = this.addDays(thisWeekStart, -1);
      return this.buildRange(start, end, timezone, 'last week');
    }

    if (/\bthis month\b/.test(text)) {
      const start: ICalendarDay = { ...today, day: 1 };
      return this.buildRange(start, today, timezone, 'this month');
    }

    if (/\b(last|past|previous) month\b/.test(text)) {
      const firstOfThisMonth: ICalendarDay = { ...today, day: 1 };
      const end = this.addDays(firstOfThisMonth, -1);
      const start: ICalendarDay = { ...end, day: 1 };
      return this.buildRange(start, end, timezone, 'last month');
    }

    if (/\bthis year\b/.test(text)) {
      const start: ICalendarDay = { year: today.year, month: 1, day: 1 };
      return this.buildRange(start, today, timezone, 'this year');
    }

    return null;
  }

  /** "last 30 days", "past 2 weeks", "previous 3 months". */
  private resolveLastNUnits(
    text: string,
    today: ICalendarDay,
    timezone: string,
  ): IResolvedDateRange | null {
    const match =
      /\b(?:the\s+)?(?:last|past|previous)\s+(\d{1,4})\s+(day|days|week|weeks|month|months)\b/.exec(
        text,
      );
    if (!match) return null;

    const amount = Number(match[1]);
    const unit = match[2];

    if (!Number.isInteger(amount) || amount < 1) return null;

    const days = unit.startsWith('day')
      ? amount
      : unit.startsWith('week')
        ? amount * 7
        : amount * 30;

    if (days > ReportDateResolverService.MAX_RANGE_DAYS) return null;

    // "Last 30 days" conventionally means the 30 days ending today, inclusive.
    const start = this.addDays(today, -(days - 1));
    return this.buildRange(
      start,
      today,
      timezone,
      `the last ${amount} ${unit.replace(/s$/, '')}${amount === 1 ? '' : 's'}`,
    );
  }

  /** "monday", "last friday" — always resolves to the most recent past day. */
  private resolveNamedWeekday(
    text: string,
    today: ICalendarDay,
    timezone: string,
  ): IResolvedDateRange | null {
    const match = /\b(?:last\s+|on\s+)?([a-z]+day)\b/.exec(text);
    if (!match) return null;

    const index = ReportDateResolverService.DAY_NAMES.indexOf(match[1]);
    if (index === -1) return null;

    const todayIndex = this.dayOfWeek(today);
    // Always look backwards: a report cannot cover the future.
    let delta = todayIndex - index;
    if (delta <= 0) delta += 7;

    const target = this.addDays(today, -delta);
    return this.buildRange(target, target, timezone, match[1]);
  }

  /** "january", "last march" — the most recent occurrence of that month. */
  private resolveNamedMonth(
    text: string,
    today: ICalendarDay,
    timezone: string,
  ): IResolvedDateRange | null {
    const match = /\b(?:last\s+|in\s+)?([a-z]+)\b/.exec(text);
    if (!match) return null;

    const index = ReportDateResolverService.MONTH_NAMES.indexOf(match[1]);
    if (index === -1) return null;

    const month = index + 1;
    // If the month has not happened yet this year, use last year's.
    const year = month > today.month ? today.year - 1 : today.year;

    const start: ICalendarDay = { year, month, day: 1 };
    const end: ICalendarDay = {
      year,
      month,
      day: this.daysInMonth(year, month),
    };

    return this.buildRange(start, end, timezone, `${match[1]} ${year}`);
  }

  /** Explicit ISO dates: "2026-08-04", or a range "2026-08-01 to 2026-08-04". */
  private resolveExplicitDate(
    text: string,
    timezone: string,
  ): IResolvedDateRange | null {
    const rangeMatch =
      /\b(\d{4})-(\d{2})-(\d{2})\s*(?:to|-|until|through)\s*(\d{4})-(\d{2})-(\d{2})\b/.exec(
        text,
      );

    if (rangeMatch) {
      const start = this.toDayIfValid(
        Number(rangeMatch[1]),
        Number(rangeMatch[2]),
        Number(rangeMatch[3]),
      );
      const end = this.toDayIfValid(
        Number(rangeMatch[4]),
        Number(rangeMatch[5]),
        Number(rangeMatch[6]),
      );

      if (!start || !end) return null;
      if (this.compareDays(start, end) > 0) return null;

      return this.buildRange(
        start,
        end,
        timezone,
        `${this.formatDay(start)} to ${this.formatDay(end)}`,
      );
    }

    const singleMatch = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
    if (singleMatch) {
      const day = this.toDayIfValid(
        Number(singleMatch[1]),
        Number(singleMatch[2]),
        Number(singleMatch[3]),
      );
      if (!day) return null;

      return this.buildRange(day, day, timezone, this.formatDay(day));
    }

    return null;
  }

  /**
   * Build an inclusive range covering start 00:00:00.000 to end 23:59:59.999
   * in the user's timezone, expressed as UTC instants.
   */
  private buildRange(
    start: ICalendarDay,
    end: ICalendarDay,
    timezone: string,
    description: string,
  ): IResolvedDateRange {
    return {
      startDate: this.toUtcIso(start, timezone, false),
      endDate: this.toUtcIso(end, timezone, true),
      description,
    };
  }

  /**
   * Convert a calendar day in `timezone` to a UTC ISO instant.
   *
   * Works by asking Intl what the wall-clock time is in that zone for a
   * candidate UTC instant, then correcting by the observed offset. This handles
   * DST without any hardcoded offset table.
   */
  private toUtcIso(
    day: ICalendarDay,
    timezone: string,
    endOfDay: boolean,
  ): string {
    const hours = endOfDay ? 23 : 0;
    const minutes = endOfDay ? 59 : 0;
    const seconds = endOfDay ? 59 : 0;
    const millis = endOfDay ? 999 : 0;

    const naiveUtc = Date.UTC(
      day.year,
      day.month - 1,
      day.day,
      hours,
      minutes,
      seconds,
      millis,
    );

    const offsetMs = this.getTimezoneOffsetMs(new Date(naiveUtc), timezone);
    let corrected = naiveUtc - offsetMs;

    // The offset can differ either side of a DST boundary; re-check once
    // against the corrected instant and adjust if the zone shifted.
    const secondOffsetMs = this.getTimezoneOffsetMs(
      new Date(corrected),
      timezone,
    );
    if (secondOffsetMs !== offsetMs) {
      corrected = naiveUtc - secondOffsetMs;
    }

    return new Date(corrected).toISOString();
  }

  /**
   * Milliseconds that `timezone` is ahead of UTC at `instant`.
   * Falls back to 0 (UTC) when the timezone is not recognised.
   */
  private getTimezoneOffsetMs(instant: Date, timezone: string): number {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const parts = formatter.formatToParts(instant);
      const lookup = (type: string): number =>
        Number(parts.find((part): boolean => part.type === type)?.value ?? '0');

      // Intl renders midnight as hour 24 in some locales; normalise to 0.
      const hour = lookup('hour') % 24;

      const asUtc = Date.UTC(
        lookup('year'),
        lookup('month') - 1,
        lookup('day'),
        hour,
        lookup('minute'),
        lookup('second'),
        instant.getUTCMilliseconds(),
      );

      return asUtc - instant.getTime();
    } catch {
      return 0;
    }
  }

  /** Current calendar day in `timezone`. */
  private toCalendarDay(instant: Date, timezone: string): ICalendarDay {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      const [year, month, day] = formatter.format(instant).split('-');
      return { year: Number(year), month: Number(month), day: Number(day) };
    } catch {
      return {
        year: instant.getUTCFullYear(),
        month: instant.getUTCMonth() + 1,
        day: instant.getUTCDate(),
      };
    }
  }

  private addDays(day: ICalendarDay, delta: number): ICalendarDay {
    const shifted = new Date(Date.UTC(day.year, day.month - 1, day.day));
    shifted.setUTCDate(shifted.getUTCDate() + delta);

    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
    };
  }

  /** Week starts Monday, matching the reporting convention used on site. */
  private startOfWeek(day: ICalendarDay): ICalendarDay {
    const dow = this.dayOfWeek(day);
    const daysSinceMonday = (dow + 6) % 7;
    return this.addDays(day, -daysSinceMonday);
  }

  /** 0 = Sunday .. 6 = Saturday. */
  private dayOfWeek(day: ICalendarDay): number {
    return new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
  }

  private daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  private compareDays(a: ICalendarDay, b: ICalendarDay): number {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  }

  /** Validate a Y/M/D triple, rejecting impossible dates like 2026-02-31. */
  private toDayIfValid(
    year: number,
    month: number,
    day: number,
  ): ICalendarDay | null {
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > this.daysInMonth(year, month)) return null;
    return { year, month, day };
  }

  private formatDay(day: ICalendarDay): string {
    const month = String(day.month).padStart(2, '0');
    const dayOfMonth = String(day.day).padStart(2, '0');
    return `${day.year}-${month}-${dayOfMonth}`;
  }
}
