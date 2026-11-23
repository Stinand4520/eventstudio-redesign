/* Advertising-cookie switch. Used by the privacy page. Default (no choice made) is on; "denied" stops the Chameleon and Meta advertising tags from loading on later page views in this browser. */
(function () {
  'use strict';
  var KEY = 'es_ad_consent';
  window.esConsent = {
    get: function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set: function (v) { try { localStorage.setItem(KEY, v === 'denied' ? 'denied' : 'granted'); } catch (e) {} }
  };
})();
