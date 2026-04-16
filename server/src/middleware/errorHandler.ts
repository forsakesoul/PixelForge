import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@shared/types.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response<ApiResponse<null>>,
  _next: NextFunction
) {
  console.error('[error]', err.message);
  res.status(500).json({
    code: -1,
    message: err.message || 'Internal Server Error',
    data: null,
  });
}
