import type { RequestHandler } from 'express';
import { config } from '../config';
import { AppError } from './errors';

export const adminAuth: RequestHandler = (req, _res, next) => {
  const pin = req.header('X-Admin-Pin');
  if (!pin || pin !== config.adminPin) {
    next(new AppError(401, 'INVALID_PIN', 'PIN de administrador incorrecto.'));
    return;
  }
  next();
};
