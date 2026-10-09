import { ReportEntityMatcherService } from '@/chatbotReport/reportEntityMatcherService';
import type { IReportLookupOption } from '@/types/chatbotReport';

describe('ReportEntityMatcherService', (): void => {
  const service = new ReportEntityMatcherService();

  const locations: IReportLookupOption[] = [
    { id: 'loc-1', label: 'Wing A' },
    { id: 'loc-2', label: 'Wing B' },
    { id: 'loc-3', label: 'Room 5' },
    { id: 'loc-4', label: 'Room 50' },
    { id: 'loc-5', label: 'Ground Floor Reception' },
  ];

  describe('exact matching', (): void => {
    it('matches an exact label', (): void => {
      const result = service.match('Wing A', locations);

      expect(result.matched?.id).toBe('loc-1');
    });

    it('ignores case', (): void => {
      expect(service.match('wing a', locations).matched?.id).toBe('loc-1');
    });

    it('ignores punctuation and extra whitespace', (): void => {
      expect(service.match('  room #5  ', locations).matched?.id).toBe('loc-3');
    });
  });

  describe('the safety property: no invented matches', (): void => {
    it('does not match an entity that does not exist', (): void => {
      const result = service.match('Wing Z', locations);

      expect(result.matched).toBeNull();
      expect(result.candidates.length).toBeGreaterThan(0);
    });

    it('does not confuse Wing A with Wing B', (): void => {
      // One character apart, but semantically different rooms. Must not
      // silently resolve to the wrong wing.
      const result = service.match('Wing C', locations);

      expect(result.matched).toBeNull();
    });

    it('returns no match against an empty lookup list', (): void => {
      const result = service.match('Wing A', []);

      expect(result.matched).toBeNull();
      expect(result.candidates).toHaveLength(0);
    });

    it('returns no match for empty text', (): void => {
      expect(service.match('   ', locations).matched).toBeNull();
    });
  });

  describe('ambiguity handling', (): void => {
    it('asks rather than guessing between Room 5 and Room 50', (): void => {
      const result = service.match('Room', locations);

      expect(result.matched).toBeNull();
      expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    });

    it('still resolves the precise variant exactly', (): void => {
      expect(service.match('Room 5', locations).matched?.id).toBe('loc-3');
      expect(service.match('Room 50', locations).matched?.id).toBe('loc-4');
    });

    it('caps how many candidates it offers', (): void => {
      const many: IReportLookupOption[] = Array.from(
        { length: 20 },
        (_unused, index): IReportLookupOption => ({
          id: `loc-${index}`,
          label: `Ward ${index}`,
        }),
      );

      const result = service.match('Ward', many);

      expect(result.candidates.length).toBeLessThanOrEqual(5);
    });
  });

  describe('partial and fuzzy matching', (): void => {
    it('matches a distinctive prefix', (): void => {
      const result = service.match('Ground Floor', locations);

      expect(result.matched?.id).toBe('loc-5');
    });

    it('tolerates a typo', (): void => {
      const result = service.match('Groud Floor Reception', locations);

      expect(result.matched?.id).toBe('loc-5');
    });

    it('offers candidates for unrelated input', (): void => {
      const result = service.match('helicopter pad', locations);

      expect(result.matched).toBeNull();
    });
  });

  describe('matchAll', (): void => {
    it('resolves several names at once', (): void => {
      const results = service.matchAll(['Wing A', 'Room 5'], locations);

      expect(results).toHaveLength(2);
      expect(results[0].matched?.id).toBe('loc-1');
      expect(results[1].matched?.id).toBe('loc-3');
    });

    it('reports per-item failure without failing the batch', (): void => {
      const results = service.matchAll(['Wing A', 'Nonexistent'], locations);

      expect(results[0].matched?.id).toBe('loc-1');
      expect(results[1].matched).toBeNull();
    });
  });

  describe('alarm types', (): void => {
    const alarmTypes: IReportLookupOption[] = [
      { id: 'at-1', label: 'Fall Alarm' },
      { id: 'at-2', label: 'Nurse Call' },
      { id: 'at-3', label: 'Emergency Call' },
    ];

    it('matches a natural phrasing to an alarm type', (): void => {
      expect(service.match('fall alarm', alarmTypes).matched?.id).toBe('at-1');
    });

    it('matches a singular word to its label', (): void => {
      expect(service.match('Emergency', alarmTypes).matched?.id).toBe('at-3');
    });
  });
});
