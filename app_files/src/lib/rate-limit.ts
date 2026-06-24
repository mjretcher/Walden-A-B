/**
 * In-memory sliding-window rate limiter.
 *
 * Trade-offs (read before changing):
 *   PROS  Zero dependencies, zero infra cost, fast (microseconds per
 *         check), works fine for a low-traffic admin app like Walden
 *         where the goal is "no brute-force attempts get through" not
 *         "DDoS-grade traffic shaping."
 *   CONS  State lives in serverless function memory. Different Vercel
 *         function instances have independent counters; counters reset
 *         on cold start. A determined attacker who waits for cold
 *         starts could bypass it. For real defense at that level we'd
 *         need Upstash Redis or Vercel KV. For now, this is "much
 *         better than nothing" and won't break anything.
 *
 * If we need stronger guarantees later, swap the implementation of
 * `consume()` to call Upstash and keep the external API identical.
 */

type Bucket = {
  // Timestamps (ms since epoch) of recent requests within the window.
  // Kept sorted; older entries get pruned on each check.
  timestamps: number[];
};

const buckets = new Map<string, Bucket>();

// Periodic cleanup so the map doesn't grow forever on long-lived
// instances. Runs once an hour and drops keys that haven't been used
// in the last hour.
if (typeof globalThis !== "undefined" && !(globalThis as unknown as { __rateLimitCleanupStarted__?: boolean }).__rateLimitCleanupStarted__) {
  (globalThis as unknown as { __rateLimitCleanupStarted__?: boolean }).__rateLimitCleanupStarted__ = true;
  setInterval(() => {
    const cutoff = Date.now() - 3600_000;
    for (const [key, bucket] of buckets) {
      const newest = bucket.timestamps[bucket.timestamps.length - 1] ?? 0;
      if (newest < cutoff) buckets.delete(key);
    }
  }, 3600_000).unref?.();
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Record an attempt and check whether it's allowed.
 *
 * @param key Identifier for the bucket. Caller decides scope — typically
 *            "login:<ip>" or "export:<userId>" or "admin:<userId>".
 * @param limit Max allowed requests in the window.
 * @param windowMs Window size in milliseconds (sliding).
 */
export function consume(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  // Drop expired entries from the front (oldest end).
  while (bucket.timestamps.length > 0 && bucket.timestamps[0] < cutoff) {
    bucket.timestamps.shift();
  }

  if (bucket.timestamps.length >= limit) {
    // Earliest timestamp still in window determines when the user could
    // try again. retry-after is the time until that oldest entry falls
    // off the back of the window.
    const oldest = bucket.timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  bucket.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - bucket.timestamps.length,
    retryAfterSeconds: 0
  };
}

/**
 * Best-effort client IP extraction from a Next.js request.
 * Vercel forwards the real client IP in `x-forwarded-for`. Falls back
 * to `x-real-ip`, then to a literal "unknown" so the rate limiter still
 * groups bad actors together (better than per-request unique keys).
 */
export function clientIp(request: { headers: { get(name: string): string | null } }): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    // x-forwarded-for can be a comma-separated list; the first is the
    // original client. Trim whitespace.
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
