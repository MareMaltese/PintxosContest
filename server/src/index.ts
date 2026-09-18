import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config';
import { db, connectDb } from './db';
import { getEntryImage } from './images/imageProcessor';
import { asyncHandler } from './middleware/asyncHandler';
import { contestRouter } from './routes/contest.routes';
import { entriesRouter } from './routes/entries.routes';
import { usersRouter } from './routes/users.routes';
import { votesRouter } from './routes/votes.routes';
import { medalVotesRouter } from './routes/medalVotes.routes';
import { tiebreakRouter } from './routes/tiebreak.routes';
import { resultsRouter } from './routes/results.routes';
import { adminRouter } from './routes/admin.routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(express.json());
app.get(
  '/uploads/:path',
  asyncHandler(async (req, res) => {
    const image = await getEntryImage(db, req.params.path);
    if (!image) {
      res.status(404).end();
      return;
    }
    res.set('Content-Type', image.mimeType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(image.data);
  })
);

app.use('/api/contest', contestRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/users', usersRouter);
app.use('/api/votes', votesRouter);
app.use('/api/medal-votes', medalVotesRouter);
app.use('/api/tiebreak', tiebreakRouter);
app.use('/api/results', resultsRouter);
app.use('/api/admin', adminRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Ese endpoint no existe.' });
});

// Only relevant when the frontend build is bundled alongside this server (e.g. running
// both from a single host). When the frontend is deployed separately (e.g. Vercel), this
// directory won't exist here and the server just serves the API on its own.
const clientDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (config.nodeEnv === 'production' && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

async function main(): Promise<void> {
  await connectDb();
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`${config.appName} escuchando en http://0.0.0.0:${config.port}`);
  });
}

main();
