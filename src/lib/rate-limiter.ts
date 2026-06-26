type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();
const MAX_STORE_SIZE = 10_000;

function evictExpired() {
  if (store.size < MAX_STORE_SIZE) return;
  const now = Date.now();
  for (const [k, v] of store) {
    if (now > v.resetAt) store.delete(k);
  }
}

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  evictExpired();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}
