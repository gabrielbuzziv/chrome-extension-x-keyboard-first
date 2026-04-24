# Manual smoke checklist

Run before every release.

**Setup:** `npm run build`, load `dist/` unpacked, sign in to X.

## Home timeline
- [ ] Press `↓`: a tweet gets a visible orange ring.
- [ ] `↓` / `↑`: ring moves between adjacent tweets.
- [ ] `j` / `k`: same as above.
- [ ] `gg`: jumps to first loaded tweet.
- [ ] `G`: jumps to last loaded tweet.
- [ ] `Space` / `Shift+Space`: page down / up, ring snaps to nearest tweet.
- [ ] `→`: opens the highlighted tweet's thread.

## Thread page
- [ ] Ring appears on nearest tweet after first keypress.
- [ ] `↓` / `↑`: moves between replies.
- [ ] `→`: opens the highlighted reply as its own thread.
- [ ] `←` / `Esc`: returns to the previous page.
- [ ] On return to the timeline, the previously active tweet is re-highlighted.

## Action keys (X natives)
- [ ] `l`: likes the actively-highlighted tweet.
- [ ] `r`: opens the reply composer targeting the active tweet.
- [ ] `t`: opens retweet menu for the active tweet.
- [ ] `b`: bookmarks the active tweet.
- [ ] `n`: opens the compose dialog.

## Input guards
- [ ] With the reply composer open: pressing `j` types `j` into the textarea and does not move the ring.
- [ ] Image lightbox open: `↓` does nothing to the ring.

## Help overlay
- [ ] `?`: opens the overlay.
- [ ] `?` / `Esc` / outside click: closes it.
- [ ] While overlay is open, nav keys are disabled.

## General health
- [ ] No DevTools console errors after five minutes of browsing.
- [ ] Scrolling a feed with the mouse does not auto-highlight anything.

## Other feeds
- [ ] Profile (`/<user>`): same nav works.
- [ ] Search (`/search?q=...`): same nav works.
- [ ] Bookmarks (`/i/bookmarks`): same nav works.
- [ ] Lists (`/<user>/lists/...`): same nav works.

## Expand / open-link / media modal

- [ ] **Space expands a truncated post.** Load `x.com/elastic_devs`, arrow-down to the pinned post (`Mostrar mais` visible), press `Space`. The button vanishes and the body grows. Page scroll position does not change.
- [ ] **Space still pages down on a plain post.** Arrow-down to a post without `Mostrar mais`, press `Space`. Page scrolls ~90 % vh and the active tweet re-snaps.
- [ ] **`o` enters link mode; badges appear on the active post.** Only the active post gets badges. `Esc` clears them. Pressing any non-digit also clears them.
- [ ] **`o → 1` opens a body URL in a new tab.** Extension tab stays on X.
- [ ] **`o → N` opens a quoted tweet in the current tab** (same behaviour as `→`).
- [ ] **`o → N` on an image opens the media modal** at the chosen image. `←` / `→` cycle, `Esc` closes.
- [ ] **Video expand button** on an inline player opens the modal. Close with `Esc`. The video resumes from the same position in its original slot.
- [ ] **Help overlay** now lists `o → 1..9 — Open link / media in active post`.
- [ ] **No key conflicts:** `1` / `2` still switch For You / Following on Home when link mode is inactive.
- [ ] **No console errors** after five minutes of use.
