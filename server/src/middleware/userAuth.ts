import type { RequestHandler } from 'express';
import { db } from '../db';
import { AppError } from './errors';

export const userAuth: RequestHandler = (req, _res, next) => {
  const userId = req.header('X-User-Id');
  if (!userId) {
    next(new AppError(401, 'MISSING_USER_ID', 'Falta identificarse.'));
    return;
  }
  const user = db.prepare('SELECT id FROM User WHERE id = ?').get(userId);
  if (!user) {
    next(new AppError(401, 'UNKNOWN_USER', 'No reconocemos tu sesión. Vuelve a entrar con tu nombre.'));
    return;
  }
  req.userId = userId;
  next();
};
