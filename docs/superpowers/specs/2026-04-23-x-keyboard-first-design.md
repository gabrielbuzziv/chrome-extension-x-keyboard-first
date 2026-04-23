# x-keyboard-first — Design

**Date:** 2026-04-23
**Project:** Chrome extension that makes X (twitter.com / x.com) keyboard-first.

## 1. Purpose

X is navigable with the mouse by default. X ships a hidden native shortcut set (`?` to view), but it lacks a visible indicator of which tweet is "focused" and has gaps around the "open-a-tweet-and-browse-its-replies" flow that power users want. This extension:

- Always shows which tweet is active via a clear highlight.
- Maps arrow keys (plus Vim `j`/`k`) to navigate between tweets in any feed.
- Opens the highlighted tweet's thread with `→`, returns with `←`.
- Navigates replies inside a thread with the same keys.
- Keeps X's native action shortcuts (`l`, `r`, `t`, `b`, `n`) working by focusing the active article so they target it.

## 2. Scope

**In scope (v1):**

- Home timeline, profile pages, search results, bookmarks, lists, and tweet detail pages — anywhere X renders a feed of `article[data-testid="tweet"]`.
- Keyboard navigation between tweets within a feed.
- Opening a highlighted tweet's permalink (`→`) and returning (`←`).
- Recursion: on a thread page, `→` opens the highlighted reply as its own thread.
- `?` help overlay listing every binding.

**Out of scope (v1):**

- Keyboard nav within the left nav rail, search autocomplete, compose modal, DMs, image lightbox, settings pages. Events inside those pass through untouched.
- Custom reply/retweet/like flows — we delegate to X's native `l`/`r`/`t`/`b`.
- Cross-tab state, sync, or options page.
- Firefox / Safari / Edge.

## 3. Architecture

Manifest V3 Chrome extension. TypeScript, bundled with Vite using `@crxjs/vite-plugin`. Single content script — no background service worker, no network, no storage.

```
x-keyboard-first/
├── manifest.json
├── src/
│   ├── content/
│   │   ├── index.ts            # entry; wires modules; lifecycle
│   │   ├── tweet-registry.ts   # discover + track visible article[data-testid="tweet"]
│   │   ├── navigator.ts        # active-tweet state; move/enter/back commands
│   │   ├── key-bindings.ts     # key → command map; capture-phase listener
│   │   ├── route-watcher.ts    # patch pushState; detect timeline vs thread
│   │   └── help-overlay.ts     # "?" shadow-DOM overlay
│   ├── styles/
│   │   └── highlight.css       # ring + glow for [data-xkbd-active="true"]
│   └── shared/
│       └── selectors.ts        # single source of truth for X DOM selectors
├── public/icons/…
├── tests/
│   ├── unit/                   # Vitest + jsdom
│   └── fixtures/               # offline HTML mirroring X's DOM for Playwright
├── package.json, tsconfig.json, vite.config.ts
```

**Module boundaries and dependencies:**

- `tweet-registry` depends only on `selectors.ts` and the DOM. Knows nothing about keys or state.
- `navigator` depends on `tweet-registry`. Owns active-tweet state. Emits commands — doesn't read keys.
- `key-bindings` depends on `navigator` and `help-overlay`. Owns the listener. Doesn't touch the DOM directly.
- `route-watcher` emits `mode` changes; `navigator` subscribes and retargets.
- `index.ts` wires them together and injects `highlight.css`.

No module has more than one inbound dependency from another. Any one file can be opened and understood without reading the others.

## 4. Key bindings

All bindings fire only when focus is **not** inside `input`, `textarea`, or `[contenteditable="true"]`, and when no `[role="dialog"]` is open. Bound keys are captured in capture phase; `stopImmediatePropagation()` is called so X's native handler doesn't double-fire. Unbound keys pass through untouched.

