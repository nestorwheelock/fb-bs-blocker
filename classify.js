'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FBF = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULT_SETTINGS = {
    ads: true,
    suggestions: true,
    politics: true,
    extraKeywords: [],
    allowKeywords: [],
  };

  const AD_LINES = new Set(['sponsored', 'ad', 'paid partnership', 'promoted']);
  const AD_HREF_RE = /\/ads\/(about|preferences)|[?&]ad_id=/i;

  const SUGGEST_LINES = new Set([
    'suggested for you', 'suggested', 'people you may know', 'suggested groups',
    'suggested pages', 'suggested reels', 'reels and short videos', 'reels',
    'follow', 'join', 'join group', 'groups you might like', 'pages you may like',
    'you may like',
  ]);
  const SUGGEST_RE = /^because you (follow|liked|joined|visited)/i;

  // Whole-word matches, so "election" does not hide "selection".
  const POLITICS_DEFAULT = [
    'trump', 'biden', 'harris', 'obama', 'desantis', 'kamala', 'vance', 'musk doge',
    'democrat', 'democrats', 'democratic party', 'republican', 'republicans', 'gop',
    'maga', 'congress', 'senate', 'senator', 'white house', 'supreme court',
    'election', 'elections', 'ballot', 'impeach', 'impeachment', 'politics',
    'political', 'politician', 'politicians', 'left-wing', 'right-wing', 'woke',
    'antifa', 'gun control', 'second amendment', 'abortion', 'immigration',
    'border wall', 'dnc', 'rnc',
  ];

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function wordRe(terms) {
    const parts = terms.map(t => t.trim()).filter(Boolean).map(escapeRe);
    if (!parts.length) return null;
    return new RegExp('(^|[^\\p{L}\\p{N}])(' + parts.join('|') + ')(?![\\p{L}\\p{N}])', 'iu');
  }

  function normalize(settings) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    s.extraKeywords = Array.isArray(s.extraKeywords) ? s.extraKeywords : [];
    s.allowKeywords = Array.isArray(s.allowKeywords) ? s.allowKeywords : [];
    return s;
  }

  /**
   * features: { lines: string[], hrefs: string[] }
   * returns:  { hide: boolean, reason: 'ad'|'suggestion'|'politics'|null, detail: string }
   */
  function classify(features, settings) {
    const s = normalize(settings);
    const lines = (features.lines || []).map(l => l.trim()).filter(Boolean);
    const lower = lines.map(l => l.toLowerCase());
    const hrefs = features.hrefs || [];

    if (s.ads) {
      const hit = lower.find(l => AD_LINES.has(l));
      if (hit) return { hide: true, reason: 'ad', detail: hit };
      const href = hrefs.find(h => AD_HREF_RE.test(h));
      if (href) return { hide: true, reason: 'ad', detail: href };
    }

    if (s.suggestions) {
      const hit = lower.find(l => SUGGEST_LINES.has(l) || SUGGEST_RE.test(l));
      if (hit) return { hide: true, reason: 'suggestion', detail: hit };
    }

    if (s.politics) {
      const text = lines.join(' \n ');
      const allow = wordRe(s.allowKeywords);
      if (!(allow && allow.test(text))) {
        const m = wordRe(POLITICS_DEFAULT.concat(s.extraKeywords)).exec(text);
        if (m) return { hide: true, reason: 'politics', detail: m[2].toLowerCase() };
      }
    }

    return { hide: false, reason: null, detail: '' };
  }

  return { classify, DEFAULT_SETTINGS, POLITICS_DEFAULT };
});
