import { AppointmentDateResolverService } from '@/chatbotAppointment/appointmentDateResolverService';
import { AppointmentResolverService } from '@/chatbotAppointment/appointmentResolverService';
import {
  APPOINTMENT_DEPARTMENT,
  APPOINTMENT_SLOT_ISSUE,
} from '@/types/chatbotAppointment';
import type { AvailabilityService } from '@/availability/availabilityService';
import type { CurrentDayAvailabilityResponse } from '@/types';

/** Tuesday 4 August 2026. */
const NOW = new Date('2026-08-04T10:00:00.000Z');
const timezone = 'UTC';

/** A phone number, so tests not about contact details clear that gap. */
const CONTACT = '0412345678';

/**
 * Build a resolver whose site follows the given schedule.
 *
 * Defaults to open 09:00-17:00 every day, keeping the slot-filling tests about
 * slot filling; the schedule-driven cases pass their own overrides.
 */
function buildService(
  availability: Partial<CurrentDayAvailabilityResponse> = {},
): AppointmentResolverService {
  const availabilityService = {
    getCurrentDayAvailability: (): Promise<CurrentDayAvailabilityResponse> =>
      Promise.resolve({
        date: '2026-08-05',
        isToday: false,
        dayOfWeek: 'wednesday',
        currentTime: '10:00:00',
        currentMode: 'businessHours',
        holiday: false,
        close: false,
        businessHours: { startTime: '09:00:00', endTime: '17:00:00' },
        afterHours: null,
        ...availability,
      } as CurrentDayAvailabilityResponse),
  } as unknown as AvailabilityService;

  return new AppointmentResolverService(
    new AppointmentDateResolverService(),
    availabilityService,
  );
}

