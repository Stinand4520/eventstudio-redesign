/* EventStudio lead form: Name / Email / Company. Sends to /api/lead (our server emails it), then goes to the thank-you page.
   Use on a <form data-lead="campaign-key" action="/api/lead" method="POST">. Without JavaScript the form still posts normally and the server redirects. */
(function () {
  'use strict';
  var form = document.querySelector('form[data-lead]');
  if (!form) return;
  var campaign = form.getAttribute('data-lead');
  var qs = new URLSearchParams(location.search);

  function field(name) {
    var el = form.querySelector('input[name="' + name + '"]');
    if (!el) { el = document.createElement('input'); el.type = 'hidden'; el.name = name; form.appendChild(el); }
    return el;
  }
  // Ad / UTM tags: from this visit's address, else the tag av-track.js remembered earlier in the visit
  var saved = {}; try { saved = JSON.parse(sessionStorage.getItem('avt_stag') || localStorage.getItem('avt_tag') || '{}') || {}; } catch (e) {}
  var fallback = { utm_source: saved.src, utm_medium: saved.med, utm_campaign: saved.cmp, utm_content: saved.cnt, utm_term: saved.trm };
  var pairs = [];
  ['ad', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
    var v = qs.get(k) || fallback[k] || '';
    field(k).value = v;
    if (v) pairs.push(k + '=' + v);
  });
  // Source: keep a fixed label if the page set one (e.g. associations-oct2026), else list the tags, else "direct"
  var src = field('source'), base = src.value && src.value !== 'direct' ? src.value : '';
  src.value = base || pairs.join(' | ') || 'direct';
  field('campaign').value = campaign;
  field('page').value = location.pathname;
  field('referrer').value = document.referrer || '';

  var statusEl = form.querySelector('.form-status') || document.getElementById('status') || document.getElementById('err') || form.querySelector('.form-error');
  if (!statusEl) { statusEl = document.createElement('p'); statusEl.className = 'form-error'; statusEl.style.cssText = 'font-size:13px;margin-top:8px'; form.appendChild(statusEl); }
  statusEl.setAttribute('role', 'status'); statusEl.setAttribute('aria-live', 'polite');
  function say(msg) { statusEl.textContent = msg; statusEl.style.display = msg ? 'block' : 'none'; }
  var btn = form.querySelector('button[type=submit]');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    say('');
    var f = form.elements;
    if (!f.name.value.trim()) { say('Please add your name.'); f.name.focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.value.trim())) { say('Please add a valid email so we can reply.'); f.email.focus(); return; }
    if (f.company.required && !f.company.value.trim()) { say('Please add your company.'); f.company.focus(); return; }

    var original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) { if (!el.name) return; if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return; data[el.name] = el.value; });
    function fail(msg) {
      if (btn) { btn.disabled = false; btn.innerHTML = original; }
      say(msg || 'That didn’t send. Please try again, or email admin@eventstudio.tv.');
    }
    fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (j) { return { ok: res.ok, j: j }; }); })
      .then(function (r) {
        if (!r.ok || !r.j.ok) return fail(r.j && r.j.error && r.j.error.indexOf(' ') > 0 ? r.j.error : '');
        // Let the page record its conversion events (Vercel, av-track, GA4) before we leave
        try { form.dispatchEvent(new CustomEvent('lead:sent', { bubbles: true, detail: { campaign: campaign } })); } catch (err) {}
        setTimeout(function () { location.href = r.j.redirect; }, 400);
      })
      .catch(function () { fail(); });
  });
})();
