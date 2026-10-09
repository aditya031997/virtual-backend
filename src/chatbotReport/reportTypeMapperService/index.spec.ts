import { ReportTypeMapperService } from '@/chatbotReport/reportTypeMapperService';
import { REPORT_FILE_FORMAT, REPORT_TYPE } from '@/types/chatbotReport';

describe('ReportTypeMapperService', (): void => {
  const service = new ReportTypeMapperService();

  describe('mapType', (): void => {
    it('maps the client\'s "longer than 5 minutes" phrasing to Excessive Response', (): void => {
      expect(
        service.mapType(
          'all calls longer than 5 minutes longer than 5 minutes',
        ),
      ).toBe(REPORT_TYPE.EXCESSIVE_RESPONSE);
    });

    it('maps "alarms raised" to List of Alarms', (): void => {
      expect(service.mapType('alarms raised')).toBe(REPORT_TYPE.LIST_OF_ALARMS);
    });

    it('prefers Response Time by Shift over the generic response rule', (): void => {
      expect(service.mapType('response times by shift')).toBe(
        REPORT_TYPE.RESPONSE_TIME_BY_SHIFT,
      );
    });

    it.each([
      ['a summary of last month', REPORT_TYPE.SUMMARY],
      ['low battery devices', REPORT_TYPE.LOW_BATTERY],
      ['care minutes', REPORT_TYPE.CARE_MINUTES],
      ['alarms by type', REPORT_TYPE.ALARMS_BY_TYPE],
      ['alarms by resident', REPORT_TYPE.ALARMS_BY_ID],
      ['detailed alarm history', REPORT_TYPE.DETAILED_EVENT],
      ['all alarms', REPORT_TYPE.LIST_OF_ALARMS],
    ])('maps "%s" correctly', (description, expected): void => {
      expect(service.mapType(description)).toBe(expected);
    });

    it('returns null when the description is too vague', (): void => {
      expect(service.mapType('some data please')).toBeNull();
    });

    it('returns null for empty input', (): void => {
      expect(service.mapType('   ')).toBeNull();
    });
  });

  describe('mapFileFormat', (): void => {
    it.each([
      ['send it as PDF', REPORT_FILE_FORMAT.PDF],
      ['excel please', REPORT_FILE_FORMAT.EXCEL],
      ['as a spreadsheet', REPORT_FILE_FORMAT.EXCEL],
      ['csv', REPORT_FILE_FORMAT.CSV],
    ])('maps "%s" to the right format', (text, expected): void => {
      expect(service.mapFileFormat(text)).toBe(expected);
    });

    it('defaults to PDF when unspecified', (): void => {
      expect(service.mapFileFormat('')).toBe(REPORT_FILE_FORMAT.PDF);
    });
  });

  describe('parseDurationSeconds', (): void => {
    it.each([
      ['longer than 5 minutes', 300],
      ['over 30 seconds', 30],
      ['more than 2 hours', 7200],
      ['10 mins', 600],
      ['90 secs', 90],
      ['1 hour', 3600],
    ])('parses "%s" to %i seconds', (text, expected): void => {
      expect(service.parseDurationSeconds(text)).toBe(expected);
    });

    it('handles a fractional amount', (): void => {
      expect(service.parseDurationSeconds('1.5 hours')).toBe(5400);
    });

    it('returns null when there is no duration', (): void => {
      expect(service.parseDurationSeconds('all calls yesterday')).toBeNull();
    });

    it('returns null for a zero duration', (): void => {
      expect(service.parseDurationSeconds('0 minutes')).toBeNull();
    });

    it('returns null for empty input', (): void => {
      expect(service.parseDurationSeconds('')).toBeNull();
    });
  });

  describe('listTypes', (): void => {
    it('lists all nine report types with labels', (): void => {
      const types = service.listTypes();

      expect(types).toHaveLength(9);
      expect(types.every((entry): boolean => entry.label.length > 0)).toBe(
        true,
      );
    });
  });

  describe('searchTypes', (): void => {
    it('returns every type when the search is empty', (): void => {
      const result = service.searchTypes('', 1, 50);

      expect(result.items).toHaveLength(9);
      expect(result.total).toBe(9);
      expect(result.hasMore).toBe(false);
    });

    it('filters by label, case-insensitively', (): void => {
      const result = service.searchTypes('alarm', 1, 50);

      expect(result.items.length).toBeGreaterThan(0);
      expect(
        result.items.every((item): boolean =>
          item.name.toLowerCase().includes('alarm'),
        ),
      ).toBe(true);
    });

    it('returns an empty page for a term that matches nothing', (): void => {
      const result = service.searchTypes('helicopter', 1, 50);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('paginates and flags that more remain', (): void => {
      const first = service.searchTypes('', 1, 4);

      expect(first.items).toHaveLength(4);
      expect(first.total).toBe(9);
      expect(first.hasMore).toBe(true);
    });

    it('returns the remainder on the last page', (): void => {
      const last = service.searchTypes('', 3, 4);

      expect(last.items).toHaveLength(1);
      expect(last.hasMore).toBe(false);
    });

    it('does not repeat an item across pages', (): void => {
      const pageOne = service.searchTypes('', 1, 4);
      const pageTwo = service.searchTypes('', 2, 4);
      const ids = [...pageOne.items, ...pageTwo.items].map(
        (item): string => item.id,
      );

      expect(new Set(ids).size).toBe(ids.length);
    });

    it('returns an empty page past the end rather than failing', (): void => {
      const result = service.searchTypes('', 99, 50);

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it.each([
      [0, 'zero page'],
      [-1, 'negative page'],
    ])('treats %s (%s) as the first page', (page): void => {
      const result = service.searchTypes('', page, 50);

      expect(result.items).toHaveLength(9);
    });

    it('caps an oversized page size', (): void => {
      const result = service.searchTypes('', 1, 100_000);

      expect(result.items).toHaveLength(9);
    });

    it('returns ids that map back to real report types', (): void => {
      const validIds = service
        .listTypes()
        .map((entry): string => String(entry.type));

      for (const item of service.searchTypes('', 1, 50).items) {
        expect(validIds).toContain(item.id);
      }
    });
  });
});
