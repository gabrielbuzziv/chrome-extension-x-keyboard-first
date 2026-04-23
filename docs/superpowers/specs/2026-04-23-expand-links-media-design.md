---
name: Expand, open-link mode, and media modal
description: Fix Space-to-expand on the active post; add `o`-prefixed numbered link mode; add an in-page media lightbox for images and video
type: design
---

# Expand, open-link mode, and media modal

**Date:** 2026-04-23
**Project:** x-keyboard-first

## 1. Purpose

Three gaps in the keyboard-first experience:

1. **Space does not expand truncated posts** on live X, despite being in the code and spec. The active-post Space → Show-more click path is not firing on real pages.
2. **No way to open a post's links / quoted tweet / card without the mouse.** The keyboard can reach a post but cannot reach anything *inside* it other than X's native action buttons.
3. **X's inline media is small.** Videos in particular play in a cramped inline box; watching anything requires clicking through to a separate page, which breaks the keyboard flow.

This design adds a bug-fix for (1), a Vimium-style numbered open-mode for (2), and a page-local media modal for (3). None of them navigate away from the current page.

## 2. Scope

**In scope:**

- Fix Space-on-truncated-post expansion, verified on live X.
- A new `o` prefix mode that paints numbered badges over the active post's openable targets, opens the chosen one on digit press, exits on Esc / any non-digit.
- Target categories for `o`-mode: body URLs (external links in tweet text), the link-preview card, the quoted tweet, images, video. Mentions and hashtags are **out of scope**.
- A new in-page media modal (shadow-DOM lightbox) that opens for image or video targets, supports carousel navigation across a multi-image post, and never changes the URL.
- An expand button overlaid on inline video players for mouse users.
- Help overlay + hint card list updated with the new bindings.

**Out of scope:**

- Opening mentions / hashtags via the numbered mode. Both remain mouse-clickable.
- Reordering or editing X's native action buttons.
- Saving / downloading media from the modal.
- Custom video controls. We reuse X's `<video>` element as-is.
- Persisting mode state across pages.

## 3. Architecture

Two new content-script modules, one modified binding path, two selector additions, one new shared binding entry set. No background script, no storage.

```
src/
├── content/
│   ├── index.ts                 # wire in link-mode + media-modal
│   ├── key-bindings.ts          # delegate to link-mode when active; add `o` entry
│   ├── link-mode.ts             # NEW — owns `o`-mode state, badge paint, target enumeration, activation
│   ├── media-modal.ts           # NEW — owns the lightbox shadow-DOM; carousel; reparent video; focus trap
│   ├── media-expand-button.ts   # NEW — injects an overlay "expand" button on video players in the active post
│   ├── navigator.ts             # unchanged
│   ├── tweet-registry.ts        # unchanged
│   ├── route-watcher.ts         # unchanged
│   ├── help-overlay.ts          # unchanged (picks up new BINDINGS entries automatically)
│   ├── hint-button.ts           # unchanged (same — auto-picks from BINDINGS)
│   └── tab-switcher.ts          # unchanged
├── shared/
│   ├── selectors.ts             # + MEDIA_* and OPENABLE_* entries
│   └── bindings.ts              # + `o` row; `expand media` row
```

**Module boundaries:**

- `link-mode` depends on `tweet-registry` (for the active article), `media-modal` (to open chosen media), and `selectors.ts`. Owns a small finite-state: `idle | active`.
- `media-modal` depends only on DOM + `selectors.ts`. Exposes `open(items, index)` / `close()` / `isOpen()`. Doesn't know about tweets or bindings.
- `media-expand-button` depends on `tweet-registry` (to know which article is active) and `media-modal`. Subscribes to the registry; paints/removes its overlay button as the active article changes.
- `key-bindings` gains one branch: if `linkMode.isActive()` is true, route the event to `linkMode.handleKey(e)` and return; otherwise the existing resolve path runs. `o` becomes a new entry in the existing resolve table.

