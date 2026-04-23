# Expand, Open-Link Mode, and Media Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Space-to-expand on truncated posts, add an `o`-prefixed numbered link mode that opens the active post's body URLs / card / quoted tweet / images / video (1..9), and add an in-page media modal with carousel that closes on Esc and preserves video playback via reparenting.

**Architecture:** Three content-script additions. Two new stateful modules (`link-mode`, `media-modal`) each own a `handleKey(e)` entry point and are driven by the existing `key-bindings.ts` via a priority gate: `mediaModal.isOpen() > linkMode.isActive() > normal resolve`. A third small module injects an expand button next to inline `<video>` elements in the active tweet. All modules are shadow-DOM-isolated; no navigation ever leaves the current page.

**Tech Stack:** TypeScript (strict), Vite + `@crxjs/vite-plugin` (MV3 build), Vitest + jsdom (unit), Playwright with persistent chromium context (e2e). No runtime dependencies beyond DOM.

---

## Scope check

The spec lists three features but they share one mental model (active post, in-page, no navigation) and they wire through one binding gate. This is a single plan — do not decompose further.

## File structure

Creates:
- `src/content/media-modal.ts` — shadow-DOM lightbox. Public surface: `open(items, index) / close() / isOpen() / handleKey(e) / stop()`.
- `src/content/link-mode.ts` — numbered-badge "open mode". Public surface: `enter() / exit() / isActive() / handleKey(e) / stop()`.
- `src/content/media-expand-button.ts` — overlay expand button on inline video players in the active tweet.
- `tests/unit/media-modal.test.ts`
- `tests/unit/link-mode.test.ts`
- `tests/unit/media-expand-button.test.ts`
- `tests/fixtures/x-timeline-truncated.html`
- `tests/fixtures/x-timeline-media.html`

Modifies:
- `src/shared/selectors.ts` — add `TWEET_TEXT`, `QUOTED_TWEET`, `CARD`, `IMAGE`, `VIDEO`, `BODY_URL`.
- `src/shared/bindings.ts` — add `['o → 1..9', 'Open link / media in active post']`.
- `src/content/key-bindings.ts` — scope `findShowMore` to the outer tweet-text; prefer focused article in Space branch; add priority gate and `o` entry.
- `src/content/index.ts` — wire the three new modules.
- `tests/unit/key-bindings.test.ts` — tests for the scoping fix, focus-preference, and `o` gate.
- `tests/e2e/navigation.spec.ts` — add a truncated-post fixture route and a media fixture route.
- `TESTING.md` — new manual smoke steps.

---

## Phase 1 — Feature 1 fixes (Space on truncated post)

### Task 1: Scope `findShowMore` to the outer tweet-text

