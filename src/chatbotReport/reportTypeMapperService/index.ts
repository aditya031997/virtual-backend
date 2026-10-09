import { Injectable } from '@nestjs/common';
import {
  REPORT_FILE_FORMAT,
  REPORT_TYPE,
  REPORT_TYPE_LABELS,
  type ReportFileFormat,
  type ReportType,
} from '@/types/chatbotReport';

/** A phrase pattern that indicates a particular report type. */
interface ITypeRule {
  type: ReportType;
  patterns: readonly RegExp[];
  /** Higher wins when several rules match the same text. */
  weight: number;
}

/**
 * Maps a natural-language description to a Smart-Caller report type and output
 * format.
 *
 * Rule-based on purpose. The nine report types are a fixed, known vocabulary,
 * and picking the wrong one produces a confident-looking report answering the
 * wrong question — the worst failure mode for this feature. Explicit rules are
 * auditable and testable in a way a model's judgement is not.
 *
 * When nothing matches, the caller asks the user which report they want rather
 * than defaulting to one.
 */
@Injectable()
export class ReportTypeMapperService {
  /**
   * Ordered by specificity: a phrase mentioning both "response time" and
   * "shift" must win over the generic response-time rule, so it carries a
   * higher weight.
   */
  private static readonly TYPE_RULES: readonly ITypeRule[] = [
    {
      type: REPORT_TYPE.RESPONSE_TIME_BY_SHIFT,
      patterns: [
        /\bresponse\s+times?\b.*\bshift/,
        /\bshift\b.*\bresponse\s+times?\b/,
        /\bby\s+shift\b/,
      ],
      weight: 10,
    },
    {
      type: REPORT_TYPE.EXCESSIVE_RESPONSE,
      patterns: [
        /\bexcessive\b/,
        /\b(longer|more|greater)\s+than\b/,
        /\bover\s+\d+\s*(min|minute|sec|second|hour)/,
        /\bexceed(ing|ed)?\b/,
        /\bslow\s+response/,
        /\bbreach(es|ed)?\b/,
      ],
      weight: 9,
    },
    {
      type: REPORT_TYPE.LOW_BATTERY,
      patterns: [/\blow\s+batter/, /\bbatter(y|ies)\b/],
      weight: 9,
    },
    {
      type: REPORT_TYPE.CARE_MINUTES,
      patterns: [/\bcare\s+min/, /\bcare\s+time\b/, /\btime\s+spent\b/],
      weight: 9,
    },
    {
      type: REPORT_TYPE.ALARMS_BY_TYPE,
      patterns: [
        /\balarms?\b.*\bby\s+type\b/,
        /\bby\s+alarm\s+type\b/,
        /\bgrouped?\s+by\s+type\b/,
        /\bbreakdown\b.*\btype\b/,
      ],
      weight: 8,
    },
    {
      type: REPORT_TYPE.ALARMS_BY_ID,
      patterns: [
        /\balarms?\b.*\bby\s+id\b/,
        /\bby\s+alarm\s+id\b/,
        /\bby\s+(resident|client|patient)\b/,
      ],
      weight: 8,
    },
    {
      type: REPORT_TYPE.SUMMARY,
      patterns: [/\bsummary\b/, /\boverview\b/, /\bhigh[-\s]?level\b/],
      weight: 7,
    },
    {
      type: REPORT_TYPE.DETAILED_EVENT,
      patterns: [
        /\bdetailed\b/,
        /\bhistory\b/,
        /\bevents?\b/,
        /\bfull\s+(log|record)/,
      ],
      weight: 6,
    },
    {
      type: REPORT_TYPE.LIST_OF_ALARMS,
      patterns: [
        /\blist\s+of\s+alarms?\b/,
        /\ball\s+alarms?\b/,
        /\balarms?\s+raised\b/,
        /\bshow\s+me\b.*\balarms?\b/,
        /\balarms?\b/,
      ],
      weight: 3,
    },
    {
      type: REPORT_TYPE.DETAILED_EVENT,
      patterns: [/\bcalls?\b/],
      weight: 2,
    },
  ];

