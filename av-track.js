/* EventStudio — AV Compare page analytics (first-party, anonymous).
   Records: visit + ad tag (utm_*), device/screen, scroll depth, sections reached,
   engaged time, clicks, form start / errors / submissions. No names, emails or IPs. */
(function () {
  'use strict';
  if (window.avt) return;
  try { if (localStorage.getItem('avt_off') === '1') { window.avt = function () {}; return; } } catch (e) {}
  var ENDPOINT = '/api/av-collect';
  var nav = navigator;
  if (nav.webdriver) return;                                 // headless / automated browsers
  if (/bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|monitor/i.test(nav.userAgent)) return;

  function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  // Anonymous visitor id (random, first-party, no personal info) + visit counter
  var vid = store('avt_v'); var isNew = !vid;
  if (!vid) { vid = rid(); store('avt_v', vid); }
  var visits = (parseInt(store('avt_n'), 10) || 0) + 1; store('avt_n', String(visits));
  var first = store('avt_f'); if (!first) { first = String(Date.now()); store('avt_f', first); }
  var sid = rid();
  var t0 = Date.now();

  var q = {}, sp = new URLSearchParams(location.search);
  sp.forEach(function (v, k) { if (Object.keys(q).length < 15) q[k.slice(0, 40)] = v.slice(0, 120); });
  // Remember the ad tag for return visits that arrive without one
  var tag = { src: q.utm_source || '', med: q.utm_medium || '', cmp: q.utm_campaign || '', cnt: q.utm_content || '', trm: q.utm_term || '' };
  if (tag.src || tag.cnt) store('avt_tag', JSON.stringify(tag));
  var firstTag = null; try { firstTag = JSON.parse(store('avt_tag') || 'null'); } catch (e) {}

  var queue = [];
  function ev(type, props) {
    queue.push({ t: type, ts: Date.now(), p: props || {} });
    if (queue.length >= 20) flush();
  }
  function flush(final) {
    if (!queue.length) return;
    var body = JSON.stringify({ v: vid, s: sid, e: queue.splice(0, 50) });
    if (final && nav.sendBeacon) { nav.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' })); return; }
    try { fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(function () {}); } catch (e) {}
  }
  setInterval(function () { flush(); }, 3000);
  setTimeout(function () { flush(); }, 1500);                  // early update: first sections + scroll

  var ref = '';
  try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
  ev('visit', {
    q: q, tag: tag, firstTag: firstTag, ref: ref, path: location.pathname,
    newV: isNew, n: visits, firstSeen: +first,
    lang: nav.language || '', tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''),
    sw: screen.width, sh: screen.height, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio || 1,
    touch: ('ontouchstart' in window) || nav.maxTouchPoints > 0,
    conn: (nav.connection && nav.connection.effectiveType) || '',
    dark: !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)
  });
  flush();                                                    // send the visit right away so quick bounces still count

  // Engaged time: counts only while the tab is visible and the user was active in the last 30 s
  var engaged = 0, lastTick = Date.now(), lastAct = Date.now();
  ['scroll', 'mousemove', 'keydown', 'touchstart', 'click'].forEach(function (n) {
    addEventListener(n, function () { lastAct = Date.now(); }, { passive: true });
  });
  setInterval(function () {
    var now = Date.now();
    if (document.visibilityState === 'visible' && now - lastAct < 30000) engaged += now - lastTick;
    lastTick = now;
  }, 1000);

  // Scroll depth milestones
  var maxScroll = 0, marks = [25, 50, 75, 90, 100];
  function onScroll() {
    var h = document.documentElement.scrollHeight - innerHeight;
    var pct = h > 0 ? Math.min(100, Math.round(scrollY / h * 100)) : 100;
    while (marks.length && pct >= marks[0]) { var m = marks.shift(); ev('scroll', { pct: m }); }
    if (pct > maxScroll) maxScroll = pct;
  }
  addEventListener('scroll', onScroll, { passive: true });

  // Sections reached (in order of the page)
  var seen = [];
  function secName(el) {
    if (el.id) return el.id;
    var c = (el.className || '').toString().split(' ').filter(function (x) { return x && x !== 'reveal' && x !== 'in'; });
    return c[0] || 'section';
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!en.isIntersecting) return;
        var n = secName(en.target);
        if (seen.indexOf(n) === -1) { seen.push(n); ev('section', { name: n, at: Date.now() - t0 }); }
        io.unobserve(en.target);
      });
    }, { threshold: 0.35 });
    document.addEventListener('DOMContentLoaded', function () {
      document.querySelectorAll('main section, section').forEach(function (s) { io.observe(s); });
      onScroll();
    });
  }

  // Clicks on links and buttons
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a,button');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var kind = a.tagName === 'BUTTON' ? 'button' : /^mailto:/.test(href) ? 'email' : /^tel:/.test(href) ? 'phone'
      : /^#/.test(href) ? 'jump' : (a.hostname && a.hostname !== location.hostname) ? 'external' : 'internal';
    ev('click', { label: (a.textContent || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60), kind: kind, href: href.slice(0, 120) });
  }, true);

  // Form: first interaction, which fields get touched, validation errors (no field values are sent)
  document.addEventListener('DOMContentLoaded', function () {
    var f = document.getElementById('specForm'); if (!f) return;
    var started = false, touched = [];
    f.addEventListener('focusin', function (e) {
      var n = e.target.name; if (!n || n.charAt(0) === '_') return;
      if (!started) { started = true; ev('form_start', { field: n, at: Date.now() - t0 }); }
      if (touched.indexOf(n) === -1) touched.push(n);
    });
    f.addEventListener('submit', function () {
      var bad = f.querySelector(':invalid');
      if (bad) ev('form_error', { field: bad.name || '' });
      else ev('form_submit', { fields: touched.length });
    }, true);
  });

  // Public hook: the page calls avt('spec_request', {...}) when the form is accepted
  window.avt = function (name, props) { ev(name, props); flush(); };

  function leave() {
    ev('leave', { engagedMs: engaged, totalMs: Date.now() - t0, maxScroll: maxScroll, sections: seen.length });
    flush(true);
  }
  addEventListener('pagehide', leave);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      ev('hidden', { engagedMs: engaged, totalMs: Date.now() - t0, maxScroll: maxScroll, sections: seen.length });
      flush(true);
    }
  });
})();
