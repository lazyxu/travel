import test from 'node:test';
import assert from 'node:assert/strict';
import { enumerateDates, normalizeTime, normalizeUrlList, optionalUrl } from '../src/lib.js';

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


test('normalizeUrlList normalizes image URL lists', () => {
  assert.deepEqual(
    normalizeUrlList(['https://example.com/a.jpg', 'https://example.com/a.jpg', 'https://example.com/b.jpg'], '图片链接'),
    ['https://example.com/a.jpg', 'https://example.com/b.jpg']
  );
  assert.throws(() => normalizeUrlList(['javascript:alert(1)'], '图片链接'));
  assert.throws(() => normalizeUrlList(Array.from({ length: 13 }, (_, i) => `https://example.com/${i}.jpg`), '图片链接'));
});
