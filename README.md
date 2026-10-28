# FB Filter

Hides feed units on facebook.com that are ads, follow suggestions, or match a political
keyword list. MV3; Chrome and Firefox. Class `site-bound` in the rfw extension standard.

Load unpacked from this directory. Options page: toggle each category, add keywords to
hide, add keywords that exempt a post.

## Layout

- `classify.js` — pure classifier, node-testable. `node --test test/*.test.js`
- `selectors.js` — ordered fallback selectors for feed units, first match wins.
- `content.js` — observes the feed, evaluates each unit when its text length changes,
  marks hidden units with `data-fbf-hidden`.
- `hide.css` — `[data-fbf-hidden] { display: none !important }`.
- `options.html`, `options.js` — settings in `chrome.storage.sync`.

## Permissions

`storage` and two Facebook hosts. No `tabs`, no `scripting`, no `webRequest`.
