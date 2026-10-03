// Receives batched events from /av-track.js and stores them per Toronto calendar day.
const { pipeline, dayKey, parseUA, readBody } = require('../lib/avstore');

const ALLOWED = (process.env.AV_ALLOWED_HOSTS || 'eventstudio.tv,www.eventstudio.tv').split(',').map(s => s.trim());
const TYPES = ['visit', 'scroll', 'section', 'click', 'form_start', 'form_error', 'form_submit', 'spec_request', 'leave', 'hidden'];
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|monitor|facebookexternalhit|curl|wget|python/i;

function hostOf(u) { try { return new URL(u).hostname; } catch (e) { return ''; } }
function dec(v) { try { return v ? decodeURIComponent(v) : ''; } catch (e) { return v || ''; } }

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  const origin = hostOf(req.headers.origin || '') || hostOf(req.headers.referer || '');
  if (origin && !ALLOWED.includes(origin)) { res.statusCode = 403; return res.end(); }
  const ua = req.headers['user-agent'] || '';
  if (BOT.test(ua)) { res.statusCode = 204; return res.end(); }

  let data;
  try { data = JSON.parse(await readBody(req)); } catch (e) { res.statusCode = 400; return res.end(); }
  if (!data || typeof data.v !== 'string' || typeof data.s !== 'string' || !Array.isArray(data.e)) { res.statusCode = 400; return res.end(); }

  const now = Date.now();
  const h = req.headers;
  const lat = parseFloat(h['x-vercel-ip-latitude']), lon = parseFloat(h['x-vercel-ip-longitude']);
  const ctx = {
    country: h['x-vercel-ip-country'] || '', region: h['x-vercel-ip-country-region'] || '', city: dec(h['x-vercel-ip-city']),
    lat: isFinite(lat) ? Math.round(lat * 100) / 100 : null, lon: isFinite(lon) ? Math.round(lon * 100) / 100 : null,
    ...parseUA(ua)
  };

  const byDay = {};
  for (const e of data.e.slice(0, 50)) {
    if (!e || !TYPES.includes(e.t)) continue;
    const ts = (typeof e.ts === 'number' && Math.abs(e.ts - now) < 6 * 3600e3) ? e.ts : now;  // distrust far-off client clocks
    const rec = { t: e.t, ts, v: data.v.slice(0, 24), s: data.s.slice(0, 24), p: e.p && typeof e.p === 'object' ? e.p : {} };
    if (e.t === 'visit') rec.c = ctx;                          // location + device stored once per visit
    const str = JSON.stringify(rec);
    if (str.length > 4000) continue;
    const d = dayKey(ts); (byDay[d] = byDay[d] || []).push(str);
  }
  const cmds = [];
  for (const d of Object.keys(byDay)) { cmds.push(['RPUSH', 'av:e:' + d, ...byDay[d]]); cmds.push(['SADD', 'av:days', d]); }
  if (!cmds.length) { res.statusCode = 204; return res.end(); }
  try { await pipeline(cmds); res.statusCode = 204; res.end(); }
  catch (err) { console.error(err.message); res.statusCode = 503; res.end(); }
};
