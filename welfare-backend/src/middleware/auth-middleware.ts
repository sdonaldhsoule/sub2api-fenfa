import type { NextFunction, Request, Response } from 'express';
import { sessionService } from '../services/session-service.js';

function extractToken(req: Request): string | null {
  // Authorization header 优先，避免跨域 cookie 和 Firefox cookie partition 问题
  const authHeader = req.header('Authorization')?.trim();
  if (authHeader) {
    const [scheme, token] = authHeader.split(/\s+/);
    if (scheme?.toLowerCase() === 'bearer' && token) {
      return token;
    }
  }
  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({
      code: 401,
      message: 'UNAUTHORIZED',
      detail: '请先登录'
    });
    return;
  }

  try {
    req.sessionUser = sessionService.verify(token);
    next();
  } catch {
    res.status(401).json({
      code: 401,
      message: 'INVALID_TOKEN',
      detail: '登录已失效，请重新登录'
    });
  }
}
