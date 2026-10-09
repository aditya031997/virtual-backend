import { AppointmentDateResolverService } from '@/chatbotAppointment/appointmentDateResolverService';

describe('AppointmentDateResolverService', (): void => {
  const service = new AppointmentDateResolverService();

  // Tuesday 4 August 2026.
  const NOW = new Date('2026-08-04T10:00:00.000Z');
  const UTC = 'UTC';

  describe('forward-looking keywords', (): void => {
    it.each([
      ['today', '2026-08-04'],
      ['tomorrow', '2026-08-05'],
      ['day after tomorrow', '2026-08-06'],
    ])('resolves "%s" to %s', (phrase, expected): void => {
      expect(service.resolve(phrase, UTC, NOW)?.date).toBe(expected);
    });

    it('resolves "next week" to the following Monday', (): void => {
      // NOW is Tue 4 Aug; next week's Monday is 10 Aug.
      expect(service.resolve('next week', UTC, NOW)?.date).toBe('2026-08-10');
    });

    it('resolves "next month" to the first of that month', (): void => {
      expect(service.resolve('next month', UTC, NOW)?.date).toBe('2026-09-01');
    });
  });

  describe('dates written inside a sentence', (): void => {
    // The phrase is rarely the whole message. Anchored patterns rejected every
    // one of these, so the resolver re-asked a question the user had answered.
    it.each([
      // Verbatim from the QA report, typos and all.
      [
        'tomorrow and meeting regarduct i want to puchase the product',
        '2026-08-05',
      ],
      [
        'tomorrow and meeting is reagrding the purchase of product',
        '2026-08-05',
      ],
      ['can we do it on friday please', '2026-08-07'],
      ['maybe in 3 days if that suits', '2026-08-07'],
      ['how about 2026-08-20 for the meeting', '2026-08-20'],
      ['next week works better for us', '2026-08-10'],
    ])('resolves a date from "%s"', (phrase, expected): void => {
      expect(service.resolve(phrase, UTC, NOW)?.date).toBe(expected);
    });

    it('prefers "day after tomorrow" over the "tomorrow" inside it', (): void => {
      expect(
        service.resolve('the day after tomorrow works', UTC, NOW)?.date,
      ).toBe('2026-08-06');
    });

    it('still treats "next friday" as the following week', (): void => {
      // NOW is Tue 4 Aug. This Friday is the 7th; "next friday" is the 14th.
      expect(
        service.resolve('lets say next friday for the demo', UTC, NOW)?.date,
      ).toBe('2026-08-14');
    });

    it('returns null when the message carries no date at all', (): void => {
      expect(
        service.resolve('i want to purchase the product', UTC, NOW),
      ).toBeNull();
    });
  });

  describe('the safety property: never book the past', (): void => {
    it.each([
      'yesterday',
      'last week',
      'last month',
      '2020-01-01',
      '2026-08-03',
    ])('refuses to resolve "%s"', (phrase): void => {
      expect(service.resolve(phrase, UTC, NOW)).toBeNull();
    });

    it('resolves a weekday forward, never backward', (): void => {
      // NOW is Tuesday. "monday" must mean next Monday, not yesterday.
      const resolved = service.resolve('monday', UTC, NOW);

      expect(resolved?.date).toBe('2026-08-10');
    });

    it('never returns a date before today for any accepted phrase', (): void => {
      const phrases = [
        'today',
        'tomorrow',
        'next week',
        'friday',
        'in 3 days',
        'next month',
      ];

      for (const phrase of phrases) {
        const resolved = service.resolve(phrase, UTC, NOW);
        expect(resolved).not.toBeNull();
        expect(resolved!.date >= '2026-08-04').toBe(true);
      }
    });
  });

  describe('named weekdays', (): void => {
    it('resolves a weekday later in the same week', (): void => {
      // Tue -> Fri is 3 days ahead.
      expect(service.resolve('friday', UTC, NOW)?.date).toBe('2026-08-07');
    });

    it('treats "next friday" as the following week', (): void => {
      expect(service.resolve('next friday', UTC, NOW)?.date).toBe('2026-08-14');
    });

    it('resolves the same weekday to a week ahead', (): void => {
      // NOW is Tuesday; "tuesday" means the Tuesday coming.
      expect(service.resolve('tuesday', UTC, NOW)?.date).toBe('2026-08-11');
    });
  });

  describe('relative offsets', (): void => {
    it.each([
      ['in 3 days', '2026-08-07'],
      ['in 1 week', '2026-08-11'],
      ['in 2 weeks', '2026-08-18'],
    ])('resolves "%s" to %s', (phrase, expected): void => {
      expect(service.resolve(phrase, UTC, NOW)?.date).toBe(expected);
    });

    it('rejects a booking beyond the horizon', (): void => {
      expect(service.resolve('in 400 days', UTC, NOW)).toBeNull();
    });
  });

  describe('explicit dates', (): void => {
    it('resolves a future ISO date', (): void => {
      expect(service.resolve('2026-08-20', UTC, NOW)?.date).toBe('2026-08-20');
    });

    it('rejects an impossible calendar date', (): void => {
      expect(service.resolve('2026-02-31', UTC, NOW)).toBeNull();
    });
  });

  describe('timezone awareness', (): void => {
    it('resolves "today" against the user timezone', (): void => {
      // 4 Aug 10:00 UTC is already 4 Aug 20:00 in Sydney — same calendar day.
      expect(service.resolve('today', 'Australia/Sydney', NOW)?.date).toBe(
        '2026-08-04',
      );
    });

    it('accounts for a timezone already on the next day', (): void => {
      // 4 Aug 23:00 UTC is 5 Aug in Sydney, so "today" differs by zone.
      const lateEvening = new Date('2026-08-04T23:00:00.000Z');

      expect(
        service.resolve('today', 'Australia/Sydney', lateEvening)?.date,
      ).toBe('2026-08-05');
      expect(service.resolve('today', 'UTC', lateEvening)?.date).toBe(
        '2026-08-04',
      );
    });
  });

  describe('unparseable input', (): void => {
    it.each(['', '   ', 'sometime soon', 'asdfgh', 'whenever'])(
      'returns null for "%s"',
      (phrase): void => {
        expect(service.resolve(phrase, UTC, NOW)).toBeNull();
      },
    );
  });

  describe('misspelt date words', (): void => {
    // "I couldn't work out a date from 'tomorrw'" was the whole of the bug:
    // the bot asks for a day, the user gives one, and it says it cannot read
    // it. The knowledge-base search already tolerates typos; dates now do too.
    it.each([
      ['tomorrw', '2026-08-05'],
      ['tommorow', '2026-08-05'],
      ['tomorow', '2026-08-05'],
      ['tommorrow', '2026-08-05'],
      ['wednesdy', '2026-08-05'],
      ['nex week', '2026-08-10'],
    ])('resolves "%s" to %s', (phrase, expected): void => {
      expect(service.resolve(phrase, UTC, NOW)?.date).toBe(expected);
    });

    it('still resolves correctly spelt phrases', (): void => {
      expect(service.resolve('tomorrow', UTC, NOW)?.date).toBe('2026-08-05');
    });

    // A swap of two adjacent characters is the most common typing slip, and
    // plain Levenshtein charged it as two edits — more than a short word's
    // budget allows. This surfaced in the report chatbot as "todya" going
    // unread; the same correction code lives here, so it is pinned on both
    // sides to stop the two copies drifting apart.
    it.each([
      ['todya', '2026-08-04'],
      ['tomorrwo', '2026-08-05'],
      ['tuesady', '2026-08-11'],
      ['mondya', '2026-08-10'],
    ])('resolves the transposition in "%s" to %s', (phrase, expected): void => {
      expect(service.resolve(phrase, UTC, NOW)?.date).toBe(expected);
    });

    it.each(['total', 'monty', 'money', 'weak', 'sunny'])(
      'does not turn the ordinary word "%s" into a date',
      (word): void => {
        // Only the cost of a swap changed; the edit budget is untouched.
        expect(service.resolve(word, UTC, NOW)).toBeNull();
      },
    );

    it.each(['i want to return the product', 'the alarms report', 'sas nagar'])(
      'does not invent a date from "%s"',
      (phrase): void => {
        expect(service.resolve(phrase, UTC, NOW)).toBeNull();
      },
    );
  });
});
