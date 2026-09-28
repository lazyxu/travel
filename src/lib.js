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
    let normalized;
    if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(raw)) normalized = raw;
    else normalized = optionalUrl(raw, field);
    if (!urls.includes(normalized)) urls.push(normalized);
    if (urls.length > maxItems) throw httpError(400, `${field}最多支持 ${maxItems} 个`);
  }
  return urls;
}

export function normalizeReferences(value, maxItems = 12) {
  const source = Array.isArray(value) ? value : [value];
  const refs = [];

  for (const entry of source) {
    const isObject = typeof entry === 'object' && entry !== null;
    let candidate = isObject ? (entry.value || entry.url || '') : entry;
    let customTitle = isObject ? cleanText(entry.customTitle ?? entry.title, 180) : '';
    let autoTitle = isObject ? cleanText(entry.autoTitle, 180) : '';
    let raw = cleanText(candidate, 3000);
    if (!raw) continue;

    if (!isObject) {
      const separator = raw.match(/\s[|｜]\s/);
      if (separator) {
        const index = separator.index;
        customTitle = cleanText(raw.slice(0, index), 180);
        raw = cleanText(raw.slice(index + separator[0].length), 3000);
      }
    }

    const httpMatch = raw.match(/https?:\/\/[^\s]+/i);
    let ref;
    if (httpMatch) {
      const url = optionalUrl(httpMatch[0].replace(/[),，。；;]+$/g, ''), '参考链接');
      ref = { kind: 'url', url, value: url, customTitle, autoTitle };
    } else if (/^weixin:\/\//i.test(raw)) {
      ref = { kind: 'uri', url: raw, value: raw, customTitle, autoTitle };
    } else if (/(?:#)?小程序:\/\//i.test(raw)) {
      ref = { kind: 'copy', value: raw, customTitle, autoTitle };
    } else {
      throw httpError(400, '参考入口仅支持网页链接、weixin:// 链接或微信小程序口令');
    }

    const key = `${ref.kind}:${ref.value}`;
    const existing = refs.find(item => `${item.kind}:${item.value}` === key);
    if (existing) {
      if (customTitle) existing.customTitle = customTitle;
      if (autoTitle) existing.autoTitle = autoTitle;
    } else {
      refs.push(ref);
    }
    if (refs.length > maxItems) throw httpError(400, `参考入口最多支持 ${maxItems} 个`);
  }

  return refs;
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

export function normalizeRouteMode(value) {
  const mode = cleanText(value, 12).toLowerCase() || 'driving';
  if (!new Set(['driving', 'walking', 'transit', 'riding']).has(mode)) {
    throw httpError(400, '路线模式仅支持驾车、步行、公交或骑行');
  }
  return mode;
}

export function normalizeCurrency(value) {
  const currency = cleanText(value, 3).toUpperCase() || 'CNY';
  if (!new Set(['CNY', 'USD', 'JPY', 'HKD', 'EUR', 'GBP', 'KRW']).has(currency)) {
    throw httpError(400, '货币仅支持 CNY、USD、JPY、HKD、EUR、GBP、KRW');
  }
  return currency;
}

export function normalizeMoney(value, field = '金额') {
  if (value === null || value === undefined || String(value).trim() === '') return '0.00';
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 9999999999.99) {
    throw httpError(400, `${field}无效`);
  }
  return number.toFixed(2);
}

export function normalizeItemDetails(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const kind = cleanText(source.kind, 12).toLowerCase();
  if (kind && !new Set(['lodging', 'flight', 'train']).has(kind)) {
    throw httpError(400, '结构化行程类型无效');
  }

  const allowed = {
    lodging: ['hotelName', 'checkInDate', 'checkInTime', 'checkOutDate', 'checkOutTime', 'roomType', 'phone', 'bookingPlatform', 'confirmationNo'],
    flight: ['airline', 'flightNo', 'departureDate', 'departureTime', 'departureAirport', 'departureTerminal', 'arrivalDate', 'arrivalTime', 'arrivalAirport', 'arrivalTerminal', 'seat', 'confirmationNo'],
    train: ['trainNo', 'departureDate', 'departureTime', 'departureStation', 'arrivalDate', 'arrivalTime', 'arrivalStation', 'carriage', 'seat', 'confirmationNo']
  };
  if (!kind) return {};

  const result = { kind };
  for (const key of allowed[kind]) {
    const max = key.toLowerCase().includes('date') ? 10 : key.toLowerCase().includes('time') ? 5 : 160;
    result[key] = cleanText(source[key], max);
  }
  if (kind === 'lodging') {
    if (result.checkInDate) result.checkInDate = validDate(result.checkInDate, '入住');
    if (result.checkOutDate) result.checkOutDate = validDate(result.checkOutDate, '退房');
    if (result.checkInDate && result.checkOutDate && result.checkOutDate < result.checkInDate) {
      throw httpError(400, '退房日期不能早于入住日期');
    }
    if (result.checkInTime) result.checkInTime = normalizeTime(result.checkInTime);
    if (result.checkOutTime) result.checkOutTime = normalizeTime(result.checkOutTime);
  }
  return result;
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
