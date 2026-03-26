import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import {
  createRateLimitMiddleware,
  keyByIp,
  keyBySessionUser
} from './rate-limit-middleware.js';

type ResponseStub = Response & {
  statusCode: number;
  body: unknown;
  set(name: string, value: string): ResponseStub;
  status(code: number): ResponseStub;
  json(payload: unknown): ResponseStub;
};

function createResponseStub() {
  const headers = new Map<string, string>();
  const response = {} as ResponseStub;

  response.statusCode = 200;
  response.body = null;
  response.set = ((field: string, value?: string | string[]) => {
    if (value !== undefined) {
      headers.set(field.toLowerCase(), Array.isArray(value) ? value.join(',') : value);
    }
    return response;
  }) as ResponseStub['set'];
  response.status = (code: number) => {
    response.statusCode = code;
    return response;
  };
  response.json = (payload: unknown) => {
    response.body = payload;
    return response;
  };

  return {
    response,
    headers
  };
}

describe('rate limit middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-26T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('会在超过限制时返回 429', () => {
    const middleware = createRateLimitMiddleware({
      bucket: 'test',
      limit: 2,
      windowMs: 60_000,
      keyGenerator: keyByIp,
      message: '操作过于频繁'
    });
    const req = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      header: () => undefined
    } as unknown as Request;

    const next = vi.fn();

    const first = createResponseStub();
    middleware(req, first.response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(first.headers.get('x-ratelimit-remaining')).toBe('1');

    const second = createResponseStub();
    middleware(req, second.response, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(second.headers.get('x-ratelimit-remaining')).toBe('0');

    const third = createResponseStub();
    middleware(req, third.response, next);
    expect(third.response.statusCode).toBe(429);
    expect(third.headers.get('retry-after')).toBe('60');
    expect(third.response.body).toEqual({
      code: 429,
      message: 'RATE_LIMITED',
      detail: '操作过于频繁'
    });
  });

  it('窗口过期后会重新允许请求', () => {
    const middleware = createRateLimitMiddleware({
      bucket: 'test',
      limit: 1,
      windowMs: 1_000,
      keyGenerator: keyByIp
    });
    const req = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      header: () => undefined
    } as unknown as Request;

    const next = vi.fn();
    middleware(req, createResponseStub().response, next);
    const blocked = createResponseStub();
    middleware(req, blocked.response, next);
    expect(blocked.response.statusCode).toBe(429);

    vi.advanceTimersByTime(1_001);

    middleware(req, createResponseStub().response, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('优先按 session user 维度限流', () => {
    const req = {
      sessionUser: { sub2apiUserId: 42 },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      header: () => undefined
    } as unknown as Request;

    expect(keyBySessionUser(req)).toBe('user:42');
  });
});
