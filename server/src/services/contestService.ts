import type { Db } from '../db/connection';
import { AppError } from '../middleware/errors';

export type ContestPhase = 'REGISTRATION' | 'VOTING' | 'TIEBREAK' | 'RESULTS';
export type VotingMode = 'FAVORITES' | 'MEDALS';

export interface Contest {
  phase: ContestPhase;
  allowSelfVote: boolean;
  votingMode: VotingMode;
  resultsRevealedAt: string | null;
  worstPrizeEnabled: boolean;
}

interface ContestRow {
  phase: ContestPhase;
  allowSelfVote: number;
  votingMode: VotingMode;
  resultsRevealedAt: string | null;
  worstPrizeEnabled: number;
}

export async function getContest(db: Db): Promise<Contest> {
  const row = (await db
    .prepare('SELECT phase, allowSelfVote, votingMode, resultsRevealedAt, worstPrizeEnabled FROM Contest WHERE id = 1')
    .get()) as unknown as ContestRow;
  return {
    phase: row.phase,
    allowSelfVote: !!row.allowSelfVote,
    votingMode: row.votingMode,
    resultsRevealedAt: row.resultsRevealedAt,
    worstPrizeEnabled: !!row.worstPrizeEnabled,
  };
}

export async function setPhase(db: Db, phase: ContestPhase): Promise<void> {
  await db.prepare('UPDATE Contest SET phase = ? WHERE id = 1').run(phase);
}

export async function setVotingMode(db: Db, mode: VotingMode): Promise<Contest> {
  await db.prepare('UPDATE Contest SET votingMode = ? WHERE id = 1').run(mode);
  return getContest(db);
}

export async function startContest(db: Db): Promise<Contest> {
  const contest = await getContest(db);
  if (contest.phase !== 'REGISTRATION') {
    throw new AppError(409, 'ALREADY_STARTED', 'El concurso ya ha empezado.');
  }
  await setPhase(db, 'VOTING');
  return getContest(db);
}

export async function setAllowSelfVote(db: Db, allow: boolean): Promise<Contest> {
  await db.prepare('UPDATE Contest SET allowSelfVote = ? WHERE id = 1').run(allow ? 1 : 0);
  return getContest(db);
}

export async function setWorstPrizeEnabled(db: Db, enabled: boolean): Promise<Contest> {
  await db.prepare('UPDATE Contest SET worstPrizeEnabled = ? WHERE id = 1').run(enabled ? 1 : 0);
  return getContest(db);
}

export async function revealResults(db: Db): Promise<Contest> {
  const contest = await getContest(db);
  if (contest.phase !== 'RESULTS') {
    throw new AppError(409, 'NOT_READY', 'Los resultados todavía no están listos para mostrarse.');
  }
  if (contest.resultsRevealedAt) {
    throw new AppError(409, 'ALREADY_REVEALED', 'Los resultados ya se han mostrado.');
  }
  const now = new Date().toISOString();
  await db.prepare('UPDATE Contest SET resultsRevealedAt = ? WHERE id = 1').run(now);
  return getContest(db);
}

export async function reopenVoting(db: Db): Promise<Contest> {
  const contest = await getContest(db);
  if (contest.phase !== 'RESULTS') {
    throw new AppError(409, 'NOT_IN_RESULTS', 'El concurso no está en la fase de resultados.');
  }
  await db.prepare('UPDATE Contest SET phase = ?, resultsRevealedAt = NULL WHERE id = 1').run('VOTING');
  return getContest(db);
}

export async function backToRegistration(db: Db): Promise<Contest> {
  const contest = await getContest(db);
  if (contest.phase === 'REGISTRATION') {
    throw new AppError(409, 'ALREADY_REGISTRATION', 'El concurso ya está en fase de registro.');
  }
  await db.prepare('UPDATE Contest SET phase = ?, resultsRevealedAt = NULL WHERE id = 1').run('REGISTRATION');
  return getContest(db);
}
