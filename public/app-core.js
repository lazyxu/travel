const CATEGORY_META = {
  '交通': { icon: '🚆', label: '交通' },
  '景点': { icon: '📍', label: '景点' },
  '餐饮': { icon: '🍜', label: '餐饮' },
  '住宿': { icon: '🏨', label: '住宿' },
  '购物': { icon: '🛍️', label: '购物' },
  '其他': { icon: '📝', label: '其他' }
};

function categoryMeta(category) {
  return CATEGORY_META[category] || CATEGORY_META['其他'];
}

const state = {
  trips: [],
  current: null,
  currentDayId: null,
  tab: 'itinerary'
};

const el = {
  loginView: document.querySelector('#login-view'),
  loginForm: document.querySelector('#login-form'),
  loginPassword: document.querySelector('#login-password'),
  app: document.querySelector('#app'),
  main: document.querySelector('#main'),
  topbarTitle: document.querySelector('#topbar-title'),
  backHome: document.querySelector('#back-home'),
  bottomNav: document.querySelector('#bottom-nav'),
  sheet: document.querySelector('#sheet'),
  sheetBackdrop: document.querySelector('#sheet-backdrop'),
  sheetTitle: document.querySelector('#sheet-title'),
  sheetForm: document.querySelector('#sheet-form'),
  sheetClose: document.querySelector('#sheet-close'),
  toast: document.querySelector('#toast')
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function attr(value) {
  return escapeHtml(value);
}

function showToast(message, type = 'info') {
  el.toast.textContent = message;
  el.toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { el.toast.className = 'toast'; }, 2600);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  let payload = null;
  if (response.status !== 204) {
    const text = await response.text();
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = { error: text }; }
    }
  }
  if (!response.ok) {
    if (response.status === 401 && url !== '/api/login') showLogin();
    const error = new Error(payload?.error || `请求失败 (${response.status})`);
    error.status = response.status;
    error.details = payload?.details;
    throw error;
  }
  return payload;
}

function showLogin() {
  closeSheet();
  el.app.classList.add('hidden');
  el.loginView.classList.remove('hidden');
  setTimeout(() => el.loginPassword.focus(), 50);
}

function showApp() {
  el.loginView.classList.add('hidden');
  el.app.classList.remove('hidden');
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localTimeKey(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatMoney(value, currency = 'CNY') {
  const number = Number(value || 0);
  try {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'JPY' || currency === 'KRW' ? 0 : 2
    }).format(number);
  } catch {
    return `${currency} ${number.toFixed(2)}`;
  }
}

function daysBetween(from, to) {
  const a = new Date(`${String(from).slice(0, 10)}T00:00:00`);
  const b = new Date(`${String(to).slice(0, 10)}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatRange(start, end) {
  if (!start || !end) return '';
  if (start === end) return formatDate(start);
  return `${formatDate(start)} — ${formatDate(end)}`;
}

function weekday(date) {
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  return ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
}

function dayNumber(date, tripStart) {
  const a = new Date(`${String(tripStart).slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86400000) + 1;
}

function extractUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/https?:\/\/[^\s]+/i);
  return (match?.[0] || text).replace(/[),，。；;]+$/g, '');
}

function extractUrls(value, maxItems = 12) {
  const text = String(value || '').trim();
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s]+/ig) || [];
  const source = matches.length ? matches : text.split(/\r?\n/);
  const urls = [];
  for (const rawValue of source) {
    const url = String(rawValue || '').trim().replace(/[),，。；;]+$/g, '');
    if (!url || !/^https?:\/\//i.test(url) || urls.includes(url)) continue;
    urls.push(url);
    if (urls.length >= maxItems) break;
  }
  return urls;
}

function extractImageRefs(value, maxItems = 12) {
  const refs = [];
  for (const line of String(value || '').split(/\r?\n/)) {
    const raw = line.trim().replace(/[),，。；;]+$/g, '');
    if (!raw) continue;
    if (!/^https?:\/\//i.test(raw) && !/^\/uploads\/[a-zA-Z0-9._-]+$/.test(raw)) continue;
    if (!refs.includes(raw)) refs.push(raw);
    if (refs.length >= maxItems) break;
  }
  return refs;
}

function itemDetailsKind(item) {
  return item?.details?.kind || '';
}

function detailsKindMeta(kind) {
  return {
    lodging: { icon: '🏨', label: '住宿' },
    flight: { icon: '✈️', label: '航班' },
    train: { icon: '🚄', label: '高铁 / 火车' }
  }[kind] || null;
}

