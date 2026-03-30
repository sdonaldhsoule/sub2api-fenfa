import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth-middleware.js';
import {
  createRateLimitMiddleware,
  keyBySessionUser
} from '../middleware/rate-limit-middleware.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  resetService
} from '../services/reset-service.js';
import { fail, ok } from '../utils/response.js';
import { asyncHandler } from '../utils/async-handler.js';
import { HttpError } from '../utils/http.js';
import { Sub2apiResponseError } from '../services/sub2api-client.js';

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional()
});

const resetMutationRateLimit = createRateLimitMiddleware({
  bucket: 'reset',
  limit: config.WELFARE_RATE_LIMIT_CHECKIN_LIMIT,
  windowMs: config.WELFARE_RATE_LIMIT_CHECKIN_WINDOW_MS,
  keyGenerator: keyBySessionUser,
  message: '重置操作过于频繁，请稍后再试'
});

export const resetRouter = Router();

resetRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
resetRouter.use(requireAuth);

resetRouter.get('/status', asyncHandler(async (req, res) => {
  const data = await resetService.getStatus(req.sessionUser!);
  ok(res, data);
}));

resetRouter.get('/history', asyncHandler(async (req, res) => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    fail(res, 400, 'BAD_REQUEST', 'limit 参数非法');
    return;
  }

  const data = await resetService.getHistory(
    req.sessionUser!,
    parsed.data.limit ?? 20
  );
  ok(res, data);
}));

resetRouter.post('/apply', resetMutationRateLimit, asyncHandler(async (req, res) => {
  try {
    const data = await resetService.apply(req.sessionUser!);
    ok(res, data);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      fail(res, 403, 'RESET_DISABLED', error.message);
      return;
    }

    if (error instanceof ConflictError) {
      fail(res, 409, 'RESET_CONFLICT', error.message);
      return;
    }

    if (error instanceof NotFoundError) {
      fail(res, 404, 'NOT_FOUND', error.message);
      return;
    }

    if (error instanceof HttpError || error instanceof Sub2apiResponseError) {
      console.error('[reset] sub2api 重置失败', error);
      fail(res, 502, 'SUB2API_RESET_FAILED', '额度重置失败，请稍后重试');
      return;
    }

    console.error('[reset] 额度重置失败', error);
    fail(res, 500, 'RESET_FAILED', '额度重置失败，请稍后重试');
  }
}));