describe('AppointmentResolverService', (): void => {
  const service = buildService();

  describe("the client's example request", (): void => {
    it('resolves "a meeting with the sales team next week" once the rest is given', async (): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          departmentText: 'sales team',
          dateText: 'next week',
          timeText: 'morning',
          contactText: CONTACT,
        },
      });

      expect(result.isComplete).toBe(true);
      expect(result.appointment?.preferredDate).toBe('2026-08-10');
      expect(result.appointment?.department).toBe(APPOINTMENT_DEPARTMENT.SALES);
      // "a meeting with the sales team" is itself a sufficient description.
      expect(result.appointment?.natureOfRequest).toContain('sales');
    });

    it('asks only for what is missing', async (): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          departmentText: 'sales team',
          dateText: 'next week',
          contactText: CONTACT,
        },
      });

      expect(result.isComplete).toBe(false);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].issue).toBe(APPOINTMENT_SLOT_ISSUE.MISSING_TIME);
    });

    it('handles the bare "I\'d like to book an appointment" opener', async (): Promise<void> => {
      const result = await service.resolve({ timezone, now: NOW, slots: {} });

      expect(result.isComplete).toBe(false);
      // Date, purpose and contact are all still needed.
      expect(result.gaps.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('business hours come from the schedule', (): void => {
    it('accepts a time inside a late window a 9-5 default would reject', async (): Promise<void> => {
      // A real site in this database opens 16:00-22:00 on Tuesdays only.
      const lateSite = buildService({
        dayOfWeek: 'tuesday',
        businessHours: { startTime: '16:00:00', endTime: '22:00:00' },
      });

      const result = await lateSite.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: '8pm',
          natureOfRequest: 'a chat',
          contactText: CONTACT,
        },
      });

      expect(result.isComplete).toBe(true);
      expect(result.appointment?.preferredTime).toBe('20:00');
    });

    it('rejects a morning time when the site opens in the afternoon', async (): Promise<void> => {
      const lateSite = buildService({
        businessHours: { startTime: '16:00:00', endTime: '22:00:00' },
      });

      const result = await lateSite.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: '10am',
          natureOfRequest: 'a chat',
          contactText: CONTACT,
        },
      });

      expect(result.isComplete).toBe(false);
      expect(
        result.gaps.some(
          (gap): boolean =>
            gap.issue === APPOINTMENT_SLOT_ISSUE.UNRESOLVED_TIME,
        ),
      ).toBe(true);
    });

    it('refuses a day the site is closed', async (): Promise<void> => {
      const closedSite = buildService({ close: true, businessHours: null });

      const result = await closedSite.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: '10am',
          natureOfRequest: 'a chat',
          contactText: CONTACT,
        },
      });

      expect(result.isComplete).toBe(false);
      expect(
        result.gaps.some(
          (gap): boolean =>
            gap.issue === APPOINTMENT_SLOT_ISSUE.DAY_UNAVAILABLE,
        ),
      ).toBe(true);
    });

    it('refuses a public holiday', async (): Promise<void> => {
      const holidaySite = buildService({ holiday: true });

      const result = await holidaySite.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: '10am',
          natureOfRequest: 'a chat',
          contactText: CONTACT,
        },
      });

      expect(result.isComplete).toBe(false);
      expect(
        result.gaps.some(
          (gap): boolean =>
            gap.issue === APPOINTMENT_SLOT_ISSUE.DAY_UNAVAILABLE,
        ),
      ).toBe(true);
    });

    it('quotes the real window back to the user', async (): Promise<void> => {
      const lateSite = buildService({
        businessHours: { startTime: '16:00:00', endTime: '22:00:00' },
      });

      const result = await lateSite.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          natureOfRequest: 'a chat',
          contactText: CONTACT,
        },
      });

      const gap = result.gaps.find(
        (entry): boolean => entry.issue === APPOINTMENT_SLOT_ISSUE.MISSING_TIME,
      );

      expect(gap?.question).toContain('4 PM');
      expect(gap?.question).toContain('10 PM');
    });

    it('still books when the schedule cannot be read', async (): Promise<void> => {
      const brokenSchedule = {
        getCurrentDayAvailability:
          (): Promise<CurrentDayAvailabilityResponse> =>
            Promise.reject(new Error('availability service down')),
      } as unknown as AvailabilityService;

      const resilient = new AppointmentResolverService(
        new AppointmentDateResolverService(),
        brokenSchedule,
      );

      const result = await resilient.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: '10am',
          natureOfRequest: 'a chat',
          contactText: CONTACT,
        },
      });

      // Degrades to the default window rather than refusing every booking.
      expect(result.isComplete).toBe(true);
    });
  });

  describe('contact number', (): void => {
    it('offers the number on file instead of asking for one', async (): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        registeredContact: '0412345678',
        slots: {
          dateText: 'tomorrow',
          timeText: '10am',
          natureOfRequest: 'a chat',
        },
      });

      const gap = result.gaps.find(
        (entry): boolean =>
          entry.issue === APPOINTMENT_SLOT_ISSUE.MISSING_CONTACT,
      );

      // A signed-in user should be asked to confirm, not to type it out again.
      expect(gap?.question).toContain('0412345678');
      expect(gap?.question).toContain('different number');
      // Named as their REGISTERED number, matching the callback flow's script.
      // Showing bare digits leaves the user wondering where the number came
      // from, and QA raised exactly that.
      expect(gap?.question).toContain('your registered number');
    });

    it('still asks outright when nothing is on file', async (): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: '10am',
          natureOfRequest: 'a chat',
        },
      });

      const gap = result.gaps.find(
        (entry): boolean =>
          entry.issue === APPOINTMENT_SLOT_ISSUE.MISSING_CONTACT,
      );

      expect(gap?.question).toBe('What number can the team reach you on?');
    });

    it.each([
      'number written above',
      'registered number',
      'the same number',
      'that one',
      'the one showing',
    ])(
      'accepts the number on file when the user answers "%s"',
      async (reply): Promise<void> => {
        const result = await service.resolve({
          timezone,
          now: NOW,
          registeredContact: '0412345678',
          slots: {
            dateText: 'tomorrow',
            timeText: '10am',
            natureOfRequest: 'a chat',
            contactText: reply,
          },
        });

        // The question offered two options, so naming one is an answer — not a
        // malformed phone number to be rejected and asked for again.
        expect(result.isComplete).toBe(true);
        expect(result.appointment?.contactNumber).toBe('0412345678');
      },
    );

    it('still rejects a non-number when there is nothing on file to accept', async (): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: '10am',
          natureOfRequest: 'a chat',
          contactText: 'the same number',
        },
      });

      const gap = result.gaps.find(
        (entry): boolean =>
          entry.issue === APPOINTMENT_SLOT_ISSUE.MISSING_CONTACT,
      );

      expect(gap).toBeDefined();
      expect(result.isComplete).toBe(false);
    });

    it('prefers a number the user typed over the one on file', async (): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        registeredContact: '0412345678',
        slots: {
          dateText: 'tomorrow',
          timeText: '10am',
          natureOfRequest: 'a chat',
          contactText: '0499888777',
        },
      });

      expect(result.isComplete).toBe(true);
      expect(result.appointment?.contactNumber).toBe('0499888777');
    });

    it('asks for one when the visitor has not given it', async (): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: '10am',
          natureOfRequest: 'a chat',
        },
      });

      expect(result.isComplete).toBe(false);
      expect(
        result.gaps.some(
          (gap): boolean =>
            gap.issue === APPOINTMENT_SLOT_ISSUE.MISSING_CONTACT,
        ),
      ).toBe(true);
    });

    it.each(['0412345678', '+61 412 345 678', '(03) 9123 4567'])(
      'accepts "%s"',
      async (contact): Promise<void> => {
        const result = await service.resolve({
          timezone,
          now: NOW,
          slots: {
            dateText: 'tomorrow',
            timeText: '10am',
            natureOfRequest: 'a chat',
            contactText: contact,
          },
        });

        expect(result.isComplete).toBe(true);
        expect(result.appointment?.contactNumber).toBe(contact);
      },
    );

    it.each([
      'not telling',
      '123',
      'abcdefgh',
      // Mixed letters and digits: these reduce to enough digits to pass a
      // digit-count check on their own, which is how "6876y76y" was accepted.
      '6876y76y',
      '0412x345y678',
      'call me on 12345six',
      'i have shared above',
    ])('asks again for "%s"', async (contact): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: '10am',
          natureOfRequest: 'a chat',
          contactText: contact,
        },
      });

      expect(result.isComplete).toBe(false);
      expect(
        result.gaps.some(
          (gap): boolean =>
            gap.issue === APPOINTMENT_SLOT_ISSUE.MISSING_CONTACT,
        ),
      ).toBe(true);
    });
  });

  describe('department mapping', (): void => {
    it.each([
      ['sales team', APPOINTMENT_DEPARTMENT.SALES],
      ['the support team', APPOINTMENT_DEPARTMENT.SUPPORT],
      ['service department', APPOINTMENT_DEPARTMENT.SERVICE],
      ['accounts', APPOINTMENT_DEPARTMENT.ACCOUNT],
      ['billing', APPOINTMENT_DEPARTMENT.ACCOUNT],
      ['someone about pricing', APPOINTMENT_DEPARTMENT.SALES],
    ])('maps "%s" to %s', async (text, expected): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          departmentText: text,
          dateText: 'tomorrow',
          timeText: '10am',
          contactText: CONTACT,
        },
      });

      expect(result.appointment?.department).toBe(expected);
    });

    it('books without a department rather than forcing a choice', async (): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: '10am',
          natureOfRequest: 'discuss a new install',
          contactText: CONTACT,
        },
      });

      expect(result.isComplete).toBe(true);
      expect(result.appointment?.department).toBeNull();
    });
  });

  describe('time parsing', (): void => {
    it.each([
      ['10am', '10:00'],
      ['3pm', '15:00'],
      ['2:30pm', '14:30'],
      ['14:00', '14:00'],
      ['morning', '10:00'],
      ['afternoon', '14:00'],
      ['midday', '12:00'],
    ])('parses "%s" to %s', async (text, expected): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: text,
          natureOfRequest: 'a chat',
          contactText: CONTACT,
        },
      });

      expect(result.appointment?.preferredTime).toBe(expected);
    });

    it('reads a bare low hour as afternoon', async (): Promise<void> => {
      // "let's meet at 2" means 2 PM, not 2 AM.
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: 'at 2',
          natureOfRequest: 'a chat',
          contactText: CONTACT,
        },
      });

      expect(result.appointment?.preferredTime).toBe('14:00');
    });

    it.each(['7am', '8pm', '11pm', '6am'])(
      'refuses "%s" as outside a 9-5 window',
      async (text): Promise<void> => {
        const result = await service.resolve({
          timezone,
          now: NOW,
          slots: {
            dateText: 'tomorrow',
            timeText: text,
            natureOfRequest: 'a chat',
            contactText: CONTACT,
          },
        });

        expect(result.isComplete).toBe(false);
        expect(
          result.gaps.some(
            (gap): boolean =>
              gap.issue === APPOINTMENT_SLOT_ISSUE.UNRESOLVED_TIME,
          ),
        ).toBe(true);
      },
    );

    it('asks again when the time cannot be parsed', async (): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: 'whenever suits',
          natureOfRequest: 'a chat',
          contactText: CONTACT,
        },
      });

      expect(result.isComplete).toBe(false);
      expect(
        result.gaps.some(
          (gap): boolean =>
            gap.issue === APPOINTMENT_SLOT_ISSUE.UNRESOLVED_TIME,
        ),
      ).toBe(true);
    });
  });

  describe('date handling', (): void => {
    it('asks when no date is given', async (): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          timeText: '10am',
          natureOfRequest: 'a chat',
          contactText: CONTACT,
        },
      });

      expect(
        result.gaps.some(
          (gap): boolean => gap.issue === APPOINTMENT_SLOT_ISSUE.MISSING_DATE,
        ),
      ).toBe(true);
    });

    it('refuses to book a date in the past', async (): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'yesterday',
          timeText: '10am',
          natureOfRequest: 'a chat',
          contactText: CONTACT,
        },
      });

      expect(result.isComplete).toBe(false);
      expect(
        result.gaps.some(
          (gap): boolean =>
            gap.issue === APPOINTMENT_SLOT_ISSUE.UNRESOLVED_DATE,
        ),
      ).toBe(true);
    });
  });

  describe('overrides from clarifying turns', (): void => {
    it('applies a user-supplied date and time', async (): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: { natureOfRequest: 'a chat' },
        overrides: {
          preferredDate: '2026-08-20',
          preferredTime: '11:00',
          contactNumber: CONTACT,
        },
      });

      expect(result.isComplete).toBe(true);
      expect(result.appointment?.preferredDate).toBe('2026-08-20');
      expect(result.appointment?.preferredTime).toBe('11:00');
    });

    it('lets an override correct an extracted slot', async (): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: '10am',
          natureOfRequest: 'a chat',
          contactText: CONTACT,
        },
        overrides: { preferredTime: '15:00' },
      });

      expect(result.appointment?.preferredTime).toBe('15:00');
    });
  });

  describe('resolution contract', (): void => {
    it('never returns both an appointment and gaps', async (): Promise<void> => {
      const complete = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: '10am',
          natureOfRequest: 'a chat',
          contactText: CONTACT,
        },
      });
      const incomplete = await service.resolve({
        timezone,
        now: NOW,
        slots: {},
      });

      expect(complete.appointment).not.toBeNull();
      expect(complete.gaps).toHaveLength(0);
      expect(incomplete.appointment).toBeNull();
      expect(incomplete.gaps.length).toBeGreaterThan(0);
    });

    it('summarises the booking in plain language', async (): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          departmentText: 'sales',
          dateText: 'tomorrow',
          timeText: '2pm',
          contactText: CONTACT,
        },
      });

      expect(result.summary).toContain('2 PM');
      expect(result.summary).toContain('sales');
      expect(result.summary).toContain('2026-08-05');
    });

    it('produces a date and time in the persisted formats', async (): Promise<void> => {
      const result = await service.resolve({
        timezone,
        now: NOW,
        slots: {
          dateText: 'tomorrow',
          timeText: '10am',
          natureOfRequest: 'a chat',
          contactText: CONTACT,
        },
      });

      expect(result.appointment?.preferredDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.appointment?.preferredTime).toMatch(
        /^([01]\d|2[0-3]):[0-5]\d$/,
      );
    });
  });

  describe('QA screenshot: the appointment question loop', (): void => {
    it('understands a date buried in the sentence, so the loop ends', async (): Promise<void> => {
      const service = buildService();

      const result = await service.resolve({
        slots: {
          dateText:
            'tomorrow and meeting regarduct i want to puchase the product',
          natureOfRequest: 'purchase the product',
        },
        timezone,
        registeredContact: CONTACT,
        now: NOW,
      });

      // The date gap is what repeated: it must be gone.
      expect(
        result.gaps.find((gap): boolean => gap.issue.includes('date')),
      ).toBeUndefined();
    });

    it('never bundles several asks into one question', async (): Promise<void> => {
      const service = buildService();

      const result = await service.resolve({ slots: {}, timezone, now: NOW });

      // The widget asks gaps[0] only, but a single gap must not itself be
      // three questions joined together, which is how the screenshot read.
      for (const gap of result.gaps) {
        expect((gap.question.match(/\?/g) ?? []).length).toBeLessThanOrEqual(1);
      }
    });
  });
});
