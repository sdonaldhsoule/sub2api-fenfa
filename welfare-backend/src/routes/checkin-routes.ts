import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth-middleware.js';
import {
  checkinService,
  ConflictError,
  ForbiddenError
} from '../services/checkin-service.js';
import { fail, ok } from '../utils/response.js';
import { HttpError } from '../utils/http.js';
import { asyncHandler } from '../utils/async-handler.js';

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional()
});

export const checkinRouter = Router();

checkinRouter.use(requireAuth);

checkinRouter.get('/status', asyncHandler(async (req, res) => {
  const data = await checkinService.getStatus(req.sessionUser!);
  ok(res, data);
}));

checkinRouter.get('/history', asyncHandler(async (req, res) => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    fail(res, 400, 'BAD_REQUEST', 'limit 参数非法');
    return;
  }

  const data = await checkinService.getHistory(
    req.sessionUser!,
    parsed.data.limit ?? 30
  );
  ok(res, data);
}));

checkinRouter.post('/', asyncHandler(async (req, res) => {
  try {
    const data = await checkinService.checkin(req.sessionUser!);
    ok(res, data);
  } catch (error) {
    if (error instanceof ConflictError) {
      fail(res, 409, 'CHECKIN_CONFLICT', error.message);
      return;
    }

    if (error instanceof ForbiddenError) {
      fail(res, 403, 'CHECKIN_DISABLED', error.message);
      return;
    }

    if (error instanceof HttpError) {
      console.error('[checkin] sub2api 发放失败', error);
      fail(res, 502, 'SUB2API_GRANT_FAILED', '奖励发放失败，请稍后重试');
      return;
    }

    console.error('[checkin] 签到处理失败', error);
    fail(res, 500, 'CHECKIN_FAILED', '签到失败，请稍后重试');
  }
}));
