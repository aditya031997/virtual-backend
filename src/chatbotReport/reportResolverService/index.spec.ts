import { ReportDateResolverService } from '@/chatbotReport/reportDateResolverService';
import { ReportEntityMatcherService } from '@/chatbotReport/reportEntityMatcherService';
import { ReportResolverService } from '@/chatbotReport/reportResolverService';
import { ReportTypeMapperService } from '@/chatbotReport/reportTypeMapperService';
import type { ReportLookupService } from '@/chatbotReport/reportLookupService';
import {
  REPORT_SLOT_ISSUE,
  REPORT_TYPE,
  type IReportLookups,
} from '@/types/chatbotReport';

const LOOKUPS: IReportLookups = {
  locations: [
    { id: 'loc-wing-a', label: 'Wing A' },
    { id: 'loc-wing-b', label: 'Wing B' },
    { id: 'loc-room-5', label: 'Room 5' },
  ],
  clients: [{ id: 'cli-1', label: 'Resident One' }],
  alarmTypes: [
    { id: 'at-fall', label: 'Fall Alarm' },
    { id: 'at-nurse', label: 'Nurse Call' },
  ],
  shifts: [
    { id: 'sh-night', label: 'Night Shift' },
    { id: 'sh-day', label: 'Day Shift' },
  ],
};

/** Resolver wired to a stub lookup service returning `lookups`. */
function buildService(
  lookups: IReportLookups = LOOKUPS,
): ReportResolverService {
  const lookupService = {
    getLookups: (): Promise<IReportLookups> => Promise.resolve(lookups),
    invalidate: (): void => undefined,
  } as unknown as ReportLookupService;

  return new ReportResolverService(
    lookupService,
    new ReportEntityMatcherService(),
    new ReportDateResolverService(),
    new ReportTypeMapperService(),
  );
}

