import { Router } from 'express';
import { db } from '../db';
import { userAuth } from '../middleware/userAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import { getContest } from '../services/contestService';
import { computeStandings } from '../services/rankingService';

export const resultsRouter = Router();

resultsRouter.get(
  '/',
  userAuth,
  asyncHandler(async (_req, res) => {
    const contest = await getContest(db);
    if (contest.phase !== 'RESULTS' || !contest.resultsRevealedAt) {
      throw new AppError(409, 'RESULTS_NOT_READY', 'Los resultados todavía no se han mostrado.');
    }
    res.json({ revealedAt: contest.resultsRevealedAt, standings: await computeStandings(db) });
  })
);
