# Shortcuts: refresh, load-new, pinned navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two shortcuts (`r`/`R` for hard reload; `.` to click the "Show N posts" pill) and change `j/k`/`Home`/`End` scroll behavior so the active post's **thread group top** always pins flush under the sticky header.

**Architecture:** Extend the existing key-bindings dispatcher with a `reload` action and a third `click` target (`newPostsPill`). Rewrite `navigator.ts:focusAndScroll` to unconditionally pin the thread-group-top article; `Home`/`End` additionally scroll to window top/bottom before pinning, to cope with X's DOM virtualization. Thread grouping is a visual-gap heuristic (≤16px between adjacent articles).

**Tech Stack:** TypeScript strict, Vite + CRX plugin for MV3 build, Vitest + jsdom for unit tests, Playwright for e2e.

---

## Spec

Design spec: `docs/superpowers/specs/2026-04-23-shortcuts-refresh-load-pin-design.md`.

## File structure

- **Modified:**
  - `src/shared/selectors.ts` — add `NEW_POSTS_PILL` selector list.
  - `src/shared/bindings.ts` — add `r` and `.` rows to the visible help table.
  - `src/content/key-bindings.ts` — add `reload` dep (optional, default `() => { scrollTo(0,0); location.reload(); }`); add `findNewPostsPill` helper; extend `ResolvedAction` with `{ kind: 'reload' }` and a third `click.target: 'newPostsPill'`; resolve `r`/`R` and `.` keys.
  - `src/content/navigator.ts` — add `THREAD_GAP_PX` constant and `findGroupTop` helper; rewrite `focusAndScroll` to unconditionally pin group top; rewrite `first`/`last` cases to `window.scrollTo` then RAF-pin the registry's first/last entry.
  - `src/content/index.ts` — pass `reload` when it's required (default stays in key-bindings; no change here unless the default isn't desired).
  - `tests/unit/key-bindings.test.ts` — new cases for `r`, `.`, n-not-bound.
  - `tests/unit/navigator.test.ts` — new cases for pinning, thread grouping, `first`/`last` virtualization.
- **Created:** none.

## Self-verification commands

- `npm run typecheck` — TypeScript must pass.
- `npm test` — vitest unit suite must pass (including new tests).
- `npm run build` — production build must succeed.
- Playwright (`npm run e2e`) — existing tests must still pass. No new e2e added (smoke items in spec are manual).

---

## Task 1: Add `NEW_POSTS_PILL` selector and visible bindings

**Files:**
- Modify: `src/shared/selectors.ts`
- Modify: `src/shared/bindings.ts`

- [ ] **Step 1: Add the selector**

Edit `src/shared/selectors.ts`. Insert a new property inside the `SELECTORS` object, immediately after `TRANSLATE`:

```ts
  NEW_POSTS_PILL: [
    '[data-testid="pillLabel"]',
    'button[aria-label*="post" i]',
  ],
```

The complete `SELECTORS` block becomes:

```ts
export const SELECTORS = {
  TWEET: ['article[data-testid="tweet"]', 'article[role="article"]'],
  FEED: ['[aria-label^="Timeline"]', '[data-testid="primaryColumn"]'],
  PERMALINK_IN_TWEET: [
    'a[href*="/status/"][role="link"]:has(time)',
    'a[href*="/status/"]',
  ],
  TABLIST: [
    '[data-testid="primaryColumn"] div[role="tablist"]',
    'div[role="tablist"]',
  ],
  TAB: ['[role="tab"]'],
  SHOW_MORE: [
    '[data-testid="tweet-text-show-more-link"]',
    '[data-testid="tweet-text-show-less-link"]',
    '[data-testid^="tweet-text-show-"]',
    '[data-testid*="show-more"]',
    '[data-testid*="show-less"]',
  ],
  TRANSLATE: [
    '[data-testid="tweet-text-show-translation-button"]',
    '[data-testid="translateTweet-button"]',
    '[data-testid^="tweet-text-show-translation"]',
    '[data-testid*="translate"]',
  ],
  NEW_POSTS_PILL: [
    '[data-testid="pillLabel"]',
    'button[aria-label*="post" i]',
  ],
} as const;
```

- [ ] **Step 2: Add help-overlay rows**

