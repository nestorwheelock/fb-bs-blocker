(function () {
  'use strict';

  const SETTINGS_KEY = 'fbf-settings';
  const HIDDEN = 'data-fbf-hidden';
  // An element is evaluated again only when its text length changed. The site re-renders
  // constantly, and reprocessing every node on every mutation is a busy loop.
  let seen = new WeakMap();
  let settings = FBF.DEFAULT_SETTINGS;
  let timer = null;

  // Text of every ad Facebook's own data names: from inline JSON in the page and from the
  // feed responses hook_main.js reads. A unit showing that text is an ad whatever it is labelled.
  const adKeys = new Set();
  // Text of posts from groups the viewer has not joined (the Join button), same sources.
  const suggestKeys = new Set();
  const scannedScripts = new WeakSet();
  let railSeen = new WeakMap();

  function features(el) {
    const lines = (el.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
    const hrefs = Array.from(el.querySelectorAll('a[href]')).map(a => a.getAttribute('href'));
    return { lines, hrefs };
  }

  function evaluate(el) {
    const len = (el.textContent || '').length;
    if (len === 0 || seen.get(el) === len) return;
    seen.set(el, len);
    let verdict = FBF.classify(features(el), settings);
    if (!verdict.hide && settings.ads && FBFAds.unitIsAd(el.textContent, adKeys)) {
      verdict = { hide: true, reason: 'ad', detail: 'data' };
    }
    if (!verdict.hide && settings.suggestions && FBFAds.unitIsAd(el.textContent, suggestKeys)) {
      verdict = { hide: true, reason: 'suggestion', detail: 'group-join' };
    }
    if (verdict.hide) el.setAttribute(HIDDEN, verdict.reason);
    else el.removeAttribute(HIDDEN);
  }

  function addKeys(keys, sKeys) {
    let added = false;
    for (const k of keys) if (!adKeys.has(k)) { adKeys.add(k); added = true; }
    for (const k of sKeys || []) if (!suggestKeys.has(k)) { suggestKeys.add(k); added = true; }
    if (added) { seen = new WeakMap(); railSeen = new WeakMap(); }
    return added;
  }

  function scanInlineJson() {
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      if (scannedScripts.has(s)) continue;
      scannedScripts.add(s);
      const r = FBFAds.scanText(s.textContent || '');
      addKeys(r.ad, r.suggestion);
    }
  }

  // Right-column ads are not feed units: hide the link card whose text is an ad's, then the
  // "Sponsored" heading above them.
  function hideRail(units) {
    if (!settings.ads || adKeys.size === 0) return;
    const inUnit = el => units.some(u => u.contains(el));
    for (const a of document.querySelectorAll('a[href]')) {
      const len = (a.textContent || '').length;
      if (len === 0 || len > 600 || railSeen.get(a) === len) continue;
      railSeen.set(a, len);
      if (inUnit(a)) continue;
      if (FBFAds.unitIsAd(a.textContent, adKeys)) a.setAttribute(HIDDEN, 'ad');
    }
    if (document.querySelector('a[' + HIDDEN + '="ad"]:not([aria-posinset] *)')) {
      for (const h of document.querySelectorAll('span,h2,h3')) {
        if (h.children.length === 0 && h.textContent.trim() === 'Sponsored' && !inUnit(h)) h.setAttribute(HIDDEN, 'ad');
      }
    }
  }

  function pass() {
    timer = null;
    // After the extension is reloaded, the script left in an open tab has no extension
    // context. Stop it, instead of throwing on every mutation until the tab is reloaded.
    if (!chrome.runtime || !chrome.runtime.id) { observer.disconnect(); return; }
    scanInlineJson();
    const units = fbfPick(document, 'feedUnits');
    for (const el of units) evaluate(el);
    hideRail(units);
    console.log('[fbf] v' + chrome.runtime.getManifest().version, units.length + ' units',
      adKeys.size + ' ad keys', suggestKeys.size + ' join keys', document.querySelectorAll('[' + HIDDEN + ']').length + ' hidden');
  }

  function schedule() {
    if (timer === null) timer = setTimeout(pass, 250);
  }

  function reset() {
    document.querySelectorAll('[' + HIDDEN + ']').forEach(e => e.removeAttribute(HIDDEN));
    seen = new WeakMap();
    railSeen = new WeakMap();
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

  // Keys read from feed responses by hook_main.js (MAIN world). A page script can post this
  // message too; the worst it can do is hide something, so it is not authenticated.
  window.addEventListener('message', ev => {
    const d = ev.data;
    if (ev.source === window && d && d.source === 'fbf-ads' && Array.isArray(d.keys)
      && addKeys(d.keys, Array.isArray(d.suggestionKeys) ? d.suggestionKeys : [])) schedule();
  });

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  load();
})();
