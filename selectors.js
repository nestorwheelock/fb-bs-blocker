'use strict';
// Ordered fallbacks per feed element; first selector that matches anything wins.
// Same shape as extensions/automation/selector_registry.js in rfw.
var FBF_SELECTORS = {
  feedUnits: [
    { id: 'feed-children', css: '[role="feed"] > div' },
    { id: 'feedunit-pagelet', css: '[data-pagelet^="FeedUnit"]' },
    { id: 'article-role', css: '[role="article"]' },
  ],
};

function fbfPick(root, key) {
  for (const sel of FBF_SELECTORS[key]) {
    const found = Array.from(root.querySelectorAll(sel.css));
    if (found.length) return found;
  }
  return [];
}
