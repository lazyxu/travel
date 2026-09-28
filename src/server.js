import crypto from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { migrate, migrationStatus, pool, withTx } from './db.js';
import {
  cleanText,
  enumerateDates,
  httpError,
  normalizeCoordType,
  normalizeCoordinate,
  normalizeCurrency,
  normalizeItemDetails,
  normalizeMoney,
  normalizeReferences,
  normalizeRouteMode,
  normalizeTimeRange,
  normalizeUrlList,
  optionalUrl,
  requiredText,
  toBoolean,
  validDate
} from './lib.js';
import { deriveHotelName, detectBookingPlatform, platformLabel, resolveReferenceMetadata } from './link-preview.js';
import { isAllowedBaiduMapUrl, resolveBaiduMapLink, searchBaiduPoi } from './baidu.js';
import { cleanupOrphanUploads } from './storage.js';
import { analyzeOrderText } from './order-parser.js';

const app = express();
const port = Number(process.env.PORT || 8080);
const authDisabled = process.env.TRAVEL_AUTH_DISABLED === '1';
const adminPassword = process.env.TRAVEL_ADMIN_PASSWORD || '';
const sessionSecret = process.env.TRAVEL_SESSION_SECRET || '';
const cookieSecure = process.env.TRAVEL_COOKIE_SECURE === '1';
const baiduMapAk = process.env.TRAVEL_BAIDU_MAP_AK || '';
const uploadDir = process.env.TRAVEL_UPLOAD_DIR || '/data/uploads';
let uploadsReady = false;
const categories = new Set(['交通', '景点', '餐饮', '住宿', '购物', '其他']);
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const buildInfo = {
  channel: process.env.TRAVEL_VERSION || 'dev',
  commit: process.env.TRAVEL_BUILD_COMMIT || 'unknown',
  message: process.env.TRAVEL_BUILD_MESSAGE || 'unknown',
  commitTime: process.env.TRAVEL_BUILD_COMMIT_TIME || 'unknown',
  buildTime: process.env.TRAVEL_BUILD_TIME || 'unknown'
};

if (!authDisabled && (!adminPassword || !sessionSecret)) {
  throw new Error('TRAVEL_ADMIN_PASSWORD and TRAVEL_SESSION_SECRET are required unless TRAVEL_AUTH_DISABLED=1');
}

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

async function prepareUploadDir() {
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.access(uploadDir, fsConstants.W_OK);
    uploadsReady = true;
    console.log(`[travel] upload directory ready: ${uploadDir}`);
  } catch (error) {
    uploadsReady = false;
    console.error(`[travel] upload directory unavailable: ${uploadDir}: ${error.code || 'ERROR'} ${error.message}`);
    console.error('[travel] image upload is disabled, but the main application will continue to run');
  }
}

function hashShareToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function shareTokenParam(value) {
  const token = String(value || '');
  if (!/^[A-Za-z0-9_-]{20,160}$/.test(token)) throw httpError(404, '分享链接无效');
  return token;
}

const SHARE_DEFAULTS = Object.freeze({
  notes: false,
  images: true,
  links: true,
  hotelPhone: false,
  expenses: false
});

function normalizeShareSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    Object.entries(SHARE_DEFAULTS).map(([key, fallback]) => [
      key,
      source[key] === undefined ? fallback : toBoolean(source[key])
    ])
  );
}

