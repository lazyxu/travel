const BAIDU_SUGGEST_URL = 'https://api.map.baidu.com/place/v2/suggestion';
const BAIDU_HOST_RE = /(^|\.)(baidu\.com|baidu\.cn)$/i;

export function normalizeBaiduPoiPayload(payload) {
  const results = Array.isArray(payload?.result) ? payload.result : [];
  return results.slice(0, 15).map(item => ({
    uid: String(item.uid || ''),
    name: String(item.name || ''),
    address: String(item.address || ''),
    province: String(item.province || ''),
    city: String(item.city || ''),
    district: String(item.district || ''),
    business: String(item.business || ''),
    location: item.location && Number.isFinite(Number(item.location.lat)) && Number.isFinite(Number(item.location.lng))
      ? { lat: Number(item.location.lat), lng: Number(item.location.lng) }
      : null
  })).filter(item => item.name);
}

export async function searchBaiduPoi({ ak, query, region, fetchImpl = fetch }) {
  if (!ak) {
    const error = new Error('未配置百度地图 AK');
    error.code = 'BAIDU_AK_MISSING';
    throw error;
  }
  const params = new URLSearchParams({ query, region, city_limit: 'false', output: 'json', ak });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchImpl(`${BAIDU_SUGGEST_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (Number(payload?.status) !== 0) {
      const error = new Error(String(payload?.message || `百度地图状态码 ${payload?.status}`));
      error.baiduStatus = Number(payload?.status);
      throw error;
    }
    return normalizeBaiduPoiPayload(payload);
  } finally {
    clearTimeout(timer);
  }
}

function extractMapUrl(value) {
  const text = String(value || '').trim();
  const match = text.match(/(?:https?:\/\/[^\s]+|baidumap:\/\/[^\s]+)/i);
  return (match?.[0] || text).replace(/[),，。；;]+$/g, '');
}

function safeDecode(value) {
  let result = String(value || '');
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(result);
      if (decoded === result) break;
      result = decoded;
    } catch {
      break;
    }
  }
  return result;
}

function normalizedCoordType(value) {
  const type = String(value || '').toLowerCase();
  if (['bd09ll', 'gcj02', 'wgs84'].includes(type)) return type;
  return 'bd09ll';
}

function parsePair(value, order = 'latlng') {
  const match = String(value || '').match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  let lat = order === 'lnglat' ? second : first;
  let lng = order === 'lnglat' ? first : second;
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) [lat, lng] = [lng, lat];
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function asUrl(raw) {
  try { return new URL(raw); } catch { return null; }
}

export function isAllowedBaiduMapUrl(value) {
  const raw = extractMapUrl(value);
  const url = asUrl(raw);
  if (!url) return false;
  if (url.protocol === 'baidumap:') return true;
  return ['http:', 'https:'].includes(url.protocol) && BAIDU_HOST_RE.test(url.hostname);
}

export function parseBaiduMapLink(value) {
  const raw = extractMapUrl(value);
  const url = asUrl(raw);
  if (!url || !isAllowedBaiduMapUrl(raw)) return null;

  const decoded = safeDecode(raw);
  const coordType = normalizedCoordType(url.searchParams.get('coord_type') || url.searchParams.get('coordType'));
  let location = parsePair(url.searchParams.get('location') || url.searchParams.get('center'));

  if (!location) {
    const lat = url.searchParams.get('lat') || url.searchParams.get('latitude');
    const lng = url.searchParams.get('lng') || url.searchParams.get('lon') || url.searchParams.get('longitude');
    if (lat && lng) location = parsePair(`${lat},${lng}`);
  }
  if (!location) {
    const explicit = decoded.match(/(?:location|center)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
    if (explicit) location = parsePair(`${explicit[1]},${explicit[2]}`);
  }
  if (!location) {
    const atPair = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:[,/]|$)/);
    if (atPair) location = parsePair(`${atPair[1]},${atPair[2]}`, 'lnglat');
  }

  const name = safeDecode(
    url.searchParams.get('title') || url.searchParams.get('name') ||
    url.searchParams.get('query') || url.searchParams.get('wd') || ''
  ).trim();
  const address = safeDecode(url.searchParams.get('address') || url.searchParams.get('content') || '').trim();
  return { url: raw, name, address, location, coordType };
}

async function resolveBaiduRedirect(urlText, fetchImpl = fetch) {
  let current = urlText;
  for (let i = 0; i < 4; i += 1) {
    const parsed = asUrl(current);
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || !BAIDU_HOST_RE.test(parsed.hostname)) {
      throw new Error('百度地图链接重定向到了不允许的域名');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetchImpl(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TravelPlanner/1.0)',
          Accept: 'text/html,*/*;q=0.1'
        }
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) break;
        current = new URL(location, current).toString();
        continue;
      }
      let html = '';
      try { html = (await response.text()).slice(0, 256 * 1024); } catch {}
      return { finalUrl: current, html };
    } finally {
      clearTimeout(timer);
    }
  }
  return { finalUrl: current, html: '' };
}

function extractNameFromHtml(html) {
  const source = String(html || '');
  const title = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  return title.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/[-_]?百度地图.*$/i, '').trim().slice(0, 160);
}

export async function resolveBaiduMapLink({ value, region = '', ak = '', fetchImpl = fetch }) {
  const direct = parseBaiduMapLink(value);
  if (!direct) throw new Error('不是可识别的百度地图链接');
  if (direct.location || direct.url.startsWith('baidumap://')) return direct;

  const { finalUrl, html } = await resolveBaiduRedirect(direct.url, fetchImpl);
  const resolved = parseBaiduMapLink(finalUrl) || direct;
  if (resolved.location) return resolved;

  const name = resolved.name || direct.name || extractNameFromHtml(html);
  const address = resolved.address || direct.address || '';
  if (name && ak && region) {
    try {
      const results = await searchBaiduPoi({ ak, query: name, region, fetchImpl });
      const exact = results.find(item => item.name === name) || results[0];
      if (exact?.location) {
        return {
          url: finalUrl,
          name: exact.name || name,
          address: [exact.city, exact.district, exact.address].filter(Boolean).join(' '),
          location: exact.location,
          coordType: 'bd09ll'
        };
      }
    } catch {}
  }
  return { url: finalUrl, name, address, location: null, coordType: 'bd09ll' };
}
