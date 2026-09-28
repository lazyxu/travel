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
  sortingDayId: null,
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

function emptyStateIconSvg(kind = 'calendar') {
  const icons = {
    trip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7V5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5V7"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7v13M16 7v13M3 12h18"/></svg>',
    add: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v3M18 3v3M4.5 8.5h15M5 5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 5 5Z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 14.5 14.5 9.5"/><path d="M7.5 16.5 6 18a3 3 0 0 1-4.2-4.2l3-3A3 3 0 0 1 9 10"/><path d="m16.5 7.5 1.5-1.5a3 3 0 0 1 4.2 4.2l-3 3A3 3 0 0 1 15 14"/></svg>'
  };
  return icons[kind] || icons.calendar;
}

function emptyStateHtml({ icon = 'calendar', title, detail = '' } = {}) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${emptyStateIconSvg(icon)}</div>
      <strong>${escapeHtml(title || '暂无内容')}</strong>
      ${detail ? `<div class="empty-detail">${escapeHtml(detail)}</div>` : ''}
    </div>
  `;
}

function showToast(message, type = 'info') {
  el.toast.textContent = message;
  el.toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { el.toast.className = 'toast'; }, 2600);
}

const networkActivity = { count: 0, timer: null };

function beginNetworkActivity() {
  networkActivity.count += 1;
  if (networkActivity.count !== 1) return;
  clearTimeout(networkActivity.timer);
  networkActivity.timer = setTimeout(() => {
    if (networkActivity.count <= 0) return;
    document.querySelector('#network-progress')?.classList.add('show');
  }, 180);
}

function endNetworkActivity() {
  networkActivity.count = Math.max(0, networkActivity.count - 1);
  if (networkActivity.count > 0) return;
  clearTimeout(networkActivity.timer);
  networkActivity.timer = null;
  document.querySelector('#network-progress')?.classList.remove('show');
}

async function api(url, options = {}) {
  beginNetworkActivity();
  const controller = options.signal ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), 30000) : null;

  try {
    let response;
    try {
      response = await fetch(url, {
        ...options,
        ...(controller ? { signal: controller.signal } : {}),
        headers: {
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {})
        }
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('请求超时，请稍后重试');
      if (error instanceof TypeError) throw new Error('网络连接失败，请检查网络后重试');
      throw error;
    }

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
  } finally {
    if (timeout) clearTimeout(timeout);
    endNetworkActivity();
  }
}

function syncOnlineStatus({ announce = false } = {}) {
  const offline = navigator.onLine === false;
  document.querySelector('#offline-status')?.classList.toggle('hidden', !offline);
  document.body.classList.toggle('is-offline', offline);
  if (announce && !offline) showToast('网络已恢复');
}

window.addEventListener('offline', () => {
  syncOnlineStatus();
});
window.addEventListener('online', () => {
  syncOnlineStatus({ announce: true });
});

function showLogin() {
  closeSheet(true);
  el.app.classList.add('hidden');
  el.loginView.classList.remove('hidden');
  setTimeout(() => el.loginPassword.focus(), 50);
}

function showApp() {
  el.loginView.classList.add('hidden');
  el.app.classList.remove('hidden');
  syncOnlineStatus();
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

function defaultTripDay(days = [], today = localDateKey()) {
  if (!days.length) return null;
  const sorted = [...days].sort((a, b) => String(a.day_date || '').localeCompare(String(b.day_date || '')));
  const exact = sorted.find(day => String(day.day_date || '').slice(0, 10) === today);
  if (exact) return exact;
  const next = sorted.find(day => String(day.day_date || '').slice(0, 10) > today);
  return next || sorted[sorted.length - 1];
}

function tripSortValue(trip, today = localDateKey()) {
  const status = tripStatusMeta(trip, today);
  const start = String(trip?.start_date || '9999-12-31').slice(0, 10);
  const end = String(trip?.end_date || '0000-01-01').slice(0, 10);
  if (status.kind === 'active') return `0:${start}`;
  if (status.kind === 'upcoming') return `1:${start}`;
  if (status.kind === 'undated') return '2:9999-12-31';
  const invertedPast = String(99999999 - Number(end.replaceAll('-', '') || 0)).padStart(8, '0');
  return `3:${invertedPast}`;
}

function todoDueMeta(todo, today = localDateKey()) {
  if (todo?.done) return { kind: 'done', label: '已完成' };
  const due = String(todo?.due_date || '').slice(0, 10);
  if (!due) return { kind: 'none', label: '' };
  if (due < today) return { kind: 'overdue', label: `已逾期 · ${formatDate(due)}` };
  if (due === today) return { kind: 'today', label: '今天截止' };
  const days = Math.max(0, daysBetween(today, due));
  if (days === 1) return { kind: 'soon', label: '明天截止' };
  if (days <= 7) return { kind: 'soon', label: `${days} 天后截止` };
  return { kind: 'future', label: `截止 ${formatDate(due)}` };
}

function tripStatusMeta(trip, today = localDateKey()) {
  const start = String(trip?.start_date || '').slice(0, 10);
  const end = String(trip?.end_date || '').slice(0, 10);
  if (!start && !end) return { kind: 'undated', label: '未设置日期', progress: null };

  if (start && today < start) {
    const days = Math.max(0, daysBetween(today, start));
    return {
      kind: 'upcoming',
      label: days === 1 ? '明天出发' : days === 0 ? '今天出发' : `${days} 天后出发`,
      progress: 0
    };
  }

  if (end && today > end) {
    return { kind: 'past', label: '已结束', progress: 100 };
  }

  if (start && end && today >= start && today <= end) {
    const total = Math.max(1, daysBetween(start, end) + 1);
    const current = Math.min(total, Math.max(1, daysBetween(start, today) + 1));
    return {
      kind: 'active',
      label: `旅行中 · D${current}/${total}`,
      progress: Math.round((current / total) * 100)
    };
  }

  if (start && today >= start) return { kind: 'active', label: '旅行中', progress: null };
  return { kind: 'upcoming', label: '即将出发', progress: null };
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

function detectReferencePlatform(value) {
  const raw = String(value || '').toLowerCase();
  if (raw.startsWith('weixin://') || raw.includes('小程序://')) return 'wechat';
  let host = '';
  try { host = new URL(value).hostname.toLowerCase(); } catch {}
  if (/xiaohongshu\.com$|xhslink\.com$/.test(host)) return 'xhs';
  if (/douyin\.com$|iesdouyin\.com$/.test(host)) return 'douyin';
  if (/meituan\.com$|meituan\.net$/.test(host)) return 'meituan';
  if (/dianping\.com$|dpurl\.cn$/.test(host)) return 'dianping';
  if (/goofish\.com$|2\.taobao\.com$/.test(host)) return 'xianyu';
  if (/wxaurl\.cn$|weixin\.qq\.com$|mp\.weixin\.qq\.com$/.test(host)) return 'wechat';
  return 'web';
}

function referencePlatformMeta(platform) {
  return REFERENCE_PLATFORM_META[platform] || REFERENCE_PLATFORM_META.web;
}

function referenceActionMeta(link) {
  const href = link?.url || link?.value || '';
  const platform = link?.platform || detectReferencePlatform(href);
  const meta = referencePlatformMeta(platform);

  if (link?.kind === 'copy') {
    if (platform === 'wechat') {
      return {
        type: 'wechat-copy-open',
        platform,
        label: `${meta.icon} ${link.title || meta.label} · 复制口令并打开微信`,
        value: link.value || ''
      };
    }
    return { type: 'copy', platform, label: `${meta.icon} ${link.title || meta.label} · 复制口令`, value: link.value || '' };
  }

  if (platform === 'wechat' && link?.kind === 'uri') {
    return { type: 'wechat-scheme', platform, label: `${meta.icon} ${link.title || meta.label} · 打开 App`, href };
  }

  if (platform === 'dianping') {
    return {
      type: 'app',
      platform,
      label: `${meta.icon} ${link.title || meta.label} · 打开 App`,
      href: link.appUrl || dianpingClientAppUrl(href, link.title || meta.label)
    };
  }

  if (link?.appUrl) {
    return { type: 'app', platform, label: `${meta.icon} ${link.title || meta.label} · 打开 App`, href: link.appUrl };
  }

  if (platform === 'wechat') {
    return { type: 'web', platform, label: `${meta.icon} ${link.title || meta.label} · 打开小程序`, href };
  }

  return { type: 'web', platform, label: `${meta.icon} ${link.title || meta.label} · 打开网页`, href };
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
      platform: ref?.platform || detectReferencePlatform(ref?.value || ref?.url || '')
    })).filter(ref => ref.value);
  }
  return [item?.xhs_url, item?.dianping_url]
    .filter(Boolean)
    .map(value => ({ customTitle: '', autoTitle: '', value, platform: detectReferencePlatform(value) }));
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

function itemRoutePoint(item) {
  const candidates = item?.details?.kind === 'dining' && Array.isArray(item.details.candidates)
    ? item.details.candidates
    : [];
  if (candidates.length) {
    const first = candidates[0];
    return {
      ...item,
      location_name: first.name || '',
      location_uid: first.locationUid || '',
      location: first.address || '',
      latitude: first.latitude ?? null,
      longitude: first.longitude ?? null,
      coord_type: first.coordType || 'bd09ll'
    };
  }
  return item;
}

function hasItemCoordinates(item) {
  item = itemRoutePoint(item);
  if (item?.latitude === null || item?.latitude === undefined || item?.longitude === null || item?.longitude === undefined) return false;
  if (String(item.latitude).trim() === '' || String(item.longitude).trim() === '') return false;
  const lat = Number(item.latitude);
  const lng = Number(item.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function itemLocationLabel(item) {
  item = itemRoutePoint(item);
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
  item = itemRoutePoint(item);
  if (!hasItemCoordinates(item)) return '';
  const scheme = baiduAppScheme();
  const label = itemLocationLabel(item) || item.title || '行程位置';
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
  fromItem = itemRoutePoint(fromItem);
  toItem = itemRoutePoint(toItem);
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
  point = itemRoutePoint(point);
  const name = itemLocationLabel(point) || point.title || '行程点';
  return `name:${name}|latlng:${point.latitude},${point.longitude}`;
}

function baiduViaPoint(point) {
  point = itemRoutePoint(point);
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

  const points = dayDisplayItems(day).filter(hasItemCoordinates).map(itemRoutePoint).slice(0, 17);
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
      button.textContent = '更新';
      button.onclick = async () => {
        if (hasUnsavedChanges()) {
          const proceed = await confirmAction({
            title: '更新应用？',
            message: '更新会刷新页面，当前尚未保存的修改将丢失。',
            confirmLabel: '更新并刷新',
            danger: false
          });
          if (!proceed) return;
        }
        button.disabled = true;
        button.textContent = '更新中…';
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

function topOpenDialog() {
  const selectors = ['#action-confirm', '#order-analyzer', '#link-analyzer', '#item-subsheet', '#sheet'];
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (node && !node.classList.contains('hidden')) return node;
  }
  return null;
}

function syncDialogBodyLock() {
  document.body.classList.toggle('dialog-open', Boolean(topOpenDialog()));
}

function focusDialogInitial(root, preferred = null) {
  if (!root) return;
  root._returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const target = preferred || root.querySelector(
    'form input:not([type="hidden"]):not([disabled]), form textarea:not([disabled]), form select:not([disabled]), form button:not([disabled])'
  );
  setTimeout(() => {
    if (!target?.isConnected || root.classList.contains('hidden')) return;
    try { target.focus({ preventScroll: true }); } catch { target.focus?.(); }
  }, 50);
}

function restoreDialogFocus(root) {
  const target = root?._returnFocus;
  if (root) root._returnFocus = null;
  setTimeout(() => {
    if (!target?.isConnected) return;
    try { target.focus({ preventScroll: true }); } catch { target.focus?.(); }
  }, 0);
}

const actionConfirmState = { resolve: null };

function ensureActionConfirm() {
  let modal = document.querySelector('#action-confirm');
  if (modal) return modal;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="action-confirm-backdrop" class="action-confirm-backdrop hidden"></div>
    <section id="action-confirm" class="action-confirm hidden" role="alertdialog" aria-modal="true" aria-labelledby="action-confirm-title" aria-describedby="action-confirm-message">
      <div class="action-confirm-icon" aria-hidden="true">!</div>
      <div class="action-confirm-copy">
        <h2 id="action-confirm-title">确认操作</h2>
        <p id="action-confirm-message"></p>
      </div>
      <div class="action-confirm-actions">
        <button class="button ghost" type="button" data-action-confirm-cancel>取消</button>
        <button class="button danger" type="button" data-action-confirm-ok>确认</button>
      </div>
    </section>
  `);

  modal = document.querySelector('#action-confirm');
  const backdrop = document.querySelector('#action-confirm-backdrop');
  const finish = value => {
    if (modal.classList.contains('hidden')) return;
    modal.classList.add('hidden');
    backdrop?.classList.add('hidden');
    syncDialogBodyLock();
    restoreDialogFocus(modal);
    const resolve = actionConfirmState.resolve;
    actionConfirmState.resolve = null;
    resolve?.(Boolean(value));
  };

  modal.querySelector('[data-action-confirm-cancel]')?.addEventListener('click', () => finish(false));
  modal.querySelector('[data-action-confirm-ok]')?.addEventListener('click', () => finish(true));
  backdrop?.addEventListener('click', () => finish(false));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || modal.classList.contains('hidden')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finish(false);
  }, true);

  modal._finishConfirm = finish;
  return modal;
}

