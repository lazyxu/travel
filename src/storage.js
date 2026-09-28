import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from './db.js';

const SAFE_UPLOAD_NAME = /^[a-zA-Z0-9._-]+$/;

export function uploadNameFromReference(value) {
  const match = String(value || '').match(/^\/uploads\/([a-zA-Z0-9._-]+)$/);
  return match ? match[1] : '';
}

export async function referencedUploadNames() {
  const result = await pool.query('SELECT image_urls FROM itinerary_items');
  const names = new Set();
  for (const row of result.rows) {
    for (const value of row.image_urls || []) {
      const name = uploadNameFromReference(value);
      if (name) names.add(name);
    }
  }
  return names;
}

export async function cleanupOrphanUploads({
  uploadDir = process.env.TRAVEL_UPLOAD_DIR || '/data/uploads',
  minAgeMs = 24 * 60 * 60 * 1000,
  dryRun = false
} = {}) {
  const referenced = await referencedUploadNames();
  let entries = [];
  try {
    entries = await fs.readdir(uploadDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return { scanned: 0, referenced: referenced.size, orphaned: 0, deleted: 0, bytes: 0, files: [] };
    throw error;
  }

  const now = Date.now();
  const files = [];
  let bytes = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !SAFE_UPLOAD_NAME.test(entry.name) || referenced.has(entry.name)) continue;
    const fullPath = path.join(uploadDir, entry.name);
    const stat = await fs.stat(fullPath);
    if (now - stat.mtimeMs < minAgeMs) continue;
    files.push(entry.name);
    bytes += stat.size;
    if (!dryRun) await fs.unlink(fullPath);
  }

  return {
    scanned: entries.filter(entry => entry.isFile()).length,
    referenced: referenced.size,
    orphaned: files.length,
    deleted: dryRun ? 0 : files.length,
    bytes,
    files
  };
}
