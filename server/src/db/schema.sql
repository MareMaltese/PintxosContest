CREATE TABLE IF NOT EXISTS Contest (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  phase TEXT NOT NULL CHECK (phase IN ('REGISTRATION','VOTING','TIEBREAK','RESULTS')),
  allowSelfVote INTEGER NOT NULL DEFAULT 0,
  resultsRevealedAt TEXT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  lastSeen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Entry (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  creatorId TEXT NOT NULL REFERENCES User(id),
  name TEXT NULL,
  description TEXT NULL,
  imagePath TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Vote (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES User(id),
  entryId TEXT NOT NULL REFERENCES Entry(id),
  createdAt TEXT NOT NULL,
  UNIQUE (userId, entryId)
);

CREATE TABLE IF NOT EXISTS TiebreakRound (
  id TEXT PRIMARY KEY,
  roundNumber INTEGER NOT NULL,
  targetRank INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'MAIN' CHECK (kind IN ('MAIN','MEDAL')),
  status TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED')),
  createdAt TEXT NOT NULL,
  closedAt TEXT NULL
);

CREATE TABLE IF NOT EXISTS TiebreakCandidate (
  roundId TEXT NOT NULL REFERENCES TiebreakRound(id),
  entryId TEXT NOT NULL REFERENCES Entry(id),
  PRIMARY KEY (roundId, entryId)
);

CREATE TABLE IF NOT EXISTS TiebreakVote (
  id TEXT PRIMARY KEY,
  roundId TEXT NOT NULL REFERENCES TiebreakRound(id),
  userId TEXT NOT NULL REFERENCES User(id),
  entryId TEXT NOT NULL REFERENCES Entry(id),
  createdAt TEXT NOT NULL,
  UNIQUE (roundId, userId)
);

CREATE TABLE IF NOT EXISTS MedalVote (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES User(id),
  entryId TEXT NOT NULL REFERENCES Entry(id),
  medal TEXT NOT NULL CHECK (medal IN ('GOLD','SILVER','BRONZE')),
  createdAt TEXT NOT NULL,
  UNIQUE (userId, entryId),
  UNIQUE (userId, medal)
);