function formatItemTime(item) {
  const start = item?.start_time || item?.item_time || '';
  const end = item?.end_time || '';
  if (start && end) return `${start}–${end}`;
  return start || '待定';
}

const REFERENCE_PLATFORM_META = {
  wechat: { icon: '🟢', label: '微信小程序' },
  douyin: { icon: '🎵', label: '抖音' },
  meituan: { icon: '🟡', label: '美团' },
  dianping: { icon: '🟠', label: '大众点评' },
  xhs: { icon: '🔴', label: '小红书' },
  xianyu: { icon: '🐟', label: '闲鱼' },
  web: { icon: '🔗', label: '网页' }
};

function referencePlatformMeta(platform) {
  return REFERENCE_PLATFORM_META[platform] || REFERENCE_PLATFORM_META.web;
}

function itemReferenceValues(item) {
  const refs = Array.isArray(item?.links)
    ? item.links.map(ref => ref?.value || ref?.url).filter(Boolean)
    : [];
  if (refs.length) return refs;
  return [item?.xhs_url, item?.dianping_url].filter(Boolean);
}

function extractReferenceInputs(value, maxItems = 12) {
  const text = String(value || '').trim();
  if (!text) return [];
  const refs = [];
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw) continue;
    const urls = raw.match(/https?:\/\/[^\s]+/ig) || [];
    if (urls.length) {
      for (const url of urls) {
        const cleaned = url.replace(/[),，。；;]+$/g, '');
        if (!refs.includes(cleaned)) refs.push(cleaned);
      }
    } else if (/^weixin:\/\//i.test(raw) || /(?:#)?小程序:\/\//i.test(raw)) {
      if (!refs.includes(raw)) refs.push(raw);
    }
    if (refs.length >= maxItems) break;
  }
  return refs.slice(0, maxItems);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

const ROUTE_MODE_META = {
  driving: { icon: '🚗', label: '驾车' },
  walking: { icon: '🚶', label: '步行' },
  transit: { icon: '🚇', label: '公交' },
  riding: { icon: '🚲', label: '骑行' }
};

function routeModeMeta(mode) {
  return ROUTE_MODE_META[mode] || ROUTE_MODE_META.driving;
}

function baiduPointUrl(item) {
  const src = 'webapp.lazyxu.travel';
  if (Number.isFinite(Number(item?.latitude)) && Number.isFinite(Number(item?.longitude))) {
    const params = new URLSearchParams({
      location: `${item.latitude},${item.longitude}`,
      title: item.title || item.location || '行程地点',
      content: item.location || item.title || '行程地点',
      coord_type: item.coord_type || 'bd09ll',
      output: 'html',
      src
    });
    return `https://api.map.baidu.com/marker?${params.toString()}`;
  }
  if (item?.location) {
    const params = new URLSearchParams({ address: item.location, output: 'html', src });
    return `https://api.map.baidu.com/geocoder?${params.toString()}`;
  }
  return '';
}

function baiduDayRouteUrl(day) {
  const points = (day?.items || [])
    .filter(item => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)))
    .slice(0, 17);
  if (points.length < 2) return '';
  const coordType = points[0].coord_type || 'bd09ll';
  if (points.some(point => (point.coord_type || 'bd09ll') !== coordType)) return '';
  const pointValue = point => `latlng:${point.latitude},${point.longitude}|name:${point.title || point.location || '行程点'}`;
  const params = new URLSearchParams({
    origin: pointValue(points[0]),
    destination: pointValue(points[points.length - 1]),
    mode: day?.route_mode || 'driving',
    coord_type: coordType,
    output: 'html',
    src: 'webapp.lazyxu.travel'
  });
  const via = points.slice(1, -1).map(point => ({
    name: point.title || point.location || '行程点',
    lat: Number(point.latitude),
    lng: Number(point.longitude)
  }));
  if (via.length) params.set('viaPoints', JSON.stringify({ viaPoints: via }));
  return `https://api.map.baidu.com/direction?${params.toString()}`;
}

async function compressImageFile(file, maxDimension = 1600, quality = 0.82) {
  if (!file?.type?.startsWith('image/')) throw new Error('请选择图片文件');

  let bitmap;
  if ('createImageBitmap' in window) {
    bitmap = await createImageBitmap(file);
  } else {
    bitmap = await new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('浏览器无法读取这张图片'));
      };
      image.src = url;
    });
  }

  const width = bitmap.width || bitmap.naturalWidth;
  const height = bitmap.height || bitmap.naturalHeight;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close?.();

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片压缩失败')), 'image/jpeg', quality);
  });
}

