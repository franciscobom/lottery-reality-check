import { NextRequest, NextResponse } from "next/server";

// Simple in-memory rate limiter for development.
// In production, swap for @upstash/ratelimit with Redis.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const stores: Record<string, Map<string, RateLimitEntry>> = {};

function getStore(name: string): Map<string, RateLimitEntry> {
  if (!stores[name]) {
    stores[name] = new Map();
  }
  return stores[name];
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

interface RateLimitConfig {
  name: string;
  maxRequests: number;
  windowMs: number;
}

export function createRateLimiter(config: RateLimitConfig) {
  return async function checkRateLimit(
    req: NextRequest
  ): Promise<NextResponse | null> {
    const ip = getClientIp(req);
    const store = getStore(config.name);
    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || now >= entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + config.windowMs });
      return null; // allowed
    }

    if (entry.count >= config.maxRequests) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 }
      );
    }

    entry.count++;
    return null; // allowed
  };
}

// Pre-configured limiters
export const sessionLimiter = createRateLimiter({
  name: "session",
  maxRequests: 10,
  windowMs: 60 * 60 * 1000, // 10/hour
});
