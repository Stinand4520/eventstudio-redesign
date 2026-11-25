/* Google Analytics 4, property "Eventstudio Ltd", measurement ID G-C6YC8W91N4, runs alongside Vercel Analytics (does not replace it).
   - Page views on every public page that loads this file (not the internal stats pages).
   - generate_lead: once per visit on each thank-you page, and once when a form with no thank-you page is sent (lead-form.js dispatches "lead:sent").
   - Honours the privacy-page switch (es_ad_consent = denied): nothing loads for that browser.
   - Google signals and ad personalization are off, so GA4 is used for measurement only, not for Google advertising. */
(function () {
  'use strict';
  var ID = 'G-C6YC8W91N4';
  try { if (localStorage.getItem('es_ad_consent') === 'denied') return; } catch (e) {}
  if (window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  var s = document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(s);
  gtag('js', new Date());
  gtag('config', ID, { allow_google_signals: false, allow_ad_personalization_signals: false });

  var path = location.pathname.replace(/\.html$/, '');
  if (/-thank-you$/.test(path)) {
    var key = 'ga_lead_' + path, seen = false;
    try { seen = sessionStorage.getItem(key) === '1'; sessionStorage.setItem(key, '1'); } catch (e) {}
    if (!seen) gtag('event', 'generate_lead', { lead_source: path.replace(/^.*\//, '') });
  }
  document.addEventListener('lead:sent', function (e) {
    var d = (e && e.detail) || {};
    if (!d.redirect) gtag('event', 'generate_lead', { lead_source: d.campaign || 'form' });
  });
})();