| Key | Owner | Behavior |
|---|---|---|
| `↓` / `j` | extension | Next tweet. `.focus({preventScroll:true})` the article, then `scrollIntoView({block:'nearest'})`. |
| `↑` / `k` | extension | Previous tweet. |
| `→` | extension | Open active tweet's permalink via `location.assign`. Remembers `activeId` as `lastTimelineActiveId`. |
| `←` / `Esc` | extension | `history.back()`. On return, `route-watcher` triggers restore. |
| `Home` / `gg` | extension | First tweet in current feed. `gg` is a two-key sequence with a 600 ms timeout — if the second `g` doesn't land in time, the first `g` is discarded. |
| `End` / `G` | extension | Last tweet loaded. |
| `Space` | extension | Scroll one viewport down; re-snap active to nearest tweet. |
| `Shift+Space` | extension | Scroll one viewport up; re-snap. |
| `?` | extension | Toggle help overlay. |
| `l` / `r` / `t` / `b` | X native | Pass through. Because the extension has `.focus()`-ed the active article, X's handler acts on it. |
| `n` | X native | Compose new tweet. |

**Rationale for letting X own the action keys:** X already ships these shortcuts and they work against the natively-focused element. By calling `.focus()` on our active article, we make our state and X's focus state coherent, so no extra code is needed. This keeps our surface small and removes a source of double-bind bugs.

## 5. State model

Three pieces of in-memory state, scoped to the content script lifetime.

```ts
// navigator.ts
interface NavState {
  mode: 'timeline' | 'thread';      // derived from URL path
  activeId: string | null;          // tweet's /status/<id>, stable across re-renders
  lastTimelineActiveId: string | null;
}

// tweet-registry.ts — rebuilt on MutationObserver ticks
interface TweetEntry {
  id: string;           // parsed from a[href*="/status/"]
  article: HTMLElement; // current DOM node (swaps during virtualization)
  top: number;          // cached getBoundingClientRect().top
}
```

**Why ID, not index or element reference:** X virtualizes the feed. The `<article>` for tweet `X` is destroyed on scroll-past and re-created on scroll-back. Index is unstable because new tweets insert at the top. ID (from the permalink `href`) is stable; the registry re-resolves `activeId → article` on every rebuild and re-applies `data-xkbd-active`.

## 6. Data flow

```
window keydown (capture)
  → key-bindings: table lookup
      ├─ if not in our table → return (X or browser handles)
      └─ if in our table:
           stopImmediatePropagation()
           navigator.dispatch(command)
              → registry.getOrdered() returns live [TweetEntry...]
              → computes newActiveId
              → DOM writes: remove data-xkbd-active from old article,
                            set on new
              → newArticle.focus({preventScroll:true})
              → newArticle.scrollIntoView({block:'nearest'})
              → if command === 'enter':
                   lastTimelineActiveId = activeId
                   location.assign(permalink)
              → if command === 'back':
                   history.back()
```

**Route changes** are observed by `route-watcher`, which patches `history.pushState`/`replaceState` and listens for `popstate`. It emits `mode: 'timeline' | 'thread'`. When returning to `timeline`, `navigator` restores `activeId = lastTimelineActiveId` once a registry rebuild contains that id; otherwise falls back to the first visible tweet.

## 7. Highlight style

Style B from the visual comparison: blue outline ring + soft glow, matching X's own focus-ring aesthetic.

```css
/* src/styles/highlight.css */
article[data-xkbd-active="true"] {
  border-radius: 12px;
  box-shadow:
    inset 0 0 0 1px rgb(29, 155, 240),
    0 0 0 3px rgba(29, 155, 240, 0.18);
  transition: box-shadow 0.12s ease;
}
```

CSS is injected via the content script (content_scripts `css` field) so it applies before the first paint.

## 8. Behaviors & edge cases

