import { IntentRateLimiterService } from '@/chatbotIntent/intentRateLimiterService';

describe('IntentRateLimiterService', (): void => {
  let service: IntentRateLimiterService;

  beforeEach((): void => {
    jest.useFakeTimers();
    service = new IntentRateLimiterService();
  });

  afterEach((): void => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('allows requests up to the per-window limit', (): void => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(service.consume('session:a')).toBe(true);
    }
  });

  it('rejects the request that exceeds the limit', (): void => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      service.consume('session:a');
    }

    expect(service.consume('session:a')).toBe(false);
  });

  it('tracks keys independently', (): void => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      service.consume('session:a');
    }

    expect(service.consume('session:a')).toBe(false);
    expect(service.consume('session:b')).toBe(true);
  });

  it('permits requests again once the window rolls over', (): void => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      service.consume('session:a');
    }
    expect(service.consume('session:a')).toBe(false);

    jest.advanceTimersByTime(60_001);

    expect(service.consume('session:a')).toBe(true);
  });

  it('reports seconds remaining until the window resets', (): void => {
    service.consume('session:a');

    jest.advanceTimersByTime(15_000);

    // 60s window, 15s elapsed -> 45s remaining.
    expect(service.getRetryAfterSeconds('session:a')).toBe(45);
  });

  it('reports zero retry-after for a key it has never seen', (): void => {
    expect(service.getRetryAfterSeconds('session:never-used')).toBe(0);
  });

  it('releases capacity for new keys once old windows expire', (): void => {
    // Fill to the tracked-key cap.
    for (let index = 0; index < 10_000; index += 1) {
      service.consume(`session:${index}`);
    }

    // Cap reached: a brand-new key cannot be admitted yet.
    expect(service.consume('session:overflow')).toBe(false);

    // Once every existing window closes, the sweep reclaims space.
    jest.advanceTimersByTime(60_001);

    expect(service.consume('session:overflow')).toBe(true);
  });
});
