(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = sessionStorage.getItem('avk') || '';
  var RAW = null, IMPR = {}, chart = null, map = null, layer = null;
  var TZ = 'America/Toronto';

  var FORMATS = { gif: 'Animated GIF', html5: 'Animated HTML5', static: 'Static' };
  var SIZES = [['desktop', '970x250'], ['desktop', '728x90'], ['desktop', '300x600'], ['desktop', '300x250'], ['desktop', '160x600'],
               ['mobile', '320x50'], ['mobile', '300x250'], ['mobile', '728x90']];
  var CREATIVES = [];
  Object.keys(FORMATS).forEach(function (f) { SIZES.forEach(function (s) { CREATIVES.push(f + '_' + s[0] + '_' + s[1]); }); });
  var SECTION_NAMES = { hero: 'Top of page', offer: 'The offer', why: 'Why it matters', how: 'How it works', who: 'Who it\u2019s for',
    'why-eventstudio': 'Why EventStudio', 'spec-form': 'Quote form' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pct(a, b) { return b ? (a / b * 100) : 0; }
  function fmtPct(x, d) { return (isFinite(x) ? x : 0).toFixed(d == null ? 1 : d) + '%'; }
  function fmtTime(ms) { var s = Math.round((ms || 0) / 1000); return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's'; }
  function n(x) { return (x || 0).toLocaleString('en-CA'); }
  function tzParts(ts) {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(ts));
    var o = {}; p.forEach(function (x) { o[x.type] = x.value; }); return o;
  }
  function dayOf(ts) { var o = tzParts(ts); return o.year + '-' + o.month + '-' + o.day; }
  function todayStr(offsetDays) { return dayOf(Date.now() - (offsetDays || 0) * 864e5); }

  // ---------- Auth + loading ----------
  $('loginForm').addEventListener('submit', function (e) { e.preventDefault(); KEY = $('pw').value; load(true); });
  function api(method, qs, body) {
    return fetch('/api/av-stats' + (qs || ''), { method: method, headers: { 'x-av-key': KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('Error ' + r.status)); return j; }); });
  }
  function rangeQS() {
    var r = $('range').value;
    if (r === 'all') return '';
    if (r === 'custom') return '?from=' + ($('from').value || '0000-00-00') + '&to=' + ($('to').value || '9999-99-99');
    return '?from=' + todayStr(+r - 1) + '&to=' + todayStr(0);
  }
  function load(fromLogin) {
    $('err').textContent = fromLogin ? 'Loading…' : '';
    api('GET', rangeQS()).then(function (j) {
      sessionStorage.setItem('avk', KEY);
      $('login').classList.add('hide'); $('app').classList.remove('hide');
      RAW = j.events; IMPR = j.impressions || {};
      $('updated').textContent = 'Updated ' + new Date(j.generated).toLocaleString('en-CA', { timeZone: TZ }) + ' · ' + n(j.events.length) + ' events';
      render();
    }).catch(function (e) {
      if (/password/i.test(e.message)) { sessionStorage.removeItem('avk'); $('login').classList.remove('hide'); $('app').classList.add('hide'); $('err').textContent = 'That password didn\u2019t work.'; }
      else { $('err').textContent = e.message; if (!$('app').classList.contains('hide')) alert('Could not load: ' + e.message); }
    });
  }
  $('range').addEventListener('change', function () {
    var c = $('range').value === 'custom';
    $('from').classList.toggle('hide', !c); $('to').classList.toggle('hide', !c);
    if (!c) load();
  });
  $('from').addEventListener('change', load); $('to').addEventListener('change', load);
  $('reload').addEventListener('click', function () { load(); });
  $('src').addEventListener('change', render);

  // ---------- Build one record per visit ----------
  function excluded() { try { return JSON.parse(localStorage.getItem('avt_ignore') || '[]'); } catch (e) { return []; } }
  function buildVisits(events) {
    var ign = excluded(), by = {};
    events.forEach(function (e) {
      if (ign.indexOf(e.v) !== -1) return;
      var s = by[e.s] || (by[e.s] = { sid: e.s, vid: e.v, ev: [] }); s.ev.push(e);
    });
    var out = [];
    Object.keys(by).forEach(function (k) {
      var s = by[k], v = null;
      s.ev.sort(function (a, b) { return a.ts - b.ts; });
      s.ev.forEach(function (e) { if (e.t === 'visit' && !v) v = e; });
      if (!v) return;
      var p = v.p || {}, c = v.c || {};
      var tag = (p.tag && (p.tag.src || p.tag.cnt)) ? p.tag : null, viaFirst = false;
      if (!tag && p.firstTag && (p.firstTag.src || p.firstTag.cnt)) { tag = p.firstTag; viaFirst = true; }
      var isAd = !!(tag && (/geofence|geo/i.test(tag.src) || /display/i.test(tag.med) || /av-?compare/i.test(tag.cmp)));
      var cnt = (tag && tag.cnt || '').toLowerCase(), parts = cnt.split('_');
      var r = {
        sid: s.sid, vid: s.vid, ts: v.ts, day: dayOf(v.ts), c: c, p: p,
        isAd: isAd, returningFromAd: viaFirst, creative: isAd ? cnt : '', format: isAd && FORMATS[parts[0]] ? parts[0] : '', adSize: parts[2] || '',
        source: isAd ? 'Geofence ad' : (p.ref ? (/google\./.test(p.ref) ? 'Google search' : /bing\./.test(p.ref) ? 'Bing search' : /linkedin/.test(p.ref) ? 'LinkedIn' : /eventstudio\.tv$/.test(p.ref) ? 'eventstudio.tv (other page)' : p.ref) : 'Direct / typed / email'),
        newV: !!p.newV, nVisits: p.n || 1,
        maxScroll: 0, engaged: 0, total: 0, sections: [], clicks: [], formStart: false, formErr: [], submitted: false, request: false, attendees: null
      };
      s.ev.forEach(function (e) {
        var q = e.p || {};
        if (e.t === 'scroll') r.maxScroll = Math.max(r.maxScroll, q.pct || 0);
        if (e.t === 'leave' || e.t === 'hidden') { r.maxScroll = Math.max(r.maxScroll, q.maxScroll || 0); r.engaged = Math.max(r.engaged, q.engagedMs || 0); r.total = Math.max(r.total, q.totalMs || 0); }
        if (e.t === 'section' && r.sections.indexOf(q.name) === -1) r.sections.push(q.name);
        if (e.t === 'click') r.clicks.push(q.label || q.kind);
        if (e.t === 'form_start') r.formStart = true;
        if (e.t === 'form_error') r.formErr.push(q.field || '?');
        if (e.t === 'form_submit') r.submitted = true;
        if (e.t === 'spec_request') { r.request = true; if (q.attendees) r.attendees = +q.attendees; }
      });
      if (!r.total) r.total = Math.max(0, s.ev[s.ev.length - 1].ts - v.ts);
      out.push(r);
    });
    return out.sort(function (a, b) { return b.ts - a.ts; });
  }

  // ---------- Render helpers ----------
  function bars(id, map, opts) {
    opts = opts || {};
    var arr = Object.keys(map).map(function (k) { return [k, map[k]]; });
    if (!opts.keepOrder) arr.sort(function (a, b) { return b[1] - a[1]; });
    arr = arr.slice(0, opts.limit || 8);
    var max = opts.max || Math.max.apply(null, arr.map(function (x) { return x[1]; }).concat([1]));
    $(id).innerHTML = arr.length ? arr.map(function (x) {
      return '<div class="row"><span class="lab" title="' + esc(x[0]) + '">' + esc(x[0]) + '</span><span class="bar"><i style="width:' + (x[1] / max * 100).toFixed(1) + '%"></i></span><span class="num">' + (opts.fmt ? opts.fmt(x[1]) : n(x[1])) + '</span></div>';
    }).join('') : '<p class="empty">No data yet</p>';
  }
  function count(list, fn) { var m = {}; list.forEach(function (x) { var k = fn(x); if (k == null || k === '') return; (Array.isArray(k) ? k : [k]).forEach(function (kk) { m[kk] = (m[kk] || 0) + 1; }); }); return m; }
  function avg(list, fn) { if (!list.length) return 0; return list.reduce(function (a, x) { return a + fn(x); }, 0) / list.length; }
  function kpi(k, v, s, hi) { return '<div class="kpi' + (hi ? ' hi' : '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + (s || '&nbsp;') + '</div></div>'; }

  function imprFor(prefix, field) { var t = 0; Object.keys(IMPR).forEach(function (k) { var m = k.split('__'); if (m[1] === field && m[0].indexOf(prefix) === 0) t += IMPR[k]; }); return t; }

  // ---------- Main render ----------
  var LAST = [];
  function render() {
    if (!RAW) return;
    var all = buildVisits(RAW), src = $('src').value;
    var V = all.filter(function (v) { return src === 'all' || (src === 'ads' ? v.isAd : !v.isAd); });
    LAST = V;
    var visitors = {}; V.forEach(function (v) { visitors[v.vid] = 1; });
    var req = V.filter(function (v) { return v.request; }).length;
    var starts = V.filter(function (v) { return v.formStart; }).length;
    var ads = V.filter(function (v) { return v.isAd; }).length;
    var engagedV = V.filter(function (v) { return v.engaged > 0; });
    var bounce = V.filter(function (v) { return v.engaged < 10000 && v.maxScroll < 25 && !v.clicks.length; }).length;

    $('kpis').innerHTML =
      kpi('Visits', n(V.length), n(Object.keys(visitors).length) + ' different people') +
      kpi('From geofence ads', n(ads), fmtPct(pct(ads, V.length), 0) + ' of visits') +
      kpi('Quote requests', n(req), fmtPct(pct(req, V.length)) + ' of visits', true) +
      kpi('Started the form', n(starts), fmtPct(pct(req, starts), 0) + ' finished it') +
      kpi('Avg. time reading', fmtTime(avg(engagedV, function (v) { return v.engaged; })), 'active time on the page') +
      kpi('Avg. scroll', fmtPct(avg(V, function (v) { return v.maxScroll; }), 0), 'of the page') +
      kpi('Left quickly', fmtPct(pct(bounce, V.length), 0), 'under 10s, no scroll or click') +
      kpi('Returning', fmtPct(pct(V.filter(function (v) { return !v.newV; }).length, V.length), 0), 'had been before');

    // Funnel
    var shown = imprFor('', 'impr'), adClicks = imprFor('', 'clicks');
    var reachedForm = V.filter(function (v) { return v.sections.indexOf('spec-form') !== -1; }).length;
    var steps = [['Ads shown', shown, 'from your ad report'], ['Ad clicks reported', adClicks, shown ? fmtPct(pct(adClicks, shown), 2) + ' click rate' : 'from your ad report'],
      ['Page visits', V.length, adClicks ? fmtPct(pct(ads, adClicks), 0) + ' of ad clicks arrived' : ''],
      ['Read down to the form', reachedForm, fmtPct(pct(reachedForm, V.length), 0)],
      ['Started the form', starts, fmtPct(pct(starts, V.length), 0)], ['Sent a quote request', req, fmtPct(pct(req, V.length), 1)]];
    var fmax = Math.max.apply(null, steps.map(function (s) { return s[1]; }).concat([1]));
    $('funnel').innerHTML = steps.map(function (s) {
      var w = s[1] ? Math.max(1.5, Math.sqrt(s[1] / fmax) * 100) : 0;   // square-root scale so small steps stay visible
      return '<div class="step"><span>' + s[0] + '</span><span class="bar"><i style="width:' + w.toFixed(1) + '%"></i></span><span class="num">' + n(s[1]) + '<small>' + (s[2] || '&nbsp;') + '</small></span></div>';
    }).join('');

    // A/B
    var adV = all.filter(function (v) { return v.isAd; });
    var groups = [['static', 'Static'], ['animated', 'Animated (GIF + HTML5)']];
    var abData = groups.map(function (g) {
      var L = adV.filter(function (v) { return g[0] === 'static' ? v.format === 'static' : (v.format === 'gif' || v.format === 'html5'); });
      var imp = g[0] === 'static' ? imprFor('static', 'impr') : imprFor('gif', 'impr') + imprFor('html5', 'impr');
      var clk = g[0] === 'static' ? imprFor('static', 'clicks') : imprFor('gif', 'clicks') + imprFor('html5', 'clicks');
      var r = L.filter(function (v) { return v.request; }).length;
      return { name: g[1], visits: L.length, req: r, conv: pct(r, L.length), imp: imp, ctr: pct(clk, imp), eng: avg(L.filter(function (v) { return v.engaged; }), function (v) { return v.engaged; }) };
    });
    var win = abData[0].visits + abData[1].visits >= 30 ? (abData[0].conv === abData[1].conv ? -1 : abData[0].conv > abData[1].conv ? 0 : 1) : -1;
    $('ab').innerHTML = abData.map(function (d, i) {
      return '<div class="box' + (win === i ? ' win' : '') + '"><span class="tag' + (win === i ? ' ok' : '') + '">' + (win === i ? 'Ahead' : d.name.split(' ')[0]) + '</span><h2 style="margin-top:8px">' + d.name + '</h2>' +
        '<b>' + fmtPct(d.conv) + '</b><span class="note">of visits sent a request</span>' +
        '<div class="note" style="margin-top:8px">' + n(d.visits) + ' visits · ' + n(d.req) + ' requests<br>' + (d.imp ? fmtPct(d.ctr, 2) + ' click rate · ' : '') + fmtTime(d.eng) + ' avg. reading</div></div>';
    }).join('') + '<p class="note" style="grid-column:1/-1;margin:0">' + (abData[0].visits + abData[1].visits < 30 ? 'Too early to call — wait for at least 30 ad visits in total, ideally 100+.' : 'Differences under a few percentage points can be chance; keep the test running until one version leads for several weeks.') + '</p>';

    // Creative table
    var rows = CREATIVES.map(function (cid) {
      var L = adV.filter(function (v) { return v.creative === cid; });
      var parts = cid.split('_');
      var r = L.filter(function (v) { return v.request; }).length;
      return { cid: cid, label: FORMATS[parts[0]] + ' · ' + parts[1] + ' ' + parts[2], visits: L.length, req: r,
        starts: L.filter(function (v) { return v.formStart; }).length,
        eng: avg(L.filter(function (v) { return v.engaged; }), function (v) { return v.engaged; }), scroll: avg(L, function (v) { return v.maxScroll; }),
        imp: IMPR[cid + '__impr'] || 0, clk: IMPR[cid + '__clicks'] || 0 };
    });
    var other = adV.filter(function (v) { return CREATIVES.indexOf(v.creative) === -1; });
    var bestConv = Math.max.apply(null, rows.filter(function (r) { return r.visits >= 10; }).map(function (r) { return pct(r.req, r.visits); }).concat([-1]));
    var showAll = window.__avAll || !rows.some(function (r) { return r.visits || r.imp || r.clk; });
    $('allAds').textContent = showAll ? 'Hide ads with no data' : 'Show all 24 ad versions (to enter numbers)';
    $('creatives').innerHTML = '<thead><tr><th>Ad</th><th>Ads shown</th><th>Ad clicks</th><th>Click rate</th><th>Visits</th><th>Avg. reading</th><th>Avg. scroll</th><th>Started form</th><th>Requests</th><th>Request rate</th></tr></thead><tbody>' +
      rows.filter(function (r) { return showAll || r.visits || r.imp || r.clk; }).map(function (r) {
        var conv = pct(r.req, r.visits);
        return '<tr' + (r.visits >= 10 && conv === bestConv && bestConv > 0 ? ' class="best"' : '') + '><td>' + esc(r.label) + '</td>' +
          '<td><input type="number" min="0" inputmode="numeric" data-k="' + r.cid + '__impr" value="' + (r.imp || '') + '" aria-label="Ads shown ' + esc(r.label) + '"></td>' +
          '<td><input type="number" min="0" inputmode="numeric" data-k="' + r.cid + '__clicks" value="' + (r.clk || '') + '" aria-label="Ad clicks ' + esc(r.label) + '"></td>' +
          '<td>' + (r.imp ? fmtPct(pct(r.clk, r.imp), 2) : '—') + '</td><td>' + n(r.visits) + '</td><td>' + (r.visits ? fmtTime(r.eng) : '—') + '</td><td>' + (r.visits ? fmtPct(r.scroll, 0) : '—') + '</td>' +
          '<td>' + n(r.starts) + '</td><td>' + n(r.req) + '</td><td>' + (r.visits ? fmtPct(conv) : '—') + '</td></tr>';
      }).join('') +
      (other.length ? '<tr><td>Other / untagged ad links</td><td></td><td></td><td></td><td>' + n(other.length) + '</td><td></td><td></td><td></td><td>' + n(other.filter(function (v) { return v.request; }).length) + '</td><td></td></tr>' : '') + '</tbody>';

    // Daily chart
    var days = {}, dreq = {};
    var dKeys = []; var start = V.length ? V[V.length - 1].day : todayStr(0), end = todayStr(0);
    if ($('range').value !== 'all' && $('range').value !== 'custom') start = todayStr(+$('range').value - 1);
    for (var t = Date.parse(start + 'T12:00:00'); dayOf(t) <= end && dKeys.length < 400; t += 864e5) dKeys.push(dayOf(t));
    V.forEach(function (v) { days[v.day] = (days[v.day] || 0) + 1; if (v.request) dreq[v.day] = (dreq[v.day] || 0) + 1; });
    var adDay = {}; V.forEach(function (v) { if (v.isAd) adDay[v.day] = (adDay[v.day] || 0) + 1; });
    if (window.Chart) {
      if (chart) chart.destroy();
      chart = new Chart($('daily'), {
        type: 'bar',
        data: { labels: dKeys.map(function (d) { return d.slice(5); }), datasets: [
          { label: 'Visits', data: dKeys.map(function (d) { return days[d] || 0; }), backgroundColor: 'rgba(242,169,59,.75)', borderRadius: 2, order: 2 },
          { label: 'From ads', data: dKeys.map(function (d) { return adDay[d] || 0; }), backgroundColor: 'rgba(0,174,239,.7)', borderRadius: 2, order: 3 },
          { label: 'Quote requests', data: dKeys.map(function (d) { return dreq[d] || 0; }), type: 'line', borderColor: '#5fd39a', backgroundColor: '#5fd39a', pointRadius: 3, tension: .25, order: 1 }] },
        options: { animation: false, responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: 'rgba(245,241,232,.75)' } } },
          scales: { x: { ticks: { color: 'rgba(245,241,232,.5)', maxRotation: 0, autoSkip: true }, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { color: 'rgba(245,241,232,.5)', precision: 0 }, grid: { color: 'rgba(245,241,232,.08)' } } } }
      });
    }

    // Map
    if (window.L) {
      if (!map) {
        map = L.map('map', { scrollWheelZoom: false }).setView([43.65, -79.38], 8);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 18, subdomains: 'abcd',
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO' }).addTo(map);
      }
      if (layer) layer.remove();
      layer = L.layerGroup().addTo(map);
      var pts = {};
      V.forEach(function (v) { if (v.c.lat == null) return; var k = v.c.lat + ',' + v.c.lon; var p = pts[k] || (pts[k] = { lat: v.c.lat, lon: v.c.lon, city: v.c.city, n: 0, r: 0 }); p.n++; if (v.request) p.r++; });
      var bounds = [];
      Object.keys(pts).forEach(function (k) {
        var p = pts[k]; bounds.push([p.lat, p.lon]);
        L.circleMarker([p.lat, p.lon], { radius: 5 + Math.sqrt(p.n) * 3, color: p.r ? '#5fd39a' : '#f2a93b', fillOpacity: .45, weight: 1.5 })
          .bindPopup('<b>' + esc(p.city || 'Unknown') + '</b><br>' + p.n + ' visit' + (p.n > 1 ? 's' : '') + (p.r ? '<br>' + p.r + ' quote request' + (p.r > 1 ? 's' : '') : '')).addTo(layer);
      });
      if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
      setTimeout(function () { map.invalidateSize(); }, 50);
    }

    bars('cities', count(V, function (v) { return v.c.city ? v.c.city + (v.c.region ? ', ' + v.c.region : '') : 'Unknown'; }), { limit: 10 });
    bars('regions', count(V, function (v) { return (v.c.region || '?') + ' ' + (v.c.country || ''); }), { limit: 6 });
    bars('device', count(V, function (v) { return v.c.device || 'Unknown'; }));
    bars('os', count(V, function (v) { return v.c.os || 'Unknown'; }));
    bars('browser', count(V, function (v) { return v.c.browser || 'Unknown'; }));
    bars('inapp', count(V, function (v) { return v.c.inApp ? 'Inside an app (e.g. LinkedIn, Facebook)' : 'Regular browser'; }));
    bars('source', count(V, function (v) { return v.source; }), { limit: 8 });
    bars('newret', count(V, function (v) { return v.newV ? 'First visit' : (v.returningFromAd ? 'Came back (first came from an ad)' : 'Came back'); }));

    var secOrder = ['hero', 'offer', 'why', 'how', 'who', 'why-eventstudio', 'spec-form'], secMap = {};
    secOrder.forEach(function (s) { secMap[SECTION_NAMES[s]] = pct(V.filter(function (v) { return v.sections.indexOf(s) !== -1; }).length, V.length); });
    bars('sections', secMap, { keepOrder: true, max: 100, fmt: function (x) { return fmtPct(x, 0); }, limit: 10 });
    var sd = {}; [25, 50, 75, 90, 100].forEach(function (m) { sd['Reached ' + m + '%'] = pct(V.filter(function (v) { return v.maxScroll >= m; }).length, V.length); });
    bars('scrolld', sd, { keepOrder: true, max: 100, fmt: function (x) { return fmtPct(x, 0); } });
    var tb = { 'Under 10 s': 0, '10–30 s': 0, '30 s – 1 min': 0, '1–3 min': 0, 'Over 3 min': 0 };
    V.forEach(function (v) { var s = v.engaged / 1000; tb[s < 10 ? 'Under 10 s' : s < 30 ? '10–30 s' : s < 60 ? '30 s – 1 min' : s < 180 ? '1–3 min' : 'Over 3 min']++; });
    bars('timeb', tb, { keepOrder: true });
    bars('clicks', count(V, function (v) { return v.clicks; }), { limit: 8 });
    var fieldNames = { name: 'Name', email: 'Email', date: 'Date', attendees: 'People in the room', venue: 'Venue', room: 'Room', agenda: 'Short agenda' };
    bars('formerr', count(V, function (v) { return v.formErr.map(function (f) { return fieldNames[f] || f; }); }));
    var sz = { 'Under 50': 0, '50–99': 0, '100–249': 0, '250–500': 0, 'Over 500': 0 };
    V.forEach(function (v) { if (!v.request || !v.attendees) return; var a = v.attendees; sz[a < 50 ? 'Under 50' : a < 100 ? '50–99' : a < 250 ? '100–249' : a <= 500 ? '250–500' : 'Over 500']++; });
    bars('sizes', sz, { keepOrder: true });
    bars('screens', count(V, function (v) { return v.p.vw ? (v.p.vw < 600 ? 'Phone-sized (<600px)' : v.p.vw < 1024 ? 'Tablet / small laptop' : v.p.vw < 1600 ? 'Laptop / desktop' : 'Large monitor') : null; }));

    // Heatmap
    var hm = {}, hmax = 1, wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    V.forEach(function (v) { var o = tzParts(v.ts); var k = o.weekday + '_' + (+o.hour); hm[k] = (hm[k] || 0) + 1; if (hm[k] > hmax) hmax = hm[k]; });
    var h = '<span class="lbl"></span>'; for (var i = 0; i < 24; i++) h += '<span class="lbl" style="justify-content:center">' + (i % 3 === 0 ? i : '') + '</span>';
    wd.forEach(function (d) {
      h += '<span class="lbl">' + d + '</span>';
      for (var i = 0; i < 24; i++) { var c = hm[d + '_' + i] || 0; h += '<div title="' + d + ' ' + i + ':00 — ' + c + ' visits" style="background:' + (c ? 'rgba(242,169,59,' + (0.15 + 0.85 * c / hmax).toFixed(2) + ')' : 'rgba(245,241,232,.05)') + '"></div>'; }
    });
    $('heat').innerHTML = h;

    // Visit log
    $('log').innerHTML = '<thead><tr><th>When (Toronto)</th><th>Where</th><th>Device</th><th>Came from</th><th>Ad</th><th>Reading</th><th>Scroll</th><th>Clicks</th><th>Form</th></tr></thead><tbody>' +
      (V.slice(0, 300).map(function (v) {
        return '<tr><td>' + new Date(v.ts).toLocaleString('en-CA', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '</td>' +
          '<td>' + esc(v.c.city || '?') + (v.c.region ? ', ' + esc(v.c.region) : '') + '</td><td>' + esc((v.c.device || '') + ' · ' + (v.c.os || '')) + '</td>' +
          '<td>' + esc(v.source) + (v.newV ? '' : ' <span class="tag">return</span>') + '</td><td>' + esc(v.creative ? v.creative.replace(/_/g, ' ') : '—') + '</td>' +
          '<td>' + fmtTime(v.engaged) + '</td><td>' + v.maxScroll + '%</td><td>' + v.clicks.length + '</td>' +
          '<td>' + (v.request ? '<span class="tag ok">Request sent</span>' : v.formStart ? '<span class="tag">Started</span>' : '—') + '</td></tr>';
      }).join('') || '<tr><td colspan="9" class="empty">No visits in this period yet</td></tr>') + '</tbody>';
  }

  $('allAds').addEventListener('click', function () { window.__avAll = !window.__avAll; render(); });
  // ---------- Save ad numbers ----------
  $('saveImpr').addEventListener('click', function () {
    var data = {};
    document.querySelectorAll('#creatives input[data-k]').forEach(function (i) { data[i.getAttribute('data-k')] = i.value === '' ? 0 : +i.value; });
    $('saveMsg').textContent = 'Saving…';
    api('POST', '', { impressions: data }).then(function () { IMPR = {}; Object.keys(data).forEach(function (k) { if (data[k]) IMPR[k] = data[k]; }); $('saveMsg').textContent = 'Saved.'; render(); })
      .catch(function (e) { $('saveMsg').textContent = 'Could not save: ' + e.message; });
  });

  // ---------- CSV export ----------
  $('csv').addEventListener('click', function () {
    var head = ['time_toronto', 'city', 'region', 'country', 'device', 'os', 'browser', 'source', 'ad', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'new_visitor', 'visit_number', 'reading_seconds', 'max_scroll_pct', 'sections_reached', 'clicks', 'form_started', 'request_sent', 'attendees', 'screen', 'language'];
    var lines = [head.join(',')].concat(LAST.map(function (v) {
      var t = (v.p.tag && (v.p.tag.src || v.p.tag.cnt)) ? v.p.tag : (v.p.firstTag || {});
      return [new Date(v.ts).toLocaleString('en-CA', { timeZone: TZ }), v.c.city, v.c.region, v.c.country, v.c.device, v.c.os, v.c.browser, v.source, v.creative,
        t.src, t.med, t.cmp, t.cnt, t.trm, v.newV, v.nVisits, Math.round(v.engaged / 1000), v.maxScroll, v.sections.join(' '), v.clicks.join(' | '),
        v.formStart, v.request, v.attendees || '', (v.p.sw || '') + 'x' + (v.p.sh || ''), v.p.lang].map(function (x) { x = String(x == null ? '' : x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(',');
    }));
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = 'av-compare-visits-' + todayStr(0) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  });

  // ---------- Exclude own visits ----------
  function selfLabel() {
    var off = localStorage.getItem('avt_off') === '1';
    $('selfBtn').textContent = off ? 'This browser is not counted — click to count it again' : 'Don\u2019t count visits from this browser';
    $('selfBtn').className = off ? 'ghost' : 'primary';
  }
  $('selfBtn').addEventListener('click', function () {
    var off = localStorage.getItem('avt_off') === '1', v = localStorage.getItem('avt_v'), ign = excluded();
    if (off) { localStorage.removeItem('avt_off'); ign = ign.filter(function (x) { return x !== v; }); }
    else { localStorage.setItem('avt_off', '1'); if (v && ign.indexOf(v) === -1) ign.push(v); }
    localStorage.setItem('avt_ignore', JSON.stringify(ign)); selfLabel(); render();
  });
  try { selfLabel(); } catch (e) {}

  if (KEY) load(); else $('pw').focus();
})();
