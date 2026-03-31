import type { NextFunction, Request, Response } from 'express';
import { distributionDetectionService } from '../services/distribution-detection-service.js';
import { sessionService } from '../services/session-service.js';
import { sessionStateService } from '../services/session-state-service.js';

function extractToken(req: Request): string | null {
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

  const verifiedSession = (() => {
    try {
      return sessionService.verifySession(token);
    } catch {
      res.status(401).json({
        code: 401,
        message: 'INVALID_TOKEN',
        detail: '登录已失效，请重新登录'
      });
      return null;
    }
  })();

  if (!verifiedSession) {
    return;
  }

  void Promise.all([
    sessionStateService.isTokenRevoked(verifiedSession.tokenId),
    sessionStateService.getSessionVersion(verifiedSession.user.sub2apiUserId)
  ])
    .then(async ([isRevoked, currentSessionVersion]) => {
      if (isRevoked) {
        res.status(401).json({
          code: 401,
          message: 'REVOKED_TOKEN',
          detail: '当前登录已退出，请重新登录'
        });
        return;
      }

      if (currentSessionVersion !== verifiedSession.sessionVersion) {
        res.status(401).json({
          code: 401,
          message: 'SESSION_VERSION_MISMATCH',
          detail: '登录已失效，请重新登录'
        });
        return;
      }

      const accessDecision = await distributionDetectionService.evaluateAccess(
        verifiedSession.user,
        'auth'
      );
      if (accessDecision.blockedEvent) {
        res.status(403).json({
          code: 403,
          message: 'RISK_BLOCKED',
          detail: distributionDetectionService.getBlockedDetail(
            accessDecision.blockedEvent
          )
        });
        return;
      }

      req.sessionUser = verifiedSession.user;
      req.sessionToken = token;
      req.sessionTokenId = verifiedSession.tokenId;
      req.sessionTokenExpiresAtMs = verifiedSession.expiresAtMs;
      next();
    })
    .catch(next);
}
