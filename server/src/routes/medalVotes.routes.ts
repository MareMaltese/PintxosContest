import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { userAuth } from '../middleware/userAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import { getContest } from '../services/contestService';
import { getMyMedals, setMedal } from '../services/medalVoteService';
import { computeMedalPodium } from '../services/medalResultsService';
import { computeMedalStandings } from '../services/rankingService';

const medalSchema = z.object({ medal: z.enum(['GOLD', 'SILVER', 'BRONZE']).nullable() });

export const medalVotesRouter = Router();

medalVotesRouter.get(
  '/me',
  userAuth,
  asyncHandler(async (req, res) => {
    res.json(getMyMedals(db, req.userId!));
  })
);

medalVotesRouter.put(
  '/:entryId',
  userAuth,
  asyncHandler(async (req, res) => {
    const { medal } = medalSchema.parse(req.body);
    setMedal(db, req.userId!, req.params.entryId, medal);
    res.json({ ok: true });
  })
);

medalVotesRouter.get(
  '/results',
  userAuth,
  asyncHandler(async (_req, res) => {
    const contest = getContest(db);
    if (contest.phase !== 'RESULTS' || !contest.resultsRevealedAt) {
      throw new AppError(409, 'RESULTS_NOT_READY', 'Los resultados todavía no se han mostrado.');
    }
    res.json({
      revealedAt: contest.resultsRevealedAt,
      podium: computeMedalPodium(db),
      standings: computeMedalStandings(db),
    });
  })
);
