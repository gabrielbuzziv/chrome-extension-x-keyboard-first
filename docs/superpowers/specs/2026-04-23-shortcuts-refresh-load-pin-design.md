---
name: Shortcuts — refresh, load-new, pinned navigation
description: Add R (reload), . (load new posts pill), and make every navigation pin the active post flush under the sticky header
type: design
---

# Shortcuts: refresh, load-new, and pinned navigation

## Goal

Extend the keyboard-first UX with two new shortcuts and change navigation scroll behavior so the active post is always pinned just below the sticky header.

## New / changed shortcuts

| Key | Behavior |
|---|---|
| `r` / `R` | `window.scrollTo(0, 0)` then `location.reload()`. The pre-scroll guards against browsers that restore the previous scroll position across a reload. |
| `.` | Click the "Show N posts" / "Mostrar N posts" pill if visible. No-op otherwise (silent). |
| `Home` / `gg` | Scroll window to `y = 0`, then on the next frame pin the first entry in the registry. Ensures the true first post is shown even after deep scrolling (X virtualizes the DOM). |
| `End` / `G` | Scroll window to `y = document.documentElement.scrollHeight`, then on the next frame pin the last entry in the registry. |
| `j` / `↓` / `k` / `↑` | Unchanged routing, but now always pins the active post flush under the header (see below). |
| `Space` / `⇧Space` | Unchanged (page down/up + nearest-to-viewport pick) — inherits pinning because it calls `moveTo`. |

All other bindings unchanged.

## Pinned navigation

### Current behavior

`navigator.ts:focusAndScroll()` computes `topObstructionHeight()` (the sticky header) and only scrolls when the active article is outside the viewport. During normal `j`/`k` the active post drifts down the screen.

### New behavior

On every `moveTo`, scroll the window unconditionally so the active article's top edge sits at `headerBottom + SCROLL_PAD`. The next post peeks below, giving continuous context.

```ts
// src/content/navigator.ts
const focusAndScroll = () => {
  if (!activeId) return;
  const entry = registry.findById(activeId);
  if (!entry) return;
  entry.article.focus({ preventScroll: true });
  const rect = entry.article.getBoundingClientRect();
  const headerBottom = topObstructionHeight();
  const targetTop = headerBottom + SCROLL_PAD;
  window.scrollBy({ top: rect.top - targetTop, behavior: 'auto' });
};
```

### `first` / `last` with virtualization

X virtualizes the timeline, so `registry.current()[0]` is the topmost *currently-rendered* article, not necessarily the real first post. To make `Home` actually return to the top of the timeline after deep scrolling:

```ts
// src/content/navigator.ts — dispatch
case 'first':
case 'last': {
  const toBottom = cmd === 'last';
  window.scrollTo({
    top: toBottom ? document.documentElement.scrollHeight : 0,
    behavior: 'auto',
  });
  requestAnimationFrame(() => {
    const list = registry.current();
    if (list.length === 0) return;
    moveTo((toBottom ? list[list.length - 1] : list[0]).id);
  });
  break;
}
```

One RAF is the common case — X re-renders via MutationObserver and the registry rebuild is already RAF-scheduled. If smoke testing reveals stale pins, bump to two RAFs. No timeout fallback needed: if the registry is empty we no-op.

## "Show N posts" pill detection

When new tweets arrive, X renders a clickable pill at the top of the feed with text like "Show 70 posts" / "Mostrar 70 posts".

### Selector strategy

Add to `src/shared/selectors.ts`:

```ts
NEW_POSTS_PILL: [
  '[data-testid="pillLabel"]',
  'button[aria-label*="post"]',
],
```

### Text fallback

If the selector misses, scan visible `button`, `a`, `[role="button"]`, `[role="link"]` elements at document level (the pill is outside any article) and match their normalized text against `/^\s*(show|mostrar|ver)\s+\d+\s+(posts?|tweets?|postagens?)\b/i`. Climb from the matched element to the nearest clickable (`button` or `[role="button"]`) and `.click()` it.

If nothing matches, no-op (silent). We do not surface errors — the key is harmless when no pill exists.

## `r` / `R` — reload

```ts
window.scrollTo(0, 0);
location.reload();
```

The pre-scroll is harmless when the browser already resets scroll and guarantees the "scroll to top" part of the user requirement regardless of `history.scrollRestoration`.

## Files touched

- `src/shared/bindings.ts` — add `['r', 'Refresh page']` and `['.', 'Load new posts']` rows.
- `src/shared/selectors.ts` — add `NEW_POSTS_PILL`.
- `src/content/key-bindings.ts`
  - `resolve()` — handle `r`/`R` (new `ResolvedAction` variant `{ kind: 'reload' }`) and `.` (new `ResolvedAction` variant `{ kind: 'click'; target: 'newPostsPill' }`). Preserve X's native `n`/`N` for new-post composer by not binding them.
  - Add `findNewPostsPill(root: ParentNode): HTMLElement | null` helper with selector + text fallback.
  - `KeyBindingsDeps` — add `reload: () => void` for testability (default to `location.reload`).
  - `onKeyDown` switch — add `reload` branch; extend existing `click` branch to support `newPostsPill`.
- `src/content/navigator.ts`
  - Replace `focusAndScroll` body per above.
  - Replace `first`/`last` branches per above.
- `src/content/index.ts` — pass `reload: () => location.reload()` into `attachKeyBindings`.

## Tests

### `tests/unit/key-bindings.test.ts`

- `r` and `R` call the injected `reload` dep exactly once and do not dispatch nav.
- `.` when a pill exists clicks it; when no pill exists does nothing.
- `.` pill detection covers both the `data-testid="pillLabel"` selector and the Portuguese text fallback (`"Mostrar 70 posts"`).
- `r` / `.` respect the existing guards: editable targets, open modals, and help overlay open → no-op.
- Pressing `n` / `N` is **not** handled by the extension (X's native new-post shortcut must still work).

### `tests/unit/navigator.test.ts`

- After `dispatch('next')` / `dispatch('prev')`, active article's `getBoundingClientRect().top` equals `headerBottom + SCROLL_PAD` (allowing ±1px).
- `dispatch('first')` with a mocked `window.scrollTo`: verify `scrollTo({ top: 0 })` is called, and after RAF the first entry becomes active.
- `dispatch('last')` analogous for `document.documentElement.scrollHeight` and last entry.
- Existing restore-from-thread and subscribe behavior unchanged.

### Manual smoke

- Reload on `R` while scrolled mid-feed; confirm browser reloads and scroll resets.
- Scroll ~100 posts; press `Home`; confirm page fully jumps to top and the real first tweet is pinned under the tab bar.
- `j`/`k` through 20 posts; confirm each selected post lands flush under the tabs with the next post peeking below.
- Wait for "Mostrar N posts" pill to appear (or trigger by leaving the tab and coming back); press `.`; confirm it clicks.
- Press `n` on a timeline; confirm X's native compose-post dialog still opens.
- `End`/`G` jumps to bottom of loaded feed.

## Out of scope

- Soft refresh (clicking active timeline tab) — user chose hard reload.
- Auto-scroll animations / smooth scroll — we use `behavior: 'auto'` for snappy feel.
- Surfacing a visual error when `.` has no pill target — silent no-op is fine.
