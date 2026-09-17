import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { adminAuth } from '../middleware/adminAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import { getContest, startContest, setAllowSelfVote, revealResults } from '../services/contestService';
import { listUsers, getUser } from '../services/userService';
import { listEntriesForAdmin } from '../services/entryService';
import { getFavoriteLimit } from '../services/voteService';
import { advance, closeRound, getOpenRoundId } from '../services/tiebreakService';
import { deleteEntryImage } from '../images/imageProcessor';
import { broadcast } from '../realtime/sse';

export const adminRouter = Router();
adminRouter.use(adminAuth);

adminRouter.get(
  '/entries',
  asyncHandler(async (_req, res) => {
    res.json(listEntriesForAdmin(db));
  })
);

adminRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const contest = getContest(db);
    const users = listUsers(db);
    const entryCount = (db.prepare('SELECT COUNT(*) as c FROM Entry').get() as { c: number }).c;

    const people = users.map((u) => {
      const entryNumbers = (
        db.prepare('SELECT number FROM Entry WHERE creatorId = ? ORDER BY number ASC').all(u.id) as {
          number: number;
        }[]
      ).map((e) => e.number);
      const votedCount = (db.prepare('SELECT COUNT(*) as c FROM Vote WHERE userId = ?').get(u.id) as { c: number })
        .c;
      const limit = getFavoriteLimit(db, u.id);
      return {
        id: u.id,
        name: u.name,
        entryNumbers,
        votedCount,
        voteLimit: limit,
        hasFinishedVoting: votedCount >= limit,
        lastSeen: u.lastSeen,
      };
    });

    res.json({
      phase: contest.phase,
      allowSelfVote: contest.allowSelfVote,
      participantCount: users.length,
      entryCount,
      votersFinished: people.filter((p) => p.hasFinishedVoting).length,
      votersTotal: users.length,
      people,
    });
  })
);

adminRouter.post(
  '/contest/start',
  asyncHandler(async (_req, res) => {
    const contest = startContest(db);
    broadcast('phase-changed', { phase: contest.phase });
    res.json(contest);
  })
);

const closeVotingSchema = z.object({ force: z.boolean().optional() });

adminRouter.post(
  '/contest/close-voting',
  asyncHandler(async (req, res) => {
    const { force } = closeVotingSchema.parse(req.body ?? {});
    const contest = getContest(db);
    if (contest.phase !== 'VOTING') {
      throw new AppError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.');
    }
    const users = listUsers(db);
    const pending = users.filter((u) => {
      const votedCount = (db.prepare('SELECT COUNT(*) as c FROM Vote WHERE userId = ?').get(u.id) as { c: number })
        .c;
      return votedCount < getFavoriteLimit(db, u.id);
    });
    if (pending.length > 0 && !force) {
      res.status(409).json({
        code: 'VOTERS_PENDING',
        message: `Hay ${pending.length} persona(s) que todavía no ha(n) completado sus votos.`,
        pending: pending.map((p) => ({ id: p.id, name: p.name })),
      });
      return;
    }
    const result = advance(db);
    broadcast('phase-changed', { phase: result.phase, openedRound: result.openedRound ?? null });
    res.json(result);
  })
);

adminRouter.post(
  '/tiebreak/close-round',
  asyncHandler(async (_req, res) => {
    const roundId = getOpenRoundId(db);
    if (!roundId) {
      throw new AppError(404, 'NO_OPEN_ROUND', 'No hay ninguna ronda de desempate abierta.');
    }
    const closeResult = closeRound(db, roundId);
    let phase: 'TIEBREAK' | 'RESULTS' = 'TIEBREAK';
    if (closeResult.status === 'RESOLVED') {
      phase = advance(db).phase;
    }
    broadcast('tiebreak-round-changed', { closeResult, phase });
    res.json({ closeResult, phase });
  })
);

adminRouter.post(
  '/contest/reveal-results',
  asyncHandler(async (_req, res) => {
    const contest = revealResults(db);
    broadcast('results-revealed', { revealedAt: contest.resultsRevealedAt });
    res.json(contest);
  })
);

const allowSelfVoteSchema = z.object({ allowSelfVote: z.boolean() });

adminRouter.patch(
  '/contest',
  asyncHandler(async (req, res) => {
    const { allowSelfVote } = allowSelfVoteSchema.parse(req.body);
    res.json(setAllowSelfVote(db, allowSelfVote));
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
    const entry = db.prepare('SELECT * FROM Entry WHERE id = ?').get(req.params.id);
    if (!entry) {
      throw new AppError(404, 'ENTRY_NOT_FOUND', 'No existe esa tapa.');
    }
    if (fields.name !== undefined) {
      db.prepare('UPDATE Entry SET name = ? WHERE id = ?').run(fields.name, req.params.id);
    }
    if (fields.description !== undefined) {
      db.prepare('UPDATE Entry SET description = ? WHERE id = ?').run(fields.description, req.params.id);
    }
    res.json(db.prepare('SELECT * FROM Entry WHERE id = ?').get(req.params.id));
  })
);

adminRouter.delete(
  '/entries/:id',
  asyncHandler(async (req, res) => {
    const entry = db.prepare('SELECT imagePath FROM Entry WHERE id = ?').get(req.params.id) as
      | { imagePath: string }
      | undefined;
    if (!entry) {
      throw new AppError(404, 'ENTRY_NOT_FOUND', 'No existe esa tapa.');
    }
    const tx = db.transaction((id: string) => {
      db.prepare('DELETE FROM TiebreakVote WHERE entryId = ?').run(id);
      db.prepare('DELETE FROM TiebreakCandidate WHERE entryId = ?').run(id);
      db.prepare('DELETE FROM Vote WHERE entryId = ?').run(id);
      db.prepare('DELETE FROM Entry WHERE id = ?').run(id);
    });
    tx(req.params.id);
    deleteEntryImage(entry.imagePath);
    res.json({ ok: true });
  })
);

const editUserSchema = z.object({ name: z.string().trim().min(1).max(60) });

adminRouter.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const { name } = editUserSchema.parse(req.body);
    const result = db.prepare('UPDATE User SET name = ? WHERE id = ?').run(name, req.params.id);
    if (result.changes === 0) {
      throw new AppError(404, 'USER_NOT_FOUND', 'No existe ese participante.');
    }
    res.json(getUser(db, req.params.id));
  })
);

adminRouter.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const ownEntries = db.prepare('SELECT id, imagePath FROM Entry WHERE creatorId = ?').all(req.params.id) as {
      id: string;
      imagePath: string;
    }[];
    const tx = db.transaction((id: string) => {
      for (const entry of ownEntries) {
        db.prepare('DELETE FROM TiebreakVote WHERE entryId = ?').run(entry.id);
        db.prepare('DELETE FROM TiebreakCandidate WHERE entryId = ?').run(entry.id);
        db.prepare('DELETE FROM Vote WHERE entryId = ?').run(entry.id);
      }
      db.prepare('DELETE FROM Entry WHERE creatorId = ?').run(id);
      db.prepare('DELETE FROM Vote WHERE userId = ?').run(id);
      db.prepare('DELETE FROM TiebreakVote WHERE userId = ?').run(id);
      const result = db.prepare('DELETE FROM User WHERE id = ?').run(id);
      if (result.changes === 0) {
        throw new AppError(404, 'USER_NOT_FOUND', 'No existe ese participante.');
      }
    });
    tx(req.params.id);
    for (const entry of ownEntries) {
      deleteEntryImage(entry.imagePath);
    }
    res.json({ ok: true });
  })
);
