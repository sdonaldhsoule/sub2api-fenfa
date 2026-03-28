import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAdmin } from './admin-middleware.js';
import { welfareRepository } from '../services/checkin-service.js';

vi.mock('../services/checkin-service.js', () => ({
  welfareRepository: {
    hasAdminUserId: vi.fn(),
    hasLegacyAdminSubject: vi.fn()
  }
}));

function createResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  } as unknown as Response;
}

describe('requireAdmin', () => {
  const next = vi.fn();

  beforeEach(() => {
    next.mockReset();
    vi.mocked(welfareRepository.hasAdminUserId).mockReset();
    vi.mocked(welfareRepository.hasLegacyAdminSubject).mockReset();
  });

  it('白名单命中时进入下一个处理器', async () => {
    vi.mocked(welfareRepository.hasAdminUserId).mockResolvedValue(true);
    vi.mocked(welfareRepository.hasLegacyAdminSubject).mockResolvedValue(false);
    const req = {
      sessionUser: {
        sub2apiUserId: 1,
        email: 'linuxdo-subject@linuxdo-connect.invalid',
        linuxdoSubject: 'subject',
        username: 'tester',
        avatarUrl: null
      }
    } as unknown as Request;
    const res = createResponse();

    requireAdmin(req, res, next);
    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledTimes(1);
    });

    expect(welfareRepository.hasAdminUserId).toHaveBeenCalledWith(1);
    expect(welfareRepository.hasLegacyAdminSubject).toHaveBeenCalledWith('subject');
  });

  it('数据库异常时会把错误交给 next，而不是产生未处理拒绝', async () => {
    const error = new Error('db down');
    vi.mocked(welfareRepository.hasAdminUserId).mockRejectedValue(error);
    const req = {
      sessionUser: {
        sub2apiUserId: 1,
        email: 'linuxdo-subject@linuxdo-connect.invalid',
        linuxdoSubject: 'subject',
        username: 'tester',
        avatarUrl: null
      }
    } as unknown as Request;
    const res = createResponse();

    requireAdmin(req, res, next);
    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
