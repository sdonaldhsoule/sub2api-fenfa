import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { authRouter } from './routes/auth-routes.js';
import { checkinRouter } from './routes/checkin-routes.js';
import { adminRouter } from './routes/admin-routes.js';
import { ok } from './utils/response.js';

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (
          config.WELFARE_CORS_ORIGINS.length === 0 ||
          config.WELFARE_CORS_ORIGINS.includes(origin)
        ) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS origin 不允许: ${origin}`));
      },
      credentials: true
    })
  );

  app.get('/healthz', (_req, res) => {
    ok(res, {
      service: 'welfare-backend',
      status: 'ok'
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/checkin', checkinRouter);
  app.use('/api/admin', adminRouter);

  app.use((req, res) => {
    res.status(404).json({
      code: 404,
      message: 'NOT_FOUND',
      detail: `未找到接口 ${req.method} ${req.path}`
    });
  });

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const detail = error instanceof Error ? error.message : '服务器异常';
      res.status(500).json({
        code: 500,
        message: 'INTERNAL_ERROR',
        detail
      });
    }
  );

  return app;
}