async function shareAccess(token) {
  const result = await pool.query(
    `SELECT id, trip_id, settings, created_at
       FROM trip_shares
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashShareToken(token)]
  );
  if (!result.rowCount) throw httpError(404, '分享链接不存在或已失效');
  return {
    ...result.rows[0],
    settings: normalizeShareSettings(result.rows[0].settings)
  };
}

async function publicTripAggregate(token) {
  const access = await shareAccess(token);
  const settings = access.settings;
  const aggregate = await getTripAggregate(access.trip_id);
  aggregate.todos = [];
  aggregate.share = { settings };

  if (!settings.notes) aggregate.trip.notes = '';

  aggregate.expenses = settings.expenses
    ? aggregate.expenses.map(expense => ({
        id: expense.id,
        item_id: expense.item_id,
        expense_date: expense.expense_date,
        category: expense.category,
        title: expense.title,
        amount: expense.amount,
        paid: expense.paid,
        notes: settings.notes ? expense.notes : ''
      }))
    : [];

  aggregate.days = aggregate.days.map(day => ({
    ...day,
    notes: settings.notes ? day.notes : '',
    items: day.items.map(item => {
      const details = { ...(item.details || {}) };
      delete details.confirmationNo;
      if (!settings.hotelPhone) delete details.phone;
      if (!settings.links) {
        delete details.bookingUrl;
        if (details.kind === 'dining' && Array.isArray(details.candidates)) {
          details.candidates = details.candidates.map(candidate => ({
            ...candidate,
            sourceUrl: '',
            appUrl: ''
          }));
        }
      }
      return {
        ...item,
        notes: settings.notes ? item.notes : '',
        details,
        links: settings.links ? item.links : [],
        image_urls: settings.images
          ? (item.image_urls || []).map(value => {
              const match = String(value).match(/^\/uploads\/([a-zA-Z0-9._-]+)$/);
              return match ? `/api/public/share/${token}/uploads/${match[1]}` : value;
            })
          : []
      };
    })
  }));
  return aggregate;
}

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
    `SELECT id, title, destination, start_date, end_date, notes, budget_total, currency, created_at, updated_at
       FROM trips WHERE id = $1`,
    [id]
  );
  if (!tripResult.rowCount) throw httpError(404, '旅行不存在');

  const [daysResult, itemsResult, todosResult, expensesResult] = await Promise.all([
    pool.query(
      `SELECT id, trip_id, day_date, title, notes, route_mode, leg_modes, position
         FROM trip_days WHERE trip_id = $1 ORDER BY day_date, position, id`,
      [id]
    ),
    pool.query(
      `SELECT i.id, i.day_id, i.item_time, i.category, i.title, i.location_name, i.location_uid, i.location, i.notes,
              i.xhs_url, i.dianping_url, i.links, i.image_urls,
              i.start_time, i.end_time, i.latitude, i.longitude, i.coord_type,
              i.details, i.position, i.created_at, i.updated_at
         FROM itinerary_items i
         JOIN trip_days d ON d.id = i.day_id
        WHERE d.trip_id = $1
        ORDER BY d.day_date, i.position, i.id`,
      [id]
    ),
    pool.query(
      `SELECT id, trip_id, title, notes, due_date, done, position, created_at, updated_at
         FROM todos WHERE trip_id = $1
        ORDER BY done, due_date NULLS LAST, position, id`,
      [id]
    ),
    pool.query(
      `SELECT id, trip_id, item_id, expense_date, category, title, amount, paid, notes, position, created_at, updated_at
         FROM expenses WHERE trip_id = $1
        ORDER BY expense_date NULLS LAST, position, id`,
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
    todos: todosResult.rows,
    expenses: expensesResult.rows
  };
}

function normalizeInlineExpense(value, fallbackTitle) {
  if (!value || typeof value !== 'object') return null;
  const amount = normalizeMoney(value.amount, '费用金额');
  if (Number(amount) <= 0) return null;
  return {
    title: cleanText(value.title, 160) || fallbackTitle,
    amount,
    category: expenseCategories.has(value.category) ? value.category : '其他',
    paid: toBoolean(value.paid),
    notes: cleanText(value.notes, 2000)
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
  res.json({ ok: true, version: buildInfo.channel, commit: buildInfo.commit, uploadsReady });
});

app.get('/api/version', async (_req, res) => {
  const schema = await migrationStatus();
  res.json({ ...buildInfo, schemaVersion: schema.currentVersion, latestSchemaVersion: schema.latestVersion });
});

app.get('/api/public/share/:token', async (req, res) => {
  const token = shareTokenParam(req.params.token);
  res.setHeader('Cache-Control', 'no-store');
  res.json(await publicTripAggregate(token));
});

app.get('/api/public/share/:token/uploads/:name', async (req, res, next) => {
  try {
    const token = shareTokenParam(req.params.token);
    const access = await shareAccess(token);
    if (!access.settings.images) throw httpError(404, '图片未在该分享中公开');
    const tripId = String(access.trip_id);
    const name = String(req.params.name || '');
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) throw httpError(404, '图片不存在');
    const ref = `/uploads/${name}`;
    const allowed = await pool.query(
      `SELECT 1
         FROM itinerary_items i
         JOIN trip_days d ON d.id = i.day_id
        WHERE d.trip_id = $1 AND $2 = ANY(i.image_urls)
        LIMIT 1`,
      [tripId, ref]
    );
    if (!allowed.rowCount) throw httpError(404, '图片不存在');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.sendFile(name, { root: uploadDir });
  } catch (error) {
    next(error);
  }
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

app.post('/api/maintenance/uploads/cleanup', async (req, res) => {
  const result = await cleanupOrphanUploads({
    uploadDir,
    dryRun: toBoolean(req.body?.dryRun),
    minAgeMs: toBoolean(req.body?.includeRecent) ? 0 : 24 * 60 * 60 * 1000
  });
  res.json(result);
});

app.post('/api/links/analyze', async (req, res) => {
  const value = requiredText(req.body?.value, '链接', 3000);
  const context = cleanText(req.body?.context, 24).toLowerCase() || 'reference';
  const region = cleanText(req.body?.region, 80);

  if (isAllowedBaiduMapUrl(value)) {
    try {
      const parsed = await resolveBaiduMapLink({ value, region, ak: baiduMapAk });
      if (parsed.location || parsed.name || parsed.address) {
        return res.json({
          type: 'location',
          analysis: {
            platform: 'baidu',
            platformLabel: '百度地图',
            autoTitle: parsed.name || '百度地图位置',
            displayTitle: parsed.name || '',
            openMode: 'app'
          },
          location: {
            name: parsed.name || '',
            address: parsed.address || '',
            uid: parsed.uid || '',
            latitude: parsed.location?.lat ?? null,
            longitude: parsed.location?.lng ?? null,
            coordType: parsed.coordType || 'bd09ll'
          },
          value: parsed.url || value
        });
      }
    } catch {}
  }

  const inputs = normalizeReferences([{ value }], 1);
  const [reference] = await resolveReferenceMetadata(inputs);
  const response = {
    type: context === 'lodging' ? 'booking' : 'reference',
    reference,
    analysis: {
      platform: reference.platform || 'web',
      platformLabel: platformLabel(reference.platform || 'web'),
      autoTitle: reference.autoTitle || reference.title || '',
      displayTitle: reference.customTitle || reference.title || '',
      appUrl: reference.appUrl || '',
      openMode: reference.kind === 'copy'
        ? 'copy'
        : reference.kind === 'uri' || reference.appUrl
          ? 'app'
          : 'web'
    },
    value: reference.url || reference.value || value
  };

  if (context === 'dining') {
    const candidateName = reference.customTitle || reference.autoTitle || reference.title || '';
    const place = {
      name: candidateName,
      address: '',
      locationUid: '',
      latitude: null,
      longitude: null,
      coordType: 'bd09ll'
    };
    if (candidateName && region && baiduMapAk) {
      try {
        const results = await searchBaiduPoi({ ak: baiduMapAk, query: candidateName, region });
        const exact = results.find(item => item.name === candidateName) || results[0];
        if (exact) {
          place.name = exact.name || candidateName;
          place.address = [exact.city, exact.district, exact.address].filter(Boolean).join(' ');
          place.locationUid = exact.uid || '';
          place.latitude = exact.location?.lat ?? null;
          place.longitude = exact.location?.lng ?? null;
        }
      } catch {}
    }
    response.place = place;
  }

  if (context === 'lodging' && reference.kind === 'url') {
    const bookingPlatform = detectBookingPlatform(reference.url || reference.value);
    const hotelName = deriveHotelName(reference.autoTitle || reference.title || '', bookingPlatform);
    const lodging = {
      bookingPlatform,
      bookingUrl: reference.url || reference.value || '',
      hotelName,
      locationName: '',
      address: '',
      locationUid: '',
      latitude: null,
      longitude: null,
      coordType: 'bd09ll'
    };

    if (hotelName && region && baiduMapAk) {
      try {
        const results = await searchBaiduPoi({ ak: baiduMapAk, query: hotelName, region });
        const exact = results.find(item => item.name === hotelName) || results[0];
        if (exact) {
          lodging.hotelName = exact.name || hotelName;
          lodging.locationName = exact.name || hotelName;
          lodging.address = [exact.city, exact.district, exact.address].filter(Boolean).join(' ');
          lodging.locationUid = exact.uid || '';
          lodging.latitude = exact.location?.lat ?? null;
          lodging.longitude = exact.location?.lng ?? null;
        }
      } catch {}
    }

    response.lodging = lodging;
  }

  res.json(response);
});

app.post('/api/orders/analyze', async (req, res) => {
  const text = requiredText(req.body?.text, '订单文本', 20000);
  const kind = cleanText(req.body?.kind, 12).toLowerCase();
  const anchorDate = cleanText(req.body?.anchorDate, 10);
  if (kind && !new Set(['lodging', 'flight', 'train']).has(kind)) {
    throw httpError(400, '订单类型仅支持酒店、航班或高铁/火车');
  }
  try {
    res.json(analyzeOrderText({ text, kind, anchorDate }));
  } catch (error) {
    throw httpError(400, error.message || '订单文本解析失败');
  }
});

app.get('/api/baidu/poi/search', async (req, res) => {
  if (!baiduMapAk) throw httpError(503, '未配置百度地图 AK，请在服务器上运行 travel-server baidu-ak set');
  const query = requiredText(req.query?.query, '搜索关键词', 45);
  const region = requiredText(req.query?.region, '搜索城市', 50);
  try {
    const results = await searchBaiduPoi({ ak: baiduMapAk, query, region });
    res.json({ results });
  } catch (error) {
    if (error.code === 'BAIDU_AK_MISSING') throw httpError(503, error.message);
    throw httpError(502, `百度地图搜索失败：${error.message}`, {
      baiduStatus: error.baiduStatus ?? null
    });
  }
});

app.post('/api/baidu/parse-link', async (req, res) => {
  const value = requiredText(req.body?.value, '百度地图链接', 3000);
  const region = cleanText(req.body?.region, 80);
  try {
    res.json(await resolveBaiduMapLink({ value, region, ak: baiduMapAk }));
  } catch (error) {
    throw httpError(400, `百度地图链接解析失败：${error.message}`);
  }
});

app.get('/api/trips', async (_req, res) => {
  const result = await pool.query(`
    SELECT t.id, t.title, t.destination, t.start_date, t.end_date, t.notes, t.budget_total, t.currency,
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
  const budgetTotal = normalizeMoney(req.body?.budgetTotal, '旅行预算');
  const currency = normalizeCurrency(req.body?.currency);
  enumerateDates(startDate, endDate);

  const id = await withTx(async client => {
    const result = await client.query(
      `INSERT INTO trips (title, destination, start_date, end_date, notes, budget_total, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [title, destination, startDate, endDate, notes, budgetTotal, currency]
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
  const budgetTotal = req.body?.budgetTotal === undefined ? null : normalizeMoney(req.body.budgetTotal, '旅行预算');
  const currency = req.body?.currency === undefined ? null : normalizeCurrency(req.body.currency);
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
          SET title = $2, destination = $3, start_date = $4, end_date = $5, notes = $6,
              budget_total = COALESCE($7, budget_total), currency = COALESCE($8, currency), updated_at = now()
        WHERE id = $1`,
      [id, title, destination, startDate, endDate, notes, budgetTotal, currency]
    );
    await client.query(
      `DELETE FROM trip_days WHERE trip_id = $1 AND (day_date < $2 OR day_date > $3)`,
      [id, startDate, endDate]
    );
    await createMissingDays(client, id, startDate, endDate);
  });

  res.json(await getTripAggregate(id));
  void cleanupOrphanUploads({ uploadDir, minAgeMs: 60 * 60 * 1000 }).catch(error => console.error('[travel] upload cleanup failed', error));
});

