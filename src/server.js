import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { migrate, pool, withTx } from './db.js';
import {
  cleanText,
  enumerateDates,
  httpError,
  normalizeTime,
  normalizeUrlList,
  optionalUrl,
  requiredText,
  toBoolean,
  validDate
} from './lib.js';

const app = express();
const port = Number(process.env.PORT || 8080);
const authDisabled = process.env.TRAVEL_AUTH_DISABLED === '1';
const adminPassword = process.env.TRAVEL_ADMIN_PASSWORD || '';
const sessionSecret = process.env.TRAVEL_SESSION_SECRET || '';
const cookieSecure = process.env.TRAVEL_COOKIE_SECURE === '1';
const categories = new Set(['交通', '景点', '餐饮', '住宿', '购物', '其他']);
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

if (!authDisabled && (!adminPassword || !sessionSecret)) {
  throw new Error('TRAVEL_ADMIN_PASSWORD and TRAVEL_SESSION_SECRET are required unless TRAVEL_AUTH_DISABLED=1');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

function idParam(value, field = 'ID') {
  if (!/^\d+$/.test(String(value))) throw httpError(400, `${field}无效`);
  return String(value);
}

function passwordMatches(input) {
  const a = crypto.createHash('sha256').update(String(input ?? '')).digest();
  const b = crypto.createHash('sha256').update(adminPassword).digest();
  return crypto.timingSafeEqual(a, b);
}

function sessionToken() {
  return crypto.createHmac('sha256', sessionSecret).update('travel-admin-session-v1').digest('base64url');
}

function readCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const index = part.indexOf('=');
        return index < 0 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function isAuthenticated(req) {
  if (authDisabled) return true;
  const actual = readCookies(req).travel_session || '';
  const expected = sessionToken();
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function setSessionCookie(res) {
  const parts = [
    `travel_session=${encodeURIComponent(sessionToken())}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=2592000'
  ];
  if (cookieSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

async function getTripAggregate(id) {
  const tripResult = await pool.query(
    `SELECT id, title, destination, start_date, end_date, notes, created_at, updated_at
       FROM trips WHERE id = $1`,
    [id]
  );
  if (!tripResult.rowCount) throw httpError(404, '旅行不存在');

  const [daysResult, itemsResult, todosResult] = await Promise.all([
    pool.query(
      `SELECT id, trip_id, day_date, title, notes, position
         FROM trip_days WHERE trip_id = $1 ORDER BY day_date, position, id`,
      [id]
    ),
    pool.query(
      `SELECT i.id, i.day_id, i.item_time, i.category, i.title, i.location, i.notes,
              i.xhs_url, i.dianping_url, i.image_urls, i.position, i.created_at, i.updated_at
         FROM itinerary_items i
         JOIN trip_days d ON d.id = i.day_id
        WHERE d.trip_id = $1
        ORDER BY d.day_date, NULLIF(i.item_time, '') NULLS LAST, i.position, i.id`,
      [id]
    ),
    pool.query(
      `SELECT id, trip_id, title, notes, due_date, done, position, created_at, updated_at
         FROM todos WHERE trip_id = $1
        ORDER BY done, due_date NULLS LAST, position, id`,
      [id]
    )
  ]);

  const itemsByDay = new Map();
  for (const item of itemsResult.rows) {
    const key = String(item.day_id);
    if (!itemsByDay.has(key)) itemsByDay.set(key, []);
    itemsByDay.get(key).push(item);
  }

  return {
    trip: tripResult.rows[0],
    days: daysResult.rows.map(day => ({ ...day, items: itemsByDay.get(String(day.id)) || [] })),
    todos: todosResult.rows
  };
}

async function createMissingDays(client, tripId, startDate, endDate) {
  const dates = enumerateDates(startDate, endDate);
  for (let index = 0; index < dates.length; index += 1) {
    await client.query(
      `INSERT INTO trip_days (trip_id, day_date, position)
       VALUES ($1, $2, $3)
       ON CONFLICT (trip_id, day_date) DO UPDATE SET position = EXCLUDED.position`,
      [tripId, dates[index], index]
    );
  }
}

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, version: process.env.TRAVEL_VERSION || 'dev' });
});

app.get('/api/auth', (req, res) => {
  res.json({ authenticated: isAuthenticated(req), authDisabled });
});

app.post('/api/login', (req, res) => {
  if (!authDisabled && !passwordMatches(req.body?.password)) {
    throw httpError(401, '密码错误');
  }
  if (!authDisabled) setSessionCookie(res);
  res.json({ ok: true });
});

app.post('/api/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'travel_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

app.use('/api', (req, _res, next) => {
  if (!isAuthenticated(req)) return next(httpError(401, '请先登录'));
  next();
});

app.get('/api/trips', async (_req, res) => {
  const result = await pool.query(`
    SELECT t.id, t.title, t.destination, t.start_date, t.end_date, t.notes,
           COUNT(DISTINCT i.id)::int AS item_count,
           COUNT(DISTINCT td.id) FILTER (WHERE td.done = false)::int AS todo_count
      FROM trips t
      LEFT JOIN trip_days d ON d.trip_id = t.id
      LEFT JOIN itinerary_items i ON i.day_id = d.id
      LEFT JOIN todos td ON td.trip_id = t.id
     GROUP BY t.id
     ORDER BY t.start_date DESC, t.id DESC
  `);
  res.json(result.rows);
});

app.post('/api/trips', async (req, res) => {
  const title = requiredText(req.body?.title, '旅行名称', 120);
  const destination = cleanText(req.body?.destination, 160);
  const startDate = validDate(req.body?.startDate, '开始');
  const endDate = validDate(req.body?.endDate, '结束');
  const notes = cleanText(req.body?.notes, 5000);
  enumerateDates(startDate, endDate);

  const id = await withTx(async client => {
    const result = await client.query(
      `INSERT INTO trips (title, destination, start_date, end_date, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [title, destination, startDate, endDate, notes]
    );
    await createMissingDays(client, result.rows[0].id, startDate, endDate);
    return result.rows[0].id;
  });

  res.status(201).json(await getTripAggregate(id));
});

