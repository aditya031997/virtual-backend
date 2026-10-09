import { ReportDateResolverService } from '@/chatbotReport/reportDateResolverService';

describe('ReportDateResolverService', (): void => {
  const service = new ReportDateResolverService();

  // Tuesday 4 August 2026, 10:00 UTC — matches the project's working period.
  const NOW = new Date('2026-08-04T10:00:00.000Z');
  const UTC = 'UTC';

  describe('dates written inside a sentence', (): void => {
    // The phrase is rarely the whole message. Anchored patterns rejected every
    // one of these, so a second report request in the same chat went unanswered.
    it('resolves the QA case: "please provide me the report of today"', (): void => {
      const range = service.resolve(
        'please provide me the report of today',
        UTC,
        NOW,
      );

      expect(range?.startDate).toBe('2026-08-04T00:00:00.000Z');
      expect(range?.endDate).toBe('2026-08-04T23:59:59.999Z');
    });

    it.each([
      ['can i get the report for yesterday please', '2026-08-03T00:00:00.000Z'],
      ['send me everything from last week', '2026-07-27T00:00:00.000Z'],
      ['i need the last 30 days of alarms', '2026-07-06T00:00:00.000Z'],
      ['the report for this month would be great', '2026-08-01T00:00:00.000Z'],
      ['show me 2026-07-15 for that site', '2026-07-15T00:00:00.000Z'],
    ])('resolves a range from "%s"', (phrase, expectedStart): void => {
      expect(service.resolve(phrase, UTC, NOW)?.startDate).toBe(expectedStart);
    });

    it('does not mistake an unrelated word for a month name', (): void => {
      // "report" and "alarms" are [a-z]+ but not months; the name lookup is
      // what keeps the loosened pattern safe.
      expect(
        service.resolve('please send the alarms report', UTC, NOW),
      ).toBeNull();
    });

    it('returns null when the message carries no date at all', (): void => {
      expect(service.resolve('generate a report for me', UTC, NOW)).toBeNull();
    });
  });

  describe('keyword phrases in UTC', (): void => {
    it('resolves "today" to the full current day', (): void => {
      const range = service.resolve('today', UTC, NOW);

      expect(range?.startDate).toBe('2026-08-04T00:00:00.000Z');
      expect(range?.endDate).toBe('2026-08-04T23:59:59.999Z');
    });

    it('resolves "yesterday" to the full prior day', (): void => {
      const range = service.resolve('yesterday', UTC, NOW);

      expect(range?.startDate).toBe('2026-08-03T00:00:00.000Z');
      expect(range?.endDate).toBe('2026-08-03T23:59:59.999Z');
    });

    it('resolves "last week" to the previous Monday-Sunday', (): void => {
      const range = service.resolve('last week', UTC, NOW);

      // Week of Mon 27 Jul - Sun 2 Aug 2026.
      expect(range?.startDate).toBe('2026-07-27T00:00:00.000Z');
      expect(range?.endDate).toBe('2026-08-02T23:59:59.999Z');
    });

    it('resolves "this week" from Monday to today', (): void => {
      const range = service.resolve('this week', UTC, NOW);

      expect(range?.startDate).toBe('2026-08-03T00:00:00.000Z');
      expect(range?.endDate).toBe('2026-08-04T23:59:59.999Z');
    });

    it('resolves "last month" to the whole of the previous month', (): void => {
      const range = service.resolve('last month', UTC, NOW);

      expect(range?.startDate).toBe('2026-07-01T00:00:00.000Z');
      expect(range?.endDate).toBe('2026-07-31T23:59:59.999Z');
    });

    it('is case and whitespace insensitive', (): void => {
      const range = service.resolve('  YESTERDAY  ', UTC, NOW);

      expect(range?.startDate).toBe('2026-08-03T00:00:00.000Z');
    });
  });

  describe('relative windows', (): void => {
    it('resolves "last 30 days" inclusive of today', (): void => {
      const range = service.resolve('last 30 days', UTC, NOW);

      // 30 days ending today inclusive => 6 July .. 4 August.
      expect(range?.startDate).toBe('2026-07-06T00:00:00.000Z');
      expect(range?.endDate).toBe('2026-08-04T23:59:59.999Z');
    });

    it('accepts the client\'s "during the last 30 days" phrasing', (): void => {
      const range = service.resolve('the last 30 days', UTC, NOW);

      expect(range?.startDate).toBe('2026-07-06T00:00:00.000Z');
    });

    it('resolves week-based windows', (): void => {
      const range = service.resolve('past 2 weeks', UTC, NOW);

      expect(range?.startDate).toBe('2026-07-22T00:00:00.000Z');
      expect(range?.endDate).toBe('2026-08-04T23:59:59.999Z');
    });

    it('rejects a window beyond the safety cap', (): void => {
      expect(service.resolve('last 3650 days', UTC, NOW)).toBeNull();
    });

    it('rejects a zero-length window', (): void => {
      expect(service.resolve('last 0 days', UTC, NOW)).toBeNull();
    });
  });

  describe('named days and months', (): void => {
    it('resolves a weekday to the most recent past occurrence', (): void => {
      // NOW is Tuesday; "friday" must look back, never forward.
      const range = service.resolve('friday', UTC, NOW);

      expect(range?.startDate).toBe('2026-07-31T00:00:00.000Z');
      expect(range?.endDate).toBe('2026-07-31T23:59:59.999Z');
    });

    it('resolves a month that has already passed this year', (): void => {
      const range = service.resolve('march', UTC, NOW);

      expect(range?.startDate).toBe('2026-03-01T00:00:00.000Z');
      expect(range?.endDate).toBe('2026-03-31T23:59:59.999Z');
    });

    it('resolves a not-yet-reached month to last year', (): void => {
      const range = service.resolve('november', UTC, NOW);

      expect(range?.startDate).toBe('2025-11-01T00:00:00.000Z');
      expect(range?.endDate).toBe('2025-11-30T23:59:59.999Z');
    });
  });

  describe('explicit dates', (): void => {
    it('resolves a single ISO date', (): void => {
      const range = service.resolve('2026-07-15', UTC, NOW);

      expect(range?.startDate).toBe('2026-07-15T00:00:00.000Z');
      expect(range?.endDate).toBe('2026-07-15T23:59:59.999Z');
    });

    it('resolves an explicit ISO range', (): void => {
      const range = service.resolve('2026-07-01 to 2026-07-31', UTC, NOW);

      expect(range?.startDate).toBe('2026-07-01T00:00:00.000Z');
      expect(range?.endDate).toBe('2026-07-31T23:59:59.999Z');
    });

    it('rejects a reversed range', (): void => {
      expect(service.resolve('2026-07-31 to 2026-07-01', UTC, NOW)).toBeNull();
    });

    it('rejects an impossible calendar date', (): void => {
      expect(service.resolve('2026-02-31', UTC, NOW)).toBeNull();
    });
  });

  describe('timezone correctness', (): void => {
    it('resolves "yesterday" in the user timezone, not UTC', (): void => {
      // Sydney is UTC+10 in August. Their 3 Aug starts at 2 Aug 14:00 UTC.
      const range = service.resolve('yesterday', 'Australia/Sydney', NOW);

      expect(range?.startDate).toBe('2026-08-02T14:00:00.000Z');
      expect(range?.endDate).toBe('2026-08-03T13:59:59.999Z');
    });

    it('resolves "yesterday" correctly for a behind-UTC timezone', (): void => {
      // New York is UTC-4 in August. Their 3 Aug starts at 3 Aug 04:00 UTC.
      const range = service.resolve('yesterday', 'America/New_York', NOW);

      expect(range?.startDate).toBe('2026-08-03T04:00:00.000Z');
      expect(range?.endDate).toBe('2026-08-04T03:59:59.999Z');
    });

    it('produces a different absolute window per timezone', (): void => {
      const sydney = service.resolve('today', 'Australia/Sydney', NOW);
      const london = service.resolve('today', 'Europe/London', NOW);

      expect(sydney?.startDate).not.toBe(london?.startDate);
    });

    it('handles a winter date in a DST timezone', (): void => {
      // 15 Jan 2026: New York is UTC-5 (no DST).
      const winter = new Date('2026-01-15T12:00:00.000Z');
      const range = service.resolve('today', 'America/New_York', winter);

      expect(range?.startDate).toBe('2026-01-15T05:00:00.000Z');
    });

    it('falls back to UTC for an unrecognised timezone', (): void => {
      const range = service.resolve('today', 'Not/AZone', NOW);

      expect(range?.startDate).toBe('2026-08-04T00:00:00.000Z');
    });
  });

  describe('typos in the date word', (): void => {
    // QA typed "please generate the report of todya". "todya" is a
    // transposition, which plain Levenshtein scores as two edits — over the
    // one-edit budget a five-letter word gets. The phrase reached the parser
    // uncorrected, no date matched, and the bot filled the gap with a default
    // window instead: it offered "2026-08-15 to 2026-08-18" for a request that
    // plainly said today.
    it('resolves the QA case: "please generate the report of todya"', (): void => {
      const range = service.resolve(
        'please generate the report of todya',
        UTC,
        NOW,
      );

      expect(range?.startDate).toBe('2026-08-04T00:00:00.000Z');
      expect(range?.endDate).toBe('2026-08-04T23:59:59.999Z');
    });

    it.each([
      ['todya', '2026-08-04T00:00:00.000Z'],
      ['tuesady', '2026-07-28T00:00:00.000Z'],
      ['mondya', '2026-08-03T00:00:00.000Z'],
      ['yesterdya', '2026-08-03T00:00:00.000Z'],
      ['lsat week', '2026-07-27T00:00:00.000Z'],
    ])('corrects the transposition in "%s"', (phrase, expectedStart): void => {
      expect(service.resolve(phrase, UTC, NOW)?.startDate).toBe(expectedStart);
    });

    it('still corrects a plain deletion ("yesteday")', (): void => {
      // Transposition support must not cost us the typos that already worked.
      expect(service.resolve('yesteday', UTC, NOW)?.startDate).toBe(
        '2026-08-03T00:00:00.000Z',
      );
    });

    it.each([
      'total',
      'monty',
      'money',
      'weak',
      'lasts',
      'yearly',
      'mound',
      'sunny',
    ])('does not turn the ordinary word "%s" into a date', (word): void => {
      // The edit budget stays where it was; only the cost of a swap changed.
      // Widening the budget instead would have pulled these in.
      expect(service.resolve(word, UTC, NOW)).toBeNull();
    });
  });

  describe('unparseable input', (): void => {
    it.each([
      ['', 'empty string'],
      ['   ', 'whitespace only'],
      ['sometime last quarter', 'vague phrase'],
      ['asdfgh', 'gibberish'],
      ['next week', 'future range'],
    ])('returns null for %s (%s)', (input): void => {
      expect(service.resolve(input, UTC, NOW)).toBeNull();
    });
  });

  describe('range integrity', (): void => {
    it.each([
      'today',
      'yesterday',
      'last week',
      'last month',
      'last 30 days',
      'past 2 weeks',
      'friday',
      'march',
    ])('produces start before end for "%s"', (phrase): void => {
      const range = service.resolve(phrase, UTC, NOW);

      expect(range).not.toBeNull();
      expect(new Date(range!.startDate).getTime()).toBeLessThan(
        new Date(range!.endDate).getTime(),
      );
    });

    it('never produces a range extending into the future', (): void => {
      const phrases = ['today', 'yesterday', 'last week', 'last 30 days'];

      for (const phrase of phrases) {
        const range = service.resolve(phrase, UTC, NOW);
        const endOfToday = new Date('2026-08-04T23:59:59.999Z').getTime();

        expect(new Date(range!.endDate).getTime()).toBeLessThanOrEqual(
          endOfToday,
        );
      }
    });
  });
});
