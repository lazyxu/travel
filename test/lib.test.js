import test from 'node:test';
import assert from 'node:assert/strict';
import { enumerateDates, normalizeTime, optionalUrl } from '../src/lib.js';

test('enumerateDates includes both ends', () => {
  assert.deepEqual(enumerateDates('2026-10-01', '2026-10-03'), ['2026-10-01', '2026-10-02', '2026-10-03']);
});

test('enumerateDates rejects reversed ranges', () => {
  assert.throws(() => enumerateDates('2026-10-03', '2026-10-01'));
});

test('normalizeTime validates HH:MM', () => {
  assert.equal(normalizeTime('09:30'), '09:30');
  assert.throws(() => normalizeTime('25:00'));
});

test('optionalUrl only accepts http(s)', () => {
  assert.equal(optionalUrl('', '链接'), '');
  assert.match(optionalUrl('https://www.xiaohongshu.com/explore/1', '链接'), /^https:/);
  assert.throws(() => optionalUrl('javascript:alert(1)', '链接'));
});