Edit `src/shared/bindings.ts`. Insert two new rows after the translate row:

```ts
export const BINDINGS: ReadonlyArray<readonly [string, string]> = [
  ['↓ / j', 'Next tweet'],
  ['↑ / k', 'Previous tweet'],
  ['→', 'Open thread'],
  ['← / Esc', 'Back'],
  ['Home / gg', 'First tweet'],
  ['End / G', 'Last tweet'],
  ['Space', 'Expand truncated post (Mostrar mais / Show more)'],
  ['Space', 'Page down (when focused post is not truncated)'],
  ['⇧Space', 'Page up'],
  ['t', 'Translate focused post'],
  ['r', 'Reload page'],
  ['.', 'Load new posts ("Mostrar N posts")'],
  ['1 / 2', 'For You / Following (Home)'],
  ['?', 'Toggle help'],
];
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/shared/selectors.ts src/shared/bindings.ts
git commit -m "feat(shared): add new-posts-pill selector and r/. help bindings"
```

---

## Task 2: `r` / `R` hard reload

**Files:**
- Modify: `src/content/key-bindings.ts`
- Modify: `src/content/index.ts`
- Test: `tests/unit/key-bindings.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/unit/key-bindings.test.ts`. Extend `makeDeps` to include a `reload` spy. Replace the existing `makeDeps` body with this version (the new `reload` field is additive):

```ts
function makeDeps() {
  const dispatch = vi.fn();
  const toggleHelp = vi.fn();
  const switchTab = vi.fn();
  const reload = vi.fn();
  let open = false;
  let active: HTMLElement | null = null;
  return {
    dispatch,
    toggleHelp,
    switchTab,
    reload,
    setHelpOpen: (v: boolean) => { open = v; },
    setActive: (el: HTMLElement | null) => { active = el; },
    bindings: {
      nav: { dispatch, activeArticle: () => active },
      toggleHelp,
      switchTab,
      helpOpen: () => open,
      reload,
    },
  };
}
```

Then add these test cases inside `describe('attachKeyBindings', …)`:

```ts
  it('r calls reload; R (shifted) also calls reload', () => {
    const d = makeDeps();
    detach = attachKeyBindings(d.bindings);
    fireKey({ key: 'r' });
    fireKey({ key: 'R', shiftKey: true });
    expect(d.reload).toHaveBeenCalledTimes(2);
    expect(d.dispatch).not.toHaveBeenCalled();
  });

  it('r is swallowed (preventDefault)', () => {
    const d = makeDeps();
    detach = attachKeyBindings(d.bindings);
    const e = fireKey({ key: 'r' });
    expect(e.defaultPrevented).toBe(true);
  });

  it('r is ignored when help overlay is open', () => {
    const d = makeDeps();
    d.setHelpOpen(true);
    detach = attachKeyBindings(d.bindings);
    fireKey({ key: 'r' });
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('r is ignored when focus is editable', () => {
    const d = makeDeps();
    detach = attachKeyBindings(d.bindings);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const e = new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true });
    input.dispatchEvent(e);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('r is ignored when a role=dialog is open', () => {
    const d = makeDeps();
    detach = attachKeyBindings(d.bindings);
    const dlg = document.createElement('div');
    dlg.setAttribute('role', 'dialog');
    document.body.appendChild(dlg);
    fireKey({ key: 'r' });
    expect(d.reload).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/unit/key-bindings.test.ts -t "r "`
Expected: FAIL — `reload` not a property on `KeyBindingsDeps`, or binding not yet routed.

- [ ] **Step 3: Extend `KeyBindingsDeps` and `ResolvedAction`**

Edit `src/content/key-bindings.ts`. Change the `KeyBindingsDeps` interface and the `ResolvedAction` type:

```ts
export interface KeyBindingsDeps {
  nav: Pick<Navigator, 'dispatch' | 'activeArticle'>;
  toggleHelp: () => void;
  helpOpen: () => boolean;
  switchTab: (index: number) => void;
  reload?: () => void;
}

type ResolvedAction =
  | { kind: 'nav'; cmd: Command }
  | { kind: 'help' }
  | { kind: 'tab'; index: number }
  | { kind: 'click'; target: 'showMore' | 'translate' | 'newPostsPill' }
  | { kind: 'reload' };
```

