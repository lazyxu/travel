const BAIDU_SUGGEST_URL = 'https://api.map.baidu.com/place/v2/suggestion';

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
  const params = new URLSearchParams({
    query,
    region,
    city_limit: 'false',
    output: 'json',
    ak
  });
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
