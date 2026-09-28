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
      details: {
        kind: 'dining',
        selectedCandidateId: '',
        candidates: [
          { id: 'food-a', name: '餐厅A', address: '杭州市A路', locationUid: 'food-a-uid', latitude: 30.31, longitude: 120.21, coordType: 'bd09ll' },
          { id: 'food-b', name: '餐厅B', address: '杭州市B路', locationUid: 'food-b-uid', latitude: 30.32, longitude: 120.22, coordType: 'bd09ll' }
        ]
      },
      expense: {
        amount: 88,
        category: '餐饮',
        paid: false
      }
    })
  });
  assert.equal(Number(second.expense.amount), 88);
  assert.equal(String(second.expense.item_id), String(second.id));
  assert.equal(second.location_name, '餐厅A');
  assert.equal(second.location_uid, 'food-a-uid');
  assert.equal(second.details.candidates[0].name, '餐厅A');

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
  const selectedDining = await json(`/api/items/${second.id}/dining-selection`, {
    method: 'PUT',
    body: JSON.stringify({ candidateId: 'food-b' })
  });
  assert.equal(selectedDining.details.selectedCandidateId, 'food-b');
  assert.equal(selectedDining.details.candidates[0].id, 'food-b');
  assert.equal(selectedDining.location_name, '餐厅B');

  await json(`/api/items/${first.id}/move`, {
    method: 'PUT',
    body: JSON.stringify({ targetDayId: day2.id, position: 0 })
  });

  await json(`/api/days/${day2.id}`, {
    method: 'PUT',
    body: JSON.stringify({ title: 'Day Two', notes: '' })
  });

  aggregate = await json(`/api/trips/${created.trip.id}`);
  currentDay1 = aggregate.days.find(day => String(day.id) === String(day1.id));
  const currentDay2 = aggregate.days.find(day => String(day.id) === String(day2.id));
  assert.deepEqual(currentDay1.items.map(item => item.title), ['Second']);
  assert.deepEqual(currentDay2.items.map(item => item.title), ['First']);
  assert.equal(currentDay2.items[0].details.kind, 'flight');
  assert.equal(currentDay2.items[0].location_name, '西湖');
  assert.equal(currentDay2.items[0].location_uid, 'poi-west-lake');
  assert.equal(currentDay2.items[0].links[0].title, '自定义参考标题');
  assert.equal(aggregate.trip.currency, 'CNY');
  assert.equal(Number(aggregate.trip.budget_total), 12000);

  const hotel = await json(`/api/days/${day2.id}/items`, {
    method: 'POST',
    body: JSON.stringify({
      startTime: '20:00',
      endTime: '',
      category: '住宿',
      title: 'Hotel Link Test',
      locationName: '杭州测试酒店',
      location: '杭州市',
      notes: '',
      references: [],
      imageUrls: [],
      details: {
        kind: 'lodging',
        hotelName: '杭州测试酒店',
        checkInDate: '2026-10-02',
        checkOutDate: '2026-10-03',
        bookingPlatform: '华住会',
        bookingUrl: 'https://www.hworld.com/hotel/123'
      }
    })
  });
  assert.equal(hotel.details.bookingPlatform, '华住会');
  assert.match(hotel.details.bookingUrl, /^https:\/\//);

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
  assert.equal(aggregate.expenses.length, 2);
  const atomicExpense = aggregate.expenses.find(value => String(value.item_id) === String(second.id));
  assert.equal(Number(atomicExpense.amount), 88);
  const westLakeExpense = aggregate.expenses.find(value => String(value.id) === String(expense.id));
  assert.equal(westLakeExpense.title, 'West Lake ticket');
  assert.equal(String(westLakeExpense.item_id), String(first.id));

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
  assert.ok(version.schemaVersion >= 3);

  const share = await json(`/api/trips/${created.trip.id}/shares`, {
    method: 'POST',
    body: JSON.stringify({
      settings: { notes: false, images: true, links: true, hotelPhone: false, expenses: true }
    })
  });
  assert.match(share.path, /^\/share\/[A-Za-z0-9_-]+$/);
  const shareToken = share.path.split('/').pop();
  const publicTrip = await json(`/api/public/share/${shareToken}`);
  assert.equal(publicTrip.trip.title, 'Integration Trip');
  assert.equal(publicTrip.expenses.length, 2);
  assert.equal(publicTrip.trip.notes, '');
  assert.deepEqual(publicTrip.todos, []);
  const activeShares = await json(`/api/trips/${created.trip.id}/shares`);
  assert.equal(activeShares.length, 1);
  assert.equal(activeShares[0].settings.expenses, true);
  const updatedShare = await json(`/api/shares/${share.id}/settings`, {
    method: 'PUT',
    body: JSON.stringify({ settings: { images: false, links: false, notes: false, hotelPhone: false, expenses: false } })
  });
  assert.equal(updatedShare.settings.images, false);
  const publicAfterPrivacy = await json(`/api/public/share/${shareToken}`);
  assert.deepEqual(publicAfterPrivacy.expenses, []);
  assert.deepEqual(publicAfterPrivacy.days.flatMap(day => day.items).flatMap(item => item.links || []), []);
  const publicHotelAfterPrivacy = publicAfterPrivacy.days
    .flatMap(day => day.items)
    .find(item => item.title === 'Hotel Link Test');
  assert.equal(publicHotelAfterPrivacy.details.bookingUrl, undefined);

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

  const analyzedMap = await json('/api/links/analyze', {
    method: 'POST',
    body: JSON.stringify({
      value: 'https://api.map.baidu.com/marker?location=30.25,120.15&title=%E8%A5%BF%E6%B9%96&content=%E6%9D%AD%E5%B7%9E&coord_type=bd09ll&output=html&src=test',
      context: 'reference',
      region: '杭州'
    })
  });
  assert.equal(analyzedMap.type, 'location');
  assert.equal(analyzedMap.analysis.platform, 'baidu');
  assert.equal(analyzedMap.location.name, '西湖');
  assert.deepEqual(
    { lat: analyzedMap.location.latitude, lng: analyzedMap.location.longitude },
    { lat: 30.25, lng: 120.15 }
  );

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