Inside `attachKeyBindings`, add a default for `reload` at the top of the function body (before `pendingG` is declared):

```ts
  const reload = deps.reload ?? (() => {
    window.scrollTo(0, 0);
    location.reload();
  });
```

- [ ] **Step 4: Route `r`/`R` in `resolve`**

Inside the `switch (e.key)` block in `resolve`, add a case **before** the `'?'` case:

```ts
      case 'r':
      case 'R':
        return { kind: 'reload' };
```

- [ ] **Step 5: Handle the action in `onKeyDown`**

In the `switch (action.kind)` inside `onKeyDown`, add a new branch (place it after the `'tab'` branch, before `'click'`):

```ts
      case 'reload':
        reload();
        break;
```

- [ ] **Step 6: Run tests to verify pass**

Run: `npx vitest run tests/unit/key-bindings.test.ts`
Expected: PASS — all existing cases plus the 5 new `r` cases.

- [ ] **Step 7: Commit**

```bash
git add src/content/key-bindings.ts tests/unit/key-bindings.test.ts
git commit -m "feat(content): r/R triggers hard reload with pre-scroll to top"
```

---

## Task 3: `.` clicks the "Show N posts" pill

**Files:**
- Modify: `src/content/key-bindings.ts`
- Test: `tests/unit/key-bindings.test.ts`

- [ ] **Step 1: Write failing tests**

Add inside `describe('attachKeyBindings', …)`:

```ts
  it('. clicks the new-posts pill when it exists (via data-testid)', () => {
    const d = makeDeps();
    const pill = document.createElement('button');
    const label = document.createElement('span');
    label.setAttribute('data-testid', 'pillLabel');
    label.textContent = 'Mostrar 70 posts';
    pill.appendChild(label);
    const click = vi.fn();
    pill.addEventListener('click', click);
    document.body.appendChild(pill);
    detach = attachKeyBindings(d.bindings);
    const e = fireKey({ key: '.' });
    expect(click).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('. falls back to text match when the data-testid is missing', () => {
    const d = makeDeps();
    const pill = document.createElement('button');
    pill.textContent = 'Show 42 posts';
    const click = vi.fn();
    pill.addEventListener('click', click);
    document.body.appendChild(pill);
    detach = attachKeyBindings(d.bindings);
    fireKey({ key: '.' });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('. passes through when no pill exists (no preventDefault, no click)', () => {
    const d = makeDeps();
    detach = attachKeyBindings(d.bindings);
    const e = fireKey({ key: '.' });
    expect(e.defaultPrevented).toBe(false);
    expect(d.dispatch).not.toHaveBeenCalled();
  });

  it('. is ignored when focus is editable (X native new-post shortcut n stays safe)', () => {
    const d = makeDeps();
    const pill = document.createElement('button');
    pill.setAttribute('data-testid', 'pillLabel');
    pill.textContent = 'Show 5 posts';
    const click = vi.fn();
    pill.addEventListener('click', click);
    document.body.appendChild(pill);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    detach = attachKeyBindings(d.bindings);
    const e = new KeyboardEvent('keydown', { key: '.', bubbles: true, cancelable: true });
    input.dispatchEvent(e);
    expect(click).not.toHaveBeenCalled();
  });

  it('n / N are NOT handled by the extension (X native compose-post preserved)', () => {
    const d = makeDeps();
    detach = attachKeyBindings(d.bindings);
    const e1 = fireKey({ key: 'n' });
    const e2 = fireKey({ key: 'N', shiftKey: true });
    expect(e1.defaultPrevented).toBe(false);
    expect(e2.defaultPrevented).toBe(false);
    expect(d.dispatch).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/unit/key-bindings.test.ts -t "pill|new-posts|compose-post"`
Expected: FAIL — `.` not routed; pill not clicked.

- [ ] **Step 3: Add `findNewPostsPill` helper**

Edit `src/content/key-bindings.ts`. Near the top, after the `TRANSLATE_TEXTS` constant, add:

