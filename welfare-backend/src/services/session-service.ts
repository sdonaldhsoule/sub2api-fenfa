import jwt from 'jsonwebtoken';
import type { SessionUser } from '../types/domain.js';
import { config } from '../config.js';

interface SessionClaims {
  uid: number;
  subid: string;
  semail: string;
  uname: string;
  ava: string | null;
}

export class SessionService {
  sign(user: SessionUser): string {
    const expiresIn = config.WELFARE_JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'];
    return jwt.sign(
      {
        uid: user.sub2apiUserId,
        subid: user.linuxdoSubject,
        semail: user.syntheticEmail,
        uname: user.username,
        ava: user.avatarUrl ?? null
      } satisfies SessionClaims,
      config.WELFARE_JWT_SECRET,
      {
        expiresIn
      }
    );
  }

  verify(token: string): SessionUser {
    const decoded = jwt.verify(
      token,
      config.WELFARE_JWT_SECRET
    ) as SessionClaims;
    return {
      sub2apiUserId: decoded.uid,
      linuxdoSubject: decoded.subid,
      syntheticEmail: decoded.semail,
      username: decoded.uname,
      avatarUrl: decoded.ava ?? null
    };
  }
}

export const sessionService = new SessionService();