No module has more than one inbound dependency from another (except `index.ts`, which wires everything).

## 4. Feature 1 — Fix Space on truncated post

### Current state

`key-bindings.ts:119-127`:

```ts
if (e.code === 'Space') {
  if (!e.shiftKey) {
    const article = deps.nav.activeArticle();
    if (article && findShowMore(article)) {
      return { kind: 'click', target: 'showMore' };
    }
  }
  return nav(e.shiftKey ? 'pageUp' : 'pageDown');
}
```

`findShowMore` uses `SELECTORS.SHOW_MORE` (`[data-testid="tweet-text-show-more-link"]` primary) and a multi-lingual text fallback. Both match the pinned post on `x.com/elastic_devs` when inspected directly. So the selector is correct — the live failure is elsewhere.

### Root-cause hypotheses (in order)

1. **Stale `dist/`.** The show-more handler lives in modified-but-uncommitted code. If the loaded unpacked extension was built before those changes, Space falls through to `pageDown`. **Resolution:** make `npm run build` a prerequisite in the spec's acceptance test; document reloading the unpacked extension in the manual smoke.
2. **Show-more inside a quoted tweet.** `findShowMore(article)` searches the whole `<article>`, including the nested quoted tweet. If X renames the outer tweet's show-more but still emits one inside a quoted sub-tweet, the click would expand the wrong element. **Resolution:** scope the query to the outer tweet-text node only (`[data-testid="tweetText"]` at the article root, not inside nested `article[data-testid="tweet"]`).
3. **Active article mismatch.** `ensureActive()` falls back to `nearestToViewport()` when `activeId` is null. If the pinned tweet is sticky-positioned and its bounding box is outside the center-of-viewport, we might target the wrong article. **Resolution:** in Space's handler, prefer the focused article (`document.activeElement.closest('article[data-testid="tweet"]')`) before falling back to `activeArticle()`.

### Changes

- `src/shared/selectors.ts`
  ```ts
  TWEET_TEXT: ['[data-testid="tweetText"]'],
  ```
- `src/content/key-bindings.ts` — rework `findShowMore`:
  ```ts
  function findShowMore(article: HTMLElement): HTMLElement | null {
    // Restrict to the outer tweet-text container so a show-more inside a
    // quoted sub-tweet does not hijack the press.
    const outerText = queryFirst(SELECTORS.TWEET_TEXT, article) as HTMLElement | null;
    const scope = outerText?.parentElement ?? article;
    return (
      (queryFirst(SELECTORS.SHOW_MORE, scope) as HTMLElement | null) ??
      findByText(scope, SHOW_MORE_TEXTS)
    );
  }
  ```
- `src/content/key-bindings.ts` — in the Space branch, prefer the focused article before the nav-tracked one:
  ```ts
  const focusedArticle =
    (document.activeElement as HTMLElement | null)
      ?.closest('article[data-testid="tweet"]') as HTMLElement | null;
  const article = focusedArticle ?? deps.nav.activeArticle();
  ```

### Acceptance test

Playwright, offline fixture (`tests/fixtures/x-timeline-truncated.html`): a timeline with one truncated tweet (contains a `[data-testid="tweet-text-show-more-link"]` node) followed by two normal tweets. Arrow-down to the truncated tweet, press Space, assert:

1. `window.scrollY` is unchanged (no page-down).
2. The `[data-testid="tweet-text-show-more-link"]` `click` event fired exactly once (fixture records it).
3. The active tweet (`[data-xkbd-active="true"]`) is still the truncated tweet.

Manual smoke adds: on `x.com/elastic_devs`, select the pinned tweet, press Space, confirm the content expands (the "Mostrar mais" / "Show more" button disappears and body grows).

## 5. Feature 2 — `o`-prefixed numbered link mode

### Interaction

