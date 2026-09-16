import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { userAuth } from '../middleware/userAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import { getCurrentOpenRound, castVote } from '../services/tiebreakService';

const voteSchema = z.object({ entryId: z.string().uuid() });

export const tiebreakRouter = Router();

tiebreakRouter.get(
  '/current',
  userAuth,
  asyncHandler(async (_req, res) => {
    const current = getCurrentOpenRound(db);
    if (!current) {
      throw new AppError(404, 'NO_OPEN_ROUND', 'No hay ninguna ronda de desempate abierta.');
    }
    res.json(current);
  })
);

tiebreakRouter.post(
  '/vote',
  userAuth,
  asyncHandler(async (req, res) => {
    const { entryId } = voteSchema.parse(req.body);
    const current = getCurrentOpenRound(db);
    if (!current) {
      throw new AppError(404, 'NO_OPEN_ROUND', 'No hay ninguna ronda de desempate abierta.');
    }
    castVote(db, current.round.id, req.userId!, entryId);
    res.status(201).json({ ok: true });
  })
);
