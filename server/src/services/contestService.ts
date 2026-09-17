import type Database from 'better-sqlite3';
import { AppError } from '../middleware/errors';

export type ContestPhase = 'REGISTRATION' | 'VOTING' | 'TIEBREAK' | 'RESULTS';
export type VotingMode = 'FAVORITES' | 'MEDALS';

export interface Contest {
  phase: ContestPhase;
  allowSelfVote: boolean;
  votingMode: VotingMode;
  resultsRevealedAt: string | null;
}

interface ContestRow {
  phase: ContestPhase;
  allowSelfVote: number;
  votingMode: VotingMode;
  resultsRevealedAt: string | null;
}

export function getContest(db: Database.Database): Contest {
  const row = db
    .prepare('SELECT phase, allowSelfVote, votingMode, resultsRevealedAt FROM Contest WHERE id = 1')
    .get() as ContestRow;
  return {
    phase: row.phase,
    allowSelfVote: !!row.allowSelfVote,
    votingMode: row.votingMode,
    resultsRevealedAt: row.resultsRevealedAt,
  };
}

export function setPhase(db: Database.Database, phase: ContestPhase): void {
  db.prepare('UPDATE Contest SET phase = ? WHERE id = 1').run(phase);
}

export function setVotingMode(db: Database.Database, mode: VotingMode): Contest {
  db.prepare('UPDATE Contest SET votingMode = ? WHERE id = 1').run(mode);
  return getContest(db);
}

export function startContest(db: Database.Database): Contest {
  const contest = getContest(db);
  if (contest.phase !== 'REGISTRATION') {
    throw new AppError(409, 'ALREADY_STARTED', 'El concurso ya ha empezado.');
  }
  setPhase(db, 'VOTING');
  return getContest(db);
}

export function setAllowSelfVote(db: Database.Database, allow: boolean): Contest {
  db.prepare('UPDATE Contest SET allowSelfVote = ? WHERE id = 1').run(allow ? 1 : 0);
  return getContest(db);
}

export function revealResults(db: Database.Database): Contest {
  const contest = getContest(db);
  if (contest.phase !== 'RESULTS') {
    throw new AppError(409, 'NOT_READY', 'Los resultados todavía no están listos para mostrarse.');
  }
  if (contest.resultsRevealedAt) {
    throw new AppError(409, 'ALREADY_REVEALED', 'Los resultados ya se han mostrado.');
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE Contest SET resultsRevealedAt = ? WHERE id = 1').run(now);
  return getContest(db);
}
