'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FBFAds = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Reads Facebook's own feed data and returns the visible text of the posts it marks, so the
  // page can hide the feed post that shows that text. Two kinds of marker:
  //   ad          a story whose `tracking` string parses to {"is_sponsored":1}, or an object
  //               carrying a non-null `th_dat_spo`; or, in the right column, an object with a
  //               non-null `sponsored_data`
  //   suggestion  a post from a group the viewer is not in: an object with
  //               `viewer_forum_join_state` of "CAN_JOIN" (the Join button)
  // A feed ad's text is read from its whole feed entry (the `node` under news_feed.edges[] or a
  // streamed data.node), never from neighbouring bytes, so an organic post is not swept in.

  const KEY_LEN = 40;
  const MARKERS = ['is_sponsored', 'sponsored_data', 'th_dat_spo', 'CAN_JOIN', 'IFR_POST_IN_NEWS_FEED', 'Comment as '];

  function isAdTracking(v) {
    if (typeof v !== 'string' || v.indexOf('is_sponsored') < 0) return false;
    try { return JSON.parse(v).is_sponsored === 1; } catch (_) { return /is_sponsored"\s*:\s*1/.test(v); }
  }

  // A string a person reads on the post: has a space, is long enough to be distinctive, and
  // is not an identifier, URL, markup or serialized JSON.
  function readable(s) {
    return s.length >= 20 && /\s/.test(s) && !/^[\w$.\-]+$/.test(s) && s[0] !== '{' && s[0] !== '<'
      && !/^https?:/.test(s) && !/graphql|\.react|_renderer|\$normalization/.test(s);
  }

  function normalize(s) {
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  // The fields a post's visible text lives in, by field name and parent field name. Every other
  // string in a feed entry is UI chrome that organic posts share ("Comment as ...", a group's
  // privacy blurb), class lists or identifiers; keying on those would hide the whole feed.
  function adTextField(parent, key) {
    return (key === 'text' && (parent === 'message' || parent === 'title_with_entities' || parent === 'description'))
      || key === 'title' || key === 'description' || key === 'link_title' || key === 'link_description';
  }

  // A group post's own words only: its group's description and link previews are shared with
  // every other post from that group.
  function messageField(parent, key) {
    return key === 'text' && parent === 'message';
  }

  function collect(n, out, parent, accept) {
    if (!n || typeof n !== 'object') return out;
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (typeof v === 'string') {
        if (accept(parent, k) && readable(v)) out.add(normalize(v).slice(0, KEY_LEN));
      } else collect(v, out, k, accept);
    }
    return out;
  }

  function unitOf(frames, fallback) {
    for (let i = frames.length - 1; i >= 0; i--) if (frames[i][0] === 'node') return frames[i][1];
    return fallback;
  }

  // frames: the chain of [key, object] pairs from the root to the current node
  function walk(n, frames, out) {
    if (!n || typeof n !== 'object') return;
    if (!Array.isArray(n)) {
      // `th_dat_spo` is a non-null object on every ad and null/absent on organic posts
      // (11 of 11 and 0 of 19 in a captured feed), and survives when `tracking` is missing.
      if (isAdTracking(n.tracking) || (n.th_dat_spo && typeof n.th_dat_spo === 'object')) {
        collect(unitOf(frames, n), out.ad, '', adTextField);
      } else if (n.sponsored_data && typeof n.sponsored_data === 'object') {
        collect(n, out.ad, '', adTextField);
      }
      if (n.viewer_forum_join_state === 'CAN_JOIN') {
        collect(unitOf(frames, n), out.suggestion, '', messageField);
      }
      // The Follow button on a post's header: present on 19 of 108 captured feed posts, and on
      // none of the ads or joinable-group posts among them.
      if (n.follow_location === 'IFR_POST_IN_NEWS_FEED') {
        collect(unitOf(frames, n), out.suggestion, '', messageField);
      }
      // The viewer's own name, from the comment box every post carries.
      if (typeof n.comment_composer_placeholder === 'string') {
        const m = /^Comment as (.{2,60})$/.exec(n.comment_composer_placeholder);
        // some posts carry only the first name; the full name is the longer one
        if (m && (!out.viewer || m[1].length > out.viewer.length)) out.viewer = m[1];
      }
    }
    for (const k of Object.keys(n)) walk(n[k], frames.concat([[k, n[k]]]), out);
  }

  // -> { ad: string[], suggestion: string[], viewer: string|null }
  function scanJson(value) {
    const out = { ad: new Set(), suggestion: new Set(), viewer: null };
    walk(value, [], out);
    return { ad: Array.from(out.ad), suggestion: Array.from(out.suggestion), viewer: out.viewer };
  }

  // A response body: one JSON document, newline-delimited JSON, or either behind `for (;;);`.
  function scanText(text) {
    const none = { ad: [], suggestion: [], viewer: null };
    if (typeof text !== 'string' || !MARKERS.some(m => text.indexOf(m) >= 0)) return none;
    const body = text.replace(/^\s*for\s*\(;;\);\s*/, '');
    const docs = [];
    try { docs.push(JSON.parse(body)); } catch (_) {
      for (const line of body.split('\n')) {
        const s = line.trim();
        if (!s) continue;
        try { docs.push(JSON.parse(s)); } catch (_) { /* partial line */ }
      }
    }
    const ad = new Set();
    const suggestion = new Set();
    let viewer = null;
    for (const d of docs) {
      const r = scanJson(d);
      r.ad.forEach(k => ad.add(k));
      r.suggestion.forEach(k => suggestion.add(k));
      if (r.viewer && (!viewer || r.viewer.length > viewer.length)) viewer = r.viewer;
    }
    return { ad: Array.from(ad), suggestion: Array.from(suggestion), viewer };
  }

  function adKeysFromJson(value) { return scanJson(value).ad; }
  function adKeysFromText(text) { return scanText(text).ad; }

  // Does a feed post's visible text contain the start of any key?
  function unitIsAd(unitText, keys) {
    if (!keys || (!keys.size && !keys.length)) return false;
    const hay = normalize(unitText);
    for (const k of keys) if (hay.indexOf(k) >= 0) return true;
    return false;
  }

  return { scanJson, scanText, adKeysFromJson, adKeysFromText, unitIsAd, normalize, KEY_LEN };
});
