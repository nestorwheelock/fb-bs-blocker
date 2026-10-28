# FB Filter

Hides feed units on facebook.com that are ads, follow suggestions, or match a political
keyword list. MV3; Chrome and Firefox. Class `site-bound` in the rfw extension standard.

Load unpacked from this directory. Options page: toggle each category, add keywords to
hide, add keywords that exempt a post.

## Layout

- `classify.js` — pure classifier, node-testable. `node --test test/*.test.js`
- `adscan.js` — reads Facebook's own feed data and returns the visible text of each ad in it.
  Feed ads are stories whose `tracking` string parses to `is_sponsored: 1`; right-column ads
  are objects with `sponsored_data`. Text is read only from the ad's message, title and
  description fields, and only from that ad's own feed entry, so organic posts are not swept in.
  Posts from groups the viewer has not joined carry `viewer_forum_join_state: "CAN_JOIN"`;
  their message text becomes a suggestion key and is hidden under "Hide suggestions".
- `hook_main.js` — MAIN world, `document_start`. Wraps `fetch` and `XMLHttpRequest` for
  GraphQL responses, passes each body to `adscan.js`, posts the keys to `content.js`.
- `selectors.js` — ordered fallback selectors for feed posts, first match wins.
- `content.js` — observes the feed, evaluates each unit when its text length changes,
  marks hidden units with `data-fbf-hidden`.
- `hide.css` — `[data-fbf-hidden] { display: none !important }`.
- `options.html`, `options.js` — settings in `chrome.storage.sync`.

## Permissions

`storage` and two Facebook hosts. No `tabs`, no `scripting`, no `webRequest`.