1. User has an active tweet. Presses `o`.
2. `link-mode` enumerates openable targets inside the active article, paints a small badge with digits `1..N` over each. Badge container is a shadow-DOM host appended to `document.body`, positioned absolutely to avoid disturbing X's layout.
3. User presses `1`..`9` → the matching target is opened (see activation rules below) and link-mode exits.
4. Any of: `Esc`, a non-digit key, loss of focus of the active tweet, a registry rebuild that drops the active article, a route change → link-mode exits silently, badges removed.

### Target enumeration

Inside the active `<article>`, in DOM order:

| Priority | Selector | Type |
|---|---|---|
| 1 | `a[href^="https://t.co/"]` inside `[data-testid="tweetText"]`, scoped to the outer tweet text (not nested sub-tweets) | `bodyUrl` |
| 2 | `[data-testid="card.wrapper"]` or `[data-testid^="card.layout"]` | `cardLink` |
| 3 | Nested `article[data-testid="tweet"]` (quoted tweet) | `quotedTweet` |
| 4 | `[data-testid="tweetPhoto"]` (each `<img>` inside, one badge per image) | `image` |
| 5 | `[data-testid="videoPlayer"]` or `[data-testid="videoComponent"]` | `video` |

First five selectors are stored in `SELECTORS.OPENABLES` as primary + fallback arrays; resolution happens once on `enter()`. Duplicates across categories (e.g., card wraps a t.co link) are de-duplicated by closest-shared-ancestor check.

Cap at 9 targets. A tenth-plus target gets no badge — extremely rare (worst observed case is a 4-image post + 1 quoted tweet + 3 body URLs = 8).

### Activation rules

- `bodyUrl`: read the `<a>`'s `href` (the short `t.co` URL is fine — X resolves it). Open in a new tab via `window.open(href, '_blank', 'noopener,noreferrer')`. Stay on current page.
- `cardLink`: same as `bodyUrl` using the card's primary anchor.
- `quotedTweet`: find the permalink anchor inside the quoted article (reuse `SELECTORS.PERMALINK_IN_TWEET`); navigate in the current tab via our existing `openLink` → same behavior as `→`.
- `image`: call `mediaModal.open(items, index)` where `items` is every image (and video, if present) in the active tweet; `index` is the zero-based index of the chosen image.
- `video`: same as `image` but index is the video's position in the items array.

### Badge rendering

- One shadow-DOM host appended to `document.body` on `enter()`, removed on exit.
- For each target, a `<span class="badge" data-digit="N">N</span>` positioned via `position:absolute; top: rect.top + window.scrollY; left: rect.left + window.scrollX`, anchored to the target's bounding box.
- On scroll or resize while active, reposition on `requestAnimationFrame`. One RAF per event loop.
- Styling: matte dark pill with a bright accent, matches the existing hint button:
  ```css
  .badge {
    background: linear-gradient(180deg,#1f2832,#131a22);
    color: #d6dde4; font: 700 12px ui-monospace, Menlo, monospace;
    padding: 2px 6px; border-radius: 4px;
    box-shadow: 0 0 0 1px rgba(29,155,240,0.45), 0 4px 10px -4px rgba(0,0,0,0.7);
    pointer-events: none;
  }
  ```

### Key handling while active

`link-mode` does not install its own `window` listener. Instead `key-bindings.ts` checks `linkMode.isActive()` at the top of `onKeyDown` and delegates the whole event:

```ts
if (linkMode.isActive()) {
  e.preventDefault();
  e.stopImmediatePropagation();
  linkMode.handleKey(e);
  return;
}
```

`linkMode.handleKey`:

- digit `1`..`9` → activate target `n-1` if it exists, then `exit()`.
- `Escape` → `exit()`.
- Any other printable key / arrow / modifier-only → `exit()` without re-dispatching (simpler than synthetic redispatch; user learns that `o` is a committed mode).

### Exits that aren't keys

- `route-watcher` mode change → `exit()`.
- `tweet-registry` rebuild where the active article id no longer resolves → `exit()`.

### Files touched

