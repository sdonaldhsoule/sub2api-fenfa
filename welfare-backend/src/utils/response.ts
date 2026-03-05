import type { Response } from 'express';

export function ok(res: Response, data: unknown): void {
  res.json({
    code: 0,
    message: 'success',
    data
  });
}

export function fail(
  res: Response,
  status: number,
  message: string,
  detail?: string
): void {
  res.status(status).json({
    code: status,
    message,
    detail
  });
}

