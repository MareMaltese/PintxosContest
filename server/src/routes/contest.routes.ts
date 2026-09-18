import { Router } from 'express';
import { db } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { getContest } from '../services/contestService';
import { addClient, removeClient } from '../realtime/sse';

export const contestRouter = Router();

contestRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getContest(db));
  })
);

contestRouter.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');
  addClient(res);
  req.on('close', () => removeClient(res));
});
