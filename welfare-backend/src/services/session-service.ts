import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { SessionTokenUser, SessionUser, VerifiedSession } from '../types/domain.js';
import { config } from '../config.js';
import { randomBase64Url } from '../utils/oauth.js';

interface SessionClaims {
  uid: number;
  subid?: string | null;
  semail: string;
  uname: string;
  ava: string | null;
  sver?: number;
}

type DecodedSessionClaims = jwt.JwtPayload & SessionClaims;

function getLegacyTokenId(token: string): string {
  return `legacy:${crypto.createHash('sha256').update(token).digest('hex')}`;
}

export class SessionService {
  sign(user: SessionTokenUser): string {
    const expiresIn = config.WELFARE_JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'];
    return jwt.sign(
      {
        uid: user.sub2apiUserId,
        subid: user.linuxdoSubject,
        semail: user.email,
        uname: user.username,
        ava: user.avatarUrl ?? null,
        sver: user.sessionVersion
      } satisfies SessionClaims,
      config.WELFARE_JWT_SECRET,
      {
        expiresIn,
        jwtid: randomBase64Url(18)
      }
    );
  }

  verify(token: string): SessionUser {
    return this.verifySession(token).user;
  }

  verifySession(token: string): VerifiedSession {
    const decoded = jwt.verify(token, config.WELFARE_JWT_SECRET) as DecodedSessionClaims;

    if (
      typeof decoded.uid !== 'number' ||
      typeof decoded.semail !== 'string' ||
      typeof decoded.uname !== 'string' ||
      !(
        decoded.subid == null ||
        typeof decoded.subid === 'string'
      ) ||
      (decoded.ava !== null && typeof decoded.ava !== 'string') ||
      (decoded.sver != null && (!Number.isInteger(decoded.sver) || decoded.sver < 1)) ||
      typeof decoded.exp !== 'number'
    ) {
      throw new Error('session token claims invalid');
    }

    return {
      user: {
        sub2apiUserId: decoded.uid,
        email: decoded.semail,
        linuxdoSubject:
          typeof decoded.subid === 'string' && decoded.subid.trim() !== ''
            ? decoded.subid
            : null,
        username: decoded.uname,
        avatarUrl: decoded.ava ?? null
      },
      tokenId:
        typeof decoded.jti === 'string' && decoded.jti.trim() !== ''
          ? decoded.jti
          : getLegacyTokenId(token),
      expiresAtMs: decoded.exp * 1000,
      sessionVersion: decoded.sver ?? 1
    };
  }
}

export const sessionService = new SessionService();