describe('ReportResolverService', (): void => {
  const service = buildService();
  const siteId = 'site-1';
  const timezone = 'UTC';

  describe("the client's example requests", (): void => {
    it('resolves "all calls longer than 5 minutes from yesterday"', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: {
          reportDescription: 'all calls longer than 5 minutes',
          durationText: 'longer than 5 minutes',
          dateRangeText: 'yesterday',
        },
      });

      expect(result.isComplete).toBe(true);
      expect(result.payload?.type).toBe(REPORT_TYPE.EXCESSIVE_RESPONSE);
      // The duration doubles as the threshold this report type requires.
      expect(result.payload?.thresholdSeconds).toBe(300);
      expect(result.payload?.siteId).toBe(siteId);
    });

    it('resolves "all calls from Room 5 last week"', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: {
          reportDescription: 'all calls',
          locationText: 'Room 5',
          dateRangeText: 'last week',
        },
      });

      expect(result.isComplete).toBe(true);
      expect(result.payload?.locationIds).toEqual(['loc-room-5']);
    });

    it('resolves "all alarms raised in Wing A during the last 30 days"', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: {
          reportDescription: 'alarms raised',
          locationText: 'Wing A',
          dateRangeText: 'the last 30 days',
        },
      });

      expect(result.isComplete).toBe(true);
      expect(result.payload?.type).toBe(REPORT_TYPE.LIST_OF_ALARMS);
      expect(result.payload?.locationIds).toEqual(['loc-wing-a']);
      expect(result.summary).toContain('Wing A');
    });
  });

  describe('the safety property: never invent filters', (): void => {
    it('asks rather than generating when the location does not exist', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: {
          reportDescription: 'all alarms',
          locationText: 'Wing Z',
          dateRangeText: 'yesterday',
        },
      });

      expect(result.isComplete).toBe(false);
      expect(result.payload).toBeNull();
      expect(
        result.gaps.some(
          (gap): boolean => gap.issue === REPORT_SLOT_ISSUE.UNRESOLVED_LOCATION,
        ),
      ).toBe(true);
    });

    it('offers real candidates when a name does not match', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: {
          reportDescription: 'all alarms',
          locationText: 'Wing',
          dateRangeText: 'yesterday',
        },
      });

      const gap = result.gaps.find(
        (entry): boolean =>
          entry.issue === REPORT_SLOT_ISSUE.UNRESOLVED_LOCATION,
      );

      expect(gap?.candidates?.length).toBeGreaterThan(0);
      // Every candidate must be a genuine site location.
      for (const candidate of gap?.candidates ?? []) {
        expect(
          LOOKUPS.locations.some(
            (location): boolean => location.id === candidate.id,
          ),
        ).toBe(true);
      }
    });

    it('does not silently drop a filter when lookups are unavailable', async (): Promise<void> => {
      const emptyService = buildService({
        locations: [],
        clients: [],
        alarmTypes: [],
        shifts: [],
      });

      const result = await emptyService.resolve({
        siteId,
        timezone,
        slots: {
          reportDescription: 'all alarms',
          locationText: 'Wing A',
          dateRangeText: 'yesterday',
        },
      });

      // Dropping the location would widen the report to the whole site.
      expect(result.isComplete).toBe(false);
    });
  });

  describe('missing information', (): void => {
    it('asks for the period when no date is given', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: { reportDescription: 'all alarms' },
      });

      expect(result.isComplete).toBe(false);
      expect(
        result.gaps.some(
          (gap): boolean => gap.issue === REPORT_SLOT_ISSUE.MISSING_DATE_RANGE,
        ),
      ).toBe(true);
    });

    it('asks which report when the description is vague', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: { reportDescription: 'some data', dateRangeText: 'yesterday' },
      });

      const gap = result.gaps.find(
        (entry): boolean =>
          entry.issue === REPORT_SLOT_ISSUE.MISSING_REPORT_TYPE,
      );

      expect(gap).toBeDefined();
      // Offered as a searchable catalogue, not a button per report — the list
      // is expected to outgrow what a chat bubble can display.
      expect(gap?.picker?.endpoint).toBe('/chatbot-report/types');
      expect(gap?.candidates).toBeUndefined();
    });

    it('asks for the dates when the phrase cannot be parsed', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: {
          reportDescription: 'all alarms',
          dateRangeText: 'sometime around the holidays',
        },
      });

      expect(
        result.gaps.some(
          (gap): boolean =>
            gap.issue === REPORT_SLOT_ISSUE.UNRESOLVED_DATE_RANGE,
        ),
      ).toBe(true);
    });

    it('asks for a threshold when Excessive Response has no duration', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: {
          reportDescription: 'excessive response times',
          dateRangeText: 'yesterday',
        },
      });

      expect(
        result.gaps.some(
          (gap): boolean => gap.issue === REPORT_SLOT_ISSUE.MISSING_THRESHOLD,
        ),
      ).toBe(true);
    });

    it('collects several gaps in one pass', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: { locationText: 'Wing Q' },
      });

      // Asking everything at once beats one question per turn.
      expect(result.gaps.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('conditional field requirements', (): void => {
    it('supplies both targets for a Summary report', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: {
          reportDescription: 'a summary',
          dateRangeText: 'last week',
        },
      });

      expect(result.isComplete).toBe(true);
      expect(result.payload?.targetASeconds).toBeGreaterThanOrEqual(60);
      expect(result.payload?.targetBSeconds).toBeGreaterThan(
        result.payload!.targetASeconds!,
      );
    });

    it('rejects targets that are the wrong way round', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: { reportDescription: 'a summary', dateRangeText: 'last week' },
        overrides: { targetASeconds: 600, targetBSeconds: 300 },
      });

      expect(result.isComplete).toBe(false);
      expect(
        result.gaps.some(
          (gap): boolean =>
            gap.issue === REPORT_SLOT_ISSUE.MISSING_SUMMARY_TARGETS,
        ),
      ).toBe(true);
    });

    it('rejects a threshold below the API minimum', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: {
          reportDescription: 'excessive response',
          durationText: '30 seconds',
          dateRangeText: 'yesterday',
        },
      });

      expect(result.isComplete).toBe(false);
      expect(
        result.gaps.some(
          (gap): boolean => gap.issue === REPORT_SLOT_ISSUE.MISSING_THRESHOLD,
        ),
      ).toBe(true);
    });

    it('omits conditional fields for types that do not need them', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: {
          reportDescription: 'low battery',
          dateRangeText: 'yesterday',
        },
      });

      expect(result.payload?.thresholdSeconds).toBeUndefined();
      expect(result.payload?.targetASeconds).toBeUndefined();
    });
  });

  describe('overrides from clarifying turns', (): void => {
    it('applies a user-chosen report type', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: { reportDescription: 'some data', dateRangeText: 'yesterday' },
        overrides: { type: REPORT_TYPE.LOW_BATTERY },
      });

      expect(result.isComplete).toBe(true);
      expect(result.payload?.type).toBe(REPORT_TYPE.LOW_BATTERY);
    });

    it('applies a user-chosen location id', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: {
          reportDescription: 'all alarms',
          locationText: 'Wing',
          dateRangeText: 'yesterday',
        },
        overrides: { locationIds: ['loc-wing-b'] },
      });

      expect(result.isComplete).toBe(true);
      expect(result.payload?.locationIds).toEqual(['loc-wing-b']);
    });
  });

  describe('payload shape', (): void => {
    it('produces ISO dates and the caller timezone', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone: 'Australia/Sydney',
        slots: { reportDescription: 'all alarms', dateRangeText: 'yesterday' },
      });

      expect(result.payload?.startDate).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(result.payload?.timezone).toBe('Australia/Sydney');
    });

    it('keeps the report name within the API limit', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: { reportDescription: 'all alarms', dateRangeText: 'yesterday' },
      });

      expect(result.payload!.name.length).toBeLessThanOrEqual(100);
    });

    it('summarises the request in plain language', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: {
          reportDescription: 'alarms raised',
          locationText: 'Wing A',
          alarmTypeText: 'Fall Alarm',
          dateRangeText: 'yesterday',
        },
      });

      expect(result.summary).toContain('Wing A');
      expect(result.summary).toContain('Fall Alarm');
    });

    it('never returns both a payload and gaps', async (): Promise<void> => {
      const complete = await service.resolve({
        siteId,
        timezone,
        slots: { reportDescription: 'all alarms', dateRangeText: 'yesterday' },
      });
      const incomplete = await service.resolve({
        siteId,
        timezone,
        slots: {},
      });

      expect(complete.payload).not.toBeNull();
      expect(complete.gaps).toHaveLength(0);
      expect(incomplete.payload).toBeNull();
      expect(incomplete.gaps.length).toBeGreaterThan(0);
    });
  });

  describe('QA screenshot: a second report request in the same chat', (): void => {
    // The first report ("yesterday", typed on its own in answer to the picker)
    // worked; the follow-up, typed as a whole sentence, went unanswered because
    // the date phrase only matched when it WAS the whole message.
    it('resolves "please provide me the report of today"', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        slots: {
          reportDescription: 'please provide me the report of today',
          dateRangeText: 'please provide me the report of today',
        },
        timezone,
      });

      expect(
        result.gaps.find((gap): boolean => gap.issue.includes('date')),
      ).toBeUndefined();
    });

    it('still asks when the message names no period at all', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        slots: { reportDescription: 'give provide' },
        timezone,
      });

      // "give provide" carries no date — asking is correct here.
      expect(result.isComplete).toBe(false);
      expect(result.gaps.length).toBeGreaterThan(0);
    });
  });

  describe('QA screenshot: a transposed date word', (): void => {
    // "please generate the report of todya" came back as "Care Minutes Report
    // for 2026-08-15 to 2026-08-18" — a multi-day window for a request that
    // named a single day. The date word never survived typo correction, so the
    // range the user asked for was silently replaced rather than queried.
    it('resolves "todya" to a single day rather than a default window', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        timezone,
        slots: {
          reportDescription: 'please generate the report of todya',
          dateRangeText: 'please generate the report of todya',
        },
      });

      expect(
        result.gaps.find((gap): boolean => gap.issue.includes('date')),
      ).toBeUndefined();
      // Start and end must fall on the same calendar day.
      expect(result.payload?.startDate.slice(0, 10)).toBe(
        result.payload?.endDate.slice(0, 10),
      );
    });
  });

  describe('QA screenshot: the report subject is not a filter', (): void => {
    // "I need information regarding the alsrm" put the misspelt SUBJECT into
    // alarmTypeText. The resolver then hunted for an alarm type by that name
    // and the follow-up request died on a filter the user never asked for.
    it('ignores a misspelt subject word in the alarm-type slot', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        slots: { alarmTypeText: 'alsrm', dateRangeText: 'last week' },
        timezone,
      });

      expect(
        result.gaps.find((gap): boolean => gap.issue.includes('alarm')),
      ).toBeUndefined();
      expect(result.payload?.alarmTypeIds ?? []).toHaveLength(0);
    });

    it.each(['alarm', 'alarms', 'Alarms', 'alarm types'])(
      'ignores "%s" as an alarm-type filter',
      async (word): Promise<void> => {
        const result = await service.resolve({
          siteId,
          slots: { alarmTypeText: word, dateRangeText: 'last week' },
          timezone,
        });

        expect(
          result.gaps.find((gap): boolean => gap.issue.includes('alarm')),
        ).toBeUndefined();
      },
    );

    it('still honours a REAL alarm type', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        slots: {
          reportDescription: 'all alarms',
          alarmTypeText: 'Fall Alarm',
          dateRangeText: 'last week',
        },
        timezone,
      });

      expect(result.payload?.alarmTypeIds).toEqual(['at-fall']);
    });

    it('still reports a genuinely unknown alarm type', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        slots: { alarmTypeText: 'Trapdoor Alarm', dateRangeText: 'last week' },
        timezone,
      });

      expect(
        result.gaps.find((gap): boolean => gap.issue.includes('alarm')),
      ).toBeDefined();
    });

    it('applies the same rule to location and shift', async (): Promise<void> => {
      const result = await service.resolve({
        siteId,
        slots: {
          locationText: 'location',
          shiftText: 'shifts',
          dateRangeText: 'last week',
        },
        timezone,
      });

      expect(
        result.gaps.find(
          (gap): boolean =>
            gap.issue.includes('location') || gap.issue.includes('shift'),
        ),
      ).toBeUndefined();
    });
  });
});
