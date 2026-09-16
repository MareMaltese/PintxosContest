import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import { createUser, touchHeartbeat } from '../services/userService';

const createUserSchema = z.object({ name: z.string().trim().min(1).max(60) });

export const usersRouter = Router();

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name } = createUserSchema.parse(req.body);
    res.status(201).json(createUser(db, name));
  })
);

usersRouter.post(
  '/:id/heartbeat',
  asyncHandler(async (req, res) => {
    try {
      touchHeartbeat(db, req.params.id);
    } catch {
      throw new AppError(404, 'USER_NOT_FOUND', 'No existe ese usuario.');
    }
    res.json({ ok: true });
  })
);