- `src/shared/selectors.ts` — add `OPENABLES`, `TWEET_TEXT`.
- `src/shared/bindings.ts` — new row `['o', 'Open link (1..9 chooses target)']`.
- `src/content/link-mode.ts` — new module. Exposes:
  ```ts
  export interface LinkMode {
    isActive(): boolean;
    enter(): boolean;     // returns false if no active article / no targets
    exit(): void;
    handleKey(e: KeyboardEvent): void;
    stop(): void;
  }
  export interface LinkModeDeps {
    nav: Pick<Navigator, 'activeArticle'>;
    registry: Pick<Registry, 'subscribe'>;
    router: Pick<RouteWatcher, 'subscribe'>;
    mediaModal: Pick<MediaModal, 'open'>;
    openLink?: (a: HTMLAnchorElement) => void;
  }
  export function createLinkMode(deps: LinkModeDeps): LinkMode;
  ```
- `src/content/key-bindings.ts` — delegate branch at top of `onKeyDown`; new `o` case in `resolve` that returns `{ kind: 'linkMode' }`; switch adds `linkMode.enter()`.
- `src/content/index.ts` — instantiate `mediaModal` first, then `linkMode` with a handle to it; pass `linkMode` into `attachKeyBindings`.

### Tests

`tests/unit/link-mode.test.ts` (Vitest + jsdom):

- Enumerates targets in expected order for a fixture article with 2 body URLs + a quoted tweet + 3 images.
- `enter()` returns `false` when no active article.
- `enter()` returns `false` when article has zero targets (e.g., plain-text tweet).
- `handleKey('1')` invokes activation for first target and exits; `handleKey('Escape')` exits; `handleKey('x')` exits.
- `handleKey('5')` with only 3 targets exits without calling activation.
- Registry rebuild that drops the active article triggers exit.

`tests/unit/key-bindings.test.ts` additions:

- `o` with an active article calls `linkMode.enter()` (via injected mock).
- While `linkMode.isActive()` is true, pressing `j` does NOT dispatch nav('next') and IS forwarded to `linkMode.handleKey`.

## 6. Feature 3 — media modal

### Public API

```ts
export type MediaItem =
  | { kind: 'image'; src: string; alt?: string }
  | { kind: 'video'; el: HTMLVideoElement };

export interface MediaModal {
  open(items: MediaItem[], index: number): void;
  close(): void;
  isOpen(): boolean;
  stop(): void;
}

export function createMediaModal(): MediaModal;
```

### Layout & styling

Shadow-DOM host appended to `document.body` on `open()`, removed on `stop()` (not on `close()` — we hide-and-reuse to preserve video state cheaply; but because we reparent the source `<video>`, on close we must always put the element back, so the host itself persisting is fine).

Structure:

```
<host-div>
  #shadow
    <div class="backdrop">
      <div class="stage">
        <img class="img" />   OR   <slot for reparented video>
        <button class="prev">‹</button>
        <button class="next">›</button>
        <button class="close">×</button>
        <div class="counter">3 / 5</div>
        <div class="thumbs">
          <button class="thumb" data-i="0"></button>
          …
        </div>
      </div>
    </div>
```

- Backdrop: `position: fixed; inset: 0; background: rgba(0,0,0,0.92); z-index: 2147483647`.
- Stage: flex-centered. Inner media fits within `90vw × 90vh` preserving aspect via `object-fit: contain`.
- Thumbs: horizontal row of small rectangles; current thumb has a blue ring. Only rendered when `items.length > 1`.
- Close button top-right. Prev/next at vertical center; hidden when only one item.

### Image specifics

For each image target, call `src` with the full-res variant:

```ts
const src = thumbUrl.replace(/&name=\w+/, '&name=large');
```

If no `name=` param, append `&name=large`. Fall back to original `src` on error.

### Video specifics

Reparenting is preferred over cloning because X's player attaches event listeners we can't reproduce and progressive / HLS streams are expensive to restart.

