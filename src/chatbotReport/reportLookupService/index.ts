import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IReportLookupOption,
  IReportLookups,
} from '@/types/chatbotReport';

/** One cached lookup set with its expiry. */
interface ICacheEntry {
  lookups: IReportLookups;
  expiresAt: number;
}

/** Raw row shapes returned by the smartcaller lookup endpoints. */
interface IRawLocation {
  id?: unknown;
  name?: unknown;
}

interface IRawClient {
  id?: unknown;
  clientName?: unknown;
  displayName?: unknown;
}

interface IRawAlarmType {
  id?: unknown;
  name?: unknown;
}

interface IRawShift {
  id?: unknown;
  name?: unknown;
}

/**
 * Fetches the selectable entities for a site from the smartcaller backend.
 *
 * These lists are what ground the user's words: the chatbot can only offer or
 * accept a location that actually exists here. Results are cached briefly
 * because a conversation typically resolves several slots in quick succession
 * and the underlying data changes rarely.
 *
 * Every failure mode returns empty lists rather than throwing — an unreachable
 * lookup service degrades into "I couldn't find that location, could you pick
 * one?" instead of a broken chat.
 */
@Injectable()
export class ReportLookupService {
  private readonly logger = new Logger(ReportLookupService.name);
  private readonly cache = new Map<string, ICacheEntry>();
  private readonly baseUrl: string;

  /** Lookup data is near-static; a short TTL keeps a conversation consistent. */
  private static readonly CACHE_TTL_MS = 60_000;

  private static readonly REQUEST_TIMEOUT_MS = 5_000;

  /** Bound on cached sites so the map cannot grow without limit. */
  private static readonly MAX_CACHED_SITES = 100;

  constructor(private readonly configService: ConfigService) {
    const configured = this.configService.get<string>(
      'SMARTCALLER_REPORTS_BASE_URL',
    );

    if (!configured) {
      this.logger.warn(
        'SMARTCALLER_REPORTS_BASE_URL is not configured. Report entity lookups will return empty lists.',
      );
    }

    this.baseUrl = (configured ?? '').replace(/\/+$/, '');
  }

  /**
   * Fetch all lookup lists for a site.
   * Never throws; unavailable lists come back empty.
   */
  async getLookups(siteId: string): Promise<IReportLookups> {
    const cached = this.cache.get(siteId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.lookups;
    }

    if (!this.baseUrl) {
      return this.emptyLookups();
    }

    const [locations, clients, alarmTypes, shifts] = await Promise.all([
      this.fetchList<IRawLocation>('locations', siteId),
      this.fetchList<IRawClient>('clients', siteId),
      this.fetchList<IRawAlarmType>('alarm-types', siteId),
      this.fetchList<IRawShift>('shifts', siteId),
    ]);

    const lookups: IReportLookups = {
      locations: this.toOptions(locations, (row): string =>
        this.asString(row.name),
      ),
      clients: this.toOptions(clients, (row): string => {
        const display = this.asString(row.displayName);
        return display || this.asString(row.clientName);
      }),
      alarmTypes: this.toOptions(alarmTypes, (row): string =>
        this.asString(row.name),
      ),
      shifts: this.toOptions(shifts, (row): string => this.asString(row.name)),
    };

    this.storeInCache(siteId, lookups);

    return lookups;
  }

  /** Drop a site's cached lookups, e.g. after the user reports a stale list. */
  invalidate(siteId: string): void {
    this.cache.delete(siteId);
  }

  /**
   * GET one lookup list.
   *
   * The smartcaller endpoints wrap payloads in `{ data: [...] }`; both wrapped
   * and bare arrays are accepted so a response-shape change does not break the
   * chatbot silently.
   */
  private async fetchList<T>(resource: string, siteId: string): Promise<T[]> {
    const url = `${this.baseUrl}/reports/chatbot/${resource}?siteId=${encodeURIComponent(siteId)}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(ReportLookupService.REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(
          `Lookup ${resource} for site ${siteId} returned ${response.status}.`,
        );
        return [];
      }

      const payload: unknown = await response.json();

      if (Array.isArray(payload)) {
        return payload as T[];
      }

      const data = (payload as { data?: unknown } | null)?.data;
      return Array.isArray(data) ? (data as T[]) : [];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Lookup ${resource} for site ${siteId} failed: ${message}`,
      );
      return [];
    }
  }

  /** Map raw rows to {id,label}, dropping any row missing either. */
  private toOptions<T extends { id?: unknown }>(
    rows: T[],
    toLabel: (row: T) => string,
  ): IReportLookupOption[] {
    const options: IReportLookupOption[] = [];

    for (const row of rows) {
      const id = this.asString(row.id);
      const label = toLabel(row);

      if (id && label) {
        options.push({ id, label });
      }
    }

    return options;
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private storeInCache(siteId: string, lookups: IReportLookups): void {
    if (this.cache.size >= ReportLookupService.MAX_CACHED_SITES) {
      this.evictExpired();

      if (this.cache.size >= ReportLookupService.MAX_CACHED_SITES) {
        // Still full: drop the oldest insertion. Map preserves insertion order.
        const oldest: IteratorResult<string> = this.cache.keys().next();
        if (!oldest.done) {
          this.cache.delete(oldest.value);
        }
      }
    }

    this.cache.set(siteId, {
      lookups,
      expiresAt: Date.now() + ReportLookupService.CACHE_TTL_MS,
    });
  }

  private evictExpired(): void {
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  private emptyLookups(): IReportLookups {
    return { locations: [], clients: [], alarmTypes: [], shifts: [] };
  }
}
