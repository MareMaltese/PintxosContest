import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { userAuth } from '../middleware/userAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { addVote, removeVote, listMyVotes, getFavoriteLimit } from '../services/voteService';

const voteSchema = z.object({ entryId: z.string().uuid() });

export const votesRouter = Router();

votesRouter.get(
  '/me',
  userAuth,
  asyncHandler(async (req, res) => {
    const entryIds = listMyVotes(db, req.userId!);
    const limit = getFavoriteLimit(db, req.userId!);
    res.json({ entryIds, limit });
  })
);

votesRouter.post(
  '/',
  userAuth,
  asyncHandler(async (req, res) => {
    const { entryId } = voteSchema.parse(req.body);
    addVote(db, req.userId!, entryId);
    res.status(201).json({ ok: true });
  })
);

votesRouter.delete(
  '/:entryId',
  userAuth,
  asyncHandler(async (req, res) => {
    removeVote(db, req.userId!, req.params.entryId);
    res.json({ ok: true });
  })
);
