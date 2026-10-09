import { Injectable } from '@nestjs/common';
import { ReportDateResolverService } from '@/chatbotReport/reportDateResolverService';
import { ReportEntityMatcherService } from '@/chatbotReport/reportEntityMatcherService';
import { ReportLookupService } from '@/chatbotReport/reportLookupService';
import { ReportTypeMapperService } from '@/chatbotReport/reportTypeMapperService';
import {
  REPORT_SLOT_ISSUE,
  reportTypeRequiresSummaryTargets,
  reportTypeRequiresThreshold,
  type IEntityMatch,
  type IReportLookupOption,
  type IReportLookups,
  type IReportPayload,
  type IReportResolution,
  type IReportSlotGap,
  type ReportType,
} from '@/types/chatbotReport';
import type { IReportIntentSlots } from '@/types/chatbotIntent';

/** Everything needed to ground a report request. */
export interface IResolveReportInput {
  slots: IReportIntentSlots;
  siteId: string;
  /** IANA timezone of the user, used for relative date resolution. */
  timezone: string;
  /** Values the user supplied in follow-up turns, e.g. after a clarification. */
  overrides?: IReportOverrides;
}

/** Answers gathered across clarifying turns, applied over the extracted slots. */
export interface IReportOverrides {
  type?: ReportType;
  locationIds?: string[];
  alarmTypeIds?: string[];
  shiftIds?: string[];
  clientIds?: string[];
  startDate?: string;
  endDate?: string;
  thresholdSeconds?: number;
  targetASeconds?: number;
  targetBSeconds?: number;
}

/**
 * Turns the classifier's raw slots into a validated report payload.
 *
 * The contract is deliberately strict: either the request is fully resolved
 * against real site data and `payload` is safe to submit, or `gaps` explains
 * exactly what to ask next. It never fills a blank with a plausible default,
 * because a wrong-but-successful report is far worse than one extra question.
 */
@Injectable()
export class ReportResolverService {
  /**
   * Fallback targets for Summary reports, in seconds.
   *
   * Unlike filters, these are presentation bands rather than data selection —
   * they change how results are bucketed, not which records are included. The
   * confirmation message states them so the user can override.
   */
  private static readonly DEFAULT_TARGET_A_SECONDS = 300;
  private static readonly DEFAULT_TARGET_B_SECONDS = 600;

  /** The report API rejects anything under 60 seconds. */
  private static readonly MIN_SECONDS = 60;

  constructor(
    private readonly lookupService: ReportLookupService,
    private readonly entityMatcher: ReportEntityMatcherService,
    private readonly dateResolver: ReportDateResolverService,
    private readonly typeMapper: ReportTypeMapperService,
  ) {}

  /**
   * Resolve a natural-language report request into a submittable payload.
   *
   * @returns A resolution that is either complete, or carries the questions
   *          needed to complete it.
   */
  async resolve(input: IResolveReportInput): Promise<IReportResolution> {
    const { slots, siteId, timezone, overrides = {} } = input;
    const gaps: IReportSlotGap[] = [];

    const lookups = await this.lookupService.getLookups(siteId);

    const type = this.resolveType(slots, overrides, gaps);
    const dateRange = this.resolveDateRange(slots, overrides, timezone, gaps);

    const locationIds = this.resolveEntity(
      slots.locationText,
      overrides.locationIds,
      lookups.locations,
      REPORT_SLOT_ISSUE.UNRESOLVED_LOCATION,
      'location',
      gaps,
    );

    const alarmTypeIds = this.resolveEntity(
      slots.alarmTypeText,
      overrides.alarmTypeIds,
      lookups.alarmTypes,
      REPORT_SLOT_ISSUE.UNRESOLVED_ALARM_TYPE,
      'alarm type',
      gaps,
    );

    const shiftIds = this.resolveEntity(
      slots.shiftText,
      overrides.shiftIds,
      lookups.shifts,
      REPORT_SLOT_ISSUE.UNRESOLVED_SHIFT,
      'shift',
      gaps,
    );

    // Conditional numeric fields depend on the resolved type, so they can only
    // be checked once the type is known.
    const conditionals = type
      ? this.resolveConditionalFields(type, slots, overrides, gaps)
      : {};

    if (gaps.length > 0 || !type || !dateRange) {
      return { isComplete: false, payload: null, gaps, summary: null };
    }

    const payload: IReportPayload = {
      siteId,
      name: this.buildReportName(type, dateRange.description),
      type,
      fileFormat: this.typeMapper.mapFileFormat(slots.fileFormatText ?? ''),
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      timezone,
      ...conditionals,
    };

    if (locationIds.length > 0) payload.locationIds = locationIds;
    if (alarmTypeIds.length > 0) payload.alarmTypeIds = alarmTypeIds;
    if (shiftIds.length > 0) payload.shiftIds = shiftIds;
    if (overrides.clientIds?.length) payload.clientIds = overrides.clientIds;

    return {
      isComplete: true,
      payload,
      gaps: [],
      summary: this.buildSummary(payload, dateRange.description, lookups),
    };
  }