app.get('/api/trips/:id/shares', async (req, res) => {
  const tripId = idParam(req.params.id, '旅行 ID');
  const result = await pool.query(
    `SELECT id, created_at, settings
       FROM trip_shares
      WHERE trip_id = $1 AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [tripId]
  );
  res.json(result.rows.map(row => ({ ...row, settings: normalizeShareSettings(row.settings) })));
});

app.post('/api/trips/:id/shares', async (req, res) => {
  const tripId = idParam(req.params.id, '旅行 ID');
  const settings = normalizeShareSettings(req.body?.settings);
  const token = crypto.randomBytes(24).toString('base64url');

  const created = await withTx(async client => {
    const exists = await client.query('SELECT 1 FROM trips WHERE id = $1 FOR UPDATE', [tripId]);
    if (!exists.rowCount) throw httpError(404, '旅行不存在');
    await client.query(
      'UPDATE trip_shares SET revoked_at = now() WHERE trip_id = $1 AND revoked_at IS NULL',
      [tripId]
    );
    const result = await client.query(
      `INSERT INTO trip_shares (trip_id, token_hash, settings)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, created_at, settings`,
      [tripId, hashShareToken(token), JSON.stringify(settings)]
    );
    return result.rows[0];
  });

  res.status(201).json({
    ...created,
    settings: normalizeShareSettings(created.settings),
    path: `/share/${token}`
  });
});

app.put('/api/shares/:id/settings', async (req, res) => {
  const id = idParam(req.params.id, '分享 ID');
  const settings = normalizeShareSettings(req.body?.settings);
  const result = await pool.query(
    `UPDATE trip_shares
        SET settings = $2::jsonb
      WHERE id = $1 AND revoked_at IS NULL
      RETURNING id, created_at, settings`,
    [id, JSON.stringify(settings)]
  );
  if (!result.rowCount) throw httpError(404, '分享链接不存在');
  res.json({ ...result.rows[0], settings: normalizeShareSettings(result.rows[0].settings) });
});

app.delete('/api/shares/:id', async (req, res) => {
  const id = idParam(req.params.id, '分享 ID');
  const result = await pool.query(
    'UPDATE trip_shares SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
    [id]
  );
  if (!result.rowCount) throw httpError(404, '分享链接不存在');
  res.status(204).end();
});

app.delete('/api/trips/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM trips WHERE id = $1', [idParam(req.params.id, '旅行 ID')]);
  if (!result.rowCount) throw httpError(404, '旅行不存在');
  res.status(204).end();
  void cleanupOrphanUploads({ uploadDir, minAgeMs: 60 * 60 * 1000 }).catch(error => console.error('[travel] upload cleanup failed', error));
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

app.put('/api/days/:dayId/leg-mode', async (req, res) => {
  const dayId = idParam(req.params.dayId, '日期 ID');
  const fromKey = cleanText(req.body?.fromKey, 100);
  const toKey = cleanText(req.body?.toKey, 100);
  const mode = cleanText(req.body?.mode, 12).toLowerCase();
  if (!/^[A-Za-z0-9:_-]+$/.test(fromKey) || !/^[A-Za-z0-9:_-]+$/.test(toKey)) {
    throw httpError(400, '路线分段标识无效');
  }
  if (!new Set(['driving', 'walking', 'transit']).has(mode)) {
    throw httpError(400, '分段交通方式仅支持驾车、步行或公交');
  }
  const key = `${fromKey}>${toKey}`;
  const result = await pool.query(
    `UPDATE trip_days
        SET leg_modes = jsonb_set(COALESCE(leg_modes, '{}'::jsonb), ARRAY[$2], to_jsonb($3::text), true)
      WHERE id = $1
      RETURNING leg_modes`,
    [dayId, key, mode]
  );
  if (!result.rowCount) throw httpError(404, '日期不存在');
  res.json({ ok: true, legModes: result.rows[0].leg_modes });
});

app.post('/api/days/:dayId/items', async (req, res) => {
  const dayId = idParam(req.params.dayId, '日期 ID');
  const title = requiredText(req.body?.title, '行程标题', 160);
  const category = categories.has(req.body?.category) ? req.body.category : '其他';
  const { startTime, endTime } = normalizeTimeRange(req.body?.startTime ?? req.body?.itemTime, req.body?.endTime);
  const locationName = cleanText(req.body?.locationName, 160);
  const locationUid = cleanText(req.body?.locationUid, 128);
  const location = cleanText(req.body?.location, 240);
  const latitude = normalizeCoordinate(req.body?.latitude, '纬度', -90, 90);
  const longitude = normalizeCoordinate(req.body?.longitude, '经度', -180, 180);
  if ((latitude === null) !== (longitude === null)) throw httpError(400, '纬度和经度需要同时填写');
  const coordType = normalizeCoordType(req.body?.coordType);
  const notes = cleanText(req.body?.notes, 5000);
  const imageUrls = normalizeUrlList(req.body?.imageUrls || [], '图片链接', 12);
  const referenceInputs = normalizeReferences(req.body?.references ?? req.body?.links ?? [], 12);
  const links = await resolveReferenceMetadata(referenceInputs);
  const details = normalizeItemDetails(req.body?.details);
  const inlineExpense = normalizeInlineExpense(req.body?.expense, title);

  const created = await withTx(async client => {
    const dayResult = await client.query(
      'SELECT id, trip_id, day_date FROM trip_days WHERE id = $1 FOR UPDATE',
      [dayId]
    );
    if (!dayResult.rowCount) throw httpError(404, '日期不存在');
    const day = dayResult.rows[0];

    const result = await client.query(
      `INSERT INTO itinerary_items (
         day_id, item_time, start_time, end_time, category, title, location_name, location_uid, location,
         latitude, longitude, coord_type, notes, links, image_urls, details, position
       )
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
              COALESCE((SELECT MAX(position) + 1 FROM itinerary_items WHERE day_id = $1), 0))
       RETURNING *`,
      [dayId, startTime, endTime, category, title, locationName, locationUid, location, latitude, longitude, coordType, notes, JSON.stringify(links), imageUrls, JSON.stringify(details)]
    );
    const item = result.rows[0];

    let expense = null;
    if (inlineExpense) {
      const expenseResult = await client.query(
        `INSERT INTO expenses (trip_id, item_id, expense_date, category, title, amount, paid, notes, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 COALESCE((SELECT MAX(position) + 1 FROM expenses WHERE trip_id = $1), 0))
         RETURNING *`,
        [day.trip_id, item.id, day.day_date, inlineExpense.category, inlineExpense.title, inlineExpense.amount, inlineExpense.paid, inlineExpense.notes]
      );
      expense = expenseResult.rows[0];
    }
    return { item, expense };
  });

  res.status(201).json({ ...created.item, expense: created.expense });
});

app.put('/api/items/:id', async (req, res) => {
  const id = idParam(req.params.id, '行程项 ID');
  const title = requiredText(req.body?.title, '行程标题', 160);
  const category = categories.has(req.body?.category) ? req.body.category : '其他';
  const { startTime, endTime } = normalizeTimeRange(req.body?.startTime ?? req.body?.itemTime, req.body?.endTime);
  const locationName = cleanText(req.body?.locationName, 160);
  const locationUid = cleanText(req.body?.locationUid, 128);
  const location = cleanText(req.body?.location, 240);
  const latitude = normalizeCoordinate(req.body?.latitude, '纬度', -90, 90);
  const longitude = normalizeCoordinate(req.body?.longitude, '经度', -180, 180);
  if ((latitude === null) !== (longitude === null)) throw httpError(400, '纬度和经度需要同时填写');
  const coordType = normalizeCoordType(req.body?.coordType);
  const notes = cleanText(req.body?.notes, 5000);
  const imageUrls = normalizeUrlList(req.body?.imageUrls || [], '图片链接', 12);
  const referenceInputs = normalizeReferences(req.body?.references ?? req.body?.links ?? [], 12);
  const links = await resolveReferenceMetadata(referenceInputs);
  const details = normalizeItemDetails(req.body?.details);

  const result = await pool.query(
    `UPDATE itinerary_items
        SET item_time = $2, start_time = $2, end_time = $3, category = $4, title = $5,
            location_name = $6, location_uid = $7, location = $8, latitude = $9, longitude = $10, coord_type = $11, notes = $12,
            links = $13, image_urls = $14, details = $15, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [id, startTime, endTime, category, title, locationName, locationUid, location, latitude, longitude, coordType, notes, JSON.stringify(links), imageUrls, JSON.stringify(details)]
  );
  if (!result.rowCount) throw httpError(404, '行程项不存在');
  res.json(result.rows[0]);
  void cleanupOrphanUploads({ uploadDir, minAgeMs: 60 * 60 * 1000 }).catch(error => console.error('[travel] upload cleanup failed', error));
});

