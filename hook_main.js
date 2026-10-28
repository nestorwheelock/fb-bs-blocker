(function () {
  'use strict';

  // Runs in the page's own world, where fetch and XMLHttpRequest are the ones Facebook calls.
  // Reads feed responses, extracts the text of the ads in them, and posts that text to
  // content.js. Responses are read from a clone; the page's own copy is untouched.
  const GRAPHQL = /\/api\/graphql|\/graphql\//;

  function report(text) {
    try {
      const r = FBFAds.scanText(text);
      if (r.ad.length || r.suggestion.length || r.rail.length || r.viewer) {
        window.postMessage({ source: 'fbf-ads', keys: r.ad, suggestionKeys: r.suggestion, railKeys: r.rail, viewer: r.viewer }, location.origin);
      }
    } catch (_) { /* a response that does not parse is not an ad source */ }
  }

  const realFetch = window.fetch;
  window.fetch = function (input) {
    const p = realFetch.apply(this, arguments);
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (GRAPHQL.test(url)) p.then(r => r.clone().text().then(report, () => {}), () => {});
    return p;
  };

  const realOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (GRAPHQL.test(String(url))) {
      this.addEventListener('load', () => {
        try { if (this.responseType === '' || this.responseType === 'text') report(this.responseText); } catch (_) { /* unreadable */ }
      });
    }
    return realOpen.apply(this, arguments);
  };
})();
