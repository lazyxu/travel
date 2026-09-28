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
  logout: document.querySelector('#logout-button'),
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