```ts
interface ReparentedVideo {
  el: HTMLVideoElement;
  originalParent: Node;
  originalNextSibling: Node | null;
}
```

On open:
1. Record `originalParent = video.parentNode` and `originalNextSibling = video.nextSibling`.
2. Append `video` into the modal's stage.
3. Leave `currentTime`, `muted`, and `paused` state untouched — playback continues or remains paused as before.

On close (or switching to another item in the carousel while this is the current one):
1. If the video is currently playing, pause only if we're closing the modal entirely. When switching within the carousel, always pause.
2. Re-insert `video` into `originalParent` before `originalNextSibling` (or appendChild if sibling is null).

If for any reason reparenting fails (element was removed from DOM mid-flight), fall back to a fresh `<video src={…}>` using the `<source>` URLs we captured on open. Best-effort.

### Keyboard while open

Capture-phase listener installed only while `isOpen()` is true. Consumes:

- `Escape` → `close()`.
- `ArrowLeft` → `index = max(0, index - 1)`, re-render.
- `ArrowRight` → `index = min(items.length - 1, index + 1)`, re-render.
- `1`..`9` → jump to that item if in range.
- All other keys → swallowed (don't leak to page). This prevents our `j`/`k` from firing tweet nav while viewing media.

### Outside click

A click whose `composedPath()` does not include the modal stage closes. The × button has the same effect.

### Scroll lock & focus trap

On open: save `document.body.style.overflow`, set to `hidden`. On close: restore.
On open: focus the close button. On Tab/Shift+Tab within the shadow root, cycle between close, prev, next, thumbs. Simpler: install a keydown handler that, on Tab, resets focus to the close button (focus trap by redirection — avoids maintaining a focusable-elements list).

### Never navigate

The modal is entirely in-page. No `location.assign`, no anchor clicks. Closing returns focus to the tweet that opened it (stored on `open()` as `returnFocus: HTMLElement`).

### Expand button on inline videos (mouse path)

New module `media-expand-button.ts`:

- Subscribes to `registry`. When the active tweet changes, it:
  - Removes any previously-rendered expand buttons.
  - Queries `SELECTORS.VIDEO` inside the newly active article. For each video player, appends a small shadow-hosted button absolutely positioned to the top-right of the player's bounding rect (not inside the player — injected as a sibling overlay).
- The button's `onclick` calls `mediaModal.open(items, index)` just like the keyboard path.
- Button styling: small pill, same palette as the hint button, a single expand glyph (e.g. `⤢`).

We don't paint expand buttons for images. Images already open on click in X's own lightbox, which our modal deliberately replaces for keyboard users; mouse users can keep clicking through to X's lightbox or use `o`-mode.

### Files touched

- `src/shared/selectors.ts` — add `VIDEO`, `IMAGE` (beyond the `OPENABLES` entries), `CARD`, `QUOTED_TWEET`, `BODY_URL`.
- `src/shared/bindings.ts` — add `['o → 1..9', 'Open link / media in active post']`. (No separate binding for the expand button — it's a mouse path.)
- `src/content/media-modal.ts` — new module per API above.
- `src/content/media-expand-button.ts` — new module.
- `src/content/index.ts` — wire modal + expand-button modules, pass modal into `linkMode`.

### Tests

`tests/unit/media-modal.test.ts` (Vitest + jsdom):

- `open` with one image item creates the host and renders the `<img>` with the `name=large` URL.
- `open` with a video item reparents the `<video>` into the stage and returns it on `close`.
- `Esc` closes; `←`/`→` change the index and re-render; `1`..`N` jump.
- Outside-click closes; inside-click does not.
- Scroll lock applied on open, restored on close.

`tests/unit/media-expand-button.test.ts`:

- When active article changes to one with a video, a button is rendered near it.
- Clicking the button calls the injected `mediaModal.open` with the correct item list and index.
- When the active article changes away, the button is removed.

Playwright fixture `tests/fixtures/x-timeline-media.html`:

- Timeline with a 3-image tweet and a video tweet.
- `j` to select the image tweet, `o`, `1` — modal opens at index 0; `→` advances; `Esc` closes.
- `j` to select the video tweet, `o`, `1` — modal opens with the `<video>` reparented; `Esc` closes and the video is back in place.

## 7. Interaction matrix (existing + new)

| Key | When | Action |
|---|---|---|
| `Space` | active post has Show-more | Click Show-more (bug-fixed) |
| `Space` | active post no Show-more | Page down + resnap (unchanged) |
| `o` | active post exists, has ≥1 target | Enter link-mode |
| `1`..`9` | link-mode active | Open target `n` + exit |
| `1`/`2` | no link-mode, on timeline | For You / Following (unchanged) |
| `Esc` | link-mode active | Exit link-mode (do not fire `back`) |
| `Esc` | media-modal open | Close modal (do not fire `back`) |
| `Esc` | neither | `history.back()` (unchanged) |
| `←` / `→` | media-modal open | Prev / next item |
| `←` / `→` | no modal, no link-mode | Navigator back / enter (unchanged) |

Priority order in `key-bindings.onKeyDown`:

1. If `mediaModal.isOpen()` → delegate to modal's own handler.
2. Else if `linkMode.isActive()` → delegate to link-mode.
3. Else the existing `resolve()` path.

This keeps the conditional simple: modal > link-mode > normal nav.

## 8. Edge cases

1. **Pinned post vs active pin.** `SELECTORS.TWEET` already matches pinned articles. The tweet-text-scoping fix in Feature 1 covers the "Mostrar mais" inside a quoted sub-tweet.
2. **Virtualization during link-mode.** If the active article unmounts while the badge overlay is visible (e.g., user scrolled the wheel), `registry` emits a change. `link-mode` subscribes and calls `exit()` when the active article is gone — no orphan badges.
3. **Virtualization during modal-open.** The original video element could be re-virtualized off-screen while reparented into the modal. On close, if `originalParent` is detached from the document, skip re-insertion; X will re-render on scroll-back.
4. **Full-res image URL variant unsupported.** If replacing `&name=` yields a 404, the `<img>` `onerror` fallback reverts to the original thumbnail URL.
5. **Multiple videos in one post.** Currently rare but possible. Carousel handles them identically to images.
6. **Link-mode while modal is open.** Not possible — guard in `linkMode.enter()` that no-ops if `mediaModal.isOpen()`.
7. **Help overlay open.** Link-mode entry and media-modal opening both require `!helpOverlay.isOpen()`. Existing guard in `resolve()` covers `o`; `mediaModal.open` callers (only link-mode for now) inherit it.
8. **Tab-switcher conflict.** Plain `1` / `2` stay bound to tab-switch when no link-mode is active. Priority rule in §7 resolves collisions cleanly.

## 9. Risks

- **X changes card / quoted-tweet / media testids.** Mitigated by primary-plus-fallback in `SELECTORS`, identical strategy to the existing selectors.
- **Reparenting video breaks X's in-article layout.** On close we put it back before its `nextSibling`, which restores the original DOM position. If X is listening for `DOMNodeRemoved` on the video, the listener fires on reparent — acceptable, these events are deprecated and X's React tree is re-rendered on route change anyway.
- **Full-res image URL assumption.** The `&name=large` trick is a well-known X CDN pattern but is not documented API. Fallback to thumbnail URL on error keeps the modal usable.
- **Badge mispositioning during CSS zoom / retina.** Bounding-rect math already handles DPR. If a target is inside a `transform: scale` region, badges may drift; none of X's current layouts use such transforms.

## 10. Out of scope / future work

- Mentions / hashtags in link-mode.
- Downloading media from the modal.
- Pinch-zoom or pan inside the modal.
- Keyboard-operable carousel for X's native lightbox (we replace it entirely with ours for keyboard invocations; mouse clicks on images still go through X).
- Multi-letter hint labels when a post has more than 9 targets.