  /** Determine the report type, recording a gap when it cannot be inferred. */
  private resolveType(
    slots: IReportIntentSlots,
    overrides: IReportOverrides,
    gaps: IReportSlotGap[],
  ): ReportType | null {
    if (overrides.type) return overrides.type;

    // The duration phrase is part of the intent ("calls longer than 5 minutes"
    // implies an Excessive Response report), so it is considered alongside the
    // description rather than after it.
    const description = [slots.reportDescription, slots.durationText]
      .filter(Boolean)
      .join(' ');

    const type = this.typeMapper.mapType(description);

    if (!type) {
      // Offered as a searchable picker rather than a button per report: the
      // catalogue is expected to grow well past what a chat bubble can list.
      gaps.push({
        issue: REPORT_SLOT_ISSUE.MISSING_REPORT_TYPE,
        question: 'Which report would you like?',
        picker: {
          endpoint: '/chatbot-report/types',
          searchPlaceholder: 'Search reports...',
        },
      });
      return null;
    }

    return type;
  }

  /** Resolve the reporting window, recording a gap when absent or unparseable. */
  private resolveDateRange(
    slots: IReportIntentSlots,
    overrides: IReportOverrides,
    timezone: string,
    gaps: IReportSlotGap[],
  ): { startDate: string; endDate: string; description: string } | null {
    if (overrides.startDate && overrides.endDate) {
      return {
        startDate: overrides.startDate,
        endDate: overrides.endDate,
        description: 'the period you selected',
      };
    }

    const text = slots.dateRangeText?.trim();

    if (!text) {
      gaps.push({
        issue: REPORT_SLOT_ISSUE.MISSING_DATE_RANGE,
        question:
          'What time period should the report cover? For example: yesterday, last week, or the last 30 days.',
      });
      return null;
    }

    const resolved = this.dateResolver.resolve(text, timezone);

    if (!resolved) {
      gaps.push({
        issue: REPORT_SLOT_ISSUE.UNRESOLVED_DATE_RANGE,
        question: `I couldn't work out the dates for "${text}". Could you give a period like "last week", "the last 30 days", or a date range such as 2026-07-01 to 2026-07-31?`,
      });
      return null;
    }

    return resolved;
  }

  /**
   * Words that name what a report is ABOUT rather than narrowing it.
   *
   * Keyed by the filter they are wrongly assigned to. Typos are covered by the
   * same fuzzy comparison the entity matcher uses, so "alsrm" is caught too.
   */
  private static readonly SUBJECT_WORDS: Record<string, string[]> = {
    'alarm type': [
      'alarm',
      'alarms',
      'alarm type',
      'alarm types',
      'all alarms',
    ],
    location: ['location', 'locations', 'site', 'sites'],
    shift: ['shift', 'shifts'],
  };

  /** True when `text` names the report's subject instead of a filter value. */
  private static isReportSubject(text: string, label: string): boolean {
    const candidates = ReportResolverService.SUBJECT_WORDS[label] ?? [];
    const normalised = text.trim().toLowerCase();

    return candidates.some((word): boolean => {
      if (word === normalised) return true;

      // Tolerate a single typo ("alsrm" for "alarm"), which is how these reach
      // us in the first place — a misspelt subject the classifier could not
      // recognise as the subject.
      if (Math.abs(word.length - normalised.length) > 1) return false;
      return ReportResolverService.isOneEditApart(word, normalised);
    });
  }

  /** True when two strings are within one insert, delete or substitution. */
  private static isOneEditApart(a: string, b: string): boolean {
    if (a === b) return true;

    const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
    if (longer.length - shorter.length > 1) return false;

    let i = 0;
    let j = 0;
    let edits = 0;

    while (i < shorter.length && j < longer.length) {
      if (shorter[i] === longer[j]) {
        i += 1;
        j += 1;
        continue;
      }

      edits += 1;
      if (edits > 1) return false;

      // Same length means a substitution; otherwise skip the extra character.
      if (shorter.length === longer.length) i += 1;
      j += 1;
    }

    return edits + (longer.length - j) + (shorter.length - i) <= 1;
  }

  /**
   * Match one piece of entity text against a lookup list.
   *
   * Returns ids only for confident matches; an unmatched or ambiguous name
   * becomes a gap so the user picks from real options.
   */
  private resolveEntity(
    text: string | undefined,
    overrideIds: string[] | undefined,
    options: IReportLookupOption[],
    issue: IReportSlotGap['issue'],
    label: string,
    gaps: IReportSlotGap[],
  ): string[] {
    if (overrideIds?.length) return overrideIds;

    const trimmed = text?.trim();
    if (!trimmed) return [];

    // The subject of the report is not a filter. A classifier that puts
    // "alarms" (or a typo of it) into alarmTypeText sends us looking for an
    // alarm type by that name, and the whole request then fails on a filter
    // the user never asked for. Treat these as "no filter given".
    if (ReportResolverService.isReportSubject(trimmed, label)) return [];

    // No lookup data available (unconfigured or unreachable): treat the filter
    // as unresolvable rather than dropping it, which would silently widen the
    // report beyond what the user asked for.
    if (options.length === 0) {
      gaps.push({
        issue,
        question: `I couldn't look up the ${label} "${trimmed}" right now. Could you try again in a moment?`,
      });
      return [];
    }

    const match: IEntityMatch = this.entityMatcher.match(trimmed, options);

    if (match.matched) {
      return [match.matched.id];
    }

    gaps.push({
      issue,
      question:
        match.candidates.length > 0
          ? `I couldn't find a ${label} called "${trimmed}". Did you mean one of these?`
          : `I couldn't find a ${label} called "${trimmed}" on this site. Could you check the name?`,
      candidates: match.candidates,
    });

    return [];
  }