1. **Input guard.** Handlers no-op when `document.activeElement` matches `input, textarea, [contenteditable="true"]`.
2. **Modal guard.** Handlers no-op when `document.querySelector('[role="dialog"]')` exists. This covers the reply composer, image lightbox, settings sheet.
3. **Lazy first activation.** No highlight on page load. The first nav keypress activates the tweet nearest the viewport center (by `getBoundingClientRect`). Avoids stealing focus from mouse users.
4. **Virtualization.** Registry subscribes to a `MutationObserver` on the feed container. On each `requestAnimationFrame`, it re-collects tweets, re-resolves `activeId → article`, and re-applies `data-xkbd-active`. If the active tweet is currently unmounted, the visual highlight disappears but `activeId` is preserved; the next nav keypress finds nearest-by-id or falls back to nearest-to-viewport.
5. **Selector resilience.** All X selectors live in `shared/selectors.ts` with primary + fallback entries:
   ```ts
   export const SELECTORS = {
     TWEET: ['article[data-testid="tweet"]', 'article[role="article"]'],
     FEED: ['[aria-label^="Timeline"]', '[data-testid="primaryColumn"]'],
     PERMALINK_IN_TWEET: [
       'a[href*="/status/"][role="link"]:has(time)',
       'a[href*="/status/"]',
     ],
   };
   ```
   Lookup tries primary, falls back if empty. If both miss, log once to console and no-op.
6. **Route URL shapes:**
   - `/home`, `/explore`, `/notifications`, `/i/bookmarks`, `/search`, `/<user>`, `/<user>/with_replies`, `/<user>/lists/...` → `mode: 'timeline'`.
   - `/<user>/status/<id>` (any trailing path) → `mode: 'thread'`.
7. **Help overlay.** Rendered into a `<div>` hosting a shadow root, appended to `document.body`. X's styles cannot leak in. Lists every binding. Closes on `?`, `Esc`, or outside click.
8. **Performance.** Registry rebuild is O(n), n ≈ 20-40 tweets present in DOM at a time. Observer callbacks debounced to one rebuild per animation frame. No per-article listeners.

## 9. Testing plan

**Unit tests (Vitest + jsdom).** Fast feedback on pure modules.

- `tweet-registry`: synthetic DOM with N articles returns ordered entries; id parsing handles `/status/<id>`, `/status/<id>/photo/1`, `/status/<id>/analytics`; rebuild after DOM mutation.
- `navigator`: state transitions for next/prev/enter/back; unmount-then-remount restoration; first/last boundary.
- `key-bindings`: keydown fixtures map to expected commands; input/textarea/contenteditable focus causes no-op; modal presence causes nav no-op; `Shift+Space` distinct from `Space`.
- `route-watcher`: `pushState` change fires callback; thread URL shapes classified correctly; `popstate` handling.

**Integration tests (Playwright).** Offline fixtures, not live X.

- `tests/fixtures/x-timeline.html` and `x-thread.html` replicate X's DOM shape (articles with the testids we target).
- Load the built extension into Playwright's persistent context, visit the fixture, drive the keyboard.
- Assertions: `data-xkbd-active` moves correctly; highlight CSS paints; `→` navigates to permalink (fixture stubs the URL change); `←` restores previous active tweet; simulated virtualization (removing/adding articles) preserves state.

**Manual smoke test (`TESTING.md`).** Run before each release against live X.

- Each of: home timeline, profile, search, bookmarks, thread page — nav works.
- Reply modal opens via `r`, typing inside does not move active tweet.
- `l` (native) likes the active tweet.
- Help overlay opens and closes.
- No console errors during five minutes of use.

We skip live-X E2E: auth is fragile, X's DOM changes without warning, tests flake. Fixtures + manual smoke captures the bulk of the value.

## 10. Risks

- **X renames `data-testid` values.** Mitigated by selector fallbacks. Low probability — testids are used by X's own QA and rarely change.
- **X's native action shortcuts stop firing when we `.focus()` an article.** If this ever breaks, we would fall back to binding our own uppercase action keys (`L`/`R`/`T`/`B`) dispatching clicks on the testid buttons. We designed for this but are not shipping it in v1.
- **CSS conflict.** Minimal — we paint only on `[data-xkbd-active="true"]`, a custom attribute X does not use.

## 11. Out-of-scope / future work

- Command palette (`Cmd+K`).
- Per-feed "mute this thread" / "mark all read" shortcuts.
- Configurable keybindings via an options page.
- Firefox / Safari ports (MV3 differences are small but non-zero).
