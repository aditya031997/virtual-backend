import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Resolves a site id to its display name for Chat History.
 *
 * The id stored on a chatbot session is a cuid belonging to the smartcaller
 * service — it is not a row in this database's `sites` table, so it cannot be
 * joined. (Trying to join the two is what made the admin query fail outright
 * with "operator does not exist: uuid = character varying", emptying the page.)
 *
 * Reads through a public, name-only endpoint. Never throws: a name is a label,
 * and a chat that cannot be listed is far worse than one listed without its
 * site.
 */
@Injectable()
export class SiteNameService {
  private readonly logger = new Logger(SiteNameService.name);

  private readonly baseUrl: string;

  /** Names change rarely, and Chat History asks for the same handful. */
  private readonly cache = new Map<
    string,
    { name: string | null; expiresAt: number }
  >();

  private static readonly CACHE_TTL_MS = 5 * 60_000;

  private static readonly REQUEST_TIMEOUT_MS = 3_000;

  /** Bound on the cache so it cannot grow without limit. */
  private static readonly MAX_CACHED = 200;

  constructor(private readonly configService: ConfigService) {
    const configured = this.configService.get<string>(
      'SMARTCALLER_REPORTS_BASE_URL',
    );

    if (!configured) {
      this.logger.warn(
        'SMARTCALLER_REPORTS_BASE_URL is not configured. Chat History will show no site names.',
      );
    }

    this.baseUrl = (configured ?? '').replace(/\/+$/, '');
  }

  /**
   * Names for many ids at once, as a Map.
   *
   * Deduplicated and fetched in parallel: Chat History lists hundreds of rows
   * but only a handful of distinct sites, so one request per row would be
   * hundreds of calls for a few answers.
   */
  async resolveMany(
    siteIds: readonly (string | null)[],
  ): Promise<Map<string, string | null>> {
    const unique = [
      ...new Set(siteIds.filter((id): id is string => Boolean(id?.trim()))),
    ];

    const entries = await Promise.all(
      unique.map(
        async (id): Promise<[string, string | null]> => [
          id,
          await this.resolve(id),
        ],
      ),
    );

    return new Map(entries);
  }

  /** One name. Null when unknown, unreachable, or not configured. */
  async resolve(siteId: string): Promise<string | null> {
    const cached = this.cache.get(siteId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.name;
    }

    if (!this.baseUrl) return null;

    const name = await this.fetchName(siteId);
    this.remember(siteId, name);
    return name;
  }

  private async fetchName(siteId: string): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(
      (): void => controller.abort(),
      SiteNameService.REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(
        `${this.baseUrl}/sites/${encodeURIComponent(siteId)}/name`,
        { signal: controller.signal },
      );

      if (!response.ok) {
        // 404 is ordinary — a site deleted since the chat happened.
        if (response.status !== 404) {
          this.logger.warn(
            `Site name lookup for ${siteId} returned ${response.status}`,
          );
        }
        return null;
      }

      const body = (await response.json()) as { siteName?: unknown };
      return typeof body.siteName === 'string' ? body.siteName : null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Site name lookup for ${siteId} failed: ${message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private remember(siteId: string, name: string | null): void {
    if (this.cache.size >= SiteNameService.MAX_CACHED) {
      // Oldest insertion first — Map preserves insertion order.
      const [oldest] = this.cache.keys();
      if (oldest !== undefined) this.cache.delete(oldest);
    }

    this.cache.set(siteId, {
      name,
      expiresAt: Date.now() + SiteNameService.CACHE_TTL_MS,
    });
  }
}
