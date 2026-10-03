// Shared helpers for the AV Compare analytics endpoints (Upstash Redis REST API, no npm packages).
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function pipeline(cmds) {
  if (!URL_ || !TOKEN) throw new Error('Database not connected (missing Upstash env vars)');
  const r = await fetch(URL_.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds)
  });
  if (!r.ok) throw new Error('Database error ' + r.status);
  const out = await r.json();
  return out.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}

// Calendar day in Toronto time, e.g. 2026-10-03
function dayKey(ts) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}

function parseUA(ua) {
  ua = ua || '';
  const tablet = /iPad|Tablet|PlayBook|Silk|Kindle|(Android(?!.*Mobile))/i.test(ua);
  const mobile = !tablet && /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua);
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'Other';
  const inApp = /FBAN|FBAV|Instagram|LinkedInApp|Line\/|; wv\)|GSA\//.test(ua);
  return { device: tablet ? 'Tablet' : mobile ? 'Mobile' : 'Desktop', os, browser, inApp };
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body !== undefined && req.body !== null && req.body !== '') {
      return resolve(typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body));
    }
    let d = ''; req.on('data', c => { d += c; if (d.length > 64000) req.destroy(); }); req.on('end', () => resolve(d)); req.on('error', () => resolve(''));
  });
}

module.exports = { pipeline, dayKey, parseUA, readBody };
