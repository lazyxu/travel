export function cleanText(value, max = 5000) {
  const text = String(value ?? '').trim();
  return text.slice(0, max);
}

export function requiredText(value, field, max = 200) {
  const text = cleanText(value, max);
  if (!text) throw httpError(400, `${field}不能为空`);
  return text;
}

export function optionalUrl(value, field) {
  const raw = cleanText(value, 2000);
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw httpError(400, `${field}不是有效链接`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw httpError(400, `${field}仅支持 http/https 链接`);
  }
  return url.toString();
}

export function normalizeUrlList(value, field = '图片链接', maxItems = 12) {
  const source = Array.isArray(value) ? value : [value];
  const urls = [];
  for (const item of source.flatMap(entry => String(entry ?? '').split(/\r?\n/))) {
    const raw = cleanText(item, 2000);
    if (!raw) continue;
    const normalized = optionalUrl(raw, field);
    if (!urls.includes(normalized)) urls.push(normalized);
    if (urls.length > maxItems) throw httpError(400, `${field}最多支持 ${maxItems} 个`);
  }
  return urls;
}

export function normalizeLinkUrls(value, field = '参考链接', maxItems = 12) {
  const source = Array.isArray(value) ? value : [value];
  const urls = [];
  for (const entry of source) {
    const candidate = typeof entry === 'object' && entry !== null ? entry.url : entry;
    for (const line of String(candidate ?? '').split(/\r?\n/)) {
      const raw = cleanText(line, 2000);
      if (!raw) continue;
      const normalized = optionalUrl(raw, field);
      if (!urls.includes(normalized)) urls.push(normalized);
      if (urls.length > maxItems) throw httpError(400, `${field}最多支持 ${maxItems} 个`);
    }
  }
  return urls;
}

export function validDate(value, field) {
  const text = cleanText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw httpError(400, `${field}日期格式应为 YYYY-MM-DD`);
  }
  return text;
}

export function enumerateDates(start, end, maxDays = 60) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (endDate < startDate) throw httpError(400, '结束日期不能早于开始日期');
  const out = [];
  for (let d = startDate; d <= endDate; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
    if (out.length > maxDays) throw httpError(400, `单次旅行最多支持 ${maxDays} 天`);
  }
  return out;
}

export function normalizeTime(value) {
  const text = cleanText(value, 5);
  if (!text) return '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw httpError(400, '时间格式应为 HH:MM');
  return text;
}

export function normalizeTimeRange(startValue, endValue) {
  const startTime = normalizeTime(startValue);
  const endTime = normalizeTime(endValue);
  if (endTime && !startTime) throw httpError(400, '设置结束时间时必须同时设置开始时间');
  if (startTime && endTime && endTime < startTime) throw httpError(400, '结束时间不能早于开始时间');
  return { startTime, endTime };
}

export function normalizeCoordinate(value, field, min, max) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw httpError(400, `${field}必须在 ${min} 到 ${max} 之间`);
  }
  return Math.round(number * 1e7) / 1e7;
}

export function normalizeCoordType(value) {
  const type = cleanText(value, 10).toLowerCase() || 'bd09ll';
  if (!new Set(['bd09ll', 'gcj02', 'wgs84']).has(type)) {
    throw httpError(400, '坐标类型仅支持 BD-09、GCJ-02 或 WGS84');
  }
  return type;
}

export function toBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function httpError(status, message, details) {
  const err = new Error(message);
  err.status = status;
  if (details !== undefined) err.details = details;
  return err;
}
