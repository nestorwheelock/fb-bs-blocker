<p align="center"><img src="assets/logo.png" alt="Facebook Bullshit Blocker" width="280"></p>

# fb-bs-blocker

A browser extension that hides posts in the facebook.com feed that are ads, suggestions
(posts with a Follow button, groups you have not joined, Reels), or match a political
keyword list. Manifest V3; Chrome and Firefox. BSD 2-Clause.

Ads and suggestions are identified from Facebook's own feed data, not from the label on the
page, so a relabelled or scrambled "Sponsored" does not get past it. Responses are read in
the browser and nothing leaves it. Not affiliated with or endorsed by Meta.

## Install

`chrome://extensions`, turn on Developer mode, Load unpacked, choose this directory. After any
change, reload the extension and then reload the Facebook tab. Options page: toggle each
category, add keywords to hide, add keywords that exempt a post.

The page console (DevTools, Console) prints two kinds of line, both beginning `[fbf]`:

- one summary line when the counts change: version, feed posts found, ad keys, right-column
  keys, suggestion keys, posts hidden, and whether your name was found
- one line per hide: the reason, what matched, and the first lines of the post

The second is how to find out why a post is missing.

## Blocks

Besides the automatic filters, you can block things by hand. Two kinds:

- **source**: the exact name an author, page or group post opens with
- **text**: a phrase (8 characters or more) the post contains

On Facebook, point at a post: a Block button floats at its top right. Its menu offers "Block this
post" (stores the post's first line of its own words) and "Block this source" (stores the
author or page name). The post is hidden at once. Each block also stores the post's shape: its
first lines, its author, the page path, its size, and a hash of its element structure (tags and
nesting, no class names), so you can see later why it matched.

The options page (the toolbar button opens it) lists every block: add one, search, switch it on
or off, edit its kind, value or note, see its stored shape under Details, delete it. Matching is
case- and spacing-insensitive. A block applies to every post, your own included.

**Where it is kept.** Blocks live in IndexedDB under the extension's own origin (database
`fbf-blocks`), shared by the background worker and the options page. Content scripts cannot reach
that database, so after every change the worker copies `{id, kind, value, enabled}` into
`chrome.storage.local` under `fbf-rules`, which the page script reads. Nothing leaves the browser.

**Export.** "Export .sqlite" builds a real SQLite database file in the browser with the vendored
sqlite-wasm (`vendor/sqlite-wasm/`, Apache-2.0, see its `NOTICE.md`) and saves it. "Export .sql"
saves the same data as SQL text for `sqlite3 blocks.sqlite < blocks.sql`. The table:
`blocks(id, kind, value, note, enabled, created_at, updated_at, page, shape_json)`.

## Status

Version 0.5.0. Developed against captured Facebook traffic and tested offline
(`node --test test/*.test.js`). Behavior in a live browser is reported by the person using it,
and Facebook changes its markup and data without notice. Expect to adjust `selectors.js` and
`adscan.js`. What has and has not been seen on the live page is listed under Limits.

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
| non-null `sponsored_data` | right-column ad object, beside a nested `rhc_ad` | ad |
| `viewer_forum_join_state: "CAN_JOIN"` | inside a feed story | post from a group the viewer has not joined |
| `follow_location: "IFR_POST_IN_NEWS_FEED"` | story action links, with `subscribe_status: "CAN_SUBSCRIBE"` | post whose header shows a Follow button |
| `comment_composer_placeholder: "Comment as <name>"` | every post | the viewer's own name |

`th_dat_spo` was non-null on 11 of 11 ads and 0 of 19 organic posts in one capture, and it
holds when `tracking` is missing, so both are checked. In a later capture the Follow marker
was on 19 of 108 feed posts and on none of the ads or group posts among them.

**Post boundary.** A feed post is the `node` under `news_feed.edges[]`, or a streamed
`data.node`. The text of an ad is read from that one post only, never from neighbouring
bytes. An early version took a window of text around the marker and would have swept in the
post beside it.

**Which text.** Matching needs text the page also displays. Reading every string in a post
produced keys such as "Comment as <viewer>", CSS class lists, and a group's privacy blurb.
All of those appear on organic posts, so keying on them would hide the whole feed. The
extractor reads only named fields: `message.text`, `title_with_entities.text`,
`description.text`, `title`, `description`, `link_title`, `link_description`. For group and
Follow suggestions only `message.text`, because a group's description is shared by every post
from that group. One video ad had no message text and was missed until `link_title` and
`link_description` were added.

**Right-column cards.** A card displays only a title and a domain; its description is in the
data but never drawn. The fields sit in a nested `rhc_ad` next to `sponsored_data`. The key is
the title and the domain together, and a card must show both. A title alone could be a word
("Claude") that appears elsewhere.

### 5. Deliver it in the page

- `hook_main.js` runs in the page's own world at `document_start` and wraps `fetch` and
  `XMLHttpRequest` for GraphQL requests. It reads each response from a clone, so the page's
  copy is untouched, runs the extractor, and posts the keys to the content script.
- The first screen of the feed is not fetched; it is embedded in the page as JSON. The
  content script scans those inline `application/json` scripts with the same extractor.