```ts
const NEW_POSTS_PILL_RE = /^\s*(show|mostrar|ver)\s+\d+\s+(posts?|tweets?|postagens?)\b/i;

function findNewPostsPill(root: ParentNode = document): HTMLElement | null {
  const direct = queryFirst(SELECTORS.NEW_POSTS_PILL, root) as HTMLElement | null;
  if (direct) {
    const clickable = direct.closest('button, [role="button"]') as HTMLElement | null;
    return clickable ?? direct;
  }
  const nodes = root.querySelectorAll<HTMLElement>(
    'button, a, [role="button"], [role="link"]',
  );
  for (const node of nodes) {
    const text = node.textContent || node.getAttribute('aria-label') || '';
    if (NEW_POSTS_PILL_RE.test(text.trim())) return node;
  }
  return null;
}
```

- [ ] **Step 4: Route `.` in `resolve`**

Inside the `switch (e.key)` block in `resolve`, add a case before the `'?'` case (after the `r` case you added in Task 2):

```ts
      case '.': {
        if (findNewPostsPill(document)) {
          return { kind: 'click', target: 'newPostsPill' };
        }
        return null;
      }
```

- [ ] **Step 5: Handle `newPostsPill` in the `click` branch**

Find the `case 'click':` branch inside `onKeyDown`. Replace it with the pill-aware version:

```ts
      case 'click': {
        if (action.target === 'newPostsPill') {
          findNewPostsPill(document)?.click();
          break;
        }
        const article = deps.nav.activeArticle();
        if (!article) break;
        const btn =
          action.target === 'showMore'
            ? findShowMore(article)
            : findTranslate(article);
        btn?.click();
        break;
      }
```

- [ ] **Step 6: Run tests to verify pass**

Run: `npx vitest run tests/unit/key-bindings.test.ts`
Expected: PASS — all existing + 5 new cases.

- [ ] **Step 7: Commit**

```bash
git add src/content/key-bindings.ts tests/unit/key-bindings.test.ts
git commit -m "feat(content): . key clicks the Mostrar-N-posts pill (no conflict with X's n)"
```

---

## Task 4: Pin active post flush under header (no thread grouping yet)

**Files:**
- Modify: `src/content/navigator.ts`
- Test: `tests/unit/navigator.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/unit/navigator.test.ts`. First, add a helper near the existing `buildEntries` helper:

```ts
function mockRect(article: HTMLElement, top: number, height: number): void {
  article.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      left: 0,
      right: 800,
      width: 800,
      height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}
```

Then add these test cases inside `describe('createNavigator', …)`:

```ts
  it('dispatching next unconditionally scrolls active article to headerBottom + SCROLL_PAD', () => {
    const entries = buildEntries(['a', 'b', 'c']);
    // Large gaps — no thread grouping
    mockRect(entries[0].article, 500, 100);
    mockRect(entries[1].article, 700, 100);
    mockRect(entries[2].article, 900, 100);

    const scrollBy = vi.fn();
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy;

    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      openLink: vi.fn(),
      goBack: vi.fn(),
    });
    nav.dispatch('next'); // a → b
    // SCROLL_PAD = 8; headerBottom = 0 in jsdom; expected scroll = 700 - 8 = 692
    expect(scrollBy).toHaveBeenCalledWith({ top: 692, behavior: 'auto' });
    nav.stop();
  });
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/unit/navigator.test.ts -t "unconditionally scrolls"`
Expected: FAIL — current `focusAndScroll` only scrolls when out of viewport; scrollBy not called with that value.

- [ ] **Step 3: Rewrite `focusAndScroll`**

Edit `src/content/navigator.ts`. Replace the existing `focusAndScroll` function (the full block from `const focusAndScroll = () => {` through its closing `};`) with:

