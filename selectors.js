'use strict';
// Ordered fallbacks per feed element; first selector that matches anything wins.
var FBF_SELECTORS = {
  feedUnits: [
    { id: 'aria-posinset', css: '[aria-posinset]' },
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
