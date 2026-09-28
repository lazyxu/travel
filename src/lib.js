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

export function toBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function httpError(status, message, details) {
  const err = new Error(message);
  err.status = status;
  if (details !== undefined) err.details = details;
  return err;
}