function confirmAction({ title = '确认操作', message = '', confirmLabel = '确认', danger = true } = {}) {
  const modal = ensureActionConfirm();
  const backdrop = document.querySelector('#action-confirm-backdrop');
  const ok = modal.querySelector('[data-action-confirm-ok]');
  modal.querySelector('#action-confirm-title').textContent = title;
  modal.querySelector('#action-confirm-message').textContent = message;
  ok.textContent = confirmLabel;
  ok.classList.toggle('danger', Boolean(danger));
  ok.classList.toggle('primary', !danger);

  if (actionConfirmState.resolve) actionConfirmState.resolve(false);

  modal.classList.remove('hidden');
  backdrop?.classList.remove('hidden');
  syncDialogBodyLock();
  focusDialogInitial(modal, ok);

  return new Promise(resolve => {
    actionConfirmState.resolve = resolve;
  });
}

document.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const dialog = topOpenDialog();
  if (!dialog) return;

  const focusables = [...dialog.querySelectorAll(
    'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
  )].filter(node => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.closest('.hidden')) return false;
    return node.offsetParent !== null || getComputedStyle(node).position === 'fixed';
  });

  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (!dialog.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}, true);

function formSnapshot(form) {
  if (!form) return '';
  const entries = [];
  for (const [name, value] of new FormData(form).entries()) {
    entries.push([name, typeof value === 'string' ? value : `${value.name}:${value.size}:${value.type}`]);
  }
  return JSON.stringify(entries);
}