- A key is the first 40 characters of an ad's or suggestion's text, lowercased with
  whitespace collapsed. A feed post whose visible text contains a key is hidden. Keys that
  arrive after the post is drawn cause every post to be checked again.
- Right-column ads: the link card whose text matches a title and domain is hidden, then the
  "Sponsored" heading above it.
- The viewer's own posts are exempt from the politics rule. Their name is found in the first
  eight lines of a post after the decoy "Facebook" lines are dropped.

Why two worlds: wrapping `fetch` has to happen in the page's world, and reaching extension
storage has to happen in the isolated one.

### 6. Problems found by running it, and what each was

Each of these came from the console on the live page, not from reading the code.

- **"Extension context invalidated".** Reloading the extension leaves the old script running
  in the open tab with no connection to it. The script now stops itself when its extension
  context is gone.
- **Posts flickering on and off.** A hidden element is not rendered, so its `innerText` has no
  line breaks. The label rules read whole lines, so on the next check a hidden "Follow" or
  "Ad" post no longer matched, was shown, and was hidden again. The check now lifts the hide
  attribute, reads the text as rendered, and restores it in the same task, so nothing is
  painted in between. Separately, Facebook empties posts that scroll out of view and refills
  them; a post with under 40 characters of text is left as it is instead of being un-hidden.
  The delay before hiding is one animation frame, and the page-wide scans run at most once a
  second.
- **The author's own post hidden as politics.** The post about this extension said "political".
  An exemption for the viewer's own posts looked at the first eight lines, but those eight are
  decoys, so the name was never found. The decoys are now dropped first. Each hide is also
  logged with its reason now, which is how this was found.
- **A right-column card not hidden.** The only ad key from the data was a description that is
  never displayed, and the displayed titles were shorter than the 20-character minimum for
  keys. Keying on title and domain fixed the design; the first version of that code and its
  test both put the fields on the wrong object, and it was running the extractor against the
  real response that showed it. Test fixtures should be copied from the real shape.

### 7. Validation

Run against captured responses with the real extractor, counting by feed post:

| capture | feed posts | ads | ads keyed | join posts | join keyed | Follow posts | Follow keyed | organic keyed |
|---|---|---|---|---|---|---|---|---|
| first | 30 | 11 | 10, then 11 after adding link fields | | | | | 0 of 19 |
| second | 50 | 5 | 5 | 8 | 8 | | | 0 |
| third | 108 | 25 | 25 | 9 | 9 | 19 | 19 | 0 |

In the first capture, 10 of the 11 ads were keyed before `link_title` was added, which is how
the missing field was found. From the third capture the extractor produced six right-column
keys, and the text of one card from a screenshot matched its key.

### 8. Tests

`node --test test/*.test.js`. Fixtures are synthetic and written to match the structure
found, so no captured traffic is committed. They cover: only the ad's own post contributes
keys; UI placeholders never become keys; newline-delimited, partial and `for (;;);`-prefixed
bodies; the right-column card; a video ad with no message; a joinable group post versus a
member's; the Follow marker; the viewer's name, including the longer of two forms; finding the
viewer past the decoy lines; text normalization.

## Limits

- A suggestion or ad whose entry has no text in the fields above produces no key and is not
  hidden by data. The label rules in `classify.js` may still catch it.
- Matching is on text. If Facebook changes punctuation between its data and its display, a
  key will not match.
- Any post whose header shows a Follow button is hidden under suggestions, including a post
  from a page you meant to look at.
- Politics is a keyword list: it will miss posts that do not use the words and hide posts
  that do (a comment quoting a word hides its post). Your own posts are exempt from it, and
  from nothing else.
- Seen working on the live page: ads hidden from feed data, a Reels row and a group "Join"
  row hidden by label, one hide logged per post, the viewer's name found. Not yet confirmed on
  the live page after the last changes: the right-column cards, and your own post reappearing.
- Chrome was the browser used. Firefox is declared in the manifest and untested.
- The analysis scripts used to find the markers are not in this repository.

## Layout

- `classify.js` - rendered-text classifier, and the own-post check
- `selectors.js` - ordered fallback selectors for feed posts
- `adscan.js` - extractor for ad, suggestion, right-column and viewer data from Facebook's feed
  data
- `hook_main.js` - page-world response reader
- `content.js` - observes the feed, applies the verdicts
- `hide.css` - `[data-fbf-hidden] { display: none !important }`
- `rules.js` - block rules: validation, matching, the shape recorded for a post
- `store.js` - the block list in IndexedDB, and publishing it for the page script
- `background.js` - service worker: receives "block this" from the page, opens the options page
- `blockui.js` - the floating Block button over a post
- `export.js` - the block list as SQL; `vendor/sqlite-wasm/` turns it into a `.sqlite` file
- `options.html`, `options.js` - settings in `chrome.storage.sync`, and the blocks manager
- `assets/logo.png`, `icons/` - logo and the extension icons
- `test/` - tests

Permissions: `storage` and two Facebook hosts. The extension pages' content security policy adds
`wasm-unsafe-eval`, which sqlite-wasm needs. No `tabs`, `scripting` or `webRequest`.

## License

BSD 2-Clause. See `LICENSE`.