app.get('/api/trips/:id', async (req, res) => {
  res.json(await getTripAggregate(idParam(req.params.id, '旅行 ID')));
});

app.put('/api/trips/:id', async (req, res) => {
  const id = idParam(req.params.id, '旅行 ID');
  const title = requiredText(req.body?.title, '旅行名称', 120);
  const destination = cleanText(req.body?.destination, 160);
  const startDate = validDate(req.body?.startDate, '开始');
  const endDate = validDate(req.body?.endDate, '结束');
  const notes = cleanText(req.body?.notes, 5000);
  enumerateDates(startDate, endDate);

  await withTx(async client => {
    const exists = await client.query('SELECT id FROM trips WHERE id = $1 FOR UPDATE', [id]);
    if (!exists.rowCount) throw httpError(404, '旅行不存在');

    const outside = await client.query(
      `SELECT d.id, d.day_date, COUNT(i.id)::int AS item_count
         FROM trip_days d
         LEFT JOIN itinerary_items i ON i.day_id = d.id
        WHERE d.trip_id = $1 AND (d.day_date < $2 OR d.day_date > $3)
        GROUP BY d.id, d.day_date`,
      [id, startDate, endDate]
    );
    const protectedDays = outside.rows.filter(row => row.item_count > 0);
    if (protectedDays.length) {
      throw httpError(409, '缩短日期范围前，请先移动或删除范围外的行程项', {
        dates: protectedDays.map(row => row.day_date)
      });
    }

    await client.query(
      `UPDATE trips
          SET title = $2, destination = $3, start_date = $4, end_date = $5, notes = $6, updated_at = now()
        WHERE id = $1`,
      [id, title, destination, startDate, endDate, notes]
    );
    await client.query(
      `DELETE FROM trip_days WHERE trip_id = $1 AND (day_date < $2 OR day_date > $3)`,
      [id, startDate, endDate]
    );
    await createMissingDays(client, id, startDate, endDate);
  });

  res.json(await getTripAggregate(id));
});

app.delete('/api/trips/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM trips WHERE id = $1', [idParam(req.params.id, '旅行 ID')]);
  if (!result.rowCount) throw httpError(404, '旅行不存在');
  res.status(204).end();
});

app.put('/api/days/:id', async (req, res) => {
  const id = idParam(req.params.id, '日期 ID');
  const title = cleanText(req.body?.title, 120);
  const notes = cleanText(req.body?.notes, 3000);
  const result = await pool.query(
    `UPDATE trip_days SET title = $2, notes = $3 WHERE id = $1 RETURNING *`,
    [id, title, notes]
  );
  if (!result.rowCount) throw httpError(404, '日期不存在');
  res.json(result.rows[0]);
});

