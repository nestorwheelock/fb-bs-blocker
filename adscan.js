'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FBFAds = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Reads Facebook's own feed data and returns the visible text of every ad in it, so the
  // page can hide the unit that shows that text. Two ad markers appear in the data:
  //   feed ads         a story whose `tracking` string parses to {"is_sponsored":1}, or an
  //                    object carrying a non-null `th_dat_spo`
  //   right-rail ads   an object carrying a non-null `sponsored_data`
  // A feed ad's text is read from its whole unit (the `node` under news_feed.edges[] or a
  // streamed data.node), never from neighbouring bytes, so an organic post is not swept in.

  const KEY_LEN = 40;

  function isAdTracking(v) {
    if (typeof v !== 'string' || v.indexOf('is_sponsored') < 0) return false;
    try { return JSON.parse(v).is_sponsored === 1; } catch (_) { return /is_sponsored"\s*:\s*1/.test(v); }
  }

  // A string a person reads on the ad: has a space, is long enough to be distinctive, and is
  // not an identifier, URL, markup or serialized JSON.
  function readable(s) {
    return s.length >= 20 && /\s/.test(s) && !/^[\w$.\-]+$/.test(s) && s[0] !== '{' && s[0] !== '<'
      && !/^https?:/.test(s) && !/graphql|\.react|_renderer|\$normalization/.test(s);
  }

  function normalize(s) {
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  // The fields an ad's visible text lives in, by field name and parent field name. Every other
  // string in a unit is UI chrome that organic posts share ("Comment as ..."), class lists or
  // identifiers; keying on those would hide the whole feed.
  function adTextField(parent, key) {
    return (key === 'text' && (parent === 'message' || parent === 'title_with_entities' || parent === 'description'))
      || key === 'title' || key === 'description' || key === 'link_title' || key === 'link_description';
  }

  function collect(n, out, parent) {
    if (!n || typeof n !== 'object') return out;
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (typeof v === 'string') {
        if (adTextField(parent, k) && readable(v)) out.add(normalize(v).slice(0, KEY_LEN));
      } else collect(v, out, k);
    }
    return out;
  }

  // frames: the chain of [key, object] pairs from the root to the current node
  function walk(n, frames, out) {
    if (!n || typeof n !== 'object') return;
    if (!Array.isArray(n)) {
      // `th_dat_spo` is a non-null object on every ad and null/absent on organic posts
      // (11 of 11 and 0 of 19 in a captured feed), and survives when `tracking` is missing.
      if (isAdTracking(n.tracking) || (n.th_dat_spo && typeof n.th_dat_spo === 'object')) {
        let unit = null;
        for (let i = frames.length - 1; i >= 0; i--) if (frames[i][0] === 'node') { unit = frames[i][1]; break; }
        collect(unit || n, out);
      } else if (n.sponsored_data && typeof n.sponsored_data === 'object') {
        collect(n, out);
      }
    }
    for (const k of Object.keys(n)) walk(n[k], frames.concat([[k, n[k]]]), out);
  }

  function adKeysFromJson(value) {
    const out = new Set();
    walk(value, [], out);
    return Array.from(out);
  }

  // A response body: one JSON document, newline-delimited JSON, or either behind `for (;;);`.
  function adKeysFromText(text) {
    if (typeof text !== 'string' || text.indexOf('is_sponsored') < 0 && text.indexOf('sponsored_data') < 0) return [];
    const body = text.replace(/^\s*for\s*\(;;\);\s*/, '');
    const out = new Set();
    const docs = [];
    try { docs.push(JSON.parse(body)); } catch (_) {
      for (const line of body.split('\n')) {
        const s = line.trim();
        if (!s) continue;
        try { docs.push(JSON.parse(s)); } catch (_) { /* partial line */ }
      }
    }
    for (const d of docs) for (const k of adKeysFromJson(d)) out.add(k);
    return Array.from(out);
  }

  // Does a feed unit's visible text contain the start of any ad key?
  function unitIsAd(unitText, keys) {
    if (!keys || !keys.size && !keys.length) return false;
    const hay = normalize(unitText);
    for (const k of keys) if (hay.indexOf(k) >= 0) return true;
    return false;
  }

  return { adKeysFromJson, adKeysFromText, unitIsAd, normalize, KEY_LEN };
});