```ts
  const focusAndScroll = () => {
    if (!activeId) return;
    const entry = registry.findById(activeId);
    if (!entry) return;
    entry.article.focus({ preventScroll: true });
    const rect = entry.article.getBoundingClientRect();
    const targetTop = topObstructionHeight() + SCROLL_PAD;
    window.scrollBy({ top: rect.top - targetTop, behavior: 'auto' });
  };
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/unit/navigator.test.ts`
Expected: PASS — new case passes; existing cases still pass (they don't assert on scrollBy).

- [ ] **Step 5: Commit**

```bash
git add src/content/navigator.ts tests/unit/navigator.test.ts
git commit -m "feat(navigator): unconditionally pin active post under header on moveTo"
```

---

## Task 5: Thread-group pinning

**Files:**
- Modify: `src/content/navigator.ts`
- Test: `tests/unit/navigator.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/unit/navigator.test.ts`:

```ts
  it('within a thread group, navigating keeps scroll anchored at the group top', () => {
    const entries = buildEntries(['a', 'b', 'c']);
    // a, b, c are flush (gap = 5px ≤ THREAD_GAP_PX)
    mockRect(entries[0].article, 500, 100); // bottom = 600
    mockRect(entries[1].article, 605, 100); // gap 5
    mockRect(entries[2].article, 710, 100); // gap 5

    const scrollBy = vi.fn();
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy;

    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      openLink: vi.fn(),
      goBack: vi.fn(),
    });
    nav.dispatch('next'); // a → b; group top still 'a' (500)
    nav.dispatch('next'); // b → c; group top still 'a' (500)
    // Both moveTo calls scroll to the same target: 500 - 8 = 492
    expect(scrollBy).toHaveBeenNthCalledWith(1, { top: 492, behavior: 'auto' });
    expect(scrollBy).toHaveBeenNthCalledWith(2, { top: 492, behavior: 'auto' });
    nav.stop();
  });

  it('crossing out of a thread group re-pins to the new group top', () => {
    const entries = buildEntries(['a', 'b', 'c', 'd']);
    // a, b, c form one group; d is its own (large gap before)
    mockRect(entries[0].article, 500, 100);  // bottom 600
    mockRect(entries[1].article, 605, 100);  // gap 5 → grouped
    mockRect(entries[2].article, 710, 100);  // gap 5 → grouped, bottom 810
    mockRect(entries[3].article, 920, 100);  // gap 110 → separate

    const scrollBy = vi.fn();
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy;

    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      openLink: vi.fn(),
      goBack: vi.fn(),
    });
    nav.dispatch('next'); // a → b (pin @ 500)
    nav.dispatch('next'); // b → c (pin @ 500)
    nav.dispatch('next'); // c → d (pin @ 920)
    expect(scrollBy).toHaveBeenNthCalledWith(3, { top: 912, behavior: 'auto' });
    nav.stop();
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/unit/navigator.test.ts -t "thread group|re-pins"`
Expected: FAIL — without grouping, each `next` scrolls to the active article's own top.

- [ ] **Step 3: Add `THREAD_GAP_PX` constant and `findGroupTop` helper**

Edit `src/content/navigator.ts`. Above the existing `const ACTIVE_ATTR = 'data-xkbd-active';` line, add:

```ts
const THREAD_GAP_PX = 16;

function findGroupTop(entries: TweetEntry[], idx: number): TweetEntry {
  let i = idx;
  while (i > 0) {
    const prev = entries[i - 1].article.getBoundingClientRect();
    const cur = entries[i].article.getBoundingClientRect();
    if (cur.top - prev.bottom > THREAD_GAP_PX) break;
    i--;
  }
  return entries[i];
}
```

- [ ] **Step 4: Use `findGroupTop` in `focusAndScroll`**

Replace the `focusAndScroll` body you wrote in Task 4 with this group-aware version:

```ts
  const focusAndScroll = () => {
    if (!activeId) return;
    const entry = registry.findById(activeId);
    if (!entry) return;
    entry.article.focus({ preventScroll: true });
    const list = registry.current();
    const idx = list.findIndex((e) => e.id === activeId);
    if (idx < 0) return;
    const groupTop = findGroupTop(list, idx);
    const rect = groupTop.article.getBoundingClientRect();
    const targetTop = topObstructionHeight() + SCROLL_PAD;
    window.scrollBy({ top: rect.top - targetTop, behavior: 'auto' });
  };
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run tests/unit/navigator.test.ts`
Expected: PASS — both new cases plus the Task 4 pinning case plus all existing cases.

- [ ] **Step 6: Commit**

```bash
git add src/content/navigator.ts tests/unit/navigator.test.ts
git commit -m "feat(navigator): pin thread-group top instead of active article (16px gap heuristic)"
```

---

## Task 6: `first` / `last` scroll to window edges before pinning

**Files:**
- Modify: `src/content/navigator.ts`
- Test: `tests/unit/navigator.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/unit/navigator.test.ts`:

```ts
  it('first scrolls window to top and pins registry[0] after a frame', async () => {
    const entries = buildEntries(['a', 'b', 'c']);
    mockRect(entries[0].article, 0, 100);
    mockRect(entries[1].article, 200, 100);
    mockRect(entries[2].article, 400, 100);

    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;

    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      openLink: vi.fn(),
      goBack: vi.fn(),
    });
    nav.dispatch('next'); // active now 'b' (sanity)
    nav.dispatch('first');
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(entries[0].article.getAttribute('data-xkbd-active')).toBe('true');
    nav.stop();
  });

  it('last scrolls window to scrollHeight and pins last entry after a frame', async () => {
    const entries = buildEntries(['a', 'b', 'c']);
    mockRect(entries[0].article, 0, 100);
    mockRect(entries[1].article, 200, 100);
    mockRect(entries[2].article, 400, 100);

    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 9999,
    });
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;

    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      openLink: vi.fn(),
      goBack: vi.fn(),
    });
    nav.dispatch('last');
    expect(scrollTo).toHaveBeenCalledWith({ top: 9999, behavior: 'auto' });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(entries[2].article.getAttribute('data-xkbd-active')).toBe('true');
    nav.stop();
  });
```

Note: the existing test `'first/last go to boundaries'` still passes because `moveTo` still runs on the correct entry inside the RAF callback; it may just need a single RAF tick. If that test starts failing on the RAF boundary, wrap its assertions in an `await new Promise((r) => requestAnimationFrame(() => r(null)));` before checking.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/unit/navigator.test.ts -t "first scrolls window|last scrolls window"`
Expected: FAIL — current `first`/`last` call `moveTo` synchronously without `window.scrollTo`.

- [ ] **Step 3: Rewrite `first`/`last` dispatch branches**

Edit `src/content/navigator.ts`. Find the `case 'first':` and `case 'last':` branches in the `dispatch` method. Replace both with a single combined block:

```ts
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

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/navigator.test.ts`
Expected: PASS — both new cases plus the existing `'first/last go to boundaries'` case. If the legacy case fails on ordering, add the RAF await described in Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/content/navigator.ts tests/unit/navigator.test.ts
git commit -m "feat(navigator): first/last scroll to window edges then RAF-pin registry ends"
```

---

## Task 7: Full integration check

**Files:**
- Verify only (no edits expected).

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 2: Full unit test suite**

Run: `npm test`
Expected: all test files pass, including the newly added ones in `tests/unit/key-bindings.test.ts` and `tests/unit/navigator.test.ts`.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds, `dist/` populated. If it fails, inspect for a missed type or missing import.

- [ ] **Step 4: Playwright e2e**

Run: `npm run e2e`
Expected: existing e2e suite passes. If new bindings cause a regression (e.g., help overlay now lists two extra rows and a test asserts exact row count), update that test to reflect the new bindings.

- [ ] **Step 5: If everything passed, create a final commit only if there are uncommitted changes**

```bash
git status
```

If `git status` is clean, no commit needed — Tasks 1–6 each committed their own work. If files were modified (e.g., a Playwright snapshot), commit:

```bash
git add -u
git commit -m "chore: update e2e snapshots for new help bindings"
```

---

## Notes for the implementing engineer

- **jsdom caveat:** `document.elementFromPoint` exists in jsdom but typically returns `null`, which means `topObstructionHeight()` returns `0` in tests. That's why tests use `SCROLL_PAD (8)` as the target top. Real-browser behavior (sticky header present) is covered by the manual smoke items in the spec.
- **`getBoundingClientRect`:** jsdom returns all zeros by default. The `mockRect` helper is required whenever a test cares about scroll math.
- **RAF in vitest/jsdom:** `requestAnimationFrame` is available and queues microtask-like callbacks. The tests await `new Promise((r) => requestAnimationFrame(() => r(null)))` to flush one frame.
- **Don't add backwards-compat shims:** `reload` is a new optional dep with a runtime default. No need to update call sites of `attachKeyBindings` unless you want to inject a custom reload (we don't).
- **Thread gap threshold:** `THREAD_GAP_PX = 16` is a tuning constant. If manual smoke reveals misfires on X's current layout, bump or lower it and update `findGroupTop`'s tests accordingly. Don't add runtime configuration.
