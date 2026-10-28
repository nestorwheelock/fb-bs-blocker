(function () {
  'use strict';

  const SETTINGS_KEY = 'fbf-settings';
  const HIDDEN = 'data-fbf-hidden';
  // An element is evaluated again only when its text length changed. The site re-renders
  // constantly, and reprocessing every node on every mutation is a busy loop.
  let seen = new WeakMap();
  let settings = FBF.DEFAULT_SETTINGS;
  let timer = null;

  function features(el) {
    const lines = (el.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
    const hrefs = Array.from(el.querySelectorAll('a[href]')).map(a => a.getAttribute('href'));
    return { lines, hrefs };
  }

  function evaluate(el) {
    const len = (el.textContent || '').length;
    if (len === 0 || seen.get(el) === len) return;
    seen.set(el, len);
    const verdict = FBF.classify(features(el), settings);
    if (verdict.hide) el.setAttribute(HIDDEN, verdict.reason);
    else el.removeAttribute(HIDDEN);
  }

  function pass() {
    timer = null;
    for (const el of fbfPick(document, 'feedUnits')) evaluate(el);
  }

  function schedule() {
    if (timer === null) timer = setTimeout(pass, 250);
  }

  function reset() {
    document.querySelectorAll('[' + HIDDEN + ']').forEach(e => e.removeAttribute(HIDDEN));
    seen = new WeakMap();
    schedule();
  }

  function load() {
    chrome.storage.sync.get(SETTINGS_KEY, got => {
      settings = Object.assign({}, FBF.DEFAULT_SETTINGS, got && got[SETTINGS_KEY]);
      reset();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[SETTINGS_KEY]) load();
  });

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  load();
})();