function hasUnsavedChanges() {
  if (!el.sheet.classList.contains('hidden')) {
    const submitting = el.sheetForm.dataset.submitting === '1';
    const initial = el.sheetForm.dataset.initialSnapshot || '';
    if (!submitting && formSnapshot(el.sheetForm) !== initial) return true;
  }

  const dirtyDialogs = [
    ['#item-subsheet', '#item-subsheet-form'],
    ['#link-analyzer', '#link-analyzer-form'],
    ['#order-analyzer', '#order-analyzer-form']
  ];
  return dirtyDialogs.some(([dialogSelector, formSelector]) => {
    const dialog = document.querySelector(dialogSelector);
    const form = document.querySelector(formSelector);
    return Boolean(dialog && !dialog.classList.contains('hidden') && form?.dataset.dirty === '1');
  });
}

window.addEventListener('beforeunload', event => {
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = '';
});

function clearFormError(form) {
  form?.querySelector('[data-form-error]')?.remove();
}

function showFormError(form, message) {
  if (!form) return;
  clearFormError(form);
  const box = document.createElement('div');
  box.className = 'form-error';
  box.dataset.formError = '1';
  box.setAttribute('role', 'alert');
  box.textContent = String(message || '操作失败，请重试');
  form.prepend(box);
}

function busyButtonLabel(button) {
  const explicit = button?.dataset?.busyLabel;
  if (explicit) return explicit;
  const text = String(button?.textContent || '').trim();
  if (text.includes('保存')) return '保存中…';
  if (text.includes('完成')) return '处理中…';
  if (text.includes('应用')) return '应用中…';
  if (text.includes('生成')) return '生成中…';
  if (text.includes('登录') || text.includes('进入')) return '登录中…';
  return '处理中…';
}