app.put('/api/days/:dayId/items/order', async (req, res) => {
  const dayId = idParam(req.params.dayId, '日期 ID');
  const itemIds = Array.isArray(req.body?.itemIds) ? req.body.itemIds.map(value => idParam(value, '行程项 ID')) : [];
  if (new Set(itemIds).size !== itemIds.length) throw httpError(400, '行程排序中存在重复项目');

  await withTx(async client => {
    const current = await client.query(
      'SELECT id FROM itinerary_items WHERE day_id = $1 ORDER BY position, id FOR UPDATE',
      [dayId]
    );
    const currentIds = current.rows.map(row => String(row.id));
    if (currentIds.length !== itemIds.length || currentIds.some(id => !itemIds.includes(id))) {
      throw httpError(409, '行程列表已经变化，请刷新后重试');
    }
    for (let index = 0; index < itemIds.length; index += 1) {
      await client.query('UPDATE itinerary_items SET position = $2, updated_at = now() WHERE id = $1', [itemIds[index], index]);
    }
  });
  res.json({ ok: true });
});

app.put('/api/items/:id/move', async (req, res) => {
  const id = idParam(req.params.id, '行程项 ID');
  const targetDayId = idParam(req.body?.targetDayId, '目标日期 ID');
  const requestedPosition = Number.isFinite(Number(req.body?.position)) ? Math.max(0, Math.floor(Number(req.body.position))) : Number.MAX_SAFE_INTEGER;

  await withTx(async client => {
    const itemResult = await client.query(
      `SELECT i.id, i.day_id, d.trip_id
         FROM itinerary_items i JOIN trip_days d ON d.id = i.day_id
        WHERE i.id = $1 FOR UPDATE`,
      [id]
    );
    if (!itemResult.rowCount) throw httpError(404, '行程项不存在');
    const item = itemResult.rows[0];

    const targetDay = await client.query('SELECT id, trip_id, day_date FROM trip_days WHERE id = $1 FOR UPDATE', [targetDayId]);
    if (!targetDay.rowCount) throw httpError(404, '目标日期不存在');
    if (String(targetDay.rows[0].trip_id) !== String(item.trip_id)) throw httpError(400, '只能在同一次旅行内移动行程');

    const targetItems = await client.query(
      'SELECT id FROM itinerary_items WHERE day_id = $1 AND id <> $2 ORDER BY position, id FOR UPDATE',
      [targetDayId, id]
    );
    const ids = targetItems.rows.map(row => String(row.id));
    const position = Math.min(requestedPosition, ids.length);
    ids.splice(position, 0, String(id));

    await client.query('UPDATE itinerary_items SET day_id = $2, updated_at = now() WHERE id = $1', [id, targetDayId]);
    await client.query(
      'UPDATE expenses SET expense_date = $2, updated_at = now() WHERE item_id = $1',
      [id, targetDay.rows[0].day_date]
    );
    for (let index = 0; index < ids.length; index += 1) {
      await client.query('UPDATE itinerary_items SET position = $2 WHERE id = $1', [ids[index], index]);
    }

    if (String(item.day_id) !== String(targetDayId)) {
      const sourceItems = await client.query(
        'SELECT id FROM itinerary_items WHERE day_id = $1 ORDER BY position, id FOR UPDATE',
        [item.day_id]
      );
      for (let index = 0; index < sourceItems.rows.length; index += 1) {
        await client.query('UPDATE itinerary_items SET position = $2 WHERE id = $1', [sourceItems.rows[index].id, index]);
      }
    }
  });
  res.json({ ok: true });
});

