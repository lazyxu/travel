import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const MAX_HTML_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 3500;
const MAX_REDIRECTS = 3;

const PLATFORM_LABELS = {
  wechat: '微信小程序',
  douyin: '抖音',
  meituan: '美团',
  dianping: '大众点评',
  xhs: '小红书',
  xianyu: '闲鱼',
  web: '网页'
};

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function cleanTitle(value) {
  return decodeEntities(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function parseAttributes(tag) {
  const attrs = {};
  const re = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(re)) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

function jsonLdCandidates(node, out = []) {
  if (!node || out.length >= 24) return out;
  if (Array.isArray(node)) {
    for (const entry of node) jsonLdCandidates(entry, out);
    return out;
  }
  if (typeof node !== 'object') return out;

  for (const key of ['headline', 'name']) {
    if (typeof node[key] === 'string') {
      const value = cleanTitle(node[key]);
      if (value && !out.includes(value)) out.push(value);
    }
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') jsonLdCandidates(value, out);
  }
  return out;
}

function extractJsonLdTitles(html) {
  const titles = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of String(html || '').matchAll(re)) {
    try {
      jsonLdCandidates(JSON.parse(match[1]), titles);
    } catch {}
  }
  return titles;
}

export function extractHtmlTitle(html) {
  const source = String(html || '');
  for (const tag of source.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = parseAttributes(tag);
    const key = String(attrs.property || attrs.name || '').toLowerCase();
    if (['og:title', 'twitter:title'].includes(key) && attrs.content) {
      const title = cleanTitle(attrs.content);
      if (title) return title;
    }
  }
  const match = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanTitle(match[1]) : '';
}

export function detectPlatform(value) {
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

function stripPlatformSuffix(title, platform) {
  let result = cleanTitle(title);
  const suffixes = {
    xhs: ['小红书'],
    douyin: ['抖音', 'Douyin'],
    meituan: ['美团'],
    dianping: ['大众点评'],
    xianyu: ['闲鱼', '咸鱼'],
    wechat: ['微信']
  }[platform] || [];

  for (const suffix of suffixes) {
    result = result
      .replace(new RegExp(`\\s*[-_｜|·—–:]\\s*${suffix}.*$`, 'i'), '')
      .replace(new RegExp(`\\s*${suffix}\\s*$`, 'i'), '')
      .trim();
  }
  return result.slice(0, 180);
}

export function extractContentTitle(html, platform = 'web') {
  const source = String(html || '');
  const jsonLd = extractJsonLdTitles(source)
    .map(title => stripPlatformSuffix(title, platform))
    .find(title => title && title !== PLATFORM_LABELS[platform]);
  if (jsonLd) return jsonLd;

  for (const tag of source.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = parseAttributes(tag);
    const key = String(attrs.property || attrs.name || '').toLowerCase();
    if (['og:title', 'twitter:title'].includes(key) && attrs.content) {
      const title = stripPlatformSuffix(attrs.content, platform);
      if (title && title !== PLATFORM_LABELS[platform]) return title;
    }
  }

  const match = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripPlatformSuffix(match[1], platform) : '';
}

export function isPrivateAddress(address) {
  const ip = String(address || '').toLowerCase();
  const family = net.isIP(ip);
  if (!family) return true;
  if (family === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (ip === '::' || ip === '::1') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || /^fe[89ab]/.test(ip)) return true;
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateAddress(mapped[1]) : false;
}

function fallbackTitle(url, platform = 'web') {
  if (platform !== 'web') return PLATFORM_LABELS[platform] || '参考入口';
  try { return new URL(url).hostname.replace(/^www\./i, ''); }
  catch { return '参考入口'; }
}

async function resolvePublicAddress(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('private address blocked');
    return hostname;
  }
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  const publicResults = results.filter(result => !isPrivateAddress(result.address));
  if (!publicResults.length || publicResults.length !== results.length) throw new Error('private address blocked');
  return publicResults[0].address;
}

async function requestHtml(urlText, redirectsLeft = MAX_REDIRECTS) {
  const url = new URL(urlText);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
  if (url.username || url.password) throw new Error('credentials not allowed');
  const allowedPort = !url.port || (url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80');
  if (!allowedPort) throw new Error('non-standard port blocked');

  const address = await resolvePublicAddress(url.hostname);
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request({
      protocol: url.protocol,
      hostname: address,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      method: 'GET',
      path: `${url.pathname}${url.search}`,
      servername: url.hostname,
      headers: {
        Host: url.host,
        'User-Agent': 'Mozilla/5.0 (compatible; TravelPlanner/1.0; +https://github.com/lazyxu/travel)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'Accept-Encoding': 'identity'
      }
    }, response => {
      const status = Number(response.statusCode || 0);
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location && redirectsLeft > 0) {
        response.resume();
        requestHtml(new URL(response.headers.location, url).toString(), redirectsLeft - 1).then(resolve, reject);
        return;
      }
      const type = String(response.headers['content-type'] || '').toLowerCase();
      if (status < 200 || status >= 300 || (type && !type.includes('text/html') && !type.includes('application/xhtml+xml'))) {
        response.resume();
        reject(new Error(`unexpected response ${status}`));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_HTML_BYTES) {
          req.destroy(new Error('response too large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), finalUrl: url.toString() }));
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    req.end();
  });
}

export async function resolveReferenceMetadata(refs) {
  return Promise.all(refs.map(async ref => {
    const value = ref.value || ref.url || '';
    const platform = detectPlatform(value);
    const customTitle = cleanTitle(ref.customTitle || ref.title || '');

    if (ref.kind === 'copy') {
      return { kind: 'copy', platform, value, title: customTitle || PLATFORM_LABELS[platform] || '参考入口', customTitle };
    }
    if (ref.kind === 'uri') {
      return { kind: 'uri', platform, value, url: ref.url || value, title: customTitle || PLATFORM_LABELS[platform] || '参考入口', customTitle };
    }

    try {
      const { html, finalUrl } = await requestHtml(ref.url);
      const finalPlatform = detectPlatform(finalUrl) || platform;
      return {
        kind: 'url',
        platform: finalPlatform,
        value: ref.url,
        url: ref.url,
        title: customTitle || extractContentTitle(html, finalPlatform) || fallbackTitle(finalUrl, finalPlatform),
        customTitle
      };
    } catch {
      return { kind: 'url', platform, value: ref.url, url: ref.url, title: customTitle || fallbackTitle(ref.url, platform), customTitle };
    }
  }));
}

export async function resolveLinkMetadata(urls) {
  return resolveReferenceMetadata(urls.map(url => ({ kind: 'url', url, value: url })));
}