  private static readonly FORMAT_RULES: readonly {
    format: ReportFileFormat;
    pattern: RegExp;
  }[] = [
    { format: REPORT_FILE_FORMAT.PDF, pattern: /\bpdf\b/ },
    {
      format: REPORT_FILE_FORMAT.EXCEL,
      pattern: /\b(excel|xlsx?|spreadsheet)\b/,
    },
    { format: REPORT_FILE_FORMAT.CSV, pattern: /\bcsv\b/ },
  ];

  /**
   * Infer the report type from a description.
   * @returns The type, or null when the description is too vague to classify.
   */
  mapType(description: string): ReportType | null {
    const normalised = description.trim().toLowerCase();
    if (!normalised) return null;

    let best: { type: ReportType; weight: number } | null = null;

    for (const rule of ReportTypeMapperService.TYPE_RULES) {
      const matches = rule.patterns.some((pattern): boolean =>
        pattern.test(normalised),
      );

      if (matches && (!best || rule.weight > best.weight)) {
        best = { type: rule.type, weight: rule.weight };
      }
    }

    return best?.type ?? null;
  }

  /**
   * Infer the output format from the user's words.
   * Defaults to PDF, the format the on-site team shares most often.
   */
  mapFileFormat(text: string): ReportFileFormat {
    const normalised = text.trim().toLowerCase();

    for (const rule of ReportTypeMapperService.FORMAT_RULES) {
      if (rule.pattern.test(normalised)) {
        return rule.format;
      }
    }

    return REPORT_FILE_FORMAT.PDF;
  }

  /**
   * Parse a duration phrase into whole seconds.
   *
   * Backs both the threshold on Excessive Response reports and the client's
   * "calls longer than 5 minutes" example.
   *
   * @returns Seconds, or null when no duration is present.
   */
  parseDurationSeconds(text: string): number | null {
    const normalised = text.trim().toLowerCase();
    if (!normalised) return null;

    const match =
      /(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b/.exec(
        normalised,
      );
    if (!match) return null;

    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const unit = match[2];
    const multiplier = unit.startsWith('h')
      ? 3600
      : unit.startsWith('m') && !unit.startsWith('ms')
        ? 60
        : 1;

    const seconds = Math.round(amount * multiplier);
    return seconds > 0 ? seconds : null;
  }

  /** Human-readable label for a report type, used in confirmations. */
  getLabel(type: ReportType): string {
    return REPORT_TYPE_LABELS[type];
  }

  /** All types with labels, for asking the user to choose. */
  listTypes(): { type: ReportType; label: string }[] {
    return Object.values(REPORT_TYPE).map(
      (type): { type: ReportType; label: string } => ({
        type,
        label: REPORT_TYPE_LABELS[type],
      }),
    );
  }

  /**
   * Search report types, one page at a time.
   *
   * The set is small today, but the widget renders it in a searchable dropdown
   * rather than a wall of buttons so the same call still works when the catalogue
   * grows. Paginating from the start means the client never has to change when
   * these move from an enum to database rows.
   *
   * @param search Free text matched against the label; empty returns everything.
   * @param page   1-based page number.
   * @param limit  Page size, clamped to a sane maximum.
   */
  searchTypes(
    search: string,
    page: number,
    limit: number,
  ): {
    items: { id: string; name: string }[];
    total: number;
    hasMore: boolean;
  } {
    const query = search.trim().toLowerCase();

    const matched = this.listTypes().filter((entry): boolean =>
      query ? entry.label.toLowerCase().includes(query) : true,
    );

    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safeLimit =
      Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 50;

    const start = (safePage - 1) * safeLimit;
    const items = matched
      .slice(start, start + safeLimit)
      .map((entry): { id: string; name: string } => ({
        id: String(entry.type),
        name: entry.label,
      }));

    return {
      items,
      total: matched.length,
      hasMore: start + items.length < matched.length,
    };
  }
}
