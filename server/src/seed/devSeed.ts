import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createDb } from '../db/connection';
import { config } from '../config';
import { createUser } from '../services/userService';
import { createEntry } from '../services/entryService';
import { startContest } from '../services/contestService';
import { addVote } from '../services/voteService';

if (config.nodeEnv === 'production') {
  console.error('El seed de desarrollo no se ejecuta en producción.');
  process.exit(1);
}

const FIRST_NAMES = [
  'Laura', 'Miguel', 'Ana', 'Carlos', 'Sara', 'Diego', 'Marta', 'Pablo', 'Lucía', 'Javier',
  'Elena', 'Hugo', 'Claudia', 'Adrián', 'Nuria', 'Álvaro', 'Marina', 'Rubén', 'Irene', 'Óscar',
];

async function placeholderImage(index: number): Promise<string> {
  const hue = (index * 47) % 360;
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  const filename = `${randomUUID()}.webp`;
  await sharp({
    create: { width: 800, height: 800, channels: 3, background: `hsl(${hue}, 60%, 55%)` },
  })
    .webp({ quality: 70 })
    .toFile(path.join(config.uploadsDir, filename));
  return filename;
}

async function main() {
  const db = await createDb(config.dbUrl, config.dbAuthToken);

  const userIds: string[] = [];
  for (const name of FIRST_NAMES) {
    const user = await createUser(db, name);
    userIds.push(user.id);
  }

  const entryIds: string[] = [];
  for (let i = 0; i < 18; i++) {
    const creatorId = userIds[i % 15];
    const imagePath = await placeholderImage(i);
    const entry = await createEntry(db, {
      creatorId,
      name: i % 3 === 0 ? null : `Tapa de prueba ${i + 1}`,
      description: 'Descripción de ejemplo generada por el seed de desarrollo.',
      imagePath,
    });
    entryIds.push(entry.id);
  }

  await startContest(db);

  for (const userId of userIds) {
    const votable: string[] = [];
    for (const id of entryIds) {
      const row = (await db.prepare('SELECT creatorId FROM Entry WHERE id = ?').get(id)) as unknown as {
        creatorId: string;
      };
      if (row.creatorId !== userId) votable.push(id);
    }
    const shuffled = votable.sort(() => Math.random() - 0.5).slice(0, 3);
    for (const entryId of shuffled) {
      await addVote(db, userId, entryId);
    }
  }

  console.log('Datos de prueba generados: 20 participantes, 18 tapas y votos aleatorios (fase VOTING).');
}

main();
