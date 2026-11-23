/* Meta (Facebook/Instagram) Pixel "EventStudio Website" (ID 938253306038298), connected to the Eventstudio ad account.
   - PageView on every public page that loads this file (not the internal stats pages).
   - Lead: fired once on each thank-you page, and once when a form that has no thank-you page is sent (lead-form.js dispatches "lead:sent"). */
(function () {
  'use strict';
  var ID = '938253306038298';
  try { if (localStorage.getItem('es_ad_consent') === 'denied') return; } catch (e) {}   // visitor turned advertising cookies off (privacy page)
  if (window.fbq) return;
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', ID);
  fbq('track', 'PageView');

  // Thank-you pages: one Lead per visit (a refresh does not count again)
  var path = location.pathname.replace(/\.html$/, '');
  if (/-thank-you$/.test(path)) {
    var key = 'mp_lead_' + path, seen = false;
    try { seen = sessionStorage.getItem(key) === '1'; sessionStorage.setItem(key, '1'); } catch (e) {}
    if (!seen) fbq('track', 'Lead', { content_name: path.replace(/^.*\//, '') });
  }
  // Forms with no thank-you page show "Thanks" on the page itself: count the Lead there
  document.addEventListener('lead:sent', function (e) {
    var d = (e && e.detail) || {};
    if (!d.redirect) fbq('track', 'Lead', { content_name: d.campaign || 'form' });
  });
})();
