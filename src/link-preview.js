import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const MAX_HTML_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 3500;
const MAX_REDIRECTS = 3;

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

export function isPrivateAddress(address) {
  const ip = String(address || '').toLowerCase();
  const family = net.isIP(ip);
  if (!family) return true;
  if (family === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
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

function fallbackTitle(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '参考链接';
  }
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

export async function resolveLinkMetadata(urls) {
  return Promise.all(urls.map(async url => {
    try {
      const { html, finalUrl } = await requestHtml(url);
      return { url, title: extractHtmlTitle(html) || fallbackTitle(finalUrl) };
    } catch {
      return { url, title: fallbackTitle(url) };
    }
  }));
}