  /**
   * Fill the numeric fields that specific report types require.
   *
   * The report API rejects Excessive Response without a threshold and Summary
   * without both targets, so these are resolved up front rather than letting a
   * 400 surface as an unexplained failure mid-conversation.
   */
  private resolveConditionalFields(
    type: ReportType,
    slots: IReportIntentSlots,
    overrides: IReportOverrides,
    gaps: IReportSlotGap[],
  ): Partial<IReportPayload> {
    const fields: Partial<IReportPayload> = {};

    if (reportTypeRequiresThreshold(type)) {
      const threshold =
        overrides.thresholdSeconds ??
        this.typeMapper.parseDurationSeconds(slots.durationText ?? '') ??
        null;

      if (threshold === null) {
        gaps.push({
          issue: REPORT_SLOT_ISSUE.MISSING_THRESHOLD,
          question:
            'What response time should count as excessive? For example: longer than 5 minutes.',
        });
      } else if (threshold < ReportResolverService.MIN_SECONDS) {
        gaps.push({
          issue: REPORT_SLOT_ISSUE.MISSING_THRESHOLD,
          question:
            'The threshold needs to be at least 1 minute. What should it be?',
        });
      } else {
        fields.thresholdSeconds = threshold;
      }
    }

    if (reportTypeRequiresSummaryTargets(type)) {
      const targetA =
        overrides.targetASeconds ??
        ReportResolverService.DEFAULT_TARGET_A_SECONDS;
      const targetB =
        overrides.targetBSeconds ??
        ReportResolverService.DEFAULT_TARGET_B_SECONDS;

      if (
        targetA < ReportResolverService.MIN_SECONDS ||
        targetB < ReportResolverService.MIN_SECONDS
      ) {
        gaps.push({
          issue: REPORT_SLOT_ISSUE.MISSING_SUMMARY_TARGETS,
          question:
            'Both response targets need to be at least 1 minute. What should they be?',
        });
      } else if (targetB <= targetA) {
        gaps.push({
          issue: REPORT_SLOT_ISSUE.MISSING_SUMMARY_TARGETS,
          question:
            'The second response target needs to be longer than the first. What should they be?',
        });
      } else {
        fields.targetASeconds = targetA;
        fields.targetBSeconds = targetB;
      }
    }

    return fields;
  }

  /** Report name shown in the dashboard and used for the download filename. */
  private buildReportName(type: ReportType, periodDescription: string): string {
    const label = this.typeMapper.getLabel(type);
    return `${label} - ${periodDescription}`.slice(0, 100);
  }

  /**
   * One-sentence read-back of what will be generated.
   *
   * Shown before anything runs so a misread filter is caught by the user rather
   * than discovered in the output.
   */
  private buildSummary(
    payload: IReportPayload,
    periodDescription: string,
    lookups: IReportLookups,
  ): string {
    const parts: string[] = [
      `${this.typeMapper.getLabel(payload.type)} for ${periodDescription}`,
    ];

    const named = (ids: string[] | undefined, from: IReportLookupOption[]) =>
      (ids ?? [])
        .map(
          (id): string =>
            from.find((option): boolean => option.id === id)?.label ?? '',
        )
        .filter(Boolean);

    const locations = named(payload.locationIds, lookups.locations);
    if (locations.length > 0) parts.push(`at ${locations.join(', ')}`);

    const alarmTypes = named(payload.alarmTypeIds, lookups.alarmTypes);
    if (alarmTypes.length > 0) parts.push(`for ${alarmTypes.join(', ')}`);

    const shifts = named(payload.shiftIds, lookups.shifts);
    if (shifts.length > 0) parts.push(`on ${shifts.join(', ')}`);

    if (payload.thresholdSeconds) {
      parts.push(
        `where response took longer than ${this.describeSeconds(payload.thresholdSeconds)}`,
      );
    }

    return parts.join(' ');
  }

  /** Render seconds as a short human phrase for confirmation messages. */
  private describeSeconds(seconds: number): string {
    if (seconds % 3600 === 0) {
      const hours = seconds / 3600;
      return `${hours} hour${hours === 1 ? '' : 's'}`;
    }

    if (seconds % 60 === 0) {
      const minutes = seconds / 60;
      return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }

    return `${seconds} seconds`;
  }
}
