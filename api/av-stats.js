// Password-protected read API for the dashboard. GET = events + ad impressions, POST = save impressions.
const crypto = require('crypto');
const { pipeline, readBody } = require('../lib/avstore');

function okKey(given) {
  const real = process.env.AV_STATS_KEY || '';
  if (!real || !given) return false;
  const a = crypto.createHash('sha256').update(String(given)).digest(), b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Type', 'application/json');
  if (!okKey(req.headers['x-av-key'])) { await new Promise(r => setTimeout(r, 400)); res.statusCode = 401; return res.end('{"error":"wrong password"}'); }
  try {
    if (req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      const imp = body.impressions || {};
      const flat = [];
      for (const k of Object.keys(imp).slice(0, 100)) {
        const n = Math.max(0, Math.floor(Number(imp[k]) || 0));
        if (/^[a-z0-9_\-]{1,60}$/i.test(k)) flat.push(k, String(n));
      }
      if (flat.length) await pipeline([['HSET', 'av:impr', ...flat]]);
      res.statusCode = 200; return res.end('{"ok":true}');
    }
    const url = new URL(req.url, 'http://x');
    const from = url.searchParams.get('from') || '0000-00-00', to = url.searchParams.get('to') || '9999-99-99';
    const [days, imprArr] = await pipeline([['SMEMBERS', 'av:days'], ['HGETALL', 'av:impr']]);
    const want = (days || []).filter(d => d >= from && d <= to).sort();
    const events = [];
    for (let i = 0; i < want.length; i += 60) {
      const lists = await pipeline(want.slice(i, i + 60).map(d => ['LRANGE', 'av:e:' + d, '0', '-1']));
      lists.forEach(l => (l || []).forEach(s => { try { events.push(JSON.parse(s)); } catch (e) {} }));
    }
    const impressions = {};
    for (let i = 0; i + 1 < (imprArr || []).length; i += 2) impressions[imprArr[i]] = Number(imprArr[i + 1]) || 0;
    res.statusCode = 200;
    res.end(JSON.stringify({ days: want, events, impressions, generated: Date.now() }));
  } catch (err) {
    res.statusCode = 503; res.end(JSON.stringify({ error: err.message }));
  }
};
