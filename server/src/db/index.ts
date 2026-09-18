import { createDb, type Db } from './connection';
import { config } from '../config';

// Assigned once connectDb() resolves, before the server starts accepting
// requests. Route/service modules import `db` as a live binding, so this
// value is up to date by the time any request handler runs it.
export let db: Db;

export async function connectDb(): Promise<void> {
  db = await createDb(config.dbUrl, config.dbAuthToken);
}