app.post('/api/uploads/images', express.raw({
  type: ['image/jpeg', 'image/png', 'image/webp'],
  limit: '6mb'
}), async (req, res) => {
  if (!uploadsReady) throw httpError(503, '图片上传目录当前不可写，请检查服务器 ~/.travel/data/uploads 权限');
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw httpError(400, '图片内容为空');
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const ext = extensions[contentType];
  if (!ext) throw httpError(415, '仅支持 JPEG、PNG、WebP 图片');
  const name = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, name), req.body, { mode: 0o600, flag: 'wx' });
  res.status(201).json({ url: `/uploads/${name}` });
});

app.delete('/api/items/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM itinerary_items WHERE id = $1', [idParam(req.params.id, '行程项 ID')]);
  if (!result.rowCount) throw httpError(404, '行程项不存在');
  res.status(204).end();
  void cleanupOrphanUploads({ uploadDir, minAgeMs: 60 * 60 * 1000 }).catch(error => console.error('[travel] upload cleanup failed', error));
});

const expenseCategories = new Set(['交通', '住宿', '餐饮', '门票', '购物', '其他']);

app.post('/api/trips/:tripId/expenses', async (req, res) => {
  const tripId = idParam(req.params.tripId, '旅行 ID');
  const title = requiredText(req.body?.title, '费用标题', 160);
  const amount = normalizeMoney(req.body?.amount, '费用金额');
  const category = expenseCategories.has(req.body?.category) ? req.body.category : '其他';
  const expenseDate = req.body?.expenseDate ? validDate(req.body.expenseDate, '费用') : null;
  const paid = toBoolean(req.body?.paid);
  const notes = cleanText(req.body?.notes, 2000);
  const itemId = req.body?.itemId ? idParam(req.body.itemId, '关联行程 ID') : null;

  const result = await pool.query(
    `INSERT INTO expenses (trip_id, item_id, expense_date, category, title, amount, paid, notes, position)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8,
            COALESCE((SELECT MAX(position) + 1 FROM expenses WHERE trip_id = $1), 0)
     WHERE EXISTS (SELECT 1 FROM trips WHERE id = $1)
       AND ($2::bigint IS NULL OR EXISTS (
         SELECT 1 FROM itinerary_items i JOIN trip_days d ON d.id = i.day_id
          WHERE i.id = $2 AND d.trip_id = $1
       ))
     RETURNING *`,
    [tripId, itemId, expenseDate, category, title, amount, paid, notes]
  );
  if (!result.rowCount) throw httpError(400, '旅行不存在或关联行程不属于该旅行');
  res.status(201).json(result.rows[0]);
});

