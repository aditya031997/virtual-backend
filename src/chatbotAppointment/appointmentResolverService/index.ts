import { Injectable } from '@nestjs/common';
import { AppointmentDateResolverService } from '@/chatbotAppointment/appointmentDateResolverService';
import { AvailabilityService } from '@/availability/availabilityService';
import {
  APPOINTMENT_DEPARTMENT,
  APPOINTMENT_DEPARTMENT_VALUES,
  APPOINTMENT_SLOT_ISSUE,
  type AppointmentDepartment,
  type IAppointmentResolution,
  type IAppointmentSlotGap,
  type IResolvedAppointment,
} from '@/types/chatbotAppointment';
import type { IAppointmentIntentSlots } from '@/types/chatbotIntent';

/** Everything needed to ground an appointment request. */
export interface IResolveAppointmentInput {
  slots: IAppointmentIntentSlots;
  /** IANA timezone of the user, used to resolve relative dates. */
  timezone: string;
  /** Answers gathered across clarifying turns. */
  overrides?: IAppointmentOverrides;
  /**
   * The number already on file for a signed-in user, when there is one.
   * Offered for confirmation instead of asking them to type it out.
   */
  registeredContact?: string;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

/** Values supplied by the user in follow-up turns. */
export interface IAppointmentOverrides {
  /** ISO "YYYY-MM-DD". */
  preferredDate?: string;
  /** 24h "HH:MM". */
  preferredTime?: string;
  department?: AppointmentDepartment;
  careFacilityLocation?: string;
  natureOfRequest?: string;
  contactNumber?: string;
}

/**
 * Replies that accept the number already on file rather than supplying a new one.
 *
 * Kept in step with the widget's own ACCEPTS_REGISTERED
 * (frontend_smartcaller/src/features/chatbot/hooks/useConversationalFlow.ts):
 * the widget uses it to short-circuit its own turn, and this resolver needs
 * the same understanding because it is what emits the rejection message.
 *
 * Matched loosely and anywhere in the reply — "yes the same number showing"
 * and "number written above" are both agreement, and neither starts with a
 * word a plain affirmative pattern would catch.
 */
const ACCEPTS_REGISTERED =
  /\b(registered|existing|current|same|that|this|above|previous)\b.{0,16}\b(number|one|phone)\b|\b(number|one)\b.{0,16}\b(on file|you have|showing|shown|above|written above|mentioned|is fine|works|ok)\b|^(that'?s? fine|same|use that|keep it)\b/i;

/**
 * Turns a natural-language appointment request into a bookable record.
 *
 * Mirrors the report resolver's contract: either the booking is complete, or
 * `gaps` says exactly what to ask. Nothing is invented — an unparseable time
 * becomes a question, never a guessed slot, because a booking made for the
 * wrong hour is only discovered when someone misses the call.
 */
@Injectable()
export class AppointmentResolverService {
  /**
   * Fallback window used only when the real schedule cannot be read.
   *
   * Business hours are configured per weekday in the `business_hours` table and
   * fetched through `AvailabilityService`. These constants exist so an
   * unreachable schedule degrades to something sane rather than accepting any
   * time at all — they are NOT the source of truth, and a site whose real hours
   * differ (16:00–22:00 on Tuesdays only, say) is served correctly from the DB.
   */
  private static readonly FALLBACK_START = '09:00';
  private static readonly FALLBACK_END = '17:00';

  /** Words users type for a department, mapped to the canonical value. */
  private static readonly DEPARTMENT_PATTERNS: readonly {
    department: AppointmentDepartment;
    patterns: readonly RegExp[];
  }[] = [
    {
      department: APPOINTMENT_DEPARTMENT.SALES,
      patterns: [
        /\bsales\b/,
        /\bbuy\b/,
        /\bpurchas/,
        /\bquote\b/,
        /\bpricing\b/,
      ],
    },
    {
      department: APPOINTMENT_DEPARTMENT.SUPPORT,
      patterns: [/\bsupport\b/, /\bhelp\s?desk\b/, /\btechnical\b/],
    },
    {
      department: APPOINTMENT_DEPARTMENT.SERVICE,
      patterns: [/\bservice\b/, /\bmaintenance\b/, /\bengineer\b/, /\brepair/],
    },
    {
      department: APPOINTMENT_DEPARTMENT.ACCOUNT,
      patterns: [/\baccounts?\b/, /\bbilling\b/, /\binvoice/, /\bfinance\b/],
    },
  ];

  /** Named times of day, mapped to a concrete slot. */
  private static readonly TIME_OF_DAY: readonly {
    pattern: RegExp;
    time: string;
  }[] = [
    { pattern: /\b(morning|am)\b/, time: '10:00' },
    { pattern: /\b(afternoon|pm)\b/, time: '14:00' },
    { pattern: /\b(midday|noon|lunch)\b/, time: '12:00' },
    { pattern: /\bevening\b/, time: '16:00' },
  ];

  constructor(
    private readonly dateResolver: AppointmentDateResolverService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  /**
   * Resolve extracted slots into a bookable appointment.
   *
   * @returns A resolution that is either complete, or carries the questions
   *          needed to complete it.
   */
  async resolve(
    input: IResolveAppointmentInput,
  ): Promise<IAppointmentResolution> {
    const {
      slots,
      timezone,
      overrides = {},
      registeredContact,
      now = new Date(),
    } = input;
    const gaps: IAppointmentSlotGap[] = [];

    const preferredDate = this.resolveDate(
      slots,
      overrides,
      timezone,
      now,
      gaps,
    );

    // The window depends on which day was chosen — the site may open only on
    // some weekdays, and public holidays close it entirely. Without a date
    // there is nothing to validate a time against yet.
    const window = preferredDate
      ? await this.resolveDayWindow(preferredDate.date, gaps)
      : null;

    const preferredTime =
      preferredDate && window
        ? this.resolveTime(slots, overrides, window, gaps)
        : null;

    const department = this.resolveDepartment(slots, overrides);
    const natureOfRequest = this.resolveNature(slots, overrides, department);
    const contact = this.resolveContact(
      slots,
      overrides,
      registeredContact,
      gaps,
    );

    if (!natureOfRequest) {
      gaps.push({
        issue: APPOINTMENT_SLOT_ISSUE.MISSING_NATURE,
        question: 'What would you like the meeting to cover?',
      });
    }

    if (
      gaps.length > 0 ||
      preferredDate === null ||
      preferredTime === null ||
      natureOfRequest === null ||
      contact === null
    ) {
      return { isComplete: false, appointment: null, gaps, summary: null };
    }

    const appointment: IResolvedAppointment = {
      preferredDate: preferredDate.date,
      preferredTime,
      department,
      careFacilityLocation:
        overrides.careFacilityLocation ?? slots.facilityText ?? null,
      natureOfRequest,
      contactNumber: contact,
    };

    return {
      isComplete: true,
      appointment,
      gaps: [],
      summary: this.buildSummary(appointment, preferredDate.description),
    };
  }

  /** Resolve the meeting date, recording a gap when absent or unusable. */
  private resolveDate(
    slots: IAppointmentIntentSlots,
    overrides: IAppointmentOverrides,
    timezone: string,
    now: Date,
    gaps: IAppointmentSlotGap[],
  ): { date: string; description: string } | null {
    if (overrides.preferredDate) {
      return {
        date: overrides.preferredDate,
        description: overrides.preferredDate,
      };
    }

    const text = slots.dateText?.trim();

    if (!text) {
      gaps.push({
        issue: APPOINTMENT_SLOT_ISSUE.MISSING_DATE,
        question:
          'What day would suit you? For example: tomorrow, next Tuesday, or next week.',
      });
      return null;
    }

    const resolved = this.dateResolver.resolve(text, timezone, now);

    if (!resolved) {
      gaps.push({
        issue: APPOINTMENT_SLOT_ISSUE.UNRESOLVED_DATE,
        question: `I couldn't work out a date from "${text}". Could you give a day such as tomorrow, next Tuesday, or a date like 2026-08-20?`,
      });
      return null;
    }

    return resolved;
  }

  /**
   * The bookable window for a given date, read from the configured schedule.
   *
   * A day the site does not open — a closed weekday, or a public holiday — is
   * recorded as a gap so the user is asked for another day rather than handed a
   * booking nobody will attend. If the schedule cannot be read, a default
   * window is used: refusing every request because a lookup failed would be
   * worse than accepting an ordinary business-hours booking.
   */
  private async resolveDayWindow(
    date: string,
    gaps: IAppointmentSlotGap[],
  ): Promise<{ start: string; end: string } | null> {
    try {
      const availability =
        await this.availabilityService.getCurrentDayAvailability({ date });

      if (availability.holiday) {
        gaps.push({
          issue: APPOINTMENT_SLOT_ISSUE.DAY_UNAVAILABLE,
          question: `${date} is a public holiday, so no one will be in. Which other day would suit?`,
        });
        return null;
      }

      const hours = availability.businessHours;

      if (availability.close || !hours) {
        gaps.push({
          issue: APPOINTMENT_SLOT_ISSUE.DAY_UNAVAILABLE,
          question: `We're closed on ${availability.dayOfWeek}s. Which other day would suit?`,
        });
        return null;
      }

      // The schedule stores HH:mm:ss; times are compared as HH:mm.
      return {
        start: hours.startTime.slice(0, 5),
        end: hours.endTime.slice(0, 5),
      };
    } catch {
      return {
        start: AppointmentResolverService.FALLBACK_START,
        end: AppointmentResolverService.FALLBACK_END,
      };
    }
  }

  /**
   * Resolve the meeting time against the chosen day's opening window.
   *
   * Accepts explicit clock times and named parts of the day. A time outside the
   * window is queried rather than silently accepted, since it would produce a
   * booking nobody can honour.
   */
  private resolveTime(
    slots: IAppointmentIntentSlots,
    overrides: IAppointmentOverrides,
    window: { start: string; end: string },
    gaps: IAppointmentSlotGap[],
  ): string | null {
    if (overrides.preferredTime) return overrides.preferredTime;

    const text = slots.timeText?.trim().toLowerCase();
    const windowLabel = `${this.formatTimeForDisplay(window.start)} and ${this.formatTimeForDisplay(window.end)}`;

    if (!text) {
      gaps.push({
        issue: APPOINTMENT_SLOT_ISSUE.MISSING_TIME,
        question: `What time works best? Our team is available between ${windowLabel}.`,
      });
      return null;
    }

    const explicit = this.parseClockTime(text, window);

    if (explicit) {
      // Compared as HH:mm strings, which sort correctly for a 24h clock.
      if (explicit < window.start || explicit >= window.end) {
        gaps.push({
          issue: APPOINTMENT_SLOT_ISSUE.UNRESOLVED_TIME,
          question: `That time falls outside our hours. Our team is available between ${windowLabel} — what time would suit?`,
        });
        return null;
      }

      return explicit;
    }

    // A named part of the day only works if it lands inside the window; when it
    // does not, the midpoint is a better offer than a rejection.
    for (const entry of AppointmentResolverService.TIME_OF_DAY) {
      if (entry.pattern.test(text)) {
        return entry.time >= window.start && entry.time < window.end
          ? entry.time
          : this.midpointOf(window);
      }
    }

    gaps.push({
      issue: APPOINTMENT_SLOT_ISSUE.UNRESOLVED_TIME,
      question: `I couldn't work out a time from "${text}". Could you give a time such as 10 AM or 2:30 PM?`,
    });
    return null;
  }

  /** Midpoint of an opening window, as "HH:MM". */
  private midpointOf(window: { start: string; end: string }): string {
    const toMinutes = (time: string): number => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const middle = Math.floor(
      (toMinutes(window.start) + toMinutes(window.end)) / 2,
    );

    return `${String(Math.floor(middle / 60)).padStart(2, '0')}:${String(
      middle % 60,
    ).padStart(2, '0')}`;
  }

  /**
   * Parse a clock time into 24h "HH:MM".
   * Handles "3pm", "3 PM", "15:00", "2:30pm".
   */
  private parseClockTime(
    text: string,
    window: { start: string; end: string },
  ): string | null {
    const match = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(text);
    if (!match) return null;

    let hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    const meridiem = match[3];

    if (!Number.isInteger(hour) || minute < 0 || minute > 59) return null;

    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;

    // Without am/pm, a bare hour that falls before opening is read as the
    // afternoon one: for a 9-5 site "let's meet at 2" means 2 PM, not 2 AM.
    // Resolved against the real window, so a site open 16:00-22:00 reads
    // "at 8" as 8 PM.
    if (!meridiem && hour <= 12) {
      const asMorning = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      if (asMorning < window.start) hour += 12;
    }

    if (hour < 0 || hour > 23) return null;

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  /**
   * A number the team can call the person back on.
   *
   * Asked for because the widget files anonymous visitors under a minted
   * identity — booking against `guest-<uuid>@guest.smartcaller.com.au` would
   * leave support with no way to reach them. Anyone who already gave real
   * details keeps them; this only fills the gap conversation left behind when
   * the contact form was removed.
   */
  private resolveContact(
    slots: IAppointmentIntentSlots,
    overrides: IAppointmentOverrides,
    registeredContact: string | undefined,
    gaps: IAppointmentSlotGap[],
  ): string | null {
    const supplied = (
      overrides.contactNumber ??
      slots.contactText ??
      ''
    ).trim();

    // The question we asked offers two options ("...on 9876543211, or a
    // different number?"), so the user answers by naming one rather than by
    // saying "yes": "registered number", "the same one", "number written
    // above". None of those contain digits, so the plausibility check below
    // would reject them and re-ask the question we already answered.
    //
    // Only meaningful when a number is actually on file — with nothing to
    // accept, "the same number" is not an answer.
    if (supplied && !/\d/.test(supplied)) {
      const registered = (registeredContact ?? '').trim();
      if (registered && ACCEPTS_REGISTERED.test(supplied)) {
        return registered;
      }
    }

    if (!supplied) {
      const registered = (registeredContact ?? '').trim();

      // A signed-in user already has a number on file. Asking them to type it
      // out is asking for something we know — offer it and let them correct it,
      // the same way the callback flow does.
      if (registered) {
        gaps.push({
          issue: APPOINTMENT_SLOT_ISSUE.MISSING_CONTACT,
          // Names it as their REGISTERED number, not just the digits. The
          // callback flow's own script words it this way ("your registered
          // number (…)"), and the phrase is what tells the user the number came
          // from their account rather than from somewhere unexplained — it is
          // also the phrase they then echo back to accept it.
          question: `Should the team call you on your registered number (${registered}), or a different number?`,
        });
        return null;
      }

      gaps.push({
        issue: APPOINTMENT_SLOT_ISSUE.MISSING_CONTACT,
        question: 'What number can the team reach you on?',
      });
      return null;
    }

    // Permissive about FORMAT — international numbers carry +, spaces, dashes,
    // brackets and dots, and rejecting a valid number is worse than passing an
    // oddly punctuated one to a human who can read it. Strict about CONTENT:
    // a phone number contains no letters.
    //
    // Counting digits alone is not enough. "6876y76y" reduces to six digits and
    // would otherwise pass, leaving the team with an unusable number.
    const hasLetters = /[a-z]/i.test(supplied);
    const digits = supplied.replace(/\D/g, '');
    const isPlausible =
      !hasLetters && digits.length >= 6 && digits.length <= 15;

    if (!isPlausible) {
      gaps.push({
        issue: APPOINTMENT_SLOT_ISSUE.MISSING_CONTACT,
        question: `"${supplied}" doesn't look like a phone number. What's the best number to reach you on?`,
      });
      return null;
    }

    return supplied;
  }

  /**
   * Map the user's words to a department.
   *
   * Returns null rather than a gap: a meeting without a named team is still
   * bookable, and support triages it. Forcing a choice would add a turn for no
   * benefit.
   */
  private resolveDepartment(
    slots: IAppointmentIntentSlots,
    overrides: IAppointmentOverrides,
  ): AppointmentDepartment | null {
    if (overrides.department) return overrides.department;

    const text = slots.departmentText?.trim().toLowerCase();
    if (!text) return null;

    if (APPOINTMENT_DEPARTMENT_VALUES.includes(text as AppointmentDepartment)) {
      return text as AppointmentDepartment;
    }

    for (const entry of AppointmentResolverService.DEPARTMENT_PATTERNS) {
      if (entry.patterns.some((pattern): boolean => pattern.test(text))) {
        return entry.department;
      }
    }

    return null;
  }

  /**
   * Determine what the meeting is about.
   *
   * Falls back to the named department, since "a meeting with the sales team"
   * is itself a sufficient description of intent — asking again would be the
   * kind of robotic follow-up this feature exists to remove.
   */
  private resolveNature(
    slots: IAppointmentIntentSlots,
    overrides: IAppointmentOverrides,
    department: AppointmentDepartment | null,
  ): string | null {
    const explicit = (
      overrides.natureOfRequest ??
      slots.natureOfRequest ??
      ''
    ).trim();

    if (explicit) return explicit;

    if (department) {
      return `Meeting with the ${department} team`;
    }

    return null;
  }

  /** Read-back of the booking for the user to confirm. */
  private buildSummary(
    appointment: IResolvedAppointment,
    dateDescription: string,
  ): string {
    // "tomorrow (2026-08-05)" is worth spelling out, but an explicit date needs
    // no gloss — "2026-08-18 (2026-08-18)" just reads as a mistake.
    const when =
      dateDescription === appointment.preferredDate
        ? appointment.preferredDate
        : `${dateDescription} (${appointment.preferredDate})`;

    const parts: string[] = [
      `${when} at ${this.formatTimeForDisplay(appointment.preferredTime)}`,
    ];

    if (appointment.department) {
      parts.push(`with the ${appointment.department} team`);
    }

    if (appointment.careFacilityLocation) {
      parts.push(`at ${appointment.careFacilityLocation}`);
    }

    return parts.join(' ');
  }

  /** Render "14:00" as "2 PM" for conversational confirmation. */
  private formatTimeForDisplay(time: string): string {
    const [hourText, minuteText] = time.split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText);

    const meridiem = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;

    return minute === 0
      ? `${displayHour} ${meridiem}`
      : `${displayHour}:${String(minute).padStart(2, '0')} ${meridiem}`;
  }
}
