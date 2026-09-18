import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { adminAuth } from '../middleware/adminAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import {
  getContest,
  startContest,
  setAllowSelfVote,
  setVotingMode,
  revealResults,
  reopenVoting,
  backToRegistration,
} from '../services/contestService';
import { listUsers, getUser } from '../services/userService';
import { listEntriesForAdmin } from '../services/entryService';
import { getFavoriteLimit } from '../services/voteService';
import { computeStandings, computeMedalStandings } from '../services/rankingService';
import { advance, closeRound, getOpenRoundId } from '../services/tiebreakService';
import { deleteEntryImage } from '../images/imageProcessor';
import { broadcast } from '../realtime/sse';

export const adminRouter = Router();
adminRouter.use(adminAuth);

adminRouter.get(
  '/entries',
  asyncHandler(async (_req, res) => {
    const entries = await listEntriesForAdmin(db);
    const voteCountById = new Map((await computeStandings(db)).map((s) => [s.entryId, s.voteCount]));
    const medalsById = new Map((await computeMedalStandings(db)).map((s) => [s.entryId, s]));
    res.json(
      entries.map((entry) => {
        const medal = medalsById.get(entry.id);
        return {
          ...entry,
          voteCount: voteCountById.get(entry.id) ?? 0,
          gold: medal?.gold ?? 0,
          silver: medal?.silver ?? 0,
          bronze: medal?.bronze ?? 0,
        };
      })
    );
  })
);

adminRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const contest = await getContest(db);
    const users = await listUsers(db);
    const entryCount = ((await db.prepare('SELECT COUNT(*) as c FROM Entry').get()) as unknown as { c: number }).c;

    const people = await Promise.all(
      users.map(async (u) => {
        const entryNumbers = (
          (await db.prepare('SELECT number FROM Entry WHERE creatorId = ? ORDER BY number ASC').all(u.id)) as unknown as {
            number: number;
          }[]
        ).map((e) => e.number);
        const votedCount = (
          (await db.prepare('SELECT COUNT(*) as c FROM Vote WHERE userId = ?').get(u.id)) as unknown as { c: number }
        ).c;
        const limit = await getFavoriteLimit(db, u.id);
        return {
          id: u.id,
          name: u.name,
          entryNumbers,
          votedCount,
          voteLimit: limit,
          hasFinishedVoting: votedCount >= limit,
          lastSeen: u.lastSeen,
        };
      })
    );

    res.json({
      phase: contest.phase,
      allowSelfVote: contest.allowSelfVote,
      votingMode: contest.votingMode,
      resultsRevealedAt: contest.resultsRevealedAt,
      participantCount: users.length,
      entryCount,
      votersFinished: people.filter((p) => p.hasFinishedVoting).length,
      votersTotal: users.length,
      people,
    });
  })
);

adminRouter.get(
  '/medal-votes',
  asyncHandler(async (_req, res) => {
    const standings = await computeMedalStandings(db);
    res.json(
      standings.map((s) => ({
        entryId: s.entryId,
        number: s.number,
        name: s.name,
        gold: s.gold,
        silver: s.silver,
        bronze: s.bronze,
        total: s.total,
      }))
    );
  })
);

adminRouter.post(
  '/contest/start',
  asyncHandler(async (_req, res) => {
    const contest = await startContest(db);
    broadcast('phase-changed', { phase: contest.phase });
    res.json(contest);
  })
);

const closeVotingSchema = z.object({ force: z.boolean().optional() });

adminRouter.post(
  '/contest/close-voting',
  asyncHandler(async (req, res) => {
    const { force } = closeVotingSchema.parse(req.body ?? {});
    const contest = await getContest(db);
    if (contest.phase !== 'VOTING') {
      throw new AppError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.');
    }
    const users = await listUsers(db);
    const pending = [];
    for (const u of users) {
      const votedCount = (
        (await db.prepare('SELECT COUNT(*) as c FROM Vote WHERE userId = ?').get(u.id)) as unknown as { c: number }
      ).c;
      if (votedCount < (await getFavoriteLimit(db, u.id))) {
        pending.push(u);
      }
    }
    if (pending.length > 0 && !force) {
      res.status(409).json({
        code: 'VOTERS_PENDING',
        message: `Hay ${pending.length} persona(s) que todavía no ha(n) completado sus votos.`,
        pending: pending.map((p) => ({ id: p.id, name: p.name })),
      });
      return;
    }
    const result = await advance(db);
    broadcast('phase-changed', { phase: result.phase, openedRound: result.openedRound ?? null });
    res.json(result);
  })
);

adminRouter.post(
  '/tiebreak/close-round',
  asyncHandler(async (_req, res) => {
    const roundId = await getOpenRoundId(db);
    if (!roundId) {
      throw new AppError(404, 'NO_OPEN_ROUND', 'No hay ninguna ronda de desempate abierta.');
    }
    const closeResult = await closeRound(db, roundId);
    let phase: 'TIEBREAK' | 'RESULTS' = 'TIEBREAK';
    if (closeResult.status === 'RESOLVED') {
      phase = (await advance(db)).phase;
    }
    broadcast('tiebreak-round-changed', { closeResult, phase });
    res.json({ closeResult, phase });
  })
);

