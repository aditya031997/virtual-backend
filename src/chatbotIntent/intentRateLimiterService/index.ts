import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

/** Internal counter for one rate-limit key. */
interface IRateLimitEntry {
  count: number;
  /** Epoch ms at which the current window expires. */
  windowExpiresAt: number;
}

/**
 * Fixed-window rate limiter for the intent classification endpoint.
 *
 * The endpoint is public (the widget calls it before a user is authenticated)
 * and every request costs an LLM call, so an unthrottled endpoint is both a
 * cost and an availability risk.
 *
 * In-memory by design: the project has no Redis dependency and no throttler
 * package, and adding either for one endpoint is not justified. The tradeoff is
 * that limits are per-instance — under multiple replicas the effective limit
 * scales with instance count. That is acceptable for a first-line abuse guard;
 * if this service is ever horizontally scaled and the limit must be exact,
 * swap the Map for a shared store behind the same interface.
 */
@Injectable()
export class IntentRateLimiterService implements OnModuleDestroy {
  private readonly logger = new Logger(IntentRateLimiterService.name);
  private readonly entries = new Map<string, IRateLimitEntry>();
  private readonly sweepTimer: NodeJS.Timeout;

  /** Window length. */
  private static readonly WINDOW_MS = 60_000;

  /** Requests permitted per key per window. */
  private static readonly MAX_REQUESTS_PER_WINDOW = 20;

  /** How often expired entries are swept out. */
  private static readonly SWEEP_INTERVAL_MS = 300_000;

  /**
   * Hard cap on tracked keys. Without this, spoofed keys would grow the Map
   * unbounded and exhaust memory.
   */
  private static readonly MAX_TRACKED_KEYS = 10_000;

  constructor() {
    this.sweepTimer = setInterval((): void => {
      this.sweepExpiredEntries();
    }, IntentRateLimiterService.SWEEP_INTERVAL_MS);

    // Do not hold the event loop open purely for the sweep.
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
    this.entries.clear();
  }

  /**
   * Consume one unit of quota for `key`.
   *
   * @returns true when the request may proceed, false when it is rate limited.
   */
  consume(key: string): boolean {
    const now = Date.now();
    const existing = this.entries.get(key);

    if (!existing || existing.windowExpiresAt <= now) {
      if (
        !existing &&
        this.entries.size >= IntentRateLimiterService.MAX_TRACKED_KEYS
      ) {
        // Reclaim space before admitting a new key so the Map cannot grow past
        // the cap. If everything is still live we fail closed for the new key
        // rather than allowing unbounded growth.
        this.sweepExpiredEntries();

        if (this.entries.size >= IntentRateLimiterService.MAX_TRACKED_KEYS) {
          this.logger.warn(
            'Intent rate limiter is at capacity; rejecting new key until entries expire.',
          );
          return false;
        }
      }

      this.entries.set(key, {
        count: 1,
        windowExpiresAt: now + IntentRateLimiterService.WINDOW_MS,
      });
      return true;
    }

    if (existing.count >= IntentRateLimiterService.MAX_REQUESTS_PER_WINDOW) {
      return false;
    }

    existing.count += 1;
    return true;
  }

  /** Seconds until `key`'s window resets; 0 when it has no active window. */
  getRetryAfterSeconds(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) return 0;

    const remainingMs = entry.windowExpiresAt - Date.now();
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  }

  /** Drop entries whose window has closed. */
  private sweepExpiredEntries(): void {
    const now = Date.now();

    for (const [key, entry] of this.entries.entries()) {
      if (entry.windowExpiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}
