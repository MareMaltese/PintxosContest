import path from 'node:path';

export const APP_NAME = 'Pincho Party';

export const config = {
  appName: APP_NAME,
  port: Number(process.env.PORT ?? 3000),
  adminPin: process.env.ADMIN_PIN ?? '0000',
  dbPath: process.env.DB_PATH ?? path.join(__dirname, '..', 'data', 'pincho-party.db'),
  uploadsDir: process.env.UPLOADS_DIR ?? path.join(__dirname, '..', 'uploads'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
};
