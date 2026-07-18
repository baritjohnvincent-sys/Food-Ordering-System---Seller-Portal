import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  next();
};
