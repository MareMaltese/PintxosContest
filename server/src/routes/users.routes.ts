import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import { createUser, touchHeartbeat, recoverUser } from '../services/userService';

const createUserSchema = z.object({ name: z.string().trim().min(1).max(60) });
const recoverUserSchema = z.object({
  name: z.string().trim().min(1).max(60),
  number: z.coerce.number().int().positive(),
});

export const usersRouter = Router();

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name } = createUserSchema.parse(req.body);
    res.status(201).json(await createUser(db, name));
  })
);

usersRouter.post(
  '/recover',
  asyncHandler(async (req, res) => {
    const { name, number } = recoverUserSchema.parse(req.body);
    res.json(await recoverUser(db, name, number));
  })
);

usersRouter.post(
  '/:id/heartbeat',
  asyncHandler(async (req, res) => {
    try {
      await touchHeartbeat(db, req.params.id);
    } catch {
      throw new AppError(404, 'USER_NOT_FOUND', 'No existe ese usuario.');
    }
    res.json({ ok: true });
  })
);
