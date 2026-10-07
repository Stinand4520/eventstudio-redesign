(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = (function(){try{return localStorage.getItem('avk')||sessionStorage.getItem('avk')}catch(e){return ''}})() || '';
  var RAW = null, IMPR = {}, charts = {}, maps = {}, TAB = 'geo', CAMP = 'all', LAST = [];
  var TZ = 'America/Toronto';

  // ---------- Known pages, campaigns and ads ----------
  var PAGES = { '/': 'Home', '/eventstudio-redesign': 'Home', '/index': 'Home', '/av-headline': 'AV Compare',
    '/live-event-production': 'Live event production', '/award-shows': 'Award shows', '/live-streaming': 'Live streaming',
    '/medical-education-production': 'Medical education', '/not-an-av-company': 'Not an AV company', '/love-letters': 'Love letters',
    '/case-studies': 'Case studies', '/md-codes-case-study': 'MD Codes case study' };
  function pageName(p) { p = (p || '/').replace(/\.html$/, '').replace(/\/$/, '') || '/'; return PAGES[p] || p; }
  var CAMPS = { 'av-compare': 'AV Compare', 'live-streaming': 'Webcast', 'award-shows': 'Award shows', 'live-events': 'Live events' };
  function campName(c) { return CAMPS[c] || c || 'Unknown'; }
  var SIZES = ['desktop_970x250', 'desktop_728x90', 'desktop_300x600', 'desktop_300x250', 'desktop_160x600', 'mobile_320x50', 'mobile_300x250', 'mobile_728x90'];
  var FMT = ['gif', 'html5', 'static'];
  function cross(prefix, sizes) { var o = []; FMT.forEach(function (f) { sizes.forEach(function (s) { o.push(prefix + f + '_' + s); }); }); return o; }
  var KNOWN = {
    'av-compare': cross('', SIZES).concat(cross('photo-', ['desktop_970x250', 'desktop_300x600', 'desktop_300x250', 'desktop_160x600'])),
    'live-streaming': cross('cmw-', SIZES).concat(cross('', SIZES)),
    'award-shows': cross('photo-', SIZES),
    'live-events': cross('', SIZES)
  };
  var FMTNAME = { gif: 'Animated GIF', html5: 'Animated HTML5', 'static': 'Static' };
  function adLabel(cnt) {
    var m = /^(?:([a-z0-9]+)-)?(gif|html5|static)_(desktop|mobile)_(\d+x\d+)$/.exec(cnt || '');
    if (!m) return cnt || '(no ad tag)';
    var set = m[1] === 'photo' ? 'Photo · ' : m[1] === 'cmw' ? 'CMW photo · ' : m[1] ? m[1] + ' · ' : 'Text · ';
    return set + FMTNAME[m[2]] + ' · ' + m[3] + ' ' + m[4];
  }
  function adFormat(cnt) { var m = /(gif|html5|static)_/.exec(cnt || ''); return m ? m[1] : ''; }

  // ---------- Helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pct(a, b) { return b ? a / b * 100 : 0; }
  function fp(x, d) { return (isFinite(x) ? x : 0).toFixed(d == null ? 1 : d) + '%'; }
  function ft(ms) { var s = Math.round((ms || 0) / 1000); return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's'; }
  function n(x) { return (x || 0).toLocaleString('en-CA'); }
  function avg(l, f) { return l.length ? l.reduce(function (a, x) { return a + f(x); }, 0) / l.length : 0; }
  function count(l, f) { var m = {}; l.forEach(function (x) { var k = f(x); if (k == null || k === '') return; (Array.isArray(k) ? k : [k]).forEach(function (kk) { m[kk] = (m[kk] || 0) + 1; }); }); return m; }
  function tzParts(ts) { var o = {}; new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(ts)).forEach(function (x) { o[x.type] = x.value; }); return o; }
  function dayOf(ts) { var o = tzParts(ts); return o.year + '-' + o.month + '-' + o.day; }
  function todayStr(off) { return dayOf(Date.now() - (off || 0) * 864e5); }
  function kpi(k, v, s, hi) { return '<div class="kpi' + (hi ? ' hi' : '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + (s || '&nbsp;') + '</div></div>'; }
  function bars(id, map, o) {
    o = o || {};
    var arr = Object.keys(map).map(function (k) { return [k, map[k]]; });
    if (!o.keepOrder) arr.sort(function (a, b) { return b[1] - a[1]; });
    arr = arr.slice(0, o.limit || 8);
    var max = o.max || Math.max.apply(null, arr.map(function (x) { return x[1]; }).concat([1]));
    $(id).innerHTML = arr.length ? arr.map(function (x) {
      return '<div class="row"><span class="lab" title="' + esc(x[0]) + '">' + esc(x[0]) + '</span><span class="bar"><i style="width:' + (x[1] / max * 100).toFixed(1) + '%"></i></span><span class="num">' + (o.fmt ? o.fmt(x[1]) : n(x[1])) + '</span></div>';
    }).join('') : '<p class="empty">No data yet</p>';
  }

  // ---------- Loading ----------
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
      try { localStorage.setItem('avk', KEY); } catch (e) {}
      $('login').classList.add('hide'); $('app').classList.remove('hide');
      RAW = j.events; IMPR = j.impressions || {};
      $('updated').textContent = 'Updated ' + new Date(j.generated).toLocaleString('en-CA', { timeZone: TZ }) + ' · ' + n(j.events.length) + ' events';
      build(); render();
    }).catch(function (e) {
      if (/password/i.test(e.message)) { try { localStorage.removeItem('avk'); } catch (e) {} $('login').classList.remove('hide'); $('app').classList.add('hide'); $('err').textContent = 'That password didn’t work.'; }
      else { $('err').textContent = e.message; }
    });
  }
  $('signout').addEventListener('click', function () { try { localStorage.removeItem('avk'); } catch (e) {} KEY = ''; $('app').classList.add('hide'); $('login').classList.remove('hide'); $('err').textContent = ''; });
  setInterval(function () { if (KEY && !document.hidden && !$('app').classList.contains('hide')) load(); }, 5 * 60000);
  $('range').addEventListener('change', function () { var c = $('range').value === 'custom'; $('from').classList.toggle('hide', !c); $('to').classList.toggle('hide', !c); if (!c) load(); });
  $('from').addEventListener('change', load); $('to').addEventListener('change', load);
  $('reload').addEventListener('click', function () { load(); });
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      TAB = b.getAttribute('data-tab');
      document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
      $('tab-geo').classList.toggle('hide', TAB !== 'geo'); $('tab-site').classList.toggle('hide', TAB !== 'site');
      render();
    });
  });

  // ---------- Build page views and visits ----------
  var PV = [], SESS = [];
  function excluded() { try { return JSON.parse(localStorage.getItem('avt_ignore') || '[]'); } catch (e) { return []; } }
  function hasTag(t) { return t && (t.src || t.cnt); }
  function classify(tag, ref) {
    if (tag) {
      var src = (tag.src || '').toLowerCase(), med = (tag.med || '').toLowerCase();
      if (/geofence|geo/.test(src) || med === 'display') return { kind: 'geo', label: 'Geofence ad · ' + campName(tag.cmp) };
      if (/paid_social|social/.test(med) || /instagram|facebook|linkedin/.test(src)) return { kind: 'social', label: (src ? src.charAt(0).toUpperCase() + src.slice(1) : 'Social') + ' ad' };
      return { kind: 'tagged', label: (tag.src || 'Tagged link') + (tag.cmp ? ' · ' + tag.cmp : '') };
    }
    if (!ref) return { kind: 'direct', label: 'Direct / typed / email' };
    if (/google\./.test(ref)) return { kind: 'search', label: 'Google search' };
    if (/bing\.|duckduckgo|yahoo\./.test(ref)) return { kind: 'search', label: 'Other search' };
    if (/linkedin/.test(ref)) return { kind: 'social', label: 'LinkedIn' };
    if (/facebook|instagram/.test(ref)) return { kind: 'social', label: 'Facebook / Instagram' };
    return { kind: 'referral', label: ref };
  }
  function build() {
    var ign = excluded(), by = {};
    RAW.forEach(function (e) { if (ign.indexOf(e.v) !== -1) return; (by[e.s] = by[e.s] || []).push(e); });
    PV = [];
    Object.keys(by).forEach(function (sid) {
      var ev = by[sid].sort(function (a, b) { return a.ts - b.ts; }), v = null;
      ev.forEach(function (e) { if (e.t === 'visit' && !v) v = e; });
      if (!v) return;
      var p = v.p || {};
      var r = { sid: sid, vid: v.v, ss: p.ss || sid, pvn: p.pvn || 1, ts: v.ts, day: dayOf(v.ts), c: v.c || {}, p: p, path: p.path || '/', page: pageName(p.path),
        tag: hasTag(p.tag) ? p.tag : null, sessTag: hasTag(p.sessTag) ? p.sessTag : null, firstTag: hasTag(p.firstTag) ? p.firstTag : null,
        newV: !!p.newV, maxScroll: 0, engaged: 0, sections: [], clicks: [], taps: [], formStart: false, formErr: [], lead: false, leadType: '', attendees: null };
      ev.forEach(function (e) {
        var q = e.p || {};
        if (e.t === 'scroll') r.maxScroll = Math.max(r.maxScroll, q.pct || 0);
        if (e.t === 'leave' || e.t === 'hidden') { r.maxScroll = Math.max(r.maxScroll, q.maxScroll || 0); r.engaged = Math.max(r.engaged, q.engagedMs || 0); }
        if (e.t === 'section' && r.sections.indexOf(q.name) === -1) r.sections.push(q.name);
        if (e.t === 'click') { r.clicks.push(q.label || q.kind); if (q.kind === 'phone' || q.kind === 'email') r.taps.push(q.kind); }
        if (e.t === 'form_start') r.formStart = true;
        if (e.t === 'form_error') r.formErr.push(q.field || '?');
        if (e.t === 'spec_request' || e.t === 'enquiry') { r.lead = true; r.leadType = e.t === 'spec_request' ? 'AV Compare quote request' : 'Contact enquiry'; if (q.attendees) r.attendees = +q.attendees; }
      });
      PV.push(r);
    });
    PV.sort(function (a, b) { return a.ts - b.ts; });
    // group page views into visits
    var S = {};
    PV.forEach(function (r) { (S[r.ss] = S[r.ss] || []).push(r); });
    SESS = Object.keys(S).map(function (k) {
      var pvs = S[k], first = pvs[0];
      var tag = null; pvs.forEach(function (r) { if (!tag && r.tag) tag = r.tag; });
      if (!tag) pvs.forEach(function (r) { if (!tag && r.sessTag) tag = r.sessTag; });
      var cls = classify(tag, first.p.ref);
      var returnedFromAd = false;
      if (!tag && first.firstTag && !first.newV) { var c2 = classify(first.firstTag, ''); if (c2.kind === 'geo') returnedFromAd = true; }
      return {
        ss: k, vid: first.vid, ts: first.ts, day: first.day, c: first.c, p: first.p, pvs: pvs, tag: tag, src: cls, returnedFromAd: returnedFromAd,
        isGeo: cls.kind === 'geo', camp: tag ? (tag.cmp || '') : '', cnt: tag ? (tag.cnt || '').toLowerCase() : '',
        landing: first.page, pages: pvs.map(function (r) { return r.page; }),
        engaged: pvs.reduce(function (a, r) { return a + r.engaged; }, 0),
        lead: pvs.some(function (r) { return r.lead; }), leadPage: (pvs.filter(function (r) { return r.lead; })[0] || {}).page || '',
        formStart: pvs.some(function (r) { return r.formStart; }), taps: [].concat.apply([], pvs.map(function (r) { return r.taps; })),
        newV: first.newV
      };
    }).sort(function (a, b) { return b.ts - a.ts; });
  }

  // ---------- Impressions (keys: campaign--adcontent__impr / __clicks; old AV keys have no campaign) ----------
  function ikey(camp, cnt, f) { return (camp === 'av-compare' && /^(gif|html5|static)_/.test(cnt) ? '' : camp + '--') + cnt + '__' + f; }
  function imprOf(camp, cnt, f) { return IMPR[ikey(camp, cnt, f)] || 0; }

  // ---------- Render ----------
  function render() { if (!RAW) return; if (TAB === 'geo') renderGeo(); else renderSite(); renderLog(); }

  function renderGeo() {
    var geoAll = SESS.filter(function (s) { return s.isGeo; });
    var camps = {}; geoAll.forEach(function (s) { camps[s.camp] = 1; }); Object.keys(KNOWN).forEach(function (k) { camps[k] = 1; });
    $('campChips').innerHTML = ['all'].concat(Object.keys(camps)).map(function (c) {
      var cnt = c === 'all' ? geoAll.length : geoAll.filter(function (s) { return s.camp === c; }).length;
      return '<button type="button" data-c="' + esc(c) + '" class="' + (CAMP === c ? 'on' : '') + '">' + (c === 'all' ? 'All campaigns' : esc(campName(c))) + ' · ' + n(cnt) + '</button>';
    }).join('');
    $('campChips').querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { CAMP = b.getAttribute('data-c'); renderGeo(); renderLog(); }); });

    var G = geoAll.filter(function (s) { return CAMP === 'all' || s.camp === CAMP; });
    LAST = G;
    var visitors = {}; G.forEach(function (s) { visitors[s.vid] = 1; });
    var leads = G.filter(function (s) { return s.lead; }).length, starts = G.filter(function (s) { return s.formStart || s.lead; }).length;
    var taps = G.reduce(function (a, s) { return a + s.taps.length; }, 0);
    var shown = 0, clicks = 0;
    Object.keys(KNOWN).forEach(function (c) { if (CAMP !== 'all' && c !== CAMP) return; adList(c).forEach(function (a) { shown += imprOf(c, a, 'impr'); clicks += imprOf(c, a, 'clicks'); }); });
    $('geoKpis').innerHTML =
      kpi('Ad visits', n(G.length), n(Object.keys(visitors).length) + ' different people') +
      kpi('Leads', n(leads), fp(pct(leads, G.length)) + ' of ad visits', true) +
      kpi('Started a form', n(starts), fp(pct(leads, starts), 0) + ' finished it') +
      kpi('Phone / email taps', n(taps), 'from ad visitors') +
      kpi('Pages per visit', avg(G, function (s) { return s.pvs.length; }).toFixed(1), 'after clicking an ad') +
      kpi('Avg. time reading', ft(avg(G.filter(function (s) { return s.engaged; }), function (s) { return s.engaged; })), 'per ad visit') +
      kpi('Ads shown', n(shown), 'from Chameleon reports') +
      kpi('Click rate', shown ? fp(pct(clicks, shown), 2) : '—', n(clicks) + ' ad clicks reported');

    var steps = [['Ads shown', shown, 'from your ad report'], ['Ad clicks reported', clicks, shown ? fp(pct(clicks, shown), 2) + ' click rate' : ''],
      ['Visits from ads', G.length, clicks ? fp(pct(G.length, clicks), 0) + ' of clicks arrived' : ''],
      ['Started a form', starts, fp(pct(starts, G.length), 0)], ['Sent a lead', leads, fp(pct(leads, G.length), 1)]];
    var fmax = Math.max.apply(null, steps.map(function (s) { return s[1]; }).concat([1]));
    $('geoFunnel').innerHTML = steps.map(function (s) {
      var w = s[1] ? Math.max(1.5, Math.sqrt(s[1] / fmax) * 100) : 0;
      return '<div class="step"><span>' + s[0] + '</span><span class="bar"><i style="width:' + w.toFixed(1) + '%"></i></span><span class="num">' + n(s[1]) + '<small>' + (s[2] || '&nbsp;') + '</small></span></div>';
    }).join('');

    // A/B: static vs animated
    var ab = [['Static', function (s) { return adFormat(s.cnt) === 'static'; }, ['static']], ['Animated (GIF + HTML5)', function (s) { var f = adFormat(s.cnt); return f === 'gif' || f === 'html5'; }, ['gif', 'html5']]].map(function (g) {
      var L = G.filter(g[1]), r = L.filter(function (s) { return s.lead; }).length, imp = 0, clk = 0;
      Object.keys(KNOWN).forEach(function (c) { if (CAMP !== 'all' && c !== CAMP) return; adList(c).forEach(function (a) { if (g[2].indexOf(adFormat(a)) !== -1) { imp += imprOf(c, a, 'impr'); clk += imprOf(c, a, 'clicks'); } }); });
      return { name: g[0], visits: L.length, req: r, conv: pct(r, L.length), imp: imp, ctr: pct(clk, imp), eng: avg(L.filter(function (s) { return s.engaged; }), function (s) { return s.engaged; }) };
    });
    var enough = ab[0].visits + ab[1].visits >= 30, win = enough && ab[0].conv !== ab[1].conv ? (ab[0].conv > ab[1].conv ? 0 : 1) : -1;
    $('ab').innerHTML = ab.map(function (d, i) {
      return '<div class="box' + (win === i ? ' win' : '') + '"><span class="tag' + (win === i ? ' ok' : '') + '">' + (win === i ? 'Ahead' : d.name.split(' ')[0]) + '</span><h2 style="margin-top:8px">' + d.name + '</h2><b>' + fp(d.conv) + '</b><span class="note">of visits sent a lead</span>' +
        '<div class="note" style="margin-top:8px">' + n(d.visits) + ' visits · ' + n(d.req) + ' leads<br>' + (d.imp ? fp(d.ctr, 2) + ' click rate · ' : '') + ft(d.eng) + ' avg. reading</div></div>';
    }).join('') + '<p class="note" style="grid-column:1/-1;margin:0">' + (enough ? 'Small differences can be chance; let it run until one version leads for a few weeks.' : 'Too early to call — wait for at least 30 ad visits, ideally 100+.') + '</p>';

    adTable(G);

    // daily ad visits by campaign
    var dk = dayKeys(G), cs = CAMP === 'all' ? Object.keys(camps) : [CAMP], palette = ['#f2a93b', '#00aeef', '#5fd39a', '#c58cff', '#ff7a6b'];
    chart('geoDaily', 'bar', dk, cs.map(function (c, i) {
      var m = {}; G.forEach(function (s) { if (s.camp === c) m[s.day] = (m[s.day] || 0) + 1; });
      return { label: campName(c), data: dk.map(function (d) { return m[d] || 0; }), backgroundColor: palette[i % palette.length], borderRadius: 2, stack: 'a' };
    }).concat([{ label: 'Leads', type: 'line', data: dk.map(function (d) { return G.filter(function (s) { return s.day === d && s.lead; }).length; }), borderColor: '#fff', backgroundColor: '#fff', pointRadius: 3 }]), true);

    drawMap('geoMap', G);
    bars('geoCities', count(G, function (s) { return s.c.city ? s.c.city + (s.c.region ? ', ' + s.c.region : '') : 'Unknown'; }), { limit: 8 });
    bars('geoDevice', count(G, function (s) { return s.c.device || 'Unknown'; }));
    bars('geoNext', count(G, function (s) { return s.pvs.slice(1).map(function (r) { return r.page; }); }), { limit: 8 });
    var lc = {}; Object.keys(camps).forEach(function (c) { var L = geoAll.filter(function (s) { return s.camp === c; }); if (L.length) lc[campName(c)] = L.filter(function (s) { return s.lead; }).length; });
    bars('geoLeadsCamp', lc);
    bars('geoTaps', count(G, function (s) { return s.taps.map(function (t) { return t === 'phone' ? 'Phone' : 'Email'; }); }));
  }

  function adList(camp) {
    var l = (KNOWN[camp] || []).slice();
    SESS.forEach(function (s) { if (s.isGeo && s.camp === camp && s.cnt && l.indexOf(s.cnt) === -1) l.push(s.cnt); });
    return l;
  }
  function adTable(G) {
    var rows = [];
    Object.keys(KNOWN).concat(Object.keys(count(G, function (s) { return s.camp; }))).forEach(function (c) {
      if (rows.some(function (r) { return r.camp === c; })) return;
      if (CAMP !== 'all' && c !== CAMP) return;
      adList(c).forEach(function (a) {
        var L = G.filter(function (s) { return s.camp === c && s.cnt === a; }), ld = L.filter(function (s) { return s.lead; }).length;
        rows.push({ camp: c, cnt: a, visits: L.length, leads: ld, pages: avg(L, function (s) { return s.pvs.length; }), eng: avg(L.filter(function (s) { return s.engaged; }), function (s) { return s.engaged; }),
          imp: imprOf(c, a, 'impr'), clk: imprOf(c, a, 'clicks') });
      });
    });
    var showAll = window.__allAds || !rows.some(function (r) { return r.visits || r.imp || r.clk; });
    $('allAds').textContent = showAll ? 'Hide ads with no data' : 'Show every ad (to enter numbers)';
    var best = Math.max.apply(null, rows.filter(function (r) { return r.visits >= 10; }).map(function (r) { return pct(r.leads, r.visits); }).concat([-1]));
    var vis = rows.filter(function (r) { return showAll || r.visits || r.imp || r.clk; });
    $('adTable').innerHTML = '<thead><tr><th>Campaign</th><th>Ad</th><th>Ads shown</th><th>Ad clicks</th><th>Click rate</th><th>Visits</th><th>Pages / visit</th><th>Avg. reading</th><th>Leads</th><th>Lead rate</th></tr></thead><tbody>' +
      (vis.map(function (r) {
        var conv = pct(r.leads, r.visits);
        return '<tr' + (r.visits >= 10 && conv === best && best > 0 ? ' class="best"' : '') + '><td>' + esc(campName(r.camp)) + '</td><td class="l">' + esc(adLabel(r.cnt)) + '</td>' +
          '<td><input type="number" min="0" inputmode="numeric" data-k="' + esc(ikey(r.camp, r.cnt, 'impr')) + '" value="' + (r.imp || '') + '" aria-label="Ads shown"></td>' +
          '<td><input type="number" min="0" inputmode="numeric" data-k="' + esc(ikey(r.camp, r.cnt, 'clicks')) + '" value="' + (r.clk || '') + '" aria-label="Ad clicks"></td>' +
          '<td>' + (r.imp ? fp(pct(r.clk, r.imp), 2) : '—') + '</td><td>' + n(r.visits) + '</td><td>' + (r.visits ? r.pages.toFixed(1) : '—') + '</td><td>' + (r.visits ? ft(r.eng) : '—') + '</td>' +
          '<td>' + n(r.leads) + '</td><td>' + (r.visits ? fp(conv) : '—') + '</td></tr>';
      }).join('') || '<tr><td colspan="10" class="empty">No ad visits in this period yet</td></tr>') + '</tbody>';
  }
  $('allAds').addEventListener('click', function () { window.__allAds = !window.__allAds; renderGeo(); });
  $('saveImpr').addEventListener('click', function () {
    var data = {};
    document.querySelectorAll('#adTable input[data-k]').forEach(function (i) { data[i.getAttribute('data-k')] = i.value === '' ? 0 : +i.value; });
    $('saveMsg').textContent = 'Saving…';
    api('POST', '', { impressions: data }).then(function () { Object.keys(data).forEach(function (k) { IMPR[k] = data[k]; }); $('saveMsg').textContent = 'Saved.'; renderGeo(); })
      .catch(function (e) { $('saveMsg').textContent = 'Could not save: ' + e.message; });
  });

  function renderSite() {
    var S = SESS, P = PV.filter(function (r) { return S.some ? true : true; });
    LAST = S;
    var visitors = {}; S.forEach(function (s) { visitors[s.vid] = 1; });
    var leads = S.filter(function (s) { return s.lead; }).length, taps = S.reduce(function (a, s) { return a + s.taps.length; }, 0);
    var bounce = S.filter(function (s) { return s.pvs.length === 1 && s.engaged < 10000 && !s.pvs[0].clicks.length; }).length;
    $('siteKpis').innerHTML =
      kpi('Page views', n(P.length), avg(S, function (s) { return s.pvs.length; }).toFixed(1) + ' pages per visit') +
      kpi('Visits', n(S.length), n(Object.keys(visitors).length) + ' different people') +
      kpi('Leads', n(leads), fp(pct(leads, S.length)) + ' of visits', true) +
      kpi('Phone / email taps', n(taps), 'tapped to call or email') +
      kpi('From geofence ads', n(S.filter(function (s) { return s.isGeo; }).length), fp(pct(S.filter(function (s) { return s.isGeo; }).length, S.length), 0) + ' of visits') +
      kpi('Avg. time reading', ft(avg(S.filter(function (s) { return s.engaged; }), function (s) { return s.engaged; })), 'per visit') +
      kpi('Left quickly', fp(pct(bounce, S.length), 0), 'one page, under 10 s') +
      kpi('Returning', fp(pct(S.filter(function (s) { return !s.newV; }).length, S.length), 0), 'had been before');

    var dk = dayKeys(S);
    var pvd = {}, sd = {}, ld = {}; P.forEach(function (r) { pvd[r.day] = (pvd[r.day] || 0) + 1; }); S.forEach(function (s) { sd[s.day] = (sd[s.day] || 0) + 1; if (s.lead) ld[s.day] = (ld[s.day] || 0) + 1; });
    chart('siteDaily', 'bar', dk, [
      { label: 'Page views', data: dk.map(function (d) { return pvd[d] || 0; }), backgroundColor: 'rgba(242,169,59,.75)', borderRadius: 2 },
      { label: 'Visits', data: dk.map(function (d) { return sd[d] || 0; }), backgroundColor: 'rgba(0,174,239,.7)', borderRadius: 2 },
      { label: 'Leads', type: 'line', data: dk.map(function (d) { return ld[d] || 0; }), borderColor: '#5fd39a', backgroundColor: '#5fd39a', pointRadius: 3 }]);

    var pages = {};
    P.forEach(function (r) {
      var g = pages[r.page] || (pages[r.page] = { views: 0, vis: {}, land: 0, eng: [], scroll: [], starts: 0, leads: 0, geo: 0 });
      g.views++; g.vis[r.vid] = 1; if (r.pvn === 1 || r.ss === r.sid) g.land++; if (r.engaged) g.eng.push(r.engaged); g.scroll.push(r.maxScroll);
      if (r.formStart || r.lead) g.starts++; if (r.lead) g.leads++;
    });
    S.forEach(function (s) { if (s.isGeo && pages[s.landing]) pages[s.landing].geo++; });
    $('pageTable').innerHTML = '<thead><tr><th>Page</th><th>Views</th><th>Visitors</th><th>Landed</th><th>From ads</th><th>Avg. reading</th><th>Avg. scroll</th><th>Started form</th><th>Leads</th></tr></thead><tbody>' +
      (Object.keys(pages).sort(function (a, b) { return pages[b].views - pages[a].views; }).map(function (k) {
        var g = pages[k];
        return '<tr><td class="l">' + esc(k) + '</td><td>' + n(g.views) + '</td><td>' + n(Object.keys(g.vis).length) + '</td><td>' + n(g.land) + '</td><td>' + n(g.geo) + '</td><td>' + ft(avg(g.eng, function (x) { return x; })) + '</td><td>' + fp(avg(g.scroll, function (x) { return x; }), 0) + '</td><td>' + n(g.starts) + '</td><td>' + n(g.leads) + '</td></tr>';
      }).join('') || '<tr><td colspan="9" class="empty">No visits in this period yet</td></tr>') + '</tbody>';

    bars('siteSources', count(S, function (s) { return s.src.label; }), { limit: 10 });
    bars('siteLeadSrc', count(S.filter(function (s) { return s.lead; }), function (s) { return s.src.label; }));
    bars('siteLeadPage', count(S.filter(function (s) { return s.lead; }), function (s) { return s.leadPage; }));
    bars('sitePaths', count(S, function (s) { var p = []; s.pages.forEach(function (x) { if (p[p.length - 1] !== x) p.push(x); }); return p.slice(0, 4).join(' → ') + (p.length > 4 ? ' → …' : ''); }), { limit: 8 });
    drawMap('siteMap', S);
    bars('siteCities', count(S, function (s) { return s.c.city ? s.c.city + (s.c.region ? ', ' + s.c.region : '') : 'Unknown'; }), { limit: 10 });
    bars('siteRegions', count(S, function (s) { return (s.c.region || '?') + ' ' + (s.c.country || ''); }), { limit: 6 });
    bars('siteDevice', count(S, function (s) { return s.c.device || 'Unknown'; }));
    bars('siteOS', count(S, function (s) { return s.c.os || 'Unknown'; }));
    bars('siteBrowser', count(S, function (s) { return s.c.browser || 'Unknown'; }));
    bars('siteNew', count(S, function (s) { return s.newV ? 'First visit' : s.returnedFromAd ? 'Came back (first came from an ad)' : 'Came back'; }));
    var names = { name: 'Name', email: 'Email', date: 'Date', attendees: 'People in the room', venue: 'Venue', room: 'Room', agenda: 'Short agenda', brief: 'Brief / message' };
    bars('siteFormErr', count(P, function (r) { return r.formErr.map(function (f) { return names[f] || f; }); }));
    heat('siteHeat', S);
  }

  function renderLog() {
    var L = LAST.slice(0, 300);
    $('logNote').textContent = (TAB === 'geo' ? 'Visits from geofence ads' : 'All visits') + ', newest first, up to 300 (Export CSV for all).';
    $('log').innerHTML = '<thead><tr><th>When (Toronto)</th><th>Result</th><th>Where</th><th>Device</th><th>Came from</th><th>Ad</th><th>Pages</th><th>Reading</th></tr></thead><tbody>' +
      (L.map(function (s) {
        var path = []; s.pages.forEach(function (x) { if (path[path.length - 1] !== x) path.push(x); });
        return '<tr><td>' + new Date(s.ts).toLocaleString('en-CA', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '</td>' +
          '<td>' + (s.lead ? '<span class="tag ok">Lead</span>' : s.taps.length ? '<span class="tag">Tapped ' + esc(s.taps[0]) + '</span>' : s.formStart ? '<span class="tag">Started form</span>' : '—') + '</td>' +
          '<td>' + esc(s.c.city || '?') + (s.c.region ? ', ' + esc(s.c.region) : '') + '</td><td>' + esc((s.c.device || '') + ' · ' + (s.c.os || '')) + '</td>' +
          '<td>' + esc(s.src.label) + (s.newV ? '' : ' <span class="tag">return</span>') + '</td><td>' + (s.cnt ? esc(adLabel(s.cnt)) : '—') + '</td>' +
          '<td class="l">' + esc(path.join(' → ')) + '</td><td>' + ft(s.engaged) + '</td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="8" class="empty">No visits in this period yet</td></tr>') + '</tbody>';
  }

  // ---------- Charts, maps, heatmap ----------
  function dayKeys(list) {
    var start = list.length ? list[list.length - 1].day : todayStr(0), end = todayStr(0), out = [];
    if ($('range').value !== 'all' && $('range').value !== 'custom') start = todayStr(+$('range').value - 1);
    for (var t = Date.parse(start + 'T12:00:00'); dayOf(t) <= end && out.length < 400; t += 864e5) out.push(dayOf(t));
    return out;
  }
  function chart(id, type, labels, datasets, stacked) {
    if (!window.Chart) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), { type: type, data: { labels: labels.map(function (d) { return d.slice(5); }), datasets: datasets },
      options: { animation: false, responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: 'rgba(245,241,232,.75)' } } },
        scales: { x: { stacked: !!stacked, ticks: { color: 'rgba(245,241,232,.5)', maxRotation: 0, autoSkip: true }, grid: { display: false } },
                  y: { stacked: !!stacked, beginAtZero: true, ticks: { color: 'rgba(245,241,232,.5)', precision: 0 }, grid: { color: 'rgba(245,241,232,.08)' } } } } });
  }
  function drawMap(id, S) {
    if (!window.L) return;
    var m = maps[id];
    if (!m) {
      m = maps[id] = { map: L.map(id, { scrollWheelZoom: false }).setView([43.65, -79.38], 8), layer: null };
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 18, subdomains: 'abcd', attribution: '&copy; OpenStreetMap contributors &copy; CARTO' }).addTo(m.map);
    }
    if (m.layer) m.layer.remove();
    m.layer = L.layerGroup().addTo(m.map);
    var pts = {}, b = [];
    S.forEach(function (s) { if (s.c.lat == null) return; var k = s.c.lat + ',' + s.c.lon, p = pts[k] || (pts[k] = { lat: s.c.lat, lon: s.c.lon, city: s.c.city, n: 0, r: 0 }); p.n++; if (s.lead) p.r++; });
    Object.keys(pts).forEach(function (k) {
      var p = pts[k]; b.push([p.lat, p.lon]);
      L.circleMarker([p.lat, p.lon], { radius: 5 + Math.sqrt(p.n) * 3, color: p.r ? '#5fd39a' : '#f2a93b', fillOpacity: .45, weight: 1.5 })
        .bindPopup('<b>' + esc(p.city || 'Unknown') + '</b><br>' + p.n + ' visit' + (p.n > 1 ? 's' : '') + (p.r ? '<br>' + p.r + ' lead' + (p.r > 1 ? 's' : '') : '')).addTo(m.layer);
    });
    if (b.length) m.map.fitBounds(b, { padding: [30, 30], maxZoom: 10 });
    setTimeout(function () { m.map.invalidateSize(); }, 60);
  }
  function heat(id, S) {
    var hm = {}, hmax = 1, wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    S.forEach(function (s) { var o = tzParts(s.ts), k = o.weekday + '_' + (+o.hour); hm[k] = (hm[k] || 0) + 1; if (hm[k] > hmax) hmax = hm[k]; });
    var h = '<span class="lbl"></span>'; for (var i = 0; i < 24; i++) h += '<span class="lbl" style="justify-content:center">' + (i % 6 === 0 ? i : '') + '</span>';
    wd.forEach(function (d) { h += '<span class="lbl">' + d + '</span>'; for (var i = 0; i < 24; i++) { var c = hm[d + '_' + i] || 0; h += '<div title="' + d + ' ' + i + ':00 — ' + c + ' visits" style="background:' + (c ? 'rgba(242,169,59,' + (0.15 + 0.85 * c / hmax).toFixed(2) + ')' : 'rgba(245,241,232,.05)') + '"></div>'; } });
    $(id).innerHTML = h;
  }

  // ---------- CSV (one row per visit) ----------
  $('csv').addEventListener('click', function () {
    var head = ['time_toronto', 'city', 'region', 'country', 'device', 'os', 'browser', 'source', 'campaign', 'ad', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'landing_page', 'pages', 'page_count', 'reading_seconds', 'form_started', 'lead', 'lead_page', 'taps', 'new_visitor'];
    var rows = [head.join(',')].concat(LAST.map(function (s) {
      var t = s.tag || {};
      return [new Date(s.ts).toLocaleString('en-CA', { timeZone: TZ }), s.c.city, s.c.region, s.c.country, s.c.device, s.c.os, s.c.browser, s.src.label, s.camp ? campName(s.camp) : '', s.cnt ? adLabel(s.cnt) : '',
        t.src, t.med, t.cmp, t.cnt, s.landing, s.pages.join(' > '), s.pvs.length, Math.round(s.engaged / 1000), s.formStart, s.lead, s.leadPage, s.taps.join(' '), s.newV]
        .map(function (x) { x = String(x == null ? '' : x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(',');
    }));
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    a.download = 'eventstudio-' + (TAB === 'geo' ? 'geofence' : 'site') + '-visits-' + todayStr(0) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  });

  // ---------- Exclude own visits ----------
  function selfLabel() {
    var off = localStorage.getItem('avt_off') === '1';
    $('selfBtn').textContent = off ? 'This browser is not counted — click to count it again' : 'Don’t count visits from this browser';
    $('selfBtn').className = off ? 'ghost' : 'primary';
  }
  $('selfBtn').addEventListener('click', function () {
    var off = localStorage.getItem('avt_off') === '1', v = localStorage.getItem('avt_v'), ign = excluded();
    if (off) { localStorage.removeItem('avt_off'); ign = ign.filter(function (x) { return x !== v; }); }
    else { localStorage.setItem('avt_off', '1'); if (v && ign.indexOf(v) === -1) ign.push(v); }
    localStorage.setItem('avt_ignore', JSON.stringify(ign)); selfLabel(); if (RAW) { build(); render(); }
  });
  try { selfLabel(); } catch (e) {}
  if (KEY) load(); else $('pw').focus();
})();