app.put('/api/expenses/:id', async (req, res) => {
  const id = idParam(req.params.id, '费用 ID');
  const current = await pool.query('SELECT trip_id FROM expenses WHERE id = $1', [id]);
  if (!current.rowCount) throw httpError(404, '费用不存在');
  const tripId = current.rows[0].trip_id;

  const title = requiredText(req.body?.title, '费用标题', 160);
  const amount = normalizeMoney(req.body?.amount, '费用金额');
  const category = expenseCategories.has(req.body?.category) ? req.body.category : '其他';
  const expenseDate = req.body?.expenseDate ? validDate(req.body.expenseDate, '费用') : null;
  const paid = toBoolean(req.body?.paid);
  const notes = cleanText(req.body?.notes, 2000);
  const itemId = req.body?.itemId ? idParam(req.body.itemId, '关联行程 ID') : null;

  if (itemId) {
    const belongs = await pool.query(
      `SELECT 1 FROM itinerary_items i JOIN trip_days d ON d.id = i.day_id
        WHERE i.id = $1 AND d.trip_id = $2`,
      [itemId, tripId]
    );
    if (!belongs.rowCount) throw httpError(400, '关联行程不属于该旅行');
  }

  const result = await pool.query(
    `UPDATE expenses
        SET item_id = $2, expense_date = $3, category = $4, title = $5, amount = $6,
            paid = $7, notes = $8, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [id, itemId, expenseDate, category, title, amount, paid, notes]
  );
  res.json(result.rows[0]);
});

app.delete('/api/expenses/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM expenses WHERE id = $1', [idParam(req.params.id, '费用 ID')]);
  if (!result.rowCount) throw httpError(404, '费用不存在');
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

app.use('/uploads', (req, _res, next) => {
  if (!isAuthenticated(req)) return next(httpError(401, '请先登录'));
  next();
}, express.static(uploadDir, {
  maxAge: '7d',
  immutable: true,
  fallthrough: false
}));

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

await prepareUploadDir();
await migrate();
if (uploadsReady) {
  try {
    const cleanupResult = await cleanupOrphanUploads({ uploadDir, minAgeMs: 24 * 60 * 60 * 1000 });
    if (cleanupResult.deleted) console.log(`[travel] cleaned ${cleanupResult.deleted} orphan upload(s), ${cleanupResult.bytes} bytes`);
  } catch (error) {
    console.error('[travel] startup upload cleanup failed', error);
  }
}
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
