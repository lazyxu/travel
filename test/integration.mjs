import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const port = 18080;
const base = `http://127.0.0.1:${port}`;
const uploadDir = await mkdtemp(path.join(os.tmpdir(), 'travel-uploads-'));
const child = spawn(process.execPath, ['src/server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    TRAVEL_AUTH_DISABLED: '1',
    TRAVEL_UPLOAD_DIR: uploadDir,
    TRAVEL_VERSION: 'integration-test'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });

async function waitForHealth() {
  for (let i = 0; i < 60; i += 1) {
    if (child.exitCode !== null) throw new Error(`server exited early: ${output}`);
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`server did not become healthy: ${output}`);
}

async function json(url, options = {}) {
  const response = await fetch(`${base}${url}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${response.status} ${url}: ${text}`);
  return payload;
}

try {
  const health = await waitForHealth();
  assert.equal(health.ok, true);
  assert.equal(health.uploadsReady, true);

  const created = await json('/api/trips', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Integration Trip',
      destination: '杭州',
      startDate: '2026-10-01',
      endDate: '2026-10-02',
      notes: '',
      budgetTotal: 12000,
      currency: 'CNY'
    })
  });
  assert.equal(created.days.length, 2);
  const [day1, day2] = created.days;

  const first = await json(`/api/days/${day1.id}/items`, {
    method: 'POST',
    body: JSON.stringify({
      startTime: '09:00',
      endTime: '10:00',
      category: '景点',
      title: 'First',
      locationName: '西湖',
      locationUid: 'poi-west-lake',
      location: 'West Lake',
      latitude: 30.25,
      longitude: 120.15,
      coordType: 'bd09ll',
      notes: '',
      references: [{ value: 'https://example.com/reference', title: '自定义参考标题' }],
      imageUrls: [],
      details: {
        kind: 'flight',
        airline: 'China Eastern',
        flightNo: 'MU5123',
        departureAirport: '杭州萧山',
        arrivalAirport: '北京首都',
        seat: '21A'
      }
    })
  });

  const second = await json(`/api/days/${day1.id}/items`, {
    method: 'POST',
    body: JSON.stringify({
      startTime: '11:00',
      endTime: '',
      category: '餐饮',
      title: 'Second',
      location: '',
      notes: '',
      references: [],
      imageUrls: [],
      expense: {
        amount: 88,
        category: '餐饮',
        paid: false
      }
    })
  });
  assert.equal(Number(second.expense.amount), 88);
  assert.equal(String(second.expense.item_id), String(second.id));

  await json(`/api/days/${day1.id}/items/order`, {
    method: 'PUT',
    body: JSON.stringify({ itemIds: [String(second.id), String(first.id)] })
  });

  const legModeResult = await json(`/api/days/${day1.id}/leg-mode`, {
    method: 'PUT',
    body: JSON.stringify({
      fromKey: `item:${second.id}`,
      toKey: `item:${first.id}`,
      mode: 'walking'
    })
  });
  assert.equal(legModeResult.legModes[`item:${second.id}>item:${first.id}`], 'walking');

  let aggregate = await json(`/api/trips/${created.trip.id}`);
  let currentDay1 = aggregate.days.find(day => String(day.id) === String(day1.id));
  assert.deepEqual(currentDay1.items.map(item => item.title), ['Second', 'First']);
  assert.equal(currentDay1.leg_modes[`item:${second.id}>item:${first.id}`], 'walking');

  await json(`/api/items/${first.id}/move`, {
    method: 'PUT',
    body: JSON.stringify({ targetDayId: day2.id, position: 0 })
  });

  await json(`/api/days/${day2.id}`, {
    method: 'PUT',
    body: JSON.stringify({ title: 'Day Two', notes: '', routeMode: 'walking' })
  });

  aggregate = await json(`/api/trips/${created.trip.id}`);
  currentDay1 = aggregate.days.find(day => String(day.id) === String(day1.id));
  const currentDay2 = aggregate.days.find(day => String(day.id) === String(day2.id));
  assert.deepEqual(currentDay1.items.map(item => item.title), ['Second']);
  assert.deepEqual(currentDay2.items.map(item => item.title), ['First']);
  assert.equal(currentDay2.route_mode, 'walking');
  assert.equal(currentDay2.items[0].details.kind, 'flight');
  assert.equal(currentDay2.items[0].location_name, '西湖');
  assert.equal(currentDay2.items[0].location_uid, 'poi-west-lake');
  assert.equal(currentDay2.items[0].links[0].title, '自定义参考标题');
  assert.equal(aggregate.trip.currency, 'CNY');
  assert.equal(Number(aggregate.trip.budget_total), 12000);

  const expense = await json(`/api/trips/${created.trip.id}/expenses`, {
    method: 'POST',
    body: JSON.stringify({
      title: 'West Lake ticket',
      amount: 1280,
      category: '住宿',
      expenseDate: '2026-10-02',
      itemId: first.id,
      paid: true,
      notes: 'prepaid'
    })
  });
  assert.equal(Number(expense.amount), 1280);
  assert.equal(expense.paid, true);

  aggregate = await json(`/api/trips/${created.trip.id}`);
  assert.equal(aggregate.expenses.length, 1);
  assert.equal(aggregate.expenses[0].title, 'West Lake ticket');
  assert.equal(String(aggregate.expenses[0].item_id), String(first.id));

  await json(`/api/expenses/${expense.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      title: 'West Lake ticket revised',
      amount: 1300,
      category: '住宿',
      expenseDate: '2026-10-02',
      itemId: first.id,
      paid: true,
      notes: ''
    })
  });

  const version = await json('/api/version');
  assert.equal(version.schemaVersion, version.latestSchemaVersion);
  assert.ok(version.schemaVersion >= 2);

  const share = await json(`/api/trips/${created.trip.id}/shares`, {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.match(share.path, /^\/share\/[A-Za-z0-9_-]+$/);
  const shareToken = share.path.split('/').pop();
  const publicTrip = await json(`/api/public/share/${shareToken}`);
  assert.equal(publicTrip.trip.title, 'Integration Trip');
  assert.deepEqual(publicTrip.expenses, []);
  assert.deepEqual(publicTrip.todos, []);

  const revokeResponse = await fetch(`${base}/api/shares/${share.id}`, { method: 'DELETE' });
  assert.equal(revokeResponse.status, 204);
  const revokedResponse = await fetch(`${base}/api/public/share/${shareToken}`);
  assert.equal(revokedResponse.status, 404);

  const orphanPath = path.join(uploadDir, 'orphan-test.jpg');
  await writeFile(orphanPath, Buffer.from([1, 2, 3]));
  const cleanup = await json('/api/maintenance/uploads/cleanup', {
    method: 'POST',
    body: JSON.stringify({ includeRecent: true })
  });
  assert.ok(cleanup.deleted >= 1);

  const parsedMap = await json('/api/baidu/parse-link', {
    method: 'POST',
    body: JSON.stringify({
      value: 'https://api.map.baidu.com/marker?location=30.25,120.15&title=%E8%A5%BF%E6%B9%96&content=%E6%9D%AD%E5%B7%9E&coord_type=bd09ll&output=html&src=test',
      region: '杭州'
    })
  });
  assert.deepEqual(parsedMap.location, { lat: 30.25, lng: 120.15 });
  assert.equal(parsedMap.name, '西湖');

  const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const uploadResponse = await fetch(`${base}/api/uploads/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: imageBytes
  });
  assert.equal(uploadResponse.status, 201);
  const uploaded = await uploadResponse.json();
  assert.match(uploaded.url, /^\/uploads\/.*\.jpg$/);

  const stored = await readFile(path.join(uploadDir, path.basename(uploaded.url)));
  assert.deepEqual(stored, imageBytes);

  const imageResponse = await fetch(`${base}${uploaded.url}`);
  assert.equal(imageResponse.status, 200);
  assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), imageBytes);

  const deepRouteResponse = await fetch(`${base}/trips/${created.trip.id}/day/${day2.id}`);
  assert.equal(deepRouteResponse.status, 200);
  assert.match(await deepRouteResponse.text(), /旅行计划/);

  console.log('integration smoke test: OK');
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 3000).unref();
  });
  await rm(uploadDir, { recursive: true, force: true });
}
