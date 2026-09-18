import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export const APP_NAME = 'Pincho Party';

export const config = {
  appName: APP_NAME,
  port: Number(process.env.PORT ?? 3000),
  adminPin: process.env.ADMIN_PIN ?? '0000',
  dbUrl: process.env.TURSO_DATABASE_URL ?? `file:${path.join(__dirname, '..', 'data', 'pincho-party.db')}`,
  dbAuthToken: process.env.TURSO_AUTH_TOKEN,
  uploadsDir: process.env.UPLOADS_DIR ?? path.join(__dirname, '..', 'uploads'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
};
