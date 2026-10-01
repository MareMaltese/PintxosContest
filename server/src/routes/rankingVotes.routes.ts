import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { userAuth } from '../middleware/userAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { getMyRanking, setMyRanking } from '../services/rankingVoteService';

const rankingSchema = z.object({ entryIds: z.array(z.string().uuid()) });

export const rankingVotesRouter = Router();

rankingVotesRouter.get(
  '/me',
  userAuth,
  asyncHandler(async (req, res) => {
    res.json({ entryIds: await getMyRanking(db, req.userId!) });
  })
);

rankingVotesRouter.put(
  '/me',
  userAuth,
  asyncHandler(async (req, res) => {
    const { entryIds } = rankingSchema.parse(req.body);
    await setMyRanking(db, req.userId!, entryIds);
    res.json({ ok: true });
  })
);
