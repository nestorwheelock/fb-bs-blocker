# fb-bs-blocker

A browser extension that hides posts in the facebook.com feed that are ads, suggestions
(follow, people you may know, Reels, groups you have not joined), or match a political
keyword list. Manifest V3; Chrome and Firefox.

Ads and group suggestions are identified from Facebook's own feed data, not from the label
on the page, so a relabelled or scrambled "Sponsored" does not get past it. The page's
requests are read in the browser and nothing leaves it.

Load unpacked from this directory (`chrome://extensions`, Developer mode, Load unpacked).
Options page: toggle each category, add keywords to hide, add keywords that exempt a post.

Facebook changes its markup and data without notice; expect to adjust `selectors.js` and
`adscan.js`. Not affiliated with or endorsed by Meta.

## License

BSD 2-Clause. See `LICENSE`.

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
