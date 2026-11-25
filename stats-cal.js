/* Click-to-pick date range calendar for the stats dashboard.
   Sets the hidden #from / #to fields (YYYY-MM-DD), then fires one "change" on #to so stats.js reloads. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var TZ = 'America/Toronto', MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var cal = $('cal'), btn = $('rangeBtn');
  if (!cal || !btn) return;
  function pad(x) { return (x < 10 ? '0' : '') + x; }
  function iso(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function todayIso() { var p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; }); return p.year + '-' + p.month + '-' + p.day; }
  var TODAY = todayIso(), t = TODAY.split('-');
  var vy = +t[0], vm = +t[1] - 1, a = '', b = '';

  function nice(s) { if (!s) return ''; var p = s.split('-'); return MON[+p[1] - 1].slice(0, 3) + ' ' + (+p[2]) + (p[0] !== t[0] ? ', ' + p[0] : ''); }
  function label() { btn.textContent = (a ? nice(a) + (b && b !== a ? ' – ' + nice(b) : '') : 'Pick dates') + ' ▾'; }
  function draw() {
    var first = new Date(Date.UTC(vy, vm, 1)).getUTCDay(), dim = new Date(Date.UTC(vy, vm + 1, 0)).getUTCDate(), h = '';
    h += '<div class="hd"><button type="button" data-n="-1" aria-label="Previous month">‹</button><span>' + MON[vm] + ' ' + vy + '</span><button type="button" data-n="1" aria-label="Next month">›</button></div><div class="gr">';
    ['S','M','T','W','T','F','S'].forEach(function (d) { h += '<span class="dow">' + d + '</span>'; });
    for (var i = 0; i < first; i++) h += '<span class="d blank"></span>';
    for (var d = 1; d <= dim; d++) {
      var s = iso(vy, vm, d), c = 'd';
      if (s > TODAY) c += ' fut';
      if (a && s === a || b && s === b) c += ' end';
      else if (a && b && s > a && s < b) c += ' mid';
      h += '<button type="button" class="' + c + '" data-d="' + s + '">' + d + '</button>';
    }
    h += '</div><div class="ft"><span>' + (a && !b ? 'Now click the last day' : a ? nice(a) + ' – ' + nice(b || a) : 'Click the first day') + '</span><button type="button" class="ghost" data-x="1">Close</button></div>';
    cal.innerHTML = h;
  }
  function openCal() { if (a) { var p = a.split('-'); vy = +p[0]; vm = +p[1] - 1; } cal.classList.remove('hide'); btn.setAttribute('aria-expanded', 'true'); draw(); }
  function closeCal() { cal.classList.add('hide'); btn.setAttribute('aria-expanded', 'false'); }
  function apply() {
    $('from').value = a; $('to').value = b || a; label();
    var ev = document.createEvent('Event'); ev.initEvent('change', true, true); $('to').dispatchEvent(ev);
  }
  cal.addEventListener('click', function (e) {
    var el = e.target.closest('button'); if (!el) return;
    if (el.getAttribute('data-n')) { vm += +el.getAttribute('data-n'); if (vm < 0) { vm = 11; vy--; } if (vm > 11) { vm = 0; vy++; } draw(); return; }
    if (el.getAttribute('data-x')) { closeCal(); return; }
    var d = el.getAttribute('data-d'); if (!d) return;
    if (!a || b) { a = d; b = ''; draw(); }
    else { if (d < a) { b = a; a = d; } else b = d; draw(); apply(); closeCal(); }
  });
  btn.addEventListener('click', function () { cal.classList.contains('hide') ? openCal() : closeCal(); });
  document.addEventListener('click', function (e) { if (!cal.classList.contains('hide') && !$('rangeWrap').contains(e.target)) closeCal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCal(); });
  window.ESCal = { open: openCal };
  label();
})();