app.post('/api/days/:dayId/items', async (req, res) => {
  const dayId = idParam(req.params.dayId, '日期 ID');
  const title = requiredText(req.body?.title, '行程标题', 160);
  const category = categories.has(req.body?.category) ? req.body.category : '其他';
  const itemTime = normalizeTime(req.body?.itemTime);
  const location = cleanText(req.body?.location, 240);
  const notes = cleanText(req.body?.notes, 5000);
  const xhsUrl = optionalUrl(req.body?.xhsUrl, '小红书链接');
  const dianpingUrl = optionalUrl(req.body?.dianpingUrl, '大众点评链接');
  const imageUrls = normalizeUrlList(req.body?.imageUrls || [], '图片链接', 12);
  const result = await pool.query(
    `INSERT INTO itinerary_items (day_id, item_time, category, title, location, notes, xhs_url, dianping_url, image_urls, position)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9,
            COALESCE((SELECT MAX(position) + 1 FROM itinerary_items WHERE day_id = $1), 0)
     WHERE EXISTS (SELECT 1 FROM trip_days WHERE id = $1)
     RETURNING *`,
    [dayId, itemTime, category, title, location, notes, xhsUrl, dianpingUrl, imageUrls]
  );
  if (!result.rowCount) throw httpError(404, '日期不存在');
  res.status(201).json(result.rows[0]);
});

app.put('/api/items/:id', async (req, res) => {
  const id = idParam(req.params.id, '行程项 ID');
  const title = requiredText(req.body?.title, '行程标题', 160);
  const category = categories.has(req.body?.category) ? req.body.category : '其他';
  const itemTime = normalizeTime(req.body?.itemTime);
  const location = cleanText(req.body?.location, 240);
  const notes = cleanText(req.body?.notes, 5000);
  const xhsUrl = optionalUrl(req.body?.xhsUrl, '小红书链接');
  const dianpingUrl = optionalUrl(req.body?.dianpingUrl, '大众点评链接');
  const imageUrls = normalizeUrlList(req.body?.imageUrls || [], '图片链接', 12);
  const result = await pool.query(
    `UPDATE itinerary_items
        SET item_time = $2, category = $3, title = $4, location = $5, notes = $6,
            xhs_url = $7, dianping_url = $8, image_urls = $9, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [id, itemTime, category, title, location, notes, xhsUrl, dianpingUrl, imageUrls]
  );
  if (!result.rowCount) throw httpError(404, '行程项不存在');
  res.json(result.rows[0]);
});

app.delete('/api/items/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM itinerary_items WHERE id = $1', [idParam(req.params.id, '行程项 ID')]);
  if (!result.rowCount) throw httpError(404, '行程项不存在');
  res.status(204).end();
});

app.post('/api/trips/:tripId/todos', async (req, res) => {
  const tripId = idParam(req.params.tripId, '旅行 ID');
  const title = requiredText(req.body?.title, '待办标题', 200);
  const notes = cleanText(req.body?.notes, 3000);
  const dueDate = req.body?.dueDate ? validDate(req.body.dueDate, '截止') : null;
  const result = await pool.query(
    `INSERT INTO todos (trip_id, title, notes, due_date, position)
     SELECT $1, $2, $3, $4,
            COALESCE((SELECT MAX(position) + 1 FROM todos WHERE trip_id = $1), 0)
     WHERE EXISTS (SELECT 1 FROM trips WHERE id = $1)
     RETURNING *`,
    [tripId, title, notes, dueDate]
  );
  if (!result.rowCount) throw httpError(404, '旅行不存在');
  res.status(201).json(result.rows[0]);
});

app.put('/api/todos/:id', async (req, res) => {
  const id = idParam(req.params.id, '待办 ID');
  const title = requiredText(req.body?.title, '待办标题', 200);
  const notes = cleanText(req.body?.notes, 3000);
  const dueDate = req.body?.dueDate ? validDate(req.body.dueDate, '截止') : null;
  const done = toBoolean(req.body?.done);
  const result = await pool.query(
    `UPDATE todos
        SET title = $2, notes = $3, due_date = $4, done = $5, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [id, title, notes, dueDate, done]
  );
  if (!result.rowCount) throw httpError(404, '待办不存在');
  res.json(result.rows[0]);
});

app.delete('/api/todos/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM todos WHERE id = $1', [idParam(req.params.id, '待办 ID')]);
  if (!result.rowCount) throw httpError(404, '待办不存在');
  res.status(204).end();
});

app.use(express.static(publicDir, { maxAge: '1h', index: 'index.html' }));
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(publicDir, 'index.html'));
  }
  next();
});

app.use((error, req, res, _next) => {
  const status = Number(error.status || 500);
  if (status >= 500) console.error(error);
  res.status(status).json({
    error: status >= 500 ? '服务器内部错误' : error.message,
    ...(error.details !== undefined ? { details: error.details } : {})
  });
});

await migrate();
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`travel listening on :${port}`);
});

async function shutdown(signal) {
  console.log(`received ${signal}, shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
