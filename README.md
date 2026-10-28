<p align="center"><img src="assets/logo.png" alt="Facebook Bullshit Blocker" width="280"></p>

# fb-bs-blocker

A browser extension that hides posts in the facebook.com feed that are ads, suggestions
(follow, people you may know, Reels, groups you have not joined), or match a political
keyword list. Manifest V3; Chrome and Firefox. BSD 2-Clause.

Ads and group suggestions are identified from Facebook's own feed data, not from the label
on the page, so a relabelled or scrambled "Sponsored" does not get past it. Responses are
read in the browser and nothing leaves it. Not affiliated with or endorsed by Meta.

## Install

`chrome://extensions`, turn on Developer mode, Load unpacked, choose this directory. Reload
the extension after any change, then reload the Facebook tab. Options page: toggle each
category, add keywords to hide, add keywords that exempt a post. The page console prints one
line per pass, beginning `[fbf]`, with the version and the counts of feed posts found, ad
keys, join keys and posts hidden.

## Status

Developed against captured Facebook traffic and tested offline (`node --test test/*.test.js`).
Behavior in a live browser is reported by the person using it, and Facebook changes its
markup and data without notice. Expect to adjust `selectors.js` and `adscan.js`.

## Methods

The extension went through two approaches. The first was replaced because of what was
observed on the live page, not because of an assumption.

### 1. Classify the rendered text

A pure function (`classify.js`) takes the text lines and link targets of one feed post and
returns hide or keep, with a reason:

- ads: a line equal to "Sponsored", "Ad", "Paid partnership" or "Promoted", or a link to
  `/ads/about`
- suggestions: lines such as "Suggested for you", "People you may know", "Follow", "Join",
  "Reels", "Because you follow ..."
- politics: whole-word keyword match against a default list plus the user's own, with an
  allow list that exempts a post

Whole-word matching keeps "election" from hiding "selection". Each rule has a test.

### 2. Find the feed posts in the page

A selector registry (`selectors.js`) tries ordered fallbacks and uses the first that matches.
On the page this was developed against, `[role="feed"]` was absent and the feed posts carried
`aria-posinset`, so that is first in the list. A post is re-evaluated only when its text
length changes, and hidden posts get a data attribute that one CSS rule turns into
`display: none`. This keeps the observer from looping on a page that re-renders constantly.

### 3. Why the rendered text was not enough

Three observations, from the live page and its console:

- The ad label was "Ad" on the page tested, not "Sponsored", so a fixed list of labels
  goes stale.
- The text of a feed post began with eight lines of the word "Facebook" before any real
  content. Reading text from the rendered tree is unreliable there, and a deliberately
  scrambled label cannot be read at all.
- Ads in the right column are not feed posts, so no feed selector reaches them.

### 4. Read Facebook's own data

The page is built from JSON that Facebook sends it. The ads are marked there, regardless of
how they are drawn.

**Capture.** DevTools, Network tab, Preserve log on, reload, scroll, then "Save all as HAR
with content". Two ways this failed: leftover text in the Network filter box hid every
request (the status bar read "0 / 846 requests") and produced an empty export, and exporting
before the page was scrolled left out the feed pagination requests. A HAR holds your session
cookies and tokens. Do not share or commit one.

**Analysis.** Offline, with small Node scripts, never by eye. The bodies needed handling
first: most were absent from the export, and the main page response was base64. Feed
pagination responses are newline-delimited JSON. The method was to find a marker, then
cross-tabulate it against the others, then check it separately on posts that should not have
it.

**Markers found**, each confirmed against the others on real responses:

| marker | where | means |
|---|---|---|
| `tracking` string that parses to `is_sponsored: 1` | inside a feed story | ad |
| non-null `th_dat_spo` | on the feed post object | ad |
| non-null `sponsored_data` | right-column ad object (`rhc_ad`) | ad |
| `viewer_forum_join_state: "CAN_JOIN"` | inside a feed story | post from a group the viewer has not joined |