function setButtonBusy(button, busy, label = '') {
  if (!button) return;
  if (busy) {
    if (!Object.prototype.hasOwnProperty.call(button.dataset, 'idleLabel')) {
      button.dataset.idleLabel = button.textContent || '';
    }
    button.disabled = true;
    button.classList.add('is-busy');
    button.textContent = label || busyButtonLabel(button);
    return;
  }

  button.disabled = false;
  button.classList.remove('is-busy');
  if (Object.prototype.hasOwnProperty.call(button.dataset, 'idleLabel')) {
    button.textContent = button.dataset.idleLabel;
    delete button.dataset.idleLabel;
  }
}

function openSheet(title, body, onSubmit) {
  el.sheetTitle.textContent = title;
  el.sheetForm.innerHTML = body;
  el.sheetForm.dataset.initialSnapshot = formSnapshot(el.sheetForm);
  el.sheetForm.dataset.submitting = '0';
  el.sheetForm.addEventListener('input', () => clearFormError(el.sheetForm), { once: true });

  el.sheetForm.onsubmit = async event => {
    event.preventDefault();
    const submit = event.submitter || el.sheetForm.querySelector('[type="submit"]');
    el.sheetForm.dataset.submitting = '1';
    setButtonBusy(submit, true);
    try {
      await onSubmit(new FormData(el.sheetForm), event);
    } catch (error) {
      el.sheetForm.dataset.submitting = '0';
      setButtonBusy(submit, false);
      showFormError(el.sheetForm, error.message);
      showToast(error.message, 'error');
    }
  };

  el.sheetBackdrop.classList.remove('hidden');
  el.sheet.classList.remove('hidden');
  syncDialogBodyLock();
  focusDialogInitial(el.sheet);
}

