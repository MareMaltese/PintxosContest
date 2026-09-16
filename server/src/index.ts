import path from 'node:path';
import express from 'express';
import { config } from './config';
import { contestRouter } from './routes/contest.routes';
import { entriesRouter } from './routes/entries.routes';
import { usersRouter } from './routes/users.routes';
import { votesRouter } from './routes/votes.routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(express.json());
app.use('/uploads', express.static(config.uploadsDir));

app.use('/api/contest', contestRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/users', usersRouter);
app.use('/api/votes', votesRouter);

if (config.nodeEnv === 'production') {
  const clientDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(config.port, '0.0.0.0', () => {
  console.log(`${config.appName} escuchando en http://0.0.0.0:${config.port}`);
});
