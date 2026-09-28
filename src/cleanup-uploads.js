import { pool } from './db.js';
import { cleanupOrphanUploads } from './storage.js';

const dryRun = process.argv.includes('--dry-run');
const includeRecent = process.argv.includes('--all');
try {
  const result = await cleanupOrphanUploads({
    dryRun,
    minAgeMs: includeRecent ? 0 : 24 * 60 * 60 * 1000
  });
  console.log(JSON.stringify(result));
} finally {
  await pool.end();
}