`th_dat_spo` was non-null on 11 of 11 ads and 0 of 19 organic posts in one capture, and it
holds when `tracking` is missing, so both are checked.

**Post boundary.** A feed post is the `node` under `news_feed.edges[]`, or a streamed
`data.node`. The text of an ad is read from that one post only, never from neighbouring
bytes. An early version took a window of text around the marker and would have swept in the
post beside it.

**Which text.** Matching needs text the page also displays. Reading every string in a post
produced keys such as "Comment as <viewer>", CSS class lists, and a group's privacy blurb.
All of those appear on organic posts, so keying on them would hide the whole feed. The
extractor reads only named fields: `message.text`, `title_with_entities.text`,
`description.text`, `title`, `description`, `link_title`, `link_description`. For group
suggestions only `message.text`, because a group's description is shared by every post from
that group. One video ad had no message text and was missed until `link_title` and
`link_description` were added.

### 5. Deliver it in the page

- `hook_main.js` runs in the page's own world at `document_start` and wraps `fetch` and
  `XMLHttpRequest` for GraphQL requests. It reads each response from a clone, so the page's
  copy is untouched, runs the extractor, and posts the keys to the content script.
- The first screen of the feed is not fetched; it is embedded in the page as JSON. The
  content script scans those inline `application/json` scripts with the same extractor.
- A key is the first 40 characters of an ad's or suggestion's text, lowercased with
  whitespace collapsed. A feed post whose visible text contains a key is hidden. Keys that
  arrive after the post is drawn cause every post to be checked again.
- Right-column ads: the link card whose text contains an ad key is hidden, then the
  "Sponsored" heading above it.

Why two worlds: wrapping `fetch` has to happen in the page's world, and reaching extension
storage has to happen in the isolated one.

### 6. Validation

Run against captured responses with the real extractor, counting by feed post:

| capture | feed posts | ads | ads keyed | join posts | join keyed | organic posts keyed |
|---|---|---|---|---|---|---|
| first | 30 | 11 | 10, then 11 after adding link fields | | | 0 of 19 |
| second | 50 | 5 | 5 | 8 | 8 | 0 |

In the first capture, 10 of the 11 ads were keyed before `link_title` was added, which is how
the missing field was found. The right-column ads in the page's inline data were extracted
as well.

### 7. Tests

`node --test test/*.test.js`. Fixtures are synthetic and written to match the structure
found, so no captured traffic is committed. They cover: only the ad's own post contributes
keys; UI placeholders never become keys; newline-delimited, partial and `for (;;);`-prefixed
bodies; the right-column object; a video ad with no message; a joinable group post versus a
member's; text normalization.

## Limits

- A suggestion or ad whose entry has no text in the fields above produces no key and is not
  hidden by data. The label rules in `classify.js` may still catch it.
- Matching is on text. If Facebook changes punctuation between its data and its display, a
  key will not match.
- Politics is a keyword list: it will miss posts that do not use the words and hide posts
  that do (a comment quoting a word hides its post).
- The right-column card hiding is checked against captured data, not yet against the live
  column.
- Chrome was the browser used. Firefox is declared in the manifest and untested.
- The analysis scripts used to find the markers are not in this repository.

## Layout

- `classify.js` - rendered-text classifier
- `selectors.js` - ordered fallback selectors for feed posts
- `adscan.js` - extractor for ad and suggestion text from Facebook's feed data
- `hook_main.js` - page-world response reader
- `content.js` - observes the feed, applies the verdicts
- `hide.css` - `[data-fbf-hidden] { display: none !important }`
- `options.html`, `options.js` - settings in `chrome.storage.sync`
- `assets/logo.png`, `icons/` - logo and the extension icons
- `test/` - tests

Permissions: `storage` and two Facebook hosts. No `tabs`, `scripting` or `webRequest`.

## License

BSD 2-Clause. See `LICENSE`.
