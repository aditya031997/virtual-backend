import { Injectable } from '@nestjs/common';

/** Calendar day in a specific timezone. */
interface ICalendarDay {
  year: number;
  month: number;
  day: number;
}

/** A resolved appointment date. */
export interface IResolvedAppointmentDate {
  /** ISO "YYYY-MM-DD". */
  date: string;
  /** Human-readable form for the confirmation message. */
  description: string;
}

/**
 * Resolves date phrases for appointment booking.
 *
 * Deliberately separate from the report date resolver, because the two look in
 * opposite directions: a report covers a past window ("last week" = the week
 * that ended), while an appointment is booked forward ("next week" = the week
 * to come). Sharing one resolver would mean one of the two silently getting
 * the wrong end of the calendar.
 *
 * Returns a single day rather than a range — an appointment happens at a point
 * in time. Where a phrase names a period ("next week"), the first working day
 * of that period is used and the description says so, letting the user correct
 * it in conversation.
 *
 * Rule-based, like the report resolver, and for the same reason: silently
 * booking the wrong day is a failure the user only discovers when nobody calls.
 */
@Injectable()
export class AppointmentDateResolverService {
  /** How far ahead a booking may be made. */
  private static readonly MAX_DAYS_AHEAD = 365;

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
   * Resolve a phrase into a future calendar date.
   *
   * @returns The date, or null when the phrase is not understood or resolves to
   *          the past — the caller then asks rather than assuming.
   */
  resolve(
    text: string,
    timezone: string,
    now: Date = new Date(),
  ): IResolvedAppointmentDate | null {
    const normalised = AppointmentDateResolverService.correctTypos(
      text.trim().toLowerCase(),
    );
    if (!normalised) return null;

    const today = this.toCalendarDay(now, timezone);

    const resolved =
      this.resolveKeyword(normalised, today) ??
      this.resolveInNUnits(normalised, today) ??
      this.resolveNamedWeekday(normalised, today) ??
      this.resolveExplicitDate(normalised);

    if (!resolved) return null;

    // Never book into the past, however the phrase was written.
    if (this.compareDays(resolved.day, today) < 0) return null;

    const daysAhead = this.daysBetween(today, resolved.day);
    if (daysAhead > AppointmentDateResolverService.MAX_DAYS_AHEAD) return null;

    return { date: this.formatDay(resolved.day), description: resolved.label };
  }

