import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enumerateDates,
  normalizeCoordinate,
  normalizeLinkUrls,
  normalizeTime,
  normalizeTimeRange,
  normalizeUrlList,
  optionalUrl
} from '../src/lib.js';
import { extractHtmlTitle, isPrivateAddress } from '../src/link-preview.js';

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

test('normalizeTimeRange supports point and range times', () => {
  assert.deepEqual(normalizeTimeRange('09:30', ''), { startTime: '09:30', endTime: '' });
  assert.deepEqual(normalizeTimeRange('09:30', '11:00'), { startTime: '09:30', endTime: '11:00' });
  assert.throws(() => normalizeTimeRange('', '11:00'));
  assert.throws(() => normalizeTimeRange('12:00', '11:00'));
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

test('normalizeLinkUrls accepts URL objects and deduplicates', () => {
  assert.deepEqual(
    normalizeLinkUrls([{ url: 'https://example.com/a' }, 'https://example.com/a', 'https://example.com/b']),
    ['https://example.com/a', 'https://example.com/b']
  );
});

test('coordinates validate legal ranges', () => {
  assert.equal(normalizeCoordinate('30.274084', '纬度', -90, 90), 30.274084);
  assert.equal(normalizeCoordinate('', '纬度', -90, 90), null);
  assert.throws(() => normalizeCoordinate('100', '纬度', -90, 90));
});

test('HTML title extraction prefers Open Graph title', () => {
  assert.equal(
    extractHtmlTitle('<html><head><title>Fallback</title><meta property="og:title" content="景点 · 推荐" /></head></html>'),
    '景点 · 推荐'
  );
  assert.equal(extractHtmlTitle('<title> Hello &amp; Travel </title>'), 'Hello & Travel');
});

test('private address detection blocks local networks', () => {
  assert.equal(isPrivateAddress('127.0.0.1'), true);
  assert.equal(isPrivateAddress('192.168.1.1'), true);
  assert.equal(isPrivateAddress('10.0.0.1'), true);
  assert.equal(isPrivateAddress('::1'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
});
