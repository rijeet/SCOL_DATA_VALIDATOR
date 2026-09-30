import pg from 'pg';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

const root = path.resolve(import.meta.dirname, '..');
const envLocal = path.join(root, '.env.local');
const env = path.join(root, '.env');
if (fs.existsSync(envLocal)) config({ path: envLocal });
else if (fs.existsSync(env)) config({ path: env });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const tables = await client.query(
  `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
);
console.log('table_count', tables.rows.length);
console.log(
  'sample',
  tables.rows.slice(0, 15).map((r) => r.tablename).join(', '),
);
const mig = await client.query(`SELECT id, timestamp, name FROM migrations ORDER BY id`).catch(
  () => ({ rows: [] }),
);
console.log('migrations', mig.rows);
await client.end();