function closeSheet(force = false) {
  if (el.sheet.classList.contains('hidden')) return true;

  const changed = formSnapshot(el.sheetForm) !== (el.sheetForm.dataset.initialSnapshot || '');
  const submitting = el.sheetForm.dataset.submitting === '1';
  if (!force && changed && !submitting) {
    if (!confirm('有尚未保存的修改，确定放弃吗？')) return false;
  }

  el.sheet.classList.add('hidden');
  el.sheetBackdrop.classList.add('hidden');
  el.sheetForm.innerHTML = '';
  el.sheetForm.onsubmit = null;
  delete el.sheetForm.dataset.initialSnapshot;
  delete el.sheetForm.dataset.submitting;
  syncDialogBodyLock();
  restoreDialogFocus(el.sheet);
  return true;
}

async function loadTrips() {
  const version = ++routeLoadVersion;
  const trips = await api('/api/trips');
  if (version !== routeLoadVersion) return;
  state.trips = trips;
  renderHome();
}


let routeLoadVersion = 0;

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
  const version = ++routeLoadVersion;
  const route = parseRoute();

  if (route.name === 'not-found') {
    history.replaceState({}, '', '/');
    return loadRoute();
  }

  if (route.name === 'home') {
    state.readonly = false;
    state.shareToken = '';
    const trips = await api('/api/trips');
    if (version !== routeLoadVersion) return;
    state.trips = trips;
    renderHome();
    return;
  }

  if (route.name === 'share') {
    const current = await api(`/api/public/share/${route.token}`);
    if (version !== routeLoadVersion) return;
    state.readonly = true;
    state.shareToken = route.token;
    state.current = current;
    state.currentDayId = state.current.days[0]?.id || null;
    el.backHome.classList.add('hidden');
    el.bottomNav.classList.add('hidden');
    renderSharedTrip();
    return;
  }

  const current = await api(`/api/trips/${route.tripId}`);
  if (version !== routeLoadVersion) return;

  state.readonly = false;
  state.shareToken = '';
  state.current = current;
  el.backHome.classList.remove('hidden');
  el.bottomNav.classList.remove('hidden');

  if (route.name === 'todos') {
    state.tab = 'todos';
    state.sortingDayId = null;
    state.currentDayId = defaultTripDay(state.current.days)?.id || null;
    renderCurrent();
    return;
  }

  const day = route.name === 'day'
    ? state.current.days.find(item => String(item.id) === String(route.dayId))
    : defaultTripDay(state.current.days);
  state.currentDayId = day?.id || null;
  if (String(state.sortingDayId || '') !== String(state.currentDayId || '')) state.sortingDayId = null;
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
