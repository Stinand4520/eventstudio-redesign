// Receives the Name / Email / Company lead forms from the four landing pages,
// emails the details to admin@eventstudio.tv, and tells the page where to redirect (that campaign's thank-you page).
//
// Environment variables (Vercel project settings):
//   RESEND_API_KEY   required. API key from resend.com (eventstudio.tv must be a verified sending domain there)
//   LEAD_FROM        optional. Default: "EventStudio Website <leads@eventstudio.tv>"
//   LEAD_TO          optional. Default: admin@eventstudio.tv
//   AV_ALLOWED_HOSTS optional. Same list /api/av-collect uses
const { pipeline, readBody } = require('../lib/avstore');

const ALLOWED = (process.env.AV_ALLOWED_HOSTS || 'eventstudio.tv,www.eventstudio.tv').split(',').map(s => s.trim());
// Preview builds also accept their own address so the forms can be tested before going live. Production stays strict.
if (process.env.VERCEL_ENV !== 'production') [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].forEach(h => { if (h) ALLOWED.push(h); });
const TO = process.env.LEAD_TO || 'admin@eventstudio.tv';
const FROM = process.env.LEAD_FROM || 'EventStudio Website <leads@eventstudio.tv>';

// campaign key (sent by the page) -> label for the email + thank-you page. Anything else is rejected, so this can't be used as an open redirect.
const CAMPAIGNS = {
  'av-compare':   { label: 'AV Compare',                      thanks: '/av-compare-thank-you' },
  'award-shows':  { label: 'Award shows',                     thanks: '/award-shows-thank-you' },
  'live-streaming': { label: 'Live streaming',                thanks: '/live-streaming-thank-you' },
  'associations': { label: 'AV Compare (Associations email)', thanks: '/av-compare-associations-thank-you' }
};
const TAGS = ['ad', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

function hostOf(u) { try { return new URL(u).hostname; } catch (e) { return ''; } }
function clip(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function parse(raw, type) {
  if (!raw) return {};
  if (/json/i.test(type || '') || /^\s*\{/.test(raw)) { try { return JSON.parse(raw); } catch (e) { return {}; } }
  const out = {}; new URLSearchParams(raw).forEach((v, k) => { out[k] = v; }); return out;
}

function done(req, res, status, body, redirect) {
  const wantsJson = /json/i.test(req.headers.accept || '') || /json/i.test(req.headers['content-type'] || '');
  res.setHeader('Cache-Control', 'no-store');
  if (wantsJson || !redirect || status >= 400) {
    res.statusCode = status; res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(body));
  }
  res.statusCode = 303; res.setHeader('Location', redirect); res.end();   // plain form post (no JavaScript): go straight to the thank-you page
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.statusCode = 405; res.setHeader('Allow', 'POST'); return res.end(); }
  const origin = hostOf(req.headers.origin || '') || hostOf(req.headers.referer || '');
  if (origin && !ALLOWED.includes(origin)) { res.statusCode = 403; return res.end(); }

  const d = parse(await readBody(req), req.headers['content-type']);
  const camp = CAMPAIGNS[clip(d.campaign, 40)];
  if (!camp) return done(req, res, 400, { ok: false, error: 'Unknown form.' });

  // Honeypots: bots fill these in. Pretend it worked so they move on.
  if (d._gotcha || d.website) return done(req, res, 200, { ok: true, redirect: camp.thanks }, camp.thanks);

  const lead = {
    name: clip(d.name, 120), email: clip(d.email, 160), company: clip(d.company || d.association, 160),
    campaign: camp.label, source: clip(d.source, 300), page: clip(d.page, 200), referrer: clip(d.referrer, 300)
  };
  TAGS.forEach(k => { lead[k] = clip(d[k], 200); });
  if (!lead.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email)) {
    return done(req, res, 422, { ok: false, error: 'Please add your name and a valid email.' });
  }
  const when = new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }) + ' Toronto time';

  // 1. Keep a copy first, so a lead is never lost if email is down (best effort; read it back from the database if ever needed).
  try { await pipeline([['RPUSH', 'av:leads', JSON.stringify({ ts: Date.now(), ...lead })]]); } catch (e) { console.error('lead backup failed:', e.message); }

  // 2. Email it.
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error('lead not emailed: RESEND_API_KEY is not set'); return done(req, res, 503, { ok: false, error: 'mail-not-configured' }); }
  const rows = [['Name', lead.name], ['Email', lead.email], ['Company', lead.company || '(not given)'], ['Form', lead.campaign], ['Page', lead.page],
    ['Source', lead.source], ['Referrer', lead.referrer]].concat(TAGS.map(k => [k, lead[k]])).filter(r => r[1]);
  const text = rows.map(r => r[0] + ': ' + r[1]).join('\n') + '\nReceived: ' + when + '\n';
  const html = '<table style="font:14px/1.5 -apple-system,Segoe UI,Arial,sans-serif;border-collapse:collapse">' +
    rows.map(r => '<tr><td style="padding:3px 14px 3px 0;color:#666">' + esc(r[0]) + '</td><td style="padding:3px 0"><b>' + esc(r[1]) + '</b></td></tr>').join('') +
    '</table><p style="font:12px Arial;color:#888">Received ' + esc(when) + '</p>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [TO], reply_to: lead.email, subject: 'New enquiry: ' + camp.label + ' – ' + lead.name + (lead.company ? ' (' + lead.company + ')' : ''), text, html })
    });
    if (!r.ok) { console.error('lead email failed', r.status, (await r.text()).slice(0, 300)); return done(req, res, 502, { ok: false, error: 'mail-failed' }); }
  } catch (e) { console.error('lead email error', e.message); return done(req, res, 502, { ok: false, error: 'mail-failed' }); }

  return done(req, res, 200, { ok: true, redirect: camp.thanks }, camp.thanks);
};