adminRouter.post(
  '/contest/reveal-results',
  asyncHandler(async (_req, res) => {
    const contest = await revealResults(db);
    broadcast('results-revealed', { revealedAt: contest.resultsRevealedAt });
    res.json(contest);
  })
);

adminRouter.post(
  '/contest/reopen-voting',
  asyncHandler(async (_req, res) => {
    const contest = await reopenVoting(db);
    broadcast('phase-changed', { phase: contest.phase });
    res.json(contest);
  })
);

adminRouter.post(
  '/contest/back-to-registration',
  asyncHandler(async (_req, res) => {
    const contest = await backToRegistration(db);
    broadcast('phase-changed', { phase: contest.phase });
    res.json(contest);
  })
);

const contestSettingsSchema = z.object({
  allowSelfVote: z.boolean().optional(),
  votingMode: z.enum(['FAVORITES', 'MEDALS']).optional(),
});

adminRouter.patch(
  '/contest',
  asyncHandler(async (req, res) => {
    const { allowSelfVote, votingMode } = contestSettingsSchema.parse(req.body);
    if (allowSelfVote !== undefined) await setAllowSelfVote(db, allowSelfVote);
    if (votingMode !== undefined) await setVotingMode(db, votingMode);
    res.json(await getContest(db));
  })
);

const editEntrySchema = z.object({
  name: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(280).nullable().optional(),
});

adminRouter.patch(
  '/entries/:id',
  asyncHandler(async (req, res) => {
    const fields = editEntrySchema.parse(req.body);
    const entry = await db.prepare('SELECT * FROM Entry WHERE id = ?').get(req.params.id);
    if (!entry) {
      throw new AppError(404, 'ENTRY_NOT_FOUND', 'No existe esa tapa.');
    }
    if (fields.name !== undefined) {
      await db.prepare('UPDATE Entry SET name = ? WHERE id = ?').run(fields.name, req.params.id);
    }
    if (fields.description !== undefined) {
      await db.prepare('UPDATE Entry SET description = ? WHERE id = ?').run(fields.description, req.params.id);
    }
    res.json(await db.prepare('SELECT * FROM Entry WHERE id = ?').get(req.params.id));
  })
);

adminRouter.delete(
  '/entries/:id',
  asyncHandler(async (req, res) => {
    const entry = (await db.prepare('SELECT imagePath FROM Entry WHERE id = ?').get(req.params.id)) as unknown as
      | { imagePath: string }
      | undefined;
    if (!entry) {
      throw new AppError(404, 'ENTRY_NOT_FOUND', 'No existe esa tapa.');
    }
    const tx = db.transaction(async (id: string) => {
      await db.prepare('DELETE FROM TiebreakVote WHERE entryId = ?').run(id);
      await db.prepare('DELETE FROM TiebreakCandidate WHERE entryId = ?').run(id);
      await db.prepare('DELETE FROM Vote WHERE entryId = ?').run(id);
      await db.prepare('DELETE FROM MedalVote WHERE entryId = ?').run(id);
      await db.prepare('DELETE FROM Entry WHERE id = ?').run(id);
    });
    await tx(req.params.id);
    deleteEntryImage(entry.imagePath);
    res.json({ ok: true });
  })
);

const editUserSchema = z.object({ name: z.string().trim().min(1).max(60) });

adminRouter.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const { name } = editUserSchema.parse(req.body);
    const result = await db.prepare('UPDATE User SET name = ? WHERE id = ?').run(name, req.params.id);
    if (result.changes === 0) {
      throw new AppError(404, 'USER_NOT_FOUND', 'No existe ese participante.');
    }
    res.json(await getUser(db, req.params.id));
  })
);

adminRouter.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const ownEntries = (await db
      .prepare('SELECT id, imagePath FROM Entry WHERE creatorId = ?')
      .all(req.params.id)) as unknown as {
      id: string;
      imagePath: string;
    }[];
    const tx = db.transaction(async (id: string) => {
      for (const entry of ownEntries) {
        await db.prepare('DELETE FROM TiebreakVote WHERE entryId = ?').run(entry.id);
        await db.prepare('DELETE FROM TiebreakCandidate WHERE entryId = ?').run(entry.id);
        await db.prepare('DELETE FROM Vote WHERE entryId = ?').run(entry.id);
        await db.prepare('DELETE FROM MedalVote WHERE entryId = ?').run(entry.id);
      }
      await db.prepare('DELETE FROM Entry WHERE creatorId = ?').run(id);
      await db.prepare('DELETE FROM Vote WHERE userId = ?').run(id);
      await db.prepare('DELETE FROM TiebreakVote WHERE userId = ?').run(id);
      await db.prepare('DELETE FROM MedalVote WHERE userId = ?').run(id);
      const result = await db.prepare('DELETE FROM User WHERE id = ?').run(id);
      if (result.changes === 0) {
        throw new AppError(404, 'USER_NOT_FOUND', 'No existe ese participante.');
      }
    });
    await tx(req.params.id);
    for (const entry of ownEntries) {
      deleteEntryImage(entry.imagePath);
    }
    res.json({ ok: true });
  })
);