**Files:**
- Modify: `src/shared/selectors.ts:1-26`
- Modify: `src/content/key-bindings.ts:92-97`
- Modify: `tests/unit/key-bindings.test.ts` (add one test above the translate tests)

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/key-bindings.test.ts` (after the existing aria-label test, before the translate tests):

```ts
it('Space does NOT click show-more inside a nested quoted tweet', () => {
  const d = makeDeps();
  const article = document.createElement('article');
  article.setAttribute('data-testid', 'tweet');

  // Outer tweet text is plain (no show-more).
  const outerText = document.createElement('div');
  outerText.setAttribute('data-testid', 'tweetText');
  outerText.textContent = 'outer post body';
  article.appendChild(outerText);

  // Nested quoted tweet has a show-more button.
  const quoted = document.createElement('article');
  quoted.setAttribute('data-testid', 'tweet');
  const innerText = document.createElement('div');
  innerText.setAttribute('data-testid', 'tweetText');
  quoted.appendChild(innerText);
  const innerBtn = document.createElement('button');
  innerBtn.setAttribute('data-testid', 'tweet-text-show-more-link');
  const click = vi.fn();
  innerBtn.addEventListener('click', click);
  quoted.appendChild(innerBtn);
  article.appendChild(quoted);

  document.body.appendChild(article);
  d.setActive(article);
  detach = attachKeyBindings(d.bindings);

  fireKey({ key: ' ', code: 'Space' });
  expect(click).not.toHaveBeenCalled();
  expect(d.dispatch).toHaveBeenCalledWith('pageDown');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/unit/key-bindings.test.ts -t "nested quoted"
```

Expected: FAIL — current `findShowMore` walks the whole article and finds the inner button.

- [ ] **Step 3: Add `TWEET_TEXT` to selectors**

Edit `src/shared/selectors.ts` — add one entry to the `SELECTORS` object:

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
  TWEET_TEXT: ['[data-testid="tweetText"]'],
  SHOW_MORE: [
    '[data-testid="tweet-text-show-more-link"]',
    '[data-testid="tweet-text-show-less-link"]',
    '[data-testid^="tweet-text-show-"]',
    '[data-testid*="show-more"]',
    '[data-testid*="show-less"]',
  ],
  // …rest unchanged
} as const;
```

- [ ] **Step 4: Scope `findShowMore` to the outer tweet-text**

Replace `findShowMore` in `src/content/key-bindings.ts`:

```ts
function findShowMore(article: HTMLElement): HTMLElement | null {
  // Restrict the search to the outer tweet's text area so a show-more inside
  // a quoted sub-tweet does not hijack the Space press.
  const outerText = queryFirst(SELECTORS.TWEET_TEXT, article) as HTMLElement | null;
  const scope: HTMLElement = outerText?.parentElement ?? article;
  const direct = queryFirst(SELECTORS.SHOW_MORE, scope) as HTMLElement | null;
  if (direct && !isInsideNestedTweet(direct, article)) return direct;
  const byText = findByText(scope, SHOW_MORE_TEXTS);
  if (byText && !isInsideNestedTweet(byText, article)) return byText;
  return null;
}

function isInsideNestedTweet(el: HTMLElement, article: HTMLElement): boolean {
  const nested = el.closest('article[data-testid="tweet"]');
  return nested != null && nested !== article;
}
```

- [ ] **Step 5: Run the test to verify it passes and nothing regressed**

```bash
npx vitest run tests/unit/key-bindings.test.ts
```

Expected: PASS (new test), all prior show-more tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/selectors.ts src/content/key-bindings.ts tests/unit/key-bindings.test.ts
git commit -m "fix(show-more): scope Space-expand to the outer tweet text"
```

---

### Task 2: Prefer focused article in the Space branch

**Files:**
- Modify: `src/content/key-bindings.ts:144-152`
- Modify: `tests/unit/key-bindings.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/key-bindings.test.ts`:

```ts
it('Space clicks show-more on the focused article even when nav.activeArticle returns a different one', () => {
  const d = makeDeps();

  // nav.activeArticle returns a different, non-truncated article.
  const navActive = document.createElement('article');
  navActive.setAttribute('data-testid', 'tweet');
  document.body.appendChild(navActive);
  d.setActive(navActive);

  // A second article has the show-more and is actually focused.
  const focused = document.createElement('article');
  focused.setAttribute('data-testid', 'tweet');
  focused.tabIndex = 0;
  const btn = document.createElement('button');
  btn.setAttribute('data-testid', 'tweet-text-show-more-link');
  const click = vi.fn();
  btn.addEventListener('click', click);
  focused.appendChild(btn);
  document.body.appendChild(focused);
  focused.focus();

  detach = attachKeyBindings(d.bindings);
  fireKey({ key: ' ', code: 'Space' });

  expect(click).toHaveBeenCalledTimes(1);
  expect(d.dispatch).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/unit/key-bindings.test.ts -t "focused article"
```

Expected: FAIL — current code only consults `deps.nav.activeArticle()` which returns the other article without show-more.

- [ ] **Step 3: Prefer the focused article in the Space branch**

Replace the Space branch in the `resolve` function of `src/content/key-bindings.ts`:

```ts
if (e.code === 'Space') {
  if (!e.shiftKey) {
    const focusedArticle =
      (document.activeElement as HTMLElement | null)?.closest(
        'article[data-testid="tweet"]',
      ) as HTMLElement | null;
    const article = focusedArticle ?? deps.nav.activeArticle();
    if (article && findShowMore(article)) {
      return { kind: 'click', target: 'showMore' };
    }
  }
  return nav(e.shiftKey ? 'pageUp' : 'pageDown');
}
```

Also update the `click` branch in `onKeyDown` so the `showMore` click uses the same preference:

```ts
case 'click': {
  if (action.target === 'newPostsPill') {
    findNewPostsPill(document)?.click();
    break;
  }
  const focusedArticle =
    (document.activeElement as HTMLElement | null)?.closest(
      'article[data-testid="tweet"]',
    ) as HTMLElement | null;
  const article = focusedArticle ?? deps.nav.activeArticle();
  if (!article) break;
  const btn =
    action.target === 'showMore'
      ? findShowMore(article)
      : findTranslate(article);
  btn?.click();
  break;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/key-bindings.test.ts
```

Expected: PASS, all prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/content/key-bindings.ts tests/unit/key-bindings.test.ts
git commit -m "fix(show-more): prefer focused article over nav.activeArticle for Space"
```

---

## Phase 2 — Shared selectors for new features

### Task 3: Add OPENABLE / media selectors

**Files:**
- Modify: `src/shared/selectors.ts`
- Modify: `tests/unit/selectors.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/selectors.test.ts`:

```ts
describe('new openable/media selectors', () => {
  it('SELECTORS exports QUOTED_TWEET, CARD, IMAGE, VIDEO, BODY_URL arrays', () => {
    expect(Array.isArray(SELECTORS.QUOTED_TWEET)).toBe(true);
    expect(Array.isArray(SELECTORS.CARD)).toBe(true);
    expect(Array.isArray(SELECTORS.IMAGE)).toBe(true);
    expect(Array.isArray(SELECTORS.VIDEO)).toBe(true);
    expect(Array.isArray(SELECTORS.BODY_URL)).toBe(true);
  });

  it('IMAGE matches a tweetPhoto img', () => {
    document.body.innerHTML = `
      <article>
        <div data-testid="tweetPhoto"><img src="https://x/img?name=small"></div>
      </article>`;
    const el = queryFirst(SELECTORS.IMAGE, document.body);
    expect(el?.tagName).toBe('IMG');
  });

  it('VIDEO matches videoPlayer', () => {
    document.body.innerHTML = `
      <article><div data-testid="videoPlayer"><video></video></div></article>`;
    const el = queryFirst(SELECTORS.VIDEO, document.body);
    expect(el).not.toBeNull();
  });

  it('BODY_URL matches t.co link inside tweetText', () => {
    document.body.innerHTML = `
      <article>
        <div data-testid="tweetText">
          hi <a role="link" href="https://t.co/abc">link</a>
        </div>
      </article>`;
    const el = queryFirst(SELECTORS.BODY_URL, document.body);
    expect((el as HTMLAnchorElement)?.href).toContain('t.co');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/unit/selectors.test.ts -t "openable"
```

Expected: FAIL — selectors not yet defined.

- [ ] **Step 3: Add selectors**

Edit `src/shared/selectors.ts` — extend the `SELECTORS` object:

```ts
export const SELECTORS = {
  // …existing entries…
  TWEET_TEXT: ['[data-testid="tweetText"]'],
  QUOTED_TWEET: [
    'div[aria-labelledby] article[data-testid="tweet"]',
    'article[data-testid="tweet"] article[data-testid="tweet"]',
    'article[data-testid="tweet"] [role="link"][tabindex="0"]:has(time)',
  ],
  CARD: [
    '[data-testid="card.wrapper"]',
    '[data-testid^="card.layout"]',
  ],
  IMAGE: [
    '[data-testid="tweetPhoto"] img',
    'a[href*="/photo/"] img',
  ],
  VIDEO: [
    '[data-testid="videoPlayer"] video',
    '[data-testid="videoComponent"] video',
    'video',
  ],
  BODY_URL: [
    '[data-testid="tweetText"] a[role="link"][href^="https://t.co/"]',
    '[data-testid="tweetText"] a[href^="http"]',
  ],
} as const;
```

(Keep `TWEET_TEXT` added in Task 1 — don't duplicate.)

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/selectors.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/selectors.ts tests/unit/selectors.test.ts
git commit -m "feat(selectors): add QUOTED_TWEET, CARD, IMAGE, VIDEO, BODY_URL"
```

---

## Phase 3 — Media modal

### Task 4: `media-modal` — module skeleton

**Files:**
- Create: `src/content/media-modal.ts`
- Create: `tests/unit/media-modal.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-modal.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { createMediaModal } from '../../src/content/media-modal';

describe('createMediaModal', () => {
  let modal: ReturnType<typeof createMediaModal> | null = null;

  afterEach(() => {
    modal?.stop();
    modal = null;
    document.body.innerHTML = '';
  });

  it('isOpen is false initially and host is not in the DOM', () => {
    modal = createMediaModal();
    expect(modal.isOpen()).toBe(false);
    expect(document.querySelector('[data-xkbd-media]')).toBeNull();
  });

  it('open() mounts a shadow-host and sets isOpen to true; close() tears it down', () => {
    modal = createMediaModal();
    modal.open([{ kind: 'image', src: 'https://example.com/a?name=small' }], 0);
    expect(modal.isOpen()).toBe(true);
    expect(document.querySelector('[data-xkbd-media]')).not.toBeNull();
    modal.close();
    expect(modal.isOpen()).toBe(false);
    expect(document.querySelector('[data-xkbd-media]')).toBeNull();
  });

  it('open() with empty items is a no-op', () => {
    modal = createMediaModal();
    modal.open([], 0);
    expect(modal.isOpen()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/unit/media-modal.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the skeleton module**

Create `src/content/media-modal.ts`:

```ts
export type MediaItem =
  | { kind: 'image'; src: string; alt?: string }
  | { kind: 'video'; el: HTMLVideoElement };

export interface MediaModal {
  open(items: MediaItem[], index: number): void;
  close(): void;
  isOpen(): boolean;
  handleKey(e: KeyboardEvent): void;
  stop(): void;
}

export function createMediaModal(): MediaModal {
  let host: HTMLDivElement | null = null;
  let shadow: ShadowRoot | null = null;
  let items: MediaItem[] = [];
  let index = 0;

  const mount = () => {
    host = document.createElement('div');
    host.dataset.xkbdMedia = '';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.92);
          z-index: 2147483647;
          display: flex; align-items: center; justify-content: center;
          font-family: -apple-system, system-ui, "Segoe UI", sans-serif;
        }
        .stage { position: relative; width: 90vw; height: 90vh;
                 display: flex; align-items: center; justify-content: center; }
        .stage img, .stage video {
          max-width: 100%; max-height: 100%; object-fit: contain;
          border-radius: 8px; background: #000;
        }
      </style>
      <div class="backdrop"><div class="stage"></div></div>
    `;
    document.body.appendChild(host);
  };

  const unmount = () => {
    host?.remove();
    host = null;
    shadow = null;
  };

  const render = () => {
    // Real rendering lands in later tasks; skeleton only mounts and unmounts.
  };

  return {
    open(nextItems, nextIndex) {
      if (nextItems.length === 0) return;
      items = nextItems;
      index = Math.max(0, Math.min(nextIndex, items.length - 1));
      if (!host) mount();
      render();
    },
    close() {
      if (!host) return;
      items = [];
      index = 0;
      unmount();
    },
    isOpen() {
      return host !== null;
    },
    handleKey(_e: KeyboardEvent) {
      // Fleshed out in a later task.
    },
    stop() {
      unmount();
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/media-modal.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/media-modal.ts tests/unit/media-modal.test.ts
git commit -m "feat(media-modal): scaffold shadow-DOM lightbox host"
```

---

### Task 5: `media-modal` — image rendering with full-res URL swap

**Files:**
- Modify: `src/content/media-modal.ts`
- Modify: `tests/unit/media-modal.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/media-modal.test.ts`:

```ts
function getImg(host: Element | null): HTMLImageElement | null {
  const h = host as HTMLElement | null;
  return h?.shadowRoot?.querySelector('img') ?? null;
}

it('open() with an image renders <img> and swaps name=small → name=large', () => {
  modal = createMediaModal();
  modal.open([{ kind: 'image', src: 'https://pbs.twimg.com/media/X?format=jpg&name=small' }], 0);
  const img = getImg(document.querySelector('[data-xkbd-media]'));
  expect(img).not.toBeNull();
  expect(img!.src).toBe('https://pbs.twimg.com/media/X?format=jpg&name=large');
});

it('open() with an image without a name= param appends &name=large', () => {
  modal = createMediaModal();
  modal.open([{ kind: 'image', src: 'https://pbs.twimg.com/media/Y?format=jpg' }], 0);
  const img = getImg(document.querySelector('[data-xkbd-media]'));
  expect(img!.src).toBe('https://pbs.twimg.com/media/Y?format=jpg&name=large');
});

it('falls back to original src on <img> error', () => {
  modal = createMediaModal();
  const orig = 'https://pbs.twimg.com/media/Z?format=jpg&name=small';
  modal.open([{ kind: 'image', src: orig }], 0);
  const img = getImg(document.querySelector('[data-xkbd-media]'))!;
  img.dispatchEvent(new Event('error'));
  expect(img.src).toBe(orig);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/unit/media-modal.test.ts -t "image"
```

Expected: FAIL.

- [ ] **Step 3: Implement image rendering**

In `src/content/media-modal.ts`, replace the `render` function and helpers:

```ts
function upgradeImageSrc(src: string): string {
  if (/[?&]name=/.test(src)) {
    return src.replace(/([?&])name=\w+/, '$1name=large');
  }
  return src + (src.includes('?') ? '&' : '?') + 'name=large';
}

// inside createMediaModal:
const render = () => {
  if (!shadow) return;
  const stage = shadow.querySelector('.stage') as HTMLElement;
  stage.innerHTML = '';
  const item = items[index];
  if (!item) return;
  if (item.kind === 'image') {
    const img = document.createElement('img');
    const upgraded = upgradeImageSrc(item.src);
    img.src = upgraded;
    img.alt = item.alt ?? '';
    img.addEventListener(
      'error',
      () => { if (img.src !== item.src) img.src = item.src; },
      { once: true },
    );
    stage.appendChild(img);
  }
};
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/media-modal.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/media-modal.ts tests/unit/media-modal.test.ts
git commit -m "feat(media-modal): render images with full-res name=large"
```

---

### Task 6: `media-modal` — video reparent + restore

**Files:**
- Modify: `src/content/media-modal.ts`
- Modify: `tests/unit/media-modal.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/media-modal.test.ts`:

```ts
it('open() with a video reparents the element into the modal stage', () => {
  const source = document.createElement('div');
  const video = document.createElement('video');
  source.appendChild(video);
  document.body.appendChild(source);

  modal = createMediaModal();
  modal.open([{ kind: 'video', el: video }], 0);

  const host = document.querySelector('[data-xkbd-media]') as HTMLElement;
  expect(host.shadowRoot!.contains(video)).toBe(true);
  expect(source.contains(video)).toBe(false);
});

it('close() returns the video to its original parent and sibling position', () => {
  const source = document.createElement('div');
  const before = document.createElement('span');
  const video = document.createElement('video');
  const after = document.createElement('span');
  source.append(before, video, after);
  document.body.appendChild(source);

  modal = createMediaModal();
  modal.open([{ kind: 'video', el: video }], 0);
  modal.close();

  expect(Array.from(source.children)).toEqual([before, video, after]);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/unit/media-modal.test.ts -t "video"
```

Expected: FAIL.

- [ ] **Step 3: Implement video reparenting**

Add to `src/content/media-modal.ts` inside `createMediaModal`:

```ts
interface Reparented {
  el: HTMLVideoElement;
  parent: Node;
  nextSibling: Node | null;
}
let reparented: Reparented | null = null;

const reparentVideo = (video: HTMLVideoElement) => {
  const parent = video.parentNode;
  if (!parent) return;
  reparented = { el: video, parent, nextSibling: video.nextSibling };
};

const restoreVideo = () => {
  if (!reparented) return;
  const { el, parent, nextSibling } = reparented;
  // If the parent was detached mid-flight, skip — X will re-render on scroll-back.
  if (parent.isConnected) {
    if (nextSibling && nextSibling.parentNode === parent) {
      parent.insertBefore(el, nextSibling);
    } else {
      parent.appendChild(el);
    }
  }
  reparented = null;
};
```

Extend `render` to handle video and to track reparenting:

```ts
const render = () => {
  if (!shadow) return;
  const stage = shadow.querySelector('.stage') as HTMLElement;
  stage.innerHTML = '';
  const item = items[index];
  if (!item) return;
  if (item.kind === 'image') {
    const img = document.createElement('img');
    const upgraded = upgradeImageSrc(item.src);
    img.src = upgraded;
    img.alt = item.alt ?? '';
    img.addEventListener(
      'error',
      () => { if (img.src !== item.src) img.src = item.src; },
      { once: true },
    );
    stage.appendChild(img);
    return;
  }
  // video
  if (!reparented || reparented.el !== item.el) {
    restoreVideo();
    reparentVideo(item.el);
  }
  stage.appendChild(item.el);
};
```

Update `close` and `stop` to restore the video:

```ts
close() {
  if (!host) return;
  restoreVideo();
  items = [];
  index = 0;
  unmount();
},
// …
stop() {
  restoreVideo();
  unmount();
},
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/media-modal.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/media-modal.ts tests/unit/media-modal.test.ts
git commit -m "feat(media-modal): reparent <video> and restore its DOM position on close"
```

---

### Task 7: `media-modal` — carousel (arrows, digits, thumbs, counter)

**Files:**
- Modify: `src/content/media-modal.ts`
- Modify: `tests/unit/media-modal.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/media-modal.test.ts`:

```ts
function itemsFor(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    kind: 'image' as const,
    src: `https://pbs.twimg.com/media/I${i}?format=jpg&name=small`,
  }));
}

it('handleKey ArrowRight advances, ArrowLeft goes back; both clamp at bounds', () => {
  modal = createMediaModal();
  modal.open(itemsFor(3), 0);
  modal.handleKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
  modal.handleKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
  modal.handleKey(new KeyboardEvent('keydown', { key: 'ArrowRight' })); // clamped
  const host = document.querySelector('[data-xkbd-media]') as HTMLElement;
  const img = host.shadowRoot!.querySelector('img') as HTMLImageElement;
  expect(img.src).toContain('I2');
  modal.handleKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
  modal.handleKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
  modal.handleKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); // clamped
  const img2 = host.shadowRoot!.querySelector('img') as HTMLImageElement;
  expect(img2.src).toContain('I0');
});

it('handleKey digit jumps to that index; out-of-range digit is ignored', () => {
  modal = createMediaModal();
  modal.open(itemsFor(3), 0);
  modal.handleKey(new KeyboardEvent('keydown', { key: '3' }));
  const host = document.querySelector('[data-xkbd-media]') as HTMLElement;
  const img = host.shadowRoot!.querySelector('img') as HTMLImageElement;
  expect(img.src).toContain('I2');
  modal.handleKey(new KeyboardEvent('keydown', { key: '9' }));
  const img2 = host.shadowRoot!.querySelector('img') as HTMLImageElement;
  expect(img2.src).toContain('I2');
});

it('carousel chrome (counter, thumbs) is hidden for single-item', () => {
  modal = createMediaModal();
  modal.open(itemsFor(1), 0);
  const host = document.querySelector('[data-xkbd-media]') as HTMLElement;
  expect(host.shadowRoot!.querySelector('.thumbs')).toBeNull();
  expect(host.shadowRoot!.querySelector('.counter')).toBeNull();
});

it('carousel chrome shown for multi-item; counter reflects index', () => {
  modal = createMediaModal();
  modal.open(itemsFor(4), 2);
  const host = document.querySelector('[data-xkbd-media]') as HTMLElement;
  const counter = host.shadowRoot!.querySelector('.counter');
  expect(counter?.textContent).toBe('3 / 4');
  const thumbs = host.shadowRoot!.querySelectorAll('.thumb');
  expect(thumbs.length).toBe(4);
  expect(thumbs[2].classList.contains('is-current')).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/unit/media-modal.test.ts -t "carousel|handleKey Arrow|digit"
```

Expected: FAIL.

- [ ] **Step 3: Implement the carousel**

Replace the inner HTML in `mount()` with the full chrome, then expand `render`:

In `mount()`, set:

```ts
shadow.innerHTML = `
  <style>
    :host { all: initial; }
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.92);
                z-index: 2147483647; display: flex; align-items: center;
                justify-content: center;
                font-family: -apple-system, system-ui, sans-serif; }
    .stage { position: relative; width: 90vw; height: 90vh;
             display: flex; align-items: center; justify-content: center; }
    .stage img, .stage video {
      max-width: 100%; max-height: 100%; object-fit: contain;
      border-radius: 8px; background: #000;
    }
    .close, .nav {
      position: absolute; border: 0; cursor: pointer;
      background: rgba(0,0,0,0.55); color: #fff;
      width: 36px; height: 36px; border-radius: 999px;
      font-size: 18px; line-height: 1; display: grid; place-items: center;
    }
    .close { top: 10px; right: 10px; width: 32px; height: 32px; font-size: 20px; }
    .nav.prev { left: 10px; top: 50%; transform: translateY(-50%); }
    .nav.next { right: 10px; top: 50%; transform: translateY(-50%); }
    .counter { position: absolute; top: 10px; left: 10px;
               color: #cfd5dc; font-size: 12px;
               background: rgba(0,0,0,0.55); padding: 4px 8px; border-radius: 999px; }
    .thumbs { position: absolute; bottom: 10px; left: 50%;
              transform: translateX(-50%); display: flex; gap: 6px; }
    .thumb { width: 34px; height: 24px; border: 0; border-radius: 4px;
             background: #333; cursor: pointer; padding: 0; }
    .thumb.is-current { box-shadow: 0 0 0 2px #1d9bf0; }
  </style>
  <div class="backdrop">
    <div class="stage"></div>
  </div>
`;
```

Rewrite `render` to paint chrome + media + wire chrome click handlers:

```ts
const setIndex = (next: number) => {
  const clamped = Math.max(0, Math.min(next, items.length - 1));
  if (clamped === index) return;
  index = clamped;
  render();
};

const render = () => {
  if (!shadow) return;
  const backdrop = shadow.querySelector('.backdrop') as HTMLElement;
  const stage = shadow.querySelector('.stage') as HTMLElement;
  stage.innerHTML = '';
  // Remove any prior overlays
  shadow.querySelectorAll('.close, .nav, .counter, .thumbs').forEach((n) => n.remove());

  const item = items[index];
  if (!item) return;

  if (item.kind === 'image') {
    const img = document.createElement('img');
    const upgraded = upgradeImageSrc(item.src);
    img.src = upgraded;
    img.alt = item.alt ?? '';
    img.addEventListener(
      'error',
      () => { if (img.src !== item.src) img.src = item.src; },
      { once: true },
    );
    stage.appendChild(img);
  } else {
    if (!reparented || reparented.el !== item.el) {
      restoreVideo();
      reparentVideo(item.el);
    }
    stage.appendChild(item.el);
  }

  const close = document.createElement('button');
  close.className = 'close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', () => this_close());
  backdrop.appendChild(close);

  if (items.length > 1) {
    const prev = document.createElement('button');
    prev.className = 'nav prev';
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous');
    prev.textContent = '‹';
    prev.addEventListener('click', () => setIndex(index - 1));
    backdrop.appendChild(prev);

    const next = document.createElement('button');
    next.className = 'nav next';
    next.type = 'button';
    next.setAttribute('aria-label', 'Next');
    next.textContent = '›';
    next.addEventListener('click', () => setIndex(index + 1));
    backdrop.appendChild(next);

    const counter = document.createElement('div');
    counter.className = 'counter';
    counter.textContent = `${index + 1} / ${items.length}`;
    backdrop.appendChild(counter);

    const thumbs = document.createElement('div');
    thumbs.className = 'thumbs';
    items.forEach((_, i) => {
      const b = document.createElement('button');
      b.className = 'thumb' + (i === index ? ' is-current' : '');
      b.type = 'button';
      b.setAttribute('aria-label', `Show item ${i + 1}`);
      b.addEventListener('click', () => setIndex(i));
      thumbs.appendChild(b);
    });
    backdrop.appendChild(thumbs);
  }
};
```

Replace the `this_close()` placeholder above by capturing the close API in a local const near the start of `createMediaModal`:

```ts
const this_close = () => {
  if (!host) return;
  restoreVideo();
  items = [];
  index = 0;
  unmount();
};
```

And have the exported `close()` delegate to it:

```ts
close() { this_close(); },
```

Flesh out `handleKey`:

```ts
handleKey(e: KeyboardEvent) {
  if (!host) return;
  switch (e.key) {
    case 'ArrowRight':
      setIndex(index + 1);
      return;
    case 'ArrowLeft':
      setIndex(index - 1);
      return;
    case 'Escape':
      this_close();
      return;
  }
  if (/^[1-9]$/.test(e.key)) {
    const target = Number(e.key) - 1;
    if (target < items.length) setIndex(target);
  }
},
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/media-modal.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/media-modal.ts tests/unit/media-modal.test.ts
git commit -m "feat(media-modal): carousel with arrows/digits, counter, thumbs"
```

---

### Task 8: `media-modal` — outside-click close, scroll lock, focus trap

**Files:**
- Modify: `src/content/media-modal.ts`
- Modify: `tests/unit/media-modal.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/media-modal.test.ts`:

```ts
it('clicking the backdrop (outside stage) closes the modal', () => {
  modal = createMediaModal();
  modal.open(itemsFor(2), 0);
  const host = document.querySelector('[data-xkbd-media]') as HTMLElement;
  const backdrop = host.shadowRoot!.querySelector('.backdrop') as HTMLElement;
  backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  expect(modal.isOpen()).toBe(false);
});

it('clicking inside the stage does not close the modal', () => {
  modal = createMediaModal();
  modal.open(itemsFor(2), 0);
  const host = document.querySelector('[data-xkbd-media]') as HTMLElement;
  const stage = host.shadowRoot!.querySelector('.stage') as HTMLElement;
  stage.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  expect(modal.isOpen()).toBe(true);
});

it('open applies scroll lock to body; close restores it', () => {
  document.body.style.overflow = 'auto';
  modal = createMediaModal();
  modal.open(itemsFor(1), 0);
  expect(document.body.style.overflow).toBe('hidden');
  modal.close();
  expect(document.body.style.overflow).toBe('auto');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/unit/media-modal.test.ts -t "backdrop|stage|scroll lock"
```

Expected: FAIL.

- [ ] **Step 3: Implement outside-click + scroll lock**

Extend `createMediaModal` state:

```ts
let prevBodyOverflow: string | null = null;
```

Update `mount()` to wire outside-click and save overflow:

```ts
const mount = () => {
  host = document.createElement('div');
  host.dataset.xkbdMedia = '';
  shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = /* …same template as Task 7… */;
  const backdrop = shadow.querySelector('.backdrop') as HTMLElement;
  backdrop.addEventListener('click', (e) => {
    const path = e.composedPath();
    const stage = shadow!.querySelector('.stage');
    if (stage && !path.includes(stage)) this_close();
  });
  document.body.appendChild(host);
  prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
};
```

Update `unmount()`:

```ts
const unmount = () => {
  host?.remove();
  host = null;
  shadow = null;
  if (prevBodyOverflow !== null) {
    document.body.style.overflow = prevBodyOverflow;
    prevBodyOverflow = null;
  }
};
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/media-modal.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/media-modal.ts tests/unit/media-modal.test.ts
git commit -m "feat(media-modal): outside-click close and body scroll lock"
```

---

## Phase 4 — Link mode

### Task 9: `link-mode` — target enumeration (pure function)

**Files:**
- Create: `src/content/link-mode.ts`
- Create: `tests/unit/link-mode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/link-mode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { enumerateTargets } from '../../src/content/link-mode';

function makeArticle(html: string): HTMLElement {
  const a = document.createElement('article');
  a.setAttribute('data-testid', 'tweet');
  a.innerHTML = html;
  document.body.appendChild(a);
  return a;
}

describe('enumerateTargets', () => {
  it('returns empty list for a plain-text tweet', () => {
    const article = makeArticle('<div data-testid="tweetText">hello</div>');
    expect(enumerateTargets(article)).toEqual([]);
  });

  it('collects body URLs in document order', () => {
    const article = makeArticle(`
      <div data-testid="tweetText">
        see <a role="link" href="https://t.co/aaa">one</a>
        and <a role="link" href="https://t.co/bbb">two</a>
      </div>`);
    const t = enumerateTargets(article);
    expect(t.map((x) => x.kind)).toEqual(['bodyUrl', 'bodyUrl']);
    expect(t.map((x) => (x.el as HTMLAnchorElement).href)).toEqual([
      'https://t.co/aaa',
      'https://t.co/bbb',
    ]);
  });

  it('collects card, quoted tweet, images and video in DOM order, ignoring duplicates', () => {
    const article = makeArticle(`
      <div data-testid="tweetText">
        hi <a role="link" href="https://t.co/aaa">link</a>
      </div>
      <div data-testid="card.wrapper">
        <a href="https://example.com">card</a>
      </div>
      <article data-testid="tweet">
        <a role="link" href="/u/status/999"><time>1</time></a>
        inner
      </article>
      <div data-testid="tweetPhoto"><img src="https://x/1?name=small"></div>
      <div data-testid="tweetPhoto"><img src="https://x/2?name=small"></div>
      <div data-testid="videoPlayer"><video></video></div>
    `);
    const t = enumerateTargets(article);
    expect(t.map((x) => x.kind)).toEqual([
      'bodyUrl',
      'cardLink',
      'quotedTweet',
      'image',
      'image',
      'video',
    ]);
  });

  it('caps at 9 targets', () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      `<div data-testid="tweetPhoto"><img src="https://x/${i}?name=small"></div>`,
    ).join('');
    const article = makeArticle(items);
    expect(enumerateTargets(article).length).toBe(9);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/unit/link-mode.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `enumerateTargets`**

Create `src/content/link-mode.ts`:

```ts
import { SELECTORS, queryAll } from '../shared/selectors';

export type LinkTargetKind =
  | 'bodyUrl'
  | 'cardLink'
  | 'quotedTweet'
  | 'image'
  | 'video';

export interface LinkTarget {
  kind: LinkTargetKind;
  el: HTMLElement;
}

const MAX_TARGETS = 9;

export function enumerateTargets(article: HTMLElement): LinkTarget[] {
  const seen = new Set<HTMLElement>();
  const all: LinkTarget[] = [];
  const add = (kind: LinkTargetKind, el: HTMLElement) => {
    if (seen.has(el)) return;
    seen.add(el);
    all.push({ kind, el });
  };

  // Body URLs: scoped to outer tweetText (avoid nested quoted tweet text).
  const outerText = article.querySelector<HTMLElement>(
    ':scope > div [data-testid="tweetText"], :scope [data-testid="tweetText"]:not(article article [data-testid="tweetText"])',
  );
  if (outerText) {
    const urls = queryAll(SELECTORS.BODY_URL, outerText) as HTMLAnchorElement[];
    for (const a of urls) add('bodyUrl', a);
  }

  // Card wrapper.
  const cards = queryAll(SELECTORS.CARD, article) as HTMLElement[];
  for (const c of cards) add('cardLink', c);

  // Quoted tweet — nested article that is not the outer article.
  const quoted = Array.from(
    article.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
  ).filter((n) => n !== article);
  for (const q of quoted) add('quotedTweet', q);

  // Images.
  const imgs = queryAll(SELECTORS.IMAGE, article) as HTMLElement[];
  for (const i of imgs) add('image', i);

  // Video.
  const videos = queryAll(SELECTORS.VIDEO, article) as HTMLElement[];
  for (const v of videos) add('video', v);

  // Return in DOM order across categories using a document-order sort.
  all.sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  return all.slice(0, MAX_TARGETS);
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/link-mode.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/link-mode.ts tests/unit/link-mode.test.ts
git commit -m "feat(link-mode): enumerate openable targets in the active article"
```

---

### Task 10: `link-mode` — enter / exit / isActive + badge paint

**Files:**
- Modify: `src/content/link-mode.ts`
- Modify: `tests/unit/link-mode.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/link-mode.test.ts`:

```ts
import { createLinkMode } from '../../src/content/link-mode';
import { vi } from 'vitest';

function makeDeps(active: HTMLElement | null) {
  const registryListeners = new Set<() => void>();
  const routerListeners = new Set<(m: 'timeline' | 'thread') => void>();
  return {
    nav: { activeArticle: () => active },
    registry: {
      subscribe: (fn: () => void) => {
        registryListeners.add(fn);
        return () => registryListeners.delete(fn);
      },
      triggerRebuild: () => registryListeners.forEach((fn) => fn()),
    },
    router: {
      subscribe: (fn: (m: 'timeline' | 'thread') => void) => {
        routerListeners.add(fn);
        return () => routerListeners.delete(fn);
      },
      triggerChange: (m: 'timeline' | 'thread') =>
        routerListeners.forEach((fn) => fn(m)),
    },
    mediaModal: { open: vi.fn() },
  };
}

describe('createLinkMode', () => {
  it('isActive() is false initially', () => {
    const article = makeArticle('<div data-testid="tweetText"><a role="link" href="https://t.co/x">x</a></div>');
    const deps = makeDeps(article);
    const lm = createLinkMode(deps as any);
    expect(lm.isActive()).toBe(false);
    lm.stop();
  });

  it('enter() with no active article returns false and stays inactive', () => {
    const deps = makeDeps(null);
    const lm = createLinkMode(deps as any);
    expect(lm.enter()).toBe(false);
    expect(lm.isActive()).toBe(false);
    lm.stop();
  });

  it('enter() with targets paints badges with digits 1..N and activates', () => {
    const article = makeArticle(`
      <div data-testid="tweetText">
        <a role="link" href="https://t.co/a">a</a>
        <a role="link" href="https://t.co/b">b</a>
      </div>`);
    const deps = makeDeps(article);
    const lm = createLinkMode(deps as any);
    expect(lm.enter()).toBe(true);
    expect(lm.isActive()).toBe(true);
    const host = document.querySelector('[data-xkbd-link-mode]') as HTMLElement;
    const badges = host.shadowRoot!.querySelectorAll('.badge');
    expect(Array.from(badges).map((b) => b.textContent)).toEqual(['1', '2']);
    lm.stop();
  });

  it('exit() removes badges and deactivates', () => {
    const article = makeArticle('<div data-testid="tweetText"><a role="link" href="https://t.co/x">x</a></div>');
    const deps = makeDeps(article);
    const lm = createLinkMode(deps as any);
    lm.enter();
    lm.exit();
    expect(lm.isActive()).toBe(false);
    expect(document.querySelector('[data-xkbd-link-mode]')).toBeNull();
    lm.stop();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/unit/link-mode.test.ts -t "createLinkMode"
```

Expected: FAIL — `createLinkMode` not exported yet.

- [ ] **Step 3: Implement the lifecycle and badge paint**

Extend `src/content/link-mode.ts`:

```ts
import type { Registry } from './tweet-registry';
import type { RouteWatcher } from './route-watcher';
import type { MediaModal } from './media-modal';

export interface LinkMode {
  enter(): boolean;
  exit(): void;
  isActive(): boolean;
  handleKey(e: KeyboardEvent): void;
  stop(): void;
}

export interface LinkModeDeps {
  nav: { activeArticle: () => HTMLElement | null };
  registry: Pick<Registry, 'subscribe'>;
  router: Pick<RouteWatcher, 'subscribe'>;
  mediaModal: Pick<MediaModal, 'open'>;
}

export function createLinkMode(deps: LinkModeDeps): LinkMode {
  let active = false;
  let targets: LinkTarget[] = [];
  let article: HTMLElement | null = null;
  let host: HTMLDivElement | null = null;
  let shadow: ShadowRoot | null = null;
  let unsubRegistry: (() => void) | null = null;
  let unsubRouter: (() => void) | null = null;

  const paintBadges = () => {
    host = document.createElement('div');
    host.dataset.xkbdLinkMode = '';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .badge {
          position: absolute; pointer-events: none;
          background: linear-gradient(180deg, #1f2832, #131a22);
          color: #d6dde4; font: 700 12px/1 ui-monospace, Menlo, monospace;
          padding: 2px 6px; border-radius: 4px;
          box-shadow: 0 0 0 1px rgba(29,155,240,0.45),
                      0 4px 10px -4px rgba(0,0,0,0.7);
          z-index: 2147483646;
        }
      </style>
    `;
    document.body.appendChild(host);
    reposition();
  };

  const reposition = () => {
    if (!shadow) return;
    shadow.querySelectorAll('.badge').forEach((b) => b.remove());
    targets.forEach((t, i) => {
      const rect = t.el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.dataset.digit = String(i + 1);
      badge.textContent = String(i + 1);
      badge.style.top = `${rect.top + window.scrollY + 4}px`;
      badge.style.left = `${rect.left + window.scrollX + 4}px`;
      shadow!.appendChild(badge);
    });
  };

  const unpaintBadges = () => {
    host?.remove();
    host = null;
    shadow = null;
  };

  return {
    enter() {
      if (active) return true;
      article = deps.nav.activeArticle();
      if (!article) return false;
      targets = enumerateTargets(article);
      if (targets.length === 0) return false;
      active = true;
      paintBadges();
      unsubRegistry = deps.registry.subscribe(() => {
        // If the active article is gone, exit.
        if (!article || !article.isConnected) this_exit();
        else reposition();
      });
      unsubRouter = deps.router.subscribe(() => this_exit());
      return true;
    },
    exit() { this_exit(); },
    isActive() { return active; },
    handleKey(_e: KeyboardEvent) { /* Task 11 */ },
    stop() { this_exit(); },
  };

  function this_exit() {
    if (!active) return;
    active = false;
    targets = [];
    article = null;
    unpaintBadges();
    unsubRegistry?.(); unsubRegistry = null;
    unsubRouter?.(); unsubRouter = null;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/link-mode.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/link-mode.ts tests/unit/link-mode.test.ts
git commit -m "feat(link-mode): enter/exit lifecycle with numbered badge overlay"
```

---

### Task 11: `link-mode` — key handling and activation

**Files:**
- Modify: `src/content/link-mode.ts`
- Modify: `tests/unit/link-mode.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/link-mode.test.ts`:

```ts
it('handleKey "1" activates first bodyUrl via window.open and exits', () => {
  const article = makeArticle('<div data-testid="tweetText"><a role="link" href="https://t.co/x">x</a></div>');
  const deps = makeDeps(article);
  const lm = createLinkMode(deps as any);
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  lm.enter();
  lm.handleKey(new KeyboardEvent('keydown', { key: '1' }));
  expect(open).toHaveBeenCalledWith('https://t.co/x', '_blank', 'noopener,noreferrer');
  expect(lm.isActive()).toBe(false);
  open.mockRestore();
  lm.stop();
});

it('handleKey "5" with only 2 targets exits without activating', () => {
  const article = makeArticle('<div data-testid="tweetText"><a role="link" href="https://t.co/x">x</a><a role="link" href="https://t.co/y">y</a></div>');
  const deps = makeDeps(article);
  const lm = createLinkMode(deps as any);
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  lm.enter();
  lm.handleKey(new KeyboardEvent('keydown', { key: '5' }));
  expect(open).not.toHaveBeenCalled();
  expect(lm.isActive()).toBe(false);
  open.mockRestore();
  lm.stop();
});

it('handleKey Escape exits without activating', () => {
  const article = makeArticle('<div data-testid="tweetText"><a role="link" href="https://t.co/x">x</a></div>');
  const deps = makeDeps(article);
  const lm = createLinkMode(deps as any);
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  lm.enter();
  lm.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(open).not.toHaveBeenCalled();
  expect(lm.isActive()).toBe(false);
  open.mockRestore();
  lm.stop();
});

it('handleKey letter exits silently', () => {
  const article = makeArticle('<div data-testid="tweetText"><a role="link" href="https://t.co/x">x</a></div>');
  const deps = makeDeps(article);
  const lm = createLinkMode(deps as any);
  lm.enter();
  lm.handleKey(new KeyboardEvent('keydown', { key: 'x' }));
  expect(lm.isActive()).toBe(false);
  lm.stop();
});

it('handleKey "1" on a video target calls mediaModal.open with the media items and the right index', () => {
  const article = makeArticle(`
    <div data-testid="videoPlayer"><video></video></div>
    <div data-testid="tweetPhoto"><img src="https://x/1?name=small"></div>
  `);
  const deps = makeDeps(article);
  const lm = createLinkMode(deps as any);
  lm.enter();
  lm.handleKey(new KeyboardEvent('keydown', { key: '2' })); // image is second in DOM order
  expect(deps.mediaModal.open).toHaveBeenCalledTimes(1);
  const [items, index] = (deps.mediaModal.open as any).mock.calls[0];
  expect(items.length).toBe(2);
  expect(items[0].kind).toBe('video');
  expect(items[1].kind).toBe('image');
  expect(index).toBe(1);
  lm.stop();
});

it('registry rebuild that disconnects the article exits link-mode', () => {
  const article = makeArticle('<div data-testid="tweetText"><a role="link" href="https://t.co/x">x</a></div>');
  const deps = makeDeps(article);
  const lm = createLinkMode(deps as any);
  lm.enter();
  article.remove();
  deps.registry.triggerRebuild();
  expect(lm.isActive()).toBe(false);
  lm.stop();
});

it('router change exits link-mode', () => {
  const article = makeArticle('<div data-testid="tweetText"><a role="link" href="https://t.co/x">x</a></div>');
  const deps = makeDeps(article);
  const lm = createLinkMode(deps as any);
  lm.enter();
  deps.router.triggerChange('thread');
  expect(lm.isActive()).toBe(false);
  lm.stop();
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/unit/link-mode.test.ts
```

Expected: FAIL — `handleKey` is a no-op.

- [ ] **Step 3: Implement `handleKey` and activation**

Inside `createLinkMode` in `src/content/link-mode.ts`, replace the `handleKey` stub with:

```ts
handleKey(e: KeyboardEvent) {
  if (!active) return;
  if (e.key === 'Escape') { this_exit(); return; }
  if (/^[1-9]$/.test(e.key)) {
    const i = Number(e.key) - 1;
    if (i < targets.length) activate(targets[i]);
    this_exit();
    return;
  }
  // Any other printable / functional key exits silently.
  this_exit();
},
```

And add `activate` inside the closure above `return {`:

```ts
const activate = (t: LinkTarget) => {
  switch (t.kind) {
    case 'bodyUrl':
    case 'cardLink': {
      const href =
        t.el instanceof HTMLAnchorElement
          ? t.el.href
          : (t.el.querySelector('a[href]') as HTMLAnchorElement | null)?.href;
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    case 'quotedTweet': {
      const link = t.el.querySelector<HTMLAnchorElement>(
        'a[href*="/status/"][role="link"]',
      );
      if (link) link.click();
      return;
    }
    case 'image':
    case 'video': {
      const items = buildMediaItems(article!);
      const index = items.findIndex((m) =>
        m.kind === 'video' ? m.el === t.el : m.src === (t.el as HTMLImageElement).src,
      );
      if (index >= 0) deps.mediaModal.open(items, index);
      return;
    }
  }
};

const buildMediaItems = (root: HTMLElement) => {
  const items: { kind: 'image' | 'video'; src?: string; el?: HTMLVideoElement }[] = [];
  enumerateTargets(root).forEach((t) => {
    if (t.kind === 'image') {
      items.push({ kind: 'image', src: (t.el as HTMLImageElement).src });
    } else if (t.kind === 'video') {
      items.push({ kind: 'video', el: t.el as HTMLVideoElement });
    }
  });
  return items.map((x) =>
    x.kind === 'image'
      ? ({ kind: 'image' as const, src: x.src! })
      : ({ kind: 'video' as const, el: x.el! }),
  );
};
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/link-mode.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/link-mode.ts tests/unit/link-mode.test.ts
git commit -m "feat(link-mode): digit activation with exit on Esc or other keys"
```

---

## Phase 5 — Binding integration

### Task 12: Priority gate + `o` entry in `key-bindings.ts`

**Files:**
- Modify: `src/content/key-bindings.ts`
- Modify: `tests/unit/key-bindings.test.ts`

- [ ] **Step 1: Write the failing test**

Extend `makeDeps` in `tests/unit/key-bindings.test.ts` to include the two new deps (modal + link-mode) and stub them:

```ts
function makeDeps() {
  const dispatch = vi.fn();
  const toggleHelp = vi.fn();
  const switchTab = vi.fn();
  const reload = vi.fn();
  const modalOpen = vi.fn(() => false);
  const modalHandleKey = vi.fn();
  const linkActive = vi.fn(() => false);
  const linkEnter = vi.fn();
  const linkHandleKey = vi.fn();
  let open = false;
  let active: HTMLElement | null = null;
  return {
    dispatch, toggleHelp, switchTab, reload,
    modalOpen, modalHandleKey, linkActive, linkEnter, linkHandleKey,
    setHelpOpen: (v: boolean) => { open = v; },
    setActive: (el: HTMLElement | null) => { active = el; },
    setModalOpen: (v: boolean) => { modalOpen.mockReturnValue(v); },
    setLinkActive: (v: boolean) => { linkActive.mockReturnValue(v); },
    bindings: {
      nav: { dispatch, activeArticle: () => active },
      toggleHelp, switchTab, reload,
      helpOpen: () => open,
      mediaModal: { isOpen: modalOpen, handleKey: modalHandleKey },
      linkMode: { isActive: linkActive, enter: linkEnter, handleKey: linkHandleKey },
    },
  };
}
```

Then append:

```ts
it('o calls linkMode.enter()', () => {
  const d = makeDeps();
  detach = attachKeyBindings(d.bindings);
  const e = fireKey({ key: 'o' });
  expect(d.linkEnter).toHaveBeenCalledTimes(1);
  expect(e.defaultPrevented).toBe(true);
  expect(d.dispatch).not.toHaveBeenCalled();
});

it('when linkMode.isActive(), all keys route to linkMode.handleKey and normal nav is suppressed', () => {
  const d = makeDeps();
  d.setLinkActive(true);
  detach = attachKeyBindings(d.bindings);
  fireKey({ key: 'j' });
  fireKey({ key: '1' });
  fireKey({ key: 'Escape' });
  expect(d.linkHandleKey).toHaveBeenCalledTimes(3);
  expect(d.dispatch).not.toHaveBeenCalled();
  expect(d.switchTab).not.toHaveBeenCalled();
});

it('when mediaModal.isOpen(), all keys route to mediaModal.handleKey', () => {
  const d = makeDeps();
  d.setModalOpen(true);
  detach = attachKeyBindings(d.bindings);
  fireKey({ key: 'ArrowRight' });
  fireKey({ key: 'Escape' });
  expect(d.modalHandleKey).toHaveBeenCalledTimes(2);
  expect(d.dispatch).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/unit/key-bindings.test.ts -t "linkMode|mediaModal"
```

Expected: FAIL.

- [ ] **Step 3: Extend deps and add the priority gate**

In `src/content/key-bindings.ts`, widen `KeyBindingsDeps`:

```ts
export interface KeyBindingsDeps {
  nav: Pick<Navigator, 'dispatch' | 'activeArticle'>;
  toggleHelp: () => void;
  helpOpen: () => boolean;
  switchTab: (index: number) => void;
  reload?: () => void;
  mediaModal: { isOpen: () => boolean; handleKey: (e: KeyboardEvent) => void };
  linkMode: {
    isActive: () => boolean;
    enter: () => void;
    handleKey: (e: KeyboardEvent) => void;
  };
}
```

Add `enterLinkMode` to `ResolvedAction`:

```ts
type ResolvedAction =
  | { kind: 'nav'; cmd: Command }
  | { kind: 'help' }
  | { kind: 'tab'; index: number }
  | { kind: 'click'; target: 'showMore' | 'translate' | 'newPostsPill' }
  | { kind: 'reload' }
  | { kind: 'enterLinkMode' };
```

Add the priority gate and `o` case at the top of `onKeyDown`, before the modifier-pass-through check is fine — put it right after. Replace `onKeyDown`:

```ts
const onKeyDown = (e: KeyboardEvent) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (deps.mediaModal.isOpen()) {
    e.preventDefault();
    e.stopImmediatePropagation();
    deps.mediaModal.handleKey(e);
    return;
  }
  if (deps.linkMode.isActive()) {
    e.preventDefault();
    e.stopImmediatePropagation();
    deps.linkMode.handleKey(e);
    return;
  }
  const action = resolve(e);
  if (!action) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  switch (action.kind) {
    case 'help': deps.toggleHelp(); break;
    case 'nav': deps.nav.dispatch(action.cmd); break;
    case 'tab': deps.switchTab(action.index); break;
    case 'reload': reload(); break;
    case 'enterLinkMode': deps.linkMode.enter(); break;
    case 'click': {
      if (action.target === 'newPostsPill') {
        findNewPostsPill(document)?.click();
        break;
      }
      const focusedArticle =
        (document.activeElement as HTMLElement | null)?.closest(
          'article[data-testid="tweet"]',
        ) as HTMLElement | null;
      const article = focusedArticle ?? deps.nav.activeArticle();
      if (!article) break;
      const btn =
        action.target === 'showMore'
          ? findShowMore(article)
          : findTranslate(article);
      btn?.click();
      break;
    }
  }
};
```

Add the `o` case inside `resolve()`'s switch, above `case '?':`:

```ts
case 'o':
case 'O':
  if (!deps.nav.activeArticle()) return null;
  return { kind: 'enterLinkMode' };
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/key-bindings.test.ts
```

Expected: PASS. All prior key-bindings tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/content/key-bindings.ts tests/unit/key-bindings.test.ts
git commit -m "feat(key-bindings): priority gate for modal/link-mode and new o binding"
```

---

### Task 13: Add `o` row to the shared BINDINGS

**Files:**
- Modify: `src/shared/bindings.ts`

- [ ] **Step 1: Verify existing order**

Read `src/shared/bindings.ts`. The current array is 12 rows. Insert the new row after the `t` row.

- [ ] **Step 2: Edit**

Replace the array in `src/shared/bindings.ts`:

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
  ['o → 1..9', 'Open link / media in active post'],
  ['1 / 2', 'For You / Following (Home)'],
  ['?', 'Toggle help'],
];
```

- [ ] **Step 3: Verify the help overlay still builds**

```bash
npx vitest run tests/unit/help-overlay.test.ts
```

Expected: PASS. (The overlay reads BINDINGS dynamically.)

- [ ] **Step 4: Commit**

```bash
git add src/shared/bindings.ts
git commit -m "docs(bindings): add o → 1..9 row to the shortcut card and help overlay"
```

---

### Task 14: Wire new modules in `index.ts`

**Files:**
- Modify: `src/content/index.ts`

- [ ] **Step 1: Read current `index.ts`**

Confirm the existing wiring (see `src/content/index.ts:1-42`).

- [ ] **Step 2: Edit `index.ts`**

Replace the file body with:

```ts
import { createRegistry } from './tweet-registry';
import { createRouteWatcher } from './route-watcher';
import { createNavigator } from './navigator';
import { createTabSwitcher } from './tab-switcher';
import { attachKeyBindings } from './key-bindings';
import { createHelpOverlay } from './help-overlay';
import { createHintButton } from './hint-button';
import { createMediaModal } from './media-modal';
import { createLinkMode } from './link-mode';

function main() {
  const registry = createRegistry();
  const router = createRouteWatcher();
  const nav = createNavigator({ registry, router });
  const tabs = createTabSwitcher({});
  const help = createHelpOverlay();
  const hint = createHintButton({ onClick: () => help.toggle() });
  const mediaModal = createMediaModal();
  const linkMode = createLinkMode({ nav, registry, router, mediaModal });

  const detach = attachKeyBindings({
    nav,
    switchTab: (i) => tabs.switchTo(i),
    toggleHelp: () => help.toggle(),
    helpOpen: () => help.isOpen(),
    mediaModal,
    linkMode,
  });

  window.addEventListener(
    'pagehide',
    () => {
      detach();
      linkMode.stop();
      mediaModal.stop();
      nav.stop();
      help.stop();
      hint.stop();
      registry.stop();
      router.stop();
    },
    { once: true },
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => main(), { once: true });
} else {
  main();
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Full unit run**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/content/index.ts
git commit -m "feat(content): wire media-modal and link-mode into the content script"
```

---

## Phase 6 — Expand button on inline video

### Task 15: `media-expand-button` module

**Files:**
- Create: `src/content/media-expand-button.ts`
- Create: `tests/unit/media-expand-button.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/media-expand-button.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createMediaExpandButton } from '../../src/content/media-expand-button';

afterEach(() => { document.body.innerHTML = ''; });

describe('createMediaExpandButton', () => {
  function makeDeps(active: HTMLElement | null) {
    const listeners = new Set<() => void>();
    return {
      nav: { activeArticle: () => active },
      registry: {
        subscribe: (fn: () => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        notify: () => listeners.forEach((fn) => fn()),
      },
      mediaModal: { open: vi.fn() },
    };
  }

  it('appends an expand button for each video in the active article', () => {
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'tweet');
    const playerWrap = document.createElement('div');
    playerWrap.setAttribute('data-testid', 'videoPlayer');
    const video = document.createElement('video');
    playerWrap.appendChild(video);
    article.appendChild(playerWrap);
    document.body.appendChild(article);

    const deps = makeDeps(article);
    const btn = createMediaExpandButton(deps as any);
    deps.registry.notify();
    const hosts = document.querySelectorAll('[data-xkbd-expand]');
    expect(hosts.length).toBe(1);
    btn.stop();
  });

  it('clicking the button calls mediaModal.open with the video item', () => {
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'tweet');
    const wrap = document.createElement('div');
    wrap.setAttribute('data-testid', 'videoPlayer');
    const video = document.createElement('video');
    wrap.appendChild(video);
    article.appendChild(wrap);
    document.body.appendChild(article);

    const deps = makeDeps(article);
    const btn = createMediaExpandButton(deps as any);
    deps.registry.notify();
    const host = document.querySelector('[data-xkbd-expand]') as HTMLElement;
    const clickable = host.shadowRoot!.querySelector('button') as HTMLButtonElement;
    clickable.click();
    expect(deps.mediaModal.open).toHaveBeenCalledTimes(1);
    const [items, index] = (deps.mediaModal.open as any).mock.calls[0];
    expect(items.length).toBe(1);
    expect(items[0].kind).toBe('video');
    expect(index).toBe(0);
    btn.stop();
  });

  it('removes existing buttons when active article changes', () => {
    const art1 = document.createElement('article');
    art1.setAttribute('data-testid', 'tweet');
    art1.innerHTML = `<div data-testid="videoPlayer"><video></video></div>`;
    const art2 = document.createElement('article');
    art2.setAttribute('data-testid', 'tweet');
    document.body.append(art1, art2);

    const deps = makeDeps(art1);
    const btn = createMediaExpandButton(deps as any);
    deps.registry.notify();
    expect(document.querySelectorAll('[data-xkbd-expand]').length).toBe(1);
    (deps.nav as any).activeArticle = () => art2;
    deps.registry.notify();
    expect(document.querySelectorAll('[data-xkbd-expand]').length).toBe(0);
    btn.stop();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/unit/media-expand-button.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the module**

Create `src/content/media-expand-button.ts`:

```ts
import type { Registry } from './tweet-registry';
import type { MediaModal, MediaItem } from './media-modal';
import { SELECTORS, queryAll } from '../shared/selectors';

export interface MediaExpandButton {
  stop(): void;
}

export interface MediaExpandButtonDeps {
  nav: { activeArticle: () => HTMLElement | null };
  registry: Pick<Registry, 'subscribe'>;
  mediaModal: Pick<MediaModal, 'open'>;
}

export function createMediaExpandButton(
  deps: MediaExpandButtonDeps,
): MediaExpandButton {
  const rendered: HTMLElement[] = [];

  const clear = () => {
    while (rendered.length) rendered.pop()?.remove();
  };

  const collectMedia = (article: HTMLElement): MediaItem[] => {
    const items: MediaItem[] = [];
    const imgs = queryAll(SELECTORS.IMAGE, article) as HTMLImageElement[];
    imgs.forEach((img) => items.push({ kind: 'image', src: img.src }));
    const videos = queryAll(SELECTORS.VIDEO, article) as HTMLVideoElement[];
    videos.forEach((el) => items.push({ kind: 'video', el }));
    return items;
  };

  const paint = () => {
    clear();
    const article = deps.nav.activeArticle();
    if (!article) return;
    const videos = queryAll(SELECTORS.VIDEO, article) as HTMLVideoElement[];
    if (videos.length === 0) return;
    const items = collectMedia(article);
    videos.forEach((video) => {
      const host = document.createElement('div');
      host.dataset.xkbdExpand = '';
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>
          :host { all: initial; position: absolute; z-index: 2147483645; }
          button {
            all: unset; cursor: pointer;
            width: 28px; height: 28px; border-radius: 999px;
            background: rgba(0,0,0,0.65); color: #fff;
            display: grid; place-items: center;
            box-shadow: 0 0 0 1px rgba(29,155,240,0.35);
            font: 700 14px/1 ui-monospace, Menlo, monospace;
          }
          button:hover { background: rgba(0,0,0,0.85); }
        </style>
        <button type="button" aria-label="Expand video">⤢</button>
      `;
      const rect = video.getBoundingClientRect();
      host.style.position = 'absolute';
      host.style.top = `${rect.top + window.scrollY + 6}px`;
      host.style.left = `${rect.right + window.scrollX - 34}px`;
      const btn = shadow.querySelector('button') as HTMLButtonElement;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const index = items.findIndex((m) => m.kind === 'video' && m.el === video);
        if (index >= 0) deps.mediaModal.open(items, index);
      });
      document.body.appendChild(host);
      rendered.push(host);
    });
  };

  const unsub = deps.registry.subscribe(paint);

  return {
    stop() { clear(); unsub(); },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/media-expand-button.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/media-expand-button.ts tests/unit/media-expand-button.test.ts
git commit -m "feat(media): overlay expand button on inline video players"
```

---

### Task 16: Wire the expand button in `index.ts`

**Files:**
- Modify: `src/content/index.ts`

- [ ] **Step 1: Edit**

Update `src/content/index.ts` — insert the import and wire it:

```ts
import { createMediaExpandButton } from './media-expand-button';
// …

const expandBtn = createMediaExpandButton({ nav, registry, mediaModal });
```

Add to `pagehide` cleanup:

```ts
expandBtn.stop();
```

- [ ] **Step 2: Run full unit suite**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/content/index.ts
git commit -m "feat(content): wire expand-button module"
```

---

## Phase 7 — e2e coverage

### Task 17: Playwright fixture — truncated post

**Files:**
- Create: `tests/fixtures/x-timeline-truncated.html`
- Modify: `tests/e2e/navigation.spec.ts`

- [ ] **Step 1: Create the fixture**

Create `tests/fixtures/x-timeline-truncated.html`:

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><title>truncated fixture</title></head>
<body>
<main>
  <div aria-label="Timeline: Home">
    <div data-testid="cellInnerDiv">
      <article data-testid="tweet" tabindex="0">
        <a role="link" href="/user/status/111"><time>1</time></a>
        <div data-testid="tweetText">Welcome — expect practical demos and more…</div>
        <button data-testid="tweet-text-show-more-link" id="expand">Mostrar mais</button>
      </article>
    </div>
    <div data-testid="cellInnerDiv">
      <article data-testid="tweet" tabindex="0">
        <a role="link" href="/user/status/222"><time>2</time></a>
        <div data-testid="tweetText">Second tweet</div>
      </article>
    </div>
  </div>
</main>
<script>
  document.getElementById('expand').addEventListener('click', () => {
    window.__expandClicked = (window.__expandClicked ?? 0) + 1;
  });
</script>
</body>
</html>
```

- [ ] **Step 2: Register the route**

In `tests/e2e/navigation.spec.ts` find the `beforeAll` server setup. Extend the route handler:

```ts
const name = req.url === '/' || req.url === '/timeline'
  ? 'x-timeline.html'
  : req.url === '/thread'
    ? 'x-thread.html'
    : req.url === '/truncated'
      ? 'x-timeline-truncated.html'
      : null;
```

- [ ] **Step 3: Add the test**

Append to `tests/e2e/navigation.spec.ts`:

```ts
test('Space expands a truncated post and does not page down', async () => {
  const userDataDir = resolve(__dirname, '.pw-profile-truncated');
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 600 },
    args: [
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
    ],
  });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/truncated`);
  await page.waitForSelector('article[data-testid="tweet"]');
  await page.keyboard.press('ArrowDown');
  const y1 = await page.evaluate(() => window.scrollY);
  await page.keyboard.press(' ');
  const y2 = await page.evaluate(() => window.scrollY);
  expect(y2).toBe(y1);
  const clicks = await page.evaluate(() => (window as any).__expandClicked ?? 0);
  expect(clicks).toBe(1);
  await ctx.close();
});
```

- [ ] **Step 4: Build and run**

```bash
npm run build && npx playwright test tests/e2e/navigation.spec.ts
```

Expected: the new test passes (alongside the existing tests).

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/x-timeline-truncated.html tests/e2e/navigation.spec.ts
git commit -m "test(e2e): Space expands a truncated post without paging"
```

---

### Task 18: Playwright fixture — media modal

**Files:**
- Create: `tests/fixtures/x-timeline-media.html`
- Modify: `tests/e2e/navigation.spec.ts`

- [ ] **Step 1: Create the fixture**

Create `tests/fixtures/x-timeline-media.html`:

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><title>media fixture</title></head>
<body>
<main>
  <div aria-label="Timeline: Home">
    <div data-testid="cellInnerDiv">
      <article data-testid="tweet" tabindex="0">
        <a role="link" href="/user/status/900"><time>m</time></a>
        <div data-testid="tweetText">three-image post</div>
        <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/A?format=jpg&name=small"></div>
        <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/B?format=jpg&name=small"></div>
        <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/C?format=jpg&name=small"></div>
      </article>
    </div>
  </div>
</main>
</body>
</html>
```

- [ ] **Step 2: Register the route**

Extend the route handler in `tests/e2e/navigation.spec.ts`:

```ts
: req.url === '/media'
  ? 'x-timeline-media.html'
```

- [ ] **Step 3: Add the test**

Append:

```ts
test('o then digit opens media modal; Escape closes it', async () => {
  const userDataDir = resolve(__dirname, '.pw-profile-media');
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
    ],
  });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/media`);
  await page.waitForSelector('article[data-testid="tweet"]');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('o');
  // badges now painted; first image is 1 (no body URLs enumerated).
  await page.keyboard.press('1');
  await expect(page.locator('[data-xkbd-media]')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-xkbd-media]')).toHaveCount(0);
  await ctx.close();
});
```

- [ ] **Step 4: Build and run**

```bash
npm run build && npx playwright test tests/e2e/navigation.spec.ts
```

Expected: passes (along with prior tests).

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/x-timeline-media.html tests/e2e/navigation.spec.ts
git commit -m "test(e2e): open/close media modal from the keyboard"
```

---

## Phase 8 — Docs

### Task 19: Update `TESTING.md` smoke checklist

**Files:**
- Modify: `TESTING.md`

- [ ] **Step 1: Read current `TESTING.md`**

Confirm structure.

- [ ] **Step 2: Append new section**

Append to `TESTING.md`:

```markdown
## Expand / open-link / media modal

- **Space expands a truncated post.** Load `x.com/elastic_devs`, arrow-down to the pinned post (`Mostrar mais` visible), press `Space`. The button vanishes and the body grows. Page scroll position does not change.
- **Space still pages down on a plain post.** Arrow-down to a post without `Mostrar mais`, press `Space`. Page scrolls ~90 % vh and the active tweet re-snaps.
- **`o` enters link mode; badges appear on the active post.** Only the active post gets badges. `Esc` clears them. Pressing any non-digit also clears them.
- **`o → 1` opens a body URL in a new tab.** Extension tab stays on X.
- **`o → N` opens a quoted tweet in the current tab** (same behaviour as `→`).
- **`o → N` on an image opens the media modal** at the chosen image. `←`/`→` cycle, `Esc` closes.
- **Video expand button** on an inline player opens the modal. Close with `Esc`. The video resumes from the same position in its original slot.
- **Help overlay** now lists `o → 1..9 — Open link / media in active post`.
- **No key conflicts:** `1` / `2` still switch For You / Following on Home when link mode is inactive.
- **No console errors** after five minutes of use.
```

- [ ] **Step 3: Commit**

```bash
git add TESTING.md
git commit -m "docs(testing): add smoke steps for expand, link mode, and media modal"
```

---

## Final verification

After all tasks land, run the full suite one time:

```bash
npm run build
npm test -- --run
npx playwright test
```

All green is the acceptance bar.

---

## Self-review

**Spec coverage:** each spec section maps to tasks — §4 (Space fix) → Tasks 1–2 and 17; §5 (link mode) → Tasks 3, 9–13; §6 (media modal) → Tasks 4–8, 15–16, 18; §7 (interaction matrix) → Task 12; §8 (edge cases) covered distributed across link-mode tests (virtualization/router exits), media-modal tests (outside-click, scroll lock, reparent restore), and the nested-tweet test in Task 1. No orphans.

**Placeholder scan:** no TBD/TODO/"handle edge cases"/"similar to Task N"/"fill in later" left in steps. Tests contain actual assertions; implementations contain actual code; commands are exact.

**Type consistency:** `MediaItem` defined in Task 4 is reused by Task 15; `LinkTarget` defined in Task 9 is reused by Tasks 10–11; `LinkMode` / `MediaModal` public APIs referenced in Task 12 match their definitions; `KeyBindingsDeps` widening in Task 12 matches the new dep shape used in `index.ts` (Task 14). `enumerateTargets` is called by `createLinkMode` (Task 10, 11) and implicitly by `createMediaExpandButton` via `SELECTORS.IMAGE`/`VIDEO` (Task 15) — both rely on the same module contract.

All green.
