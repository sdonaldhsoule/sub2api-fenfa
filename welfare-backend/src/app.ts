import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { authRouter } from './routes/auth-routes.js';
import { checkinRouter } from './routes/checkin-routes.js';
import { adminRouter } from './routes/admin-routes.js';
import { redeemRouter } from './routes/redeem-routes.js';
import { resetRouter } from './routes/reset-routes.js';
import { ok } from './utils/response.js';

const CORS_ERROR_PREFIX = 'CORS_ORIGIN_NOT_ALLOWED:';
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDistDir = process.env.WELFARE_STATIC_DIR?.trim()
  ? path.resolve(process.env.WELFARE_STATIC_DIR)
  : path.resolve(currentDir, 'public');
const frontendIndexFile = path.join(frontendDistDir, 'index.html');
const frameAncestorsPolicy = [
  "frame-ancestors",
  "'self'",
  config.SUB2API_ORIGIN
].join(' ');

export function createApp() {
  const app = express();
  const apiCors = cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (config.WELFARE_CORS_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`${CORS_ERROR_PREFIX}${origin}`));
    },
    maxAge: 600
  });

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.set('Content-Security-Policy', frameAncestorsPolicy);
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => {
    ok(res, {
      service: 'welfare-backend',
      status: 'ok'
    });
  });

  app.use('/api', apiCors);
  app.use('/api/auth', authRouter);
  app.use('/api/checkin', checkinRouter);
  app.use('/api/redeem-codes', redeemRouter);
  app.use('/api/reset', resetRouter);
  app.use('/api/admin', adminRouter);

  if (fs.existsSync(frontendIndexFile)) {
    app.use(express.static(frontendDistDir, { index: false }));
    app.get('*', (req, res, next) => {
      const isApiRequest = req.path === '/api' || req.path.startsWith('/api/');
      if (isApiRequest || !req.accepts('html')) {
        next();
        return;
      }

      res.sendFile(frontendIndexFile);
    });
  }

  app.use((req, res) => {
    res.status(404).json({
      code: 404,
      message: 'NOT_FOUND',
      detail: `未找到接口：${req.method} ${req.path}`
    });
  });

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (error instanceof Error && error.message.startsWith(CORS_ERROR_PREFIX)) {
        res.status(403).json({
          code: 403,
          message: 'FORBIDDEN',
          detail: '跨域请求来源未被允许'
        });
        return;
      }

      console.error('[welfare-backend] 未处理异常', error);
      res.status(500).json({
        code: 500,
        message: 'INTERNAL_ERROR',
        detail: '服务端错误，请稍后再试'
      });
    }
  );

  return app;
}
