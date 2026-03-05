import type { SessionUser } from './domain.js';

declare global {
  namespace Express {
    interface Request {
      sessionUser?: SessionUser;
    }
  }
}

export {};

