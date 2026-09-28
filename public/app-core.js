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

function itemCategoryMeta(item) {
  const kind = item?.details?.kind || '';
  if (kind === 'lodging') return { icon: '🏨', label: '酒店' };
  if (kind === 'flight') return { icon: '✈️', label: '航班' };
  if (kind === 'train') return { icon: '🚄', label: '高铁 / 火车' };
  return categoryMeta(item?.category);
}

function formatStructuredDateTime(date, time) {
  const parts = [];
  if (date) parts.push(formatDate(date));
  if (time) parts.push(time);
  return parts.join(' ');
}

const state = {
  trips: [],
  current: null,
  currentDayId: null,
  tab: 'itinerary',
  readonly: false,
  shareToken: ''
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

function dianpingClientAppUrl(value, title = '') {
  try {
    const url = new URL(String(value || ''), window.location.origin);
    if (/(^|\.)(?:m\.)?dianping\.com$/.test(url.hostname.toLowerCase()) || url.hostname.toLowerCase() === 'www.dianping.com') {
      const pathMatch = url.pathname.match(/\/(?:shop|shopshare)\/([A-Za-z0-9_-]+)/i);
      const shopId = pathMatch?.[1]
        || ['shopId', 'shopid', 'shopuuid', 'id']
          .map(key => url.searchParams.get(key))
          .find(candidate => /^[A-Za-z0-9_-]+$/.test(String(candidate || '')));
      if (shopId) return `dianping://shopinfo?id=${encodeURIComponent(shopId)}`;
    }
  } catch {}

  const keyword = String(title || '').trim();
  return keyword
    ? `dianping://searchshoplist?keyword=${encodeURIComponent(keyword)}`
    : 'dianping://';
}

function itemReferenceEntries(item) {
  const refs = Array.isArray(item?.links) ? item.links : [];
  if (refs.length) {
    return refs.map(ref => ({
      customTitle: ref?.customTitle || '',
      autoTitle: ref?.autoTitle || (!ref?.customTitle ? (ref?.title || '') : ''),
      value: ref?.value || ref?.url || '',
      platform: ref?.platform || 'web'
    })).filter(ref => ref.value);
  }
  return [item?.xhs_url, item?.dianping_url]
    .filter(Boolean)
    .map(value => ({ customTitle: '', autoTitle: '', value, platform: 'web' }));
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

function hasItemCoordinates(item) {
  if (item?.latitude === null || item?.latitude === undefined || item?.longitude === null || item?.longitude === undefined) return false;
  if (String(item.latitude).trim() === '' || String(item.longitude).trim() === '') return false;
  const lat = Number(item.latitude);
  const lng = Number(item.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function itemLocationLabel(item) {
  return item?.location_name || item?.location || '';
}

function isAndroidBrowser() {
  return /Android/i.test(navigator.userAgent);
}

function isWeChatBrowser() {
  return /MicroMessenger/i.test(navigator.userAgent);
}

function baiduAppScheme() {
  return isAndroidBrowser() ? 'bdapp' : 'baidumap';
}

function baiduAppSrc() {
  return isAndroidBrowser() ? 'webapp.lazyxu.travel' : 'ios.lazyxu.travel';
}

function enc(value) {
  return encodeURIComponent(String(value ?? ''));
}

function baiduPointUrl(item) {
  if (!hasItemCoordinates(item)) return '';
  const scheme = baiduAppScheme();
  const label = itemLocationLabel(item) || item.title || '行程地点';
  const pairs = [
    ['location', `${item.latitude},${item.longitude}`],
    ['title', label],
    ['content', item.location || label],
    ['coord_type', item.coord_type || 'bd09ll'],
    ['src', baiduAppSrc()]
  ];
  return `${scheme}://map/marker?${pairs.map(([key, value]) => `${key}=${enc(value)}`).join('&')}`;
}

function hotelStayRange(item) {
  const d = item?.details || {};
  if (d.kind !== 'lodging' || !/^\d{4}-\d{2}-\d{2}$/.test(d.checkInDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(d.checkOutDate || '')) return null;
  if (d.checkOutDate <= d.checkInDate) return null;
  return { checkInDate: d.checkInDate, checkOutDate: d.checkOutDate };
}

function tripItemById(id) {
  for (const day of state.current?.days || []) {
    const found = day.items?.find(item => String(item.id) === String(id));
    if (found) return found;
  }
  return null;
}

function hotelStayAnchorsForDay(day) {
  const date = String(day?.day_date || '').slice(0, 10);
  const hotels = (state.current?.days || []).flatMap(sourceDay => sourceDay.items || []).filter(item => hotelStayRange(item));
  const morning = [];
  const night = [];
  for (const hotel of hotels) {
    const range = hotelStayRange(hotel);
    const d = hotel.details || {};
    if (date > range.checkInDate && date <= range.checkOutDate) {
      morning.push({
        ...hotel,
        _virtualStay: true,
        _stayRole: 'morning',
        _virtualKey: `hotel-morning-${hotel.id}-${date}`,
        _stayTime: date === range.checkOutDate ? (d.checkOutTime || '早晨') : '早晨'
      });
    }
    if (date >= range.checkInDate && date < range.checkOutDate) {
      night.push({
        ...hotel,
        _virtualStay: true,
        _stayRole: 'night',
        _virtualKey: `hotel-night-${hotel.id}-${date}`,
        _stayTime: date === range.checkInDate ? (d.checkInTime || '夜间') : '夜间'
      });
    }
  }
  return { morning, night };
}

function dayDisplayItems(day) {
  const anchors = hotelStayAnchorsForDay(day);
  const regular = (day?.items || []).filter(item => !hotelStayRange(item));
  return [...anchors.morning, ...regular, ...anchors.night];
}

function itemRouteKey(item) {
  if (item?._virtualStay) return `hotel:${item.id}:${item._stayRole}`;
  return `item:${item?.id || 'unknown'}`;
}

function legKey(fromItem, toItem) {
  return `${itemRouteKey(fromItem)}>${itemRouteKey(toItem)}`;
}

function legMode(day, fromItem, toItem) {
  return day?.leg_modes?.[legKey(fromItem, toItem)] || 'driving';
}

function baiduLegUrl(fromItem, toItem, mode = 'driving') {
  if (!hasItemCoordinates(fromItem) || !hasItemCoordinates(toItem)) return '';
  const coordType = fromItem.coord_type || 'bd09ll';
  if ((toItem.coord_type || 'bd09ll') !== coordType) return '';
  const pairs = [
    ['origin', baiduDirectionPoint(fromItem)],
    ['destination', baiduDirectionPoint(toItem)],
    ['coord_type', coordType],
    ['mode', mode],
    ['src', baiduAppSrc()]
  ];
  if (fromItem.location_uid) pairs.push(['origin_uid', fromItem.location_uid]);
  if (toItem.location_uid) pairs.push(['destination_uid', toItem.location_uid]);
  return `${baiduAppScheme()}://map/direction?${pairs.map(([key, value]) => `${key}=${enc(value)}`).join('&')}`;
}

function itemExpenses(item) {
  return (state.current?.expenses || []).filter(expense => String(expense.item_id || '') === String(item?.id || ''));
}

function baiduDirectionPoint(point) {
  const name = itemLocationLabel(point) || point.title || '行程点';
  return `name:${name}|latlng:${point.latitude},${point.longitude}`;
}

function baiduViaPoint(point) {
  const result = {
    name: itemLocationLabel(point) || point.title || '行程点',
    lat: Number(point.latitude),
    lng: Number(point.longitude)
  };
  if (point.location_uid) result.uid = point.location_uid;
  return result;
}

function dayUniformRouteMode(day) {
  const items = dayDisplayItems(day);
  if (items.length < 2 || items.some(item => !hasItemCoordinates(item))) return '';
  const modes = [];
  for (let index = 0; index < items.length - 1; index += 1) {
    modes.push(legMode(day, items[index], items[index + 1]));
  }
  const unique = [...new Set(modes)];
  return unique.length === 1 ? unique[0] : '';
}

function baiduDayRouteUrl(day) {
  const mode = dayUniformRouteMode(day);
  if (!mode) return '';

  const points = dayDisplayItems(day).filter(hasItemCoordinates).slice(0, 17);
  if (points.length < 2) return '';

  const coordType = points[0].coord_type || 'bd09ll';
  if (points.some(point => (point.coord_type || 'bd09ll') !== coordType)) return '';

  const scheme = baiduAppScheme();
  const origin = points[0];
  const destination = points[points.length - 1];
  const pairs = [
    ['origin', baiduDirectionPoint(origin)],
    ['destination', baiduDirectionPoint(destination)],
    ['coord_type', coordType],
    ['mode', mode]
  ];

  if (origin.location_uid) pairs.push(['origin_uid', origin.location_uid]);
  if (destination.location_uid) pairs.push(['destination_uid', destination.location_uid]);

  const region = state.current?.trip?.destination || '';
  if (region) pairs.push(['region', region]);

  const viaPoints = points.slice(1, -1).map(baiduViaPoint);
  if (viaPoints.length) pairs.push(['viaPoints', JSON.stringify({ viaPoints })]);

  pairs.push(['src', baiduAppSrc()]);
  return `${scheme}://map/direction?${pairs.map(([key, value]) => `${key}=${enc(value)}`).join('&')}`;
}

function dayRouteLabel(day) {
  const mode = dayUniformRouteMode(day);
  if (!mode) return '';
  const meta = {
    driving: { icon: '🚕', label: '驾车' },
    walking: { icon: '🚶', label: '步行' },
    transit: { icon: '🚇', label: '公交' }
  }[mode];
  return meta ? `${meta.icon} 全天${meta.label}路线` : '';
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

  window.addEventListener('load', async () => {
    let knownCommit = '';
    let reloading = false;

    const fetchCommit = async () => {
      const response = await fetch('/api/version', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return String((await response.json()).commit || 'dev');
    };

    const showUpdate = worker => {
      const banner = document.querySelector('#pwa-update');
      const button = document.querySelector('#pwa-update-button');
      if (!banner || !button || !worker || !navigator.serviceWorker.controller) return;
      banner.classList.remove('hidden');
      button.disabled = false;
      button.textContent = '立即刷新';
      button.onclick = () => {
        button.disabled = true;
        button.textContent = '刷新中…';
        worker.postMessage({ type: 'SKIP_WAITING' });
      };
    };

    const bindRegistration = registration => {
      if (registration.waiting) showUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(worker);
        });
      });
    };

    const registerCommit = async commit => {
      const registration = await navigator.serviceWorker.register(
        `/sw.js?v=${encodeURIComponent(commit)}`,
        { scope: '/' }
      );
      bindRegistration(registration);
      return registration;
    };

    try {
      knownCommit = await fetchCommit();
      await registerCommit(knownCommit);

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });

      setInterval(async () => {
        try {
          const latestCommit = await fetchCommit();
          if (latestCommit && latestCommit !== knownCommit) {
            knownCommit = latestCommit;
            await registerCommit(latestCommit);
          }
        } catch {}
      }, 15 * 60 * 1000);
    } catch {}
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
  const shareMatch = pathname.match(/^\/share\/([A-Za-z0-9_-]{20,160})\/?$/);
  if (shareMatch) return { name: 'share', token: shareMatch[1] };
  let match = pathname.match(/^\/trips\/(\d+)\/day\/(\d+)\/?$/);
  if (match) return { name: 'day', tripId: match[1], dayId: match[2] };
  match = pathname.match(/^\/trips\/(\d+)\/todos\/?$/);
  if (match) return { name: 'todos', tripId: match[1] };
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
    state.readonly = false;
    state.shareToken = '';
    state.trips = await api('/api/trips');
    renderHome();
    return;
  }

  if (route.name === 'share') {
    state.readonly = true;
    state.shareToken = route.token;
    state.current = await api(`/api/public/share/${route.token}`);
    state.currentDayId = state.current.days[0]?.id || null;
    el.backHome.classList.add('hidden');
    el.bottomNav.classList.add('hidden');
    renderSharedTrip();
    return;
  }

  state.readonly = false;
  state.shareToken = '';
  state.current = await api(`/api/trips/${route.tripId}`);
  el.backHome.classList.remove('hidden');
  el.bottomNav.classList.remove('hidden');

  if (route.name === 'todos') {
    state.tab = 'todos';
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
  const path = state.tab === 'todos'
    ? `/trips/${state.current.trip.id}/todos`
    : `/trips/${state.current.trip.id}/day/${state.currentDayId}`;
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
}
