import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { userAuth } from '../middleware/userAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import { getContest } from '../services/contestService';
import { getMyMedals, setMedal } from '../services/medalVoteService';
import { computeMedalPodium, getWorstPrizeWinner } from '../services/medalResultsService';
import { computeMedalStandings } from '../services/rankingService';

const medalSchema = z.object({ medal: z.enum(['GOLD', 'SILVER', 'BRONZE']).nullable() });

export const medalVotesRouter = Router();

medalVotesRouter.get(
  '/me',
  userAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyMedals(db, req.userId!));
  })
);

medalVotesRouter.put(
  '/:entryId',
  userAuth,
  asyncHandler(async (req, res) => {
    const { medal } = medalSchema.parse(req.body);
    await setMedal(db, req.userId!, req.params.entryId, medal);
    res.json({ ok: true });
  })
);

medalVotesRouter.get(
  '/results',
  userAuth,
  asyncHandler(async (_req, res) => {
    const contest = await getContest(db);
    if (contest.phase !== 'RESULTS' || !contest.resultsRevealedAt) {
      throw new AppError(409, 'RESULTS_NOT_READY', 'Los resultados todavía no se han mostrado.');
    }
    res.json({
      revealedAt: contest.resultsRevealedAt,
      podium: await computeMedalPodium(db),
      standings: await computeMedalStandings(db),
      worstEntryId: await getWorstPrizeWinner(db),
    });
  })
);