  /** Words a date phrase is built from, for typo correction. */
  private static readonly DATE_WORDS: readonly string[] = [
    'today',
    'tomorrow',
    'yesterday',
    'week',
    'month',
    'year',
    'next',
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
      if (AppointmentDateResolverService.DATE_WORDS.includes(word)) return word;

      let best: string | null = null;
      let bestDistance = Infinity;

      for (const candidate of AppointmentDateResolverService.DATE_WORDS) {
        // A word can only be a typo of a similar-length one; this also keeps
        // the edit-distance work small.
        if (Math.abs(candidate.length - word.length) > 2) continue;

        const distance = AppointmentDateResolverService.editDistance(
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
   * word: "todya" scored 2 against a budget of 1 and reached the parser
   * uncorrected. Kept identical to the report resolver's copy — the two lists
   * differ, but the matching rules must not.
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

  /**
   * Fixed forward-looking phrases.
   *
   * Matched anywhere in the message, not just as the whole of it. People answer
   * "what day suits you?" with "tomorrow and the meeting is about the purchase"
   * far more often than with the bare word, and anchoring the patterns to the
   * ends of the string rejected every one of those — leaving the resolver to
   * ask the same question again over a message that plainly answered it.
   *
   * Order matters: "day after tomorrow" is tested before "tomorrow", which
   * would otherwise match inside it and book a day early.
   */
  private resolveKeyword(
    text: string,
    today: ICalendarDay,
  ): { day: ICalendarDay; label: string } | null {
    if (/\b(the\s+)?day after tomorrow\b/.test(text)) {
      return {
        day: this.addDays(today, 2),
        label: 'the day after tomorrow',
      };
    }

    if (/\btomorrow\b/.test(text)) {
      return { day: this.addDays(today, 1), label: 'tomorrow' };
    }

    if (/\btoday\b/.test(text)) {
      return { day: today, label: 'today' };
    }

    if (/\b(next|the following)\s+week\b/.test(text)) {
      // Monday of next week: the first working day the user likely means.
      const monday = this.addDays(this.startOfWeek(today), 7);
      return { day: monday, label: 'Monday next week' };
    }

    if (/\bthis\s+week\b/.test(text)) {
      // Next working day within the current week.
      return { day: this.addDays(today, 1), label: 'later this week' };
    }

    if (/\b(next|the following)\s+month\b/.test(text)) {
      const firstOfNextMonth = this.firstOfNextMonth(today);
      return {
        day: firstOfNextMonth,
        label: 'the start of next month',
      };
    }

    return null;
  }

  /** "in 3 days", "in 2 weeks". */
  private resolveInNUnits(
    text: string,
    today: ICalendarDay,
  ): { day: ICalendarDay; label: string } | null {
    const match =
      /\bin\s+(\d{1,3})\s+(day|days|week|weeks|month|months)\b/.exec(text);
    if (!match) return null;

    const amount = Number(match[1]);
    if (!Number.isInteger(amount) || amount < 1) return null;

    const unit = match[2];
    const days = unit.startsWith('day')
      ? amount
      : unit.startsWith('week')
        ? amount * 7
        : amount * 30;

    const singular = unit.replace(/s$/, '');

    return {
      day: this.addDays(today, days),
      label: `in ${amount} ${singular}${amount === 1 ? '' : 's'}`,
    };
  }

  /** "monday", "next friday" — always the next future occurrence. */
  private resolveNamedWeekday(
    text: string,
    today: ICalendarDay,
  ): { day: ICalendarDay; label: string } | null {
    // "on tuesday", "next friday" — anywhere in the message. The optional
    // prefix is captured so "next friday" still means the following week.
    const match = /\b(next\s+|on\s+|this\s+)?([a-z]+day)\b/.exec(text);
    if (!match) return null;

    const index = AppointmentDateResolverService.DAY_NAMES.indexOf(match[2]);
    if (index === -1) return null;

    const todayIndex = this.dayOfWeek(today);

    // Look forward: "monday" said on a Monday means the Monday coming, not
    // today, because a same-day booking is rarely what "next monday" means.
    let delta = index - todayIndex;
    if (delta <= 0) delta += 7;

    // "next friday" said on a Wednesday means the following week's Friday.
    if (match[1]?.trim() === 'next' && delta < 7) {
      delta += 7;
    }

    return {
      day: this.addDays(today, delta),
      label: match[2].charAt(0).toUpperCase() + match[2].slice(1),
    };
  }

  /** Explicit dates: "2026-08-20", "20 August", "August 20". */
  private resolveExplicitDate(
    text: string,
  ): { day: ICalendarDay; label: string } | null {
    const isoMatch = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
    if (isoMatch) {
      const day = this.toDayIfValid(
        Number(isoMatch[1]),
        Number(isoMatch[2]),
        Number(isoMatch[3]),
      );
      return day ? { day, label: this.formatDay(day) } : null;
    }

    return null;
  }

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

  /** Week starts Monday. */
  private startOfWeek(day: ICalendarDay): ICalendarDay {
    const daysSinceMonday = (this.dayOfWeek(day) + 6) % 7;
    return this.addDays(day, -daysSinceMonday);
  }

  private firstOfNextMonth(day: ICalendarDay): ICalendarDay {
    return day.month === 12
      ? { year: day.year + 1, month: 1, day: 1 }
      : { year: day.year, month: day.month + 1, day: 1 };
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

  private daysBetween(from: ICalendarDay, to: ICalendarDay): number {
    const fromMs = Date.UTC(from.year, from.month - 1, from.day);
    const toMs = Date.UTC(to.year, to.month - 1, to.day);
    return Math.round((toMs - fromMs) / 86_400_000);
  }

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