async function uploadImageBlob(blob) {
  const response = await fetch('/api/uploads/images', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    body: blob
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) throw new Error(payload?.error || `图片上传失败 (${response.status})`);
  return payload.url;
}

function registerPwa() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, { once: true });
}

registerPwa();

function openSheet(title, body, onSubmit) {
  el.sheetTitle.textContent = title;
  el.sheetForm.innerHTML = body;
  el.sheetForm.onsubmit = async event => {
    event.preventDefault();
    const submit = el.sheetForm.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await onSubmit(new FormData(el.sheetForm), event);
    } catch (error) {
      showToast(error.message, 'error');
      if (submit) submit.disabled = false;
    }
  };
  el.sheetBackdrop.classList.remove('hidden');
  el.sheet.classList.remove('hidden');
}

function closeSheet() {
  el.sheet.classList.add('hidden');
  el.sheetBackdrop.classList.add('hidden');
  el.sheetForm.innerHTML = '';
  el.sheetForm.onsubmit = null;
}

async function loadTrips() {
  state.trips = await api('/api/trips');
  renderHome();
}


function parseRoute(pathname = window.location.pathname) {
  if (pathname === '/' || pathname === '') return { name: 'home' };
  let match = pathname.match(/^\/trips\/(\d+)\/day\/(\d+)\/?$/);
  if (match) return { name: 'day', tripId: match[1], dayId: match[2] };
  match = pathname.match(/^\/trips\/(\d+)\/today\/?$/);
  if (match) return { name: 'today', tripId: match[1] };
  match = pathname.match(/^\/trips\/(\d+)\/todos\/?$/);
  if (match) return { name: 'todos', tripId: match[1] };
  match = pathname.match(/^\/trips\/(\d+)\/expenses\/?$/);
  if (match) return { name: 'expenses', tripId: match[1] };
  match = pathname.match(/^\/trips\/(\d+)\/?$/);
  if (match) return { name: 'trip', tripId: match[1] };
  return { name: 'not-found' };
}

async function navigate(path, { replace = false } = {}) {
  if (window.location.pathname !== path) {
    history[replace ? 'replaceState' : 'pushState']({}, '', path);
  } else if (replace) {
    history.replaceState({}, '', path);
  }
  await loadRoute();
}

async function loadRoute() {
  const route = parseRoute();
  if (route.name === 'not-found') {
    history.replaceState({}, '', '/');
    return loadRoute();
  }
  if (route.name === 'home') {
    state.trips = await api('/api/trips');
    renderHome();
    return;
  }

  state.current = await api(`/api/trips/${route.tripId}`);
  el.backHome.classList.remove('hidden');
  el.bottomNav.classList.remove('hidden');

  if (route.name === 'today') {
    state.tab = 'today';
    const today = localDateKey();
    state.currentDayId = state.current.days.find(day => String(day.day_date).slice(0, 10) === today)?.id || state.current.days[0]?.id || null;
    renderCurrent();
    return;
  }

  if (route.name === 'todos') {
    state.tab = 'todos';
    state.currentDayId = state.current.days[0]?.id || null;
    renderCurrent();
    return;
  }

  if (route.name === 'expenses') {
    state.tab = 'expenses';
    state.currentDayId = state.current.days[0]?.id || null;
    renderCurrent();
    return;
  }

  const day = route.name === 'day'
    ? state.current.days.find(item => String(item.id) === String(route.dayId))
    : state.current.days[0];
  state.currentDayId = day?.id || null;
  state.tab = 'itinerary';

  if (day && route.name !== 'day') {
    history.replaceState({}, '', `/trips/${route.tripId}/day/${day.id}`);
  } else if (!day && route.name !== 'todos') {
    history.replaceState({}, '', `/trips/${route.tripId}/todos`);
    state.tab = 'todos';
  }
  renderCurrent();
}

function syncCurrentUrl({ replace = true } = {}) {
  if (!state.current?.trip?.id) return;
  const path = state.tab === 'today'
    ? `/trips/${state.current.trip.id}/today`
    : state.tab === 'todos'
      ? `/trips/${state.current.trip.id}/todos`
      : state.tab === 'expenses'
        ? `/trips/${state.current.trip.id}/expenses`
        : `/trips/${state.current.trip.id}/day/${state.currentDayId}`;
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
}
