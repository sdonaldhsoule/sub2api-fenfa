import type { NextFunction, Request, Response } from 'express';
import { fail } from '../utils/response.js';

interface RateLimitRecord {
  count: number;
  resetAtMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
}

interface RateLimitOptions {
  bucket: string;
  limit: number;
  windowMs: number;
  message?: string;
  keyGenerator: (req: Request) => string | null;
}

function readClientIp(req: Request): string {
  const forwarded = req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.ip || req.socket.remoteAddress || 'unknown';
}

class InMemoryRateLimiter {
  private readonly records = new Map<string, RateLimitRecord>();
  private operations = 0;

  hit(key: string, nowMs: number, limit: number, windowMs: number): RateLimitResult {
    this.operations += 1;
    if (this.operations % 100 === 0) {
      this.cleanup(nowMs);
    }

    const current = this.records.get(key);
    if (!current || current.resetAtMs <= nowMs) {
      const next: RateLimitRecord = {
        count: 1,
        resetAtMs: nowMs + windowMs
      };
      this.records.set(key, next);
      return {
        allowed: true,
        remaining: Math.max(0, limit - 1),
        resetAtMs: next.resetAtMs
      };
    }

    current.count += 1;
    this.records.set(key, current);

    return {
      allowed: current.count <= limit,
      remaining: Math.max(0, limit - current.count),
      resetAtMs: current.resetAtMs
    };
  }

  private cleanup(nowMs: number) {
    for (const [key, value] of this.records.entries()) {
      if (value.resetAtMs <= nowMs) {
        this.records.delete(key);
      }
    }
  }
}

export function keyByIp(req: Request): string {
  return readClientIp(req);
}

export function keyBySessionUser(req: Request): string | null {
  if (req.sessionUser) {
    return `user:${req.sessionUser.sub2apiUserId}`;
  }
  return readClientIp(req);
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  const limiter = new InMemoryRateLimiter();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (options.limit <= 0 || options.windowMs <= 0) {
      next();
      return;
    }

    const key = options.keyGenerator(req);
    if (!key) {
      next();
      return;
    }

    const result = limiter.hit(
      `${options.bucket}:${key}`,
      Date.now(),
      options.limit,
      options.windowMs
    );
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((result.resetAtMs - Date.now()) / 1000)
    );

    res.set('X-RateLimit-Limit', String(options.limit));
    res.set('X-RateLimit-Remaining', String(result.remaining));
    res.set('X-RateLimit-Reset', String(Math.ceil(result.resetAtMs / 1000)));

    if (!result.allowed) {
      res.set('Retry-After', String(retryAfterSeconds));
      fail(res, 429, 'RATE_LIMITED', options.message ?? '请求过于频繁，请稍后再试');
      return;
    }

    next();
  };
}
