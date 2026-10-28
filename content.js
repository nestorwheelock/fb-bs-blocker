(function () {
  'use strict';

  const SETTINGS_KEY = 'fbf-settings';
  const HIDDEN = 'data-fbf-hidden';
  // A feed post with less text than this is a placeholder: Facebook empties posts that scroll
  // out of view and fills them again. A placeholder is neither hidden nor shown by us, so the
  // post does not flip on and off while it is emptied and refilled.
  const MIN_TEXT = 40;
  // An element is evaluated again only when its text length changed. The site re-renders
  // constantly, and reprocessing every node on every mutation is a busy loop.
  let seen = new WeakMap();
  let settings = FBF.DEFAULT_SETTINGS;
  let frame = null;
  let slowTimer = null;
  let lastSlow = 0;
  let lastReport = '';

  // Text of every ad Facebook's own data names: from inline JSON in the page and from the
  // feed responses hook_main.js reads. A post showing that text is an ad whatever it is labelled.
  const adKeys = new Set();
  // Text of posts to suppress as suggestions: a group the viewer has not joined (Join button)
  // or a profile or page the viewer could follow (Follow button), same sources.
  const suggestKeys = new Set();
  const scannedScripts = new WeakSet();
  let railSeen = new WeakMap();
  // The viewer's own name, from the comment box on every post. Their own posts are never
  // hidden as politics.
  let viewer = null;

  function features(el) {
    const lines = (el.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
    const hrefs = Array.from(el.querySelectorAll('a[href]')).map(a => a.getAttribute('href'));
    return { lines, hrefs };
  }

  function evaluate(el) {
    const len = (el.textContent || '').length;
    if (len < MIN_TEXT || seen.get(el) === len) return;
    seen.set(el, len);

    // `innerText` of an element we hid has no line breaks (it is not rendered), and the label
    // rules read whole lines. Lift the attribute, read the text as rendered, and put it back in
    // the same task: nothing is painted in between, so the post does not flash.
    const prev = el.getAttribute(HIDDEN);
    if (prev !== null) el.removeAttribute(HIDDEN);
    const f = features(el);

    const own = viewer !== null && f.lines.slice(0, 8).indexOf(viewer) >= 0;
    let verdict = FBF.classify(f, own ? Object.assign({}, settings, { politics: false }) : settings);
    if (!verdict.hide && settings.ads && FBFAds.unitIsAd(el.textContent, adKeys)) {
      verdict = { hide: true, reason: 'ad', detail: 'data' };
    }
    if (!verdict.hide && settings.suggestions && FBFAds.unitIsAd(el.textContent, suggestKeys)) {
      verdict = { hide: true, reason: 'suggestion', detail: 'data' };
    }

    if (verdict.hide) {
      el.setAttribute(HIDDEN, verdict.reason);
      if (prev === null) {
        console.log('[fbf] hide', verdict.reason, verdict.detail, '|', f.lines.slice(0, 3).join(' / ').slice(0, 90));
      }
    }
  }

  function addKeys(keys, sKeys, who) {
    let added = false;
    for (const k of keys) if (!adKeys.has(k)) { adKeys.add(k); added = true; }
    for (const k of sKeys || []) if (!suggestKeys.has(k)) { suggestKeys.add(k); added = true; }
    if (who && (viewer === null || who.length > viewer.length)) { viewer = who; added = true; }
    if (added) { seen = new WeakMap(); railSeen = new WeakMap(); lastSlow = 0; }
    return added;
  }

  function scanInlineJson() {
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      if (scannedScripts.has(s)) continue;
      scannedScripts.add(s);
      const r = FBFAds.scanText(s.textContent || '');
      addKeys(r.ad, r.suggestion, r.viewer);
    }
  }

  // Right-column ads are not feed posts: hide the link card whose text is an ad's, then the
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
    frame = null;
    // After the extension is reloaded, the script left in an open tab has no extension
    // context. Stop it, instead of throwing on every mutation until the tab is reloaded.
    if (!chrome.runtime || !chrome.runtime.id) { observer.disconnect(); return; }

    // Feed posts every frame; the page-wide scans (inline JSON, right column) at most once a
    // second, with a trailing run so the last change is not skipped.
    const now = performance.now();
    const slow = now - lastSlow > 1000;
    if (slow) { lastSlow = now; scanInlineJson(); }
    else if (slowTimer === null) slowTimer = setTimeout(() => { slowTimer = null; schedule(); }, 1000 - (now - lastSlow) + 20);

    const units = fbfPick(document, 'feedUnits');
    for (const el of units) evaluate(el);
    if (slow) hideRail(units);

    const line = 'v' + chrome.runtime.getManifest().version + ' ' + units.length + ' units, ' + adKeys.size +
      ' ad keys, ' + suggestKeys.size + ' suggestion keys, ' + document.querySelectorAll('[' + HIDDEN + ']').length +
      ' hidden' + (viewer ? ', viewer known' : '');
    if (line !== lastReport) { lastReport = line; console.log('[fbf]', line); }
  }

  function schedule() {
    if (frame === null) frame = requestAnimationFrame(pass);
  }

  function reset() {
    // Right-column cards are not re-evaluated like feed posts, so clear those here; feed posts
    // are lifted and re-decided in evaluate().
    document.querySelectorAll('[' + HIDDEN + ']').forEach(e => { if (!e.hasAttribute('aria-posinset')) e.removeAttribute(HIDDEN); });
    seen = new WeakMap();
    railSeen = new WeakMap();
    lastSlow = 0;
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
      && addKeys(d.keys, Array.isArray(d.suggestionKeys) ? d.suggestionKeys : [], typeof d.viewer === 'string' ? d.viewer : null)) schedule();
  });

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  load();
})();
