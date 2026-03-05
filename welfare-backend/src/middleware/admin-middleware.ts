import type { NextFunction, Request, Response } from 'express';
import { welfareRepository } from '../services/checkin-service.js';

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const sessionUser = req.sessionUser;
  if (!sessionUser) {
    res.status(401).json({
      code: 401,
      message: 'UNAUTHORIZED',
      detail: '请先登录'
    });
    return;
  }

  const isAdmin = await welfareRepository.hasAdminSubject(sessionUser.linuxdoSubject);
  if (!isAdmin) {
    res.status(403).json({
      code: 403,
      message: 'FORBIDDEN',
      detail: '当前账号不在福利后台管理员白名单'
    });
    return;
  }

  next();
}

