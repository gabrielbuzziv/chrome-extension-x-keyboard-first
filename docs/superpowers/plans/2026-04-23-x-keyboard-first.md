# x-keyboard-first Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 Chrome extension that makes X (twitter.com / x.com) keyboard-first: arrow/j-k nav between tweets, visible active-tweet highlight, `→` to open a thread, `←` to return, `?` for a help overlay.

**Architecture:** One TypeScript content script bundled with Vite (`@crxjs/vite-plugin`). Six focused modules: `selectors`, `tweet-registry`, `route-watcher`, `navigator`, `key-bindings`, `help-overlay`. State is in-memory; active tweet is tracked by its `/status/<id>` so it survives X's list virtualization. Action keys (`l`/`r`/`t`/`b`/`n`) are left to X's natives — we call `.focus()` on the active article so they target it.

**Tech Stack:** TypeScript 5, Vite 5, `@crxjs/vite-plugin` 2, Vitest 2 + jsdom for unit tests, Playwright 1.48 for integration tests against local DOM fixtures.

**Spec:** `docs/superpowers/specs/2026-04-23-x-keyboard-first-design.md`.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `manifest.json`, `.gitignore` (append), `src/.gitkeep`, `tests/.gitkeep`, `public/icons/.gitkeep`

- [ ] **Step 1: Initialize package**

Create `package.json`:

```json
{
  "name": "x-keyboard-first",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "e2e": "playwright test"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.26",
    "@playwright/test": "^1.48.0",
    "@types/chrome": "^0.0.280",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome", "vitest/globals"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "useDefineForClassFields": true
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

- [ ] **Step 3: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "x-keyboard-first",
  "version": "0.1.0",
  "description": "Keyboard-first navigation for X (twitter.com / x.com).",
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "content_scripts": [
    {
      "matches": ["*://x.com/*", "*://twitter.com/*"],
      "js": ["src/content/index.ts"],
      "css": ["src/styles/highlight.css"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { crx } from '@crxjs/vite-plugin';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf-8'));

export default defineConfig({
  plugins: [crx({ manifest })],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.ts'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
```

- [ ] **Step 5: Extend `.gitignore`**

Append to existing `.gitignore`:

```
node_modules/
dist/
.vite/
coverage/
playwright-report/
test-results/
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: installs without errors; `node_modules/` populated.

- [ ] **Step 7: Placeholder source tree**

Create empty placeholder files so directories exist:
- `src/content/.gitkeep` (empty file)
- `src/shared/.gitkeep` (empty file)
- `src/styles/.gitkeep` (empty file)
- `tests/unit/.gitkeep` (empty file)
- `public/icons/.gitkeep` (empty file)

- [ ] **Step 8: Verify baseline toolchain**

Run: `npx tsc --noEmit`
Expected: exits 0 (nothing to compile yet).

Run: `npx vitest run --passWithNoTests`
Expected: exits 0, "No test files found".

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json vite.config.ts manifest.json .gitignore src/ tests/ public/
git commit -m "chore: scaffold MV3 + Vite + Vitest toolchain"
```

---

## Task 2: Shared selectors module

**Files:**
- Create: `src/shared/selectors.ts`
- Create: `tests/unit/selectors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/selectors.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SELECTORS, queryFirst, queryAll } from '../../src/shared/selectors';

describe('selectors', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('queryFirst returns primary match', () => {
    document.body.innerHTML = '<article data-testid="tweet" id="p"></article>';
    expect(queryFirst(SELECTORS.TWEET)?.id).toBe('p');
  });

  it('queryFirst falls back when primary misses', () => {
    document.body.innerHTML = '<article role="article" id="f"></article>';
    expect(queryFirst(SELECTORS.TWEET)?.id).toBe('f');
  });

  it('queryFirst returns null when neither matches', () => {
    document.body.innerHTML = '<div></div>';
    expect(queryFirst(SELECTORS.TWEET)).toBeNull();
  });

  it('queryAll returns primary matches', () => {
    document.body.innerHTML =
      '<article data-testid="tweet"></article><article data-testid="tweet"></article>';
    expect(queryAll(SELECTORS.TWEET)).toHaveLength(2);
  });

  it('queryAll falls back when primary returns zero', () => {
    document.body.innerHTML =
      '<article role="article"></article><article role="article"></article>';
    expect(queryAll(SELECTORS.TWEET)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/selectors.test.ts`
Expected: FAIL — `Cannot find module '../../src/shared/selectors'`.

- [ ] **Step 3: Implement the module**

Create `src/shared/selectors.ts`:

```ts
export const SELECTORS = {
  TWEET: ['article[data-testid="tweet"]', 'article[role="article"]'],
  FEED: ['[aria-label^="Timeline"]', '[data-testid="primaryColumn"]'],
  PERMALINK_IN_TWEET: [
    'a[href*="/status/"][role="link"]:has(time)',
    'a[href*="/status/"]',
  ],
} as const;

export function queryFirst(
  selectors: readonly string[],
  root: ParentNode = document,
): Element | null {
  for (const s of selectors) {
    const el = root.querySelector(s);
    if (el) return el;
  }
  return null;
}

export function queryAll(
  selectors: readonly string[],
  root: ParentNode = document,
): Element[] {
  for (const s of selectors) {
    const nodes = root.querySelectorAll(s);
    if (nodes.length > 0) return Array.from(nodes);
  }
  return [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/selectors.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Remove scaffold placeholder and commit**

Remove `src/shared/.gitkeep`.

```bash
git add src/shared tests/unit/selectors.test.ts
git rm src/shared/.gitkeep
git commit -m "feat(selectors): add primary+fallback X DOM selectors"
```

---

## Task 3: Tweet registry

**Files:**
- Create: `src/content/tweet-registry.ts`
- Create: `tests/unit/tweet-registry.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/tweet-registry.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { collectTweets, createRegistry } from '../../src/content/tweet-registry';

function tweetHtml(id: string, extraHref = ''): string {
  return `
    <article data-testid="tweet">
      <a role="link" href="/user/status/${id}${extraHref}"><time></time></a>
    </article>
  `;
}

async function nextFrame() {
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

describe('collectTweets', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('returns entries in DOM order with parsed ids', () => {
    document.body.innerHTML = tweetHtml('111') + tweetHtml('222') + tweetHtml('333');
    expect(collectTweets().map((e) => e.id)).toEqual(['111', '222', '333']);
  });

  it('dedupes tweets with the same id', () => {
    document.body.innerHTML = tweetHtml('111') + tweetHtml('111');
    expect(collectTweets()).toHaveLength(1);
  });

  it('parses id from /status/<id>/photo/1 style urls', () => {
    document.body.innerHTML = tweetHtml('42', '/photo/1');
    expect(collectTweets()[0].id).toBe('42');
  });

  it('skips articles with no /status/<id> link', () => {
    document.body.innerHTML = '<article data-testid="tweet"></article>';
    expect(collectTweets()).toEqual([]);
  });
});

describe('createRegistry', () => {
  let reg: ReturnType<typeof createRegistry>;
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => reg?.stop());

  it('exposes current tweets', () => {
    document.body.innerHTML = tweetHtml('1') + tweetHtml('2');
    reg = createRegistry();
    expect(reg.current().map((e) => e.id)).toEqual(['1', '2']);
  });

  it('rebuilds on DOM mutation', async () => {
    document.body.innerHTML = tweetHtml('1');
    reg = createRegistry();
    document.body.insertAdjacentHTML('beforeend', tweetHtml('2'));
    await nextFrame();
    expect(reg.current().map((e) => e.id)).toEqual(['1', '2']);
  });

  it('findById resolves to the current TweetEntry', () => {
    document.body.innerHTML = tweetHtml('7');
    reg = createRegistry();
    expect(reg.findById('7')?.id).toBe('7');
    expect(reg.findById('missing')).toBeUndefined();
  });

  it('notifies subscribers on rebuild', async () => {
    document.body.innerHTML = tweetHtml('1');
    reg = createRegistry();
    let calls = 0;
    reg.subscribe(() => { calls++; });
    document.body.insertAdjacentHTML('beforeend', tweetHtml('2'));
    await nextFrame();
    expect(calls).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/tweet-registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement tweet-registry**

Create `src/content/tweet-registry.ts`:

```ts
import { SELECTORS, queryAll } from '../shared/selectors';

export interface TweetEntry {
  id: string;
  article: HTMLElement;
  top: number;
}

const STATUS_ID_RE = /\/status\/(\d+)/;

function parseTweetId(article: HTMLElement): string | null {
  const links = queryAll(SELECTORS.PERMALINK_IN_TWEET, article);
  for (const link of links) {
    const href = (link as HTMLAnchorElement).getAttribute('href') ?? '';
    const m = href.match(STATUS_ID_RE);
    if (m) return m[1];
  }
  return null;
}

export function collectTweets(root: ParentNode = document): TweetEntry[] {
  const articles = queryAll(SELECTORS.TWEET, root) as HTMLElement[];
  const seen = new Set<string>();
  const entries: TweetEntry[] = [];
  for (const article of articles) {
    const id = parseTweetId(article);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    entries.push({
      id,
      article,
      top: article.getBoundingClientRect().top,
    });
  }
  return entries;
}

export interface Registry {
  current(): TweetEntry[];
  findById(id: string): TweetEntry | undefined;
  nearestToViewport(): TweetEntry | undefined;
  subscribe(listener: () => void): () => void;
  stop(): void;
}

export function createRegistry(root: ParentNode = document): Registry {
  let entries = collectTweets(root);
  const listeners = new Set<() => void>();
  let rafId: number | null = null;

  const rebuild = () => {
    rafId = null;
    entries = collectTweets(root);
    for (const fn of listeners) fn();
  };

  const schedule = () => {
    if (rafId != null) return;
    rafId = requestAnimationFrame(rebuild);
  };

  const observer = new MutationObserver(schedule);
  const target: Node =
    root instanceof Document ? root.body : (root as unknown as Node);
  observer.observe(target, { childList: true, subtree: true });

  return {
    current: () => entries,
    findById: (id) => entries.find((e) => e.id === id),
    nearestToViewport: () => {
      if (entries.length === 0) return undefined;
      const mid = window.innerHeight / 2;
      let best: TweetEntry | undefined;
      let bestDist = Infinity;
      for (const e of entries) {
        const rect = e.article.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const d = Math.abs(center - mid);
        if (d < bestDist) {
          bestDist = d;
          best = e;
        }
      }
      return best;
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    stop: () => {
      observer.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
      listeners.clear();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/tweet-registry.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/content/tweet-registry.ts tests/unit/tweet-registry.test.ts
git commit -m "feat(tweet-registry): track visible tweets with id-keyed entries"
```

---

## Task 4: Route watcher

**Files:**
- Create: `src/content/route-watcher.ts`
- Create: `tests/unit/route-watcher.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/route-watcher.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { urlToMode, createRouteWatcher } from '../../src/content/route-watcher';

describe('urlToMode', () => {
  it('classifies timeline urls', () => {
    expect(urlToMode('https://x.com/home')).toBe('timeline');
    expect(urlToMode('https://x.com/jack')).toBe('timeline');
    expect(urlToMode('https://x.com/jack/with_replies')).toBe('timeline');
    expect(urlToMode('https://x.com/search?q=foo')).toBe('timeline');
    expect(urlToMode('https://x.com/i/bookmarks')).toBe('timeline');
  });

  it('classifies thread urls', () => {
    expect(urlToMode('https://x.com/jack/status/12345')).toBe('thread');
    expect(urlToMode('https://x.com/jack/status/12345/photo/1')).toBe('thread');
    expect(urlToMode('https://x.com/jack/status/12345/analytics')).toBe('thread');
  });
});

describe('createRouteWatcher', () => {
  let watcher: ReturnType<typeof createRouteWatcher> | undefined;

  beforeEach(() => {
    history.replaceState(null, '', '/home');
  });
  afterEach(() => {
    watcher?.stop();
    watcher = undefined;
  });

  it('reports initial mode from current url', () => {
    history.replaceState(null, '', '/home');
    watcher = createRouteWatcher();
    expect(watcher.mode()).toBe('timeline');
  });

  it('fires subscribers on pushState and updates mode', () => {
    watcher = createRouteWatcher();
    const fn = vi.fn();
    watcher.subscribe(fn);
    history.pushState(null, '', '/jack/status/99');
    expect(fn).toHaveBeenCalled();
    expect(watcher.mode()).toBe('thread');
  });

  it('fires subscribers on replaceState', () => {
    watcher = createRouteWatcher();
    const fn = vi.fn();
    watcher.subscribe(fn);
    history.replaceState(null, '', '/jack');
    expect(fn).toHaveBeenCalled();
  });

  it('fires subscribers on popstate', () => {
    watcher = createRouteWatcher();
    const fn = vi.fn();
    watcher.subscribe(fn);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(fn).toHaveBeenCalled();
  });

  it('stop restores the original history.pushState reference', () => {
    const orig = history.pushState;
    watcher = createRouteWatcher();
    expect(history.pushState).not.toBe(orig);
    watcher.stop();
    expect(history.pushState).toBe(orig);
    watcher = undefined;
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/route-watcher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement route-watcher**

Create `src/content/route-watcher.ts`:

```ts
export type Mode = 'timeline' | 'thread';

export function urlToMode(url: string): Mode {
  const u = new URL(url);
  const parts = u.pathname.split('/').filter(Boolean);
  // /<user>/status/<id>[...]
  if (parts.length >= 3 && parts[1] === 'status') return 'thread';
  return 'timeline';
}

export interface RouteWatcher {
  mode(): Mode;
  subscribe(fn: (mode: Mode, url: string) => void): () => void;
  stop(): void;
}

export function createRouteWatcher(): RouteWatcher {
  let currentMode: Mode = urlToMode(location.href);
  const listeners = new Set<(m: Mode, url: string) => void>();

  const emit = () => {
    currentMode = urlToMode(location.href);
    for (const fn of listeners) fn(currentMode, location.href);
  };

  const origPush = history.pushState;
  const origReplace = history.replaceState;

  history.pushState = function (
    ...args: Parameters<typeof history.pushState>
  ) {
    origPush.apply(history, args);
    emit();
  };

  history.replaceState = function (
    ...args: Parameters<typeof history.replaceState>
  ) {
    origReplace.apply(history, args);
    emit();
  };

  const onPopState = () => emit();
  window.addEventListener('popstate', onPopState);

  return {
    mode: () => currentMode,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    stop: () => {
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener('popstate', onPopState);
      listeners.clear();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/route-watcher.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/content/route-watcher.ts tests/unit/route-watcher.test.ts
git commit -m "feat(route-watcher): detect timeline vs thread, emit on pushState/popstate"
```

---

## Task 5: Navigator

**Files:**
- Create: `src/content/navigator.ts`
- Create: `tests/unit/navigator.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/navigator.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Registry, TweetEntry } from '../../src/content/tweet-registry';
import type { RouteWatcher, Mode } from '../../src/content/route-watcher';
import { createNavigator } from '../../src/content/navigator';

function makeArticle(id: string): HTMLElement {
  const art = document.createElement('article');
  art.setAttribute('data-testid', 'tweet');
  art.setAttribute('tabindex', '0');
  const a = document.createElement('a');
  a.setAttribute('role', 'link');
  a.setAttribute('href', `/user/status/${id}`);
  const time = document.createElement('time');
  a.appendChild(time);
  art.appendChild(a);
  document.body.appendChild(art);
  return art;
}

function makeRegistry(entries: TweetEntry[]): Registry & { fire(): void } {
  const listeners = new Set<() => void>();
  const current = entries;
  return {
    current: () => current,
    findById: (id) => current.find((e) => e.id === id),
    nearestToViewport: () => current[0],
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    stop: () => listeners.clear(),
    fire: () => { for (const fn of listeners) fn(); },
  };
}

function makeRouter(mode: Mode = 'timeline') {
  const listeners = new Set<(m: Mode, url: string) => void>();
  let current = mode;
  return {
    mode: () => current,
    subscribe: (fn: (m: Mode, url: string) => void) => {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    stop: () => listeners.clear(),
    _setMode: (m: Mode) => {
      current = m;
      for (const fn of listeners) fn(m, location.href);
    },
  } as RouteWatcher & { _setMode(m: Mode): void };
}

function buildEntries(ids: string[]): TweetEntry[] {
  return ids.map((id) => ({ id, article: makeArticle(id), top: 0 }));
}

describe('createNavigator', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('first dispatch activates nearest-to-viewport tweet', () => {
    const entries = buildEntries(['a', 'b', 'c']);
    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      navigate: vi.fn(),
      goBack: vi.fn(),
    });
    nav.dispatch('next');
    // nearest was 'a', then next → 'b'
    expect(entries[1].article.getAttribute('data-xkbd-active')).toBe('true');
    expect(entries[0].article.getAttribute('data-xkbd-active')).toBeNull();
    nav.stop();
  });

  it('prev moves back one', () => {
    const entries = buildEntries(['a', 'b', 'c']);
    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      navigate: vi.fn(),
      goBack: vi.fn(),
    });
    nav.dispatch('next'); // a -> b
    nav.dispatch('next'); // b -> c
    nav.dispatch('prev'); // c -> b
    expect(entries[1].article.getAttribute('data-xkbd-active')).toBe('true');
    nav.stop();
  });

  it('first/last go to boundaries', () => {
    const entries = buildEntries(['a', 'b', 'c']);
    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      navigate: vi.fn(),
      goBack: vi.fn(),
    });
    nav.dispatch('last');
    expect(entries[2].article.getAttribute('data-xkbd-active')).toBe('true');
    nav.dispatch('first');
    expect(entries[0].article.getAttribute('data-xkbd-active')).toBe('true');
    nav.stop();
  });

  it('enter calls navigate with the permalink href', () => {
    const entries = buildEntries(['77']);
    const navigate = vi.fn();
    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter('timeline'),
      navigate,
      goBack: vi.fn(),
    });
    nav.dispatch('next'); // activates '77'
    nav.dispatch('enter');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0]).toContain('/user/status/77');
    nav.stop();
  });

  it('back calls goBack', () => {
    const entries = buildEntries(['a']);
    const goBack = vi.fn();
    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      navigate: vi.fn(),
      goBack,
    });
    nav.dispatch('back');
    expect(goBack).toHaveBeenCalled();
    nav.stop();
  });

  it('restores activeId when returning to timeline mode', () => {
    const entries = buildEntries(['a', 'b', 'c']);
    const registry = makeRegistry(entries);
    const router = makeRouter('timeline');
    const nav = createNavigator({
      registry, router, navigate: vi.fn(), goBack: vi.fn(),
    });
    nav.dispatch('next'); nav.dispatch('next'); // b
    nav.dispatch('enter'); // lastTimelineActiveId = b
    router._setMode('thread');
    expect(entries[1].article.getAttribute('data-xkbd-active')).toBeNull();
    router._setMode('timeline');
    expect(entries[1].article.getAttribute('data-xkbd-active')).toBe('true');
    nav.stop();
  });

  it('re-applies active attribute after registry rebuild (virtualization)', () => {
    const entries = buildEntries(['a', 'b']);
    const registry = makeRegistry(entries);
    const nav = createNavigator({
      registry, router: makeRouter(), navigate: vi.fn(), goBack: vi.fn(),
    });
    nav.dispatch('next'); nav.dispatch('next'); // activate 'b'
    // simulate b being unmounted then re-mounted (new DOM node)
    entries[1].article.remove();
    const newB = makeArticle('b');
    entries[1] = { id: 'b', article: newB, top: 0 };
    registry.fire();
    expect(newB.getAttribute('data-xkbd-active')).toBe('true');
    nav.stop();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/navigator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement navigator**

Create `src/content/navigator.ts`:

```ts
import type { Registry, TweetEntry } from './tweet-registry';
import type { RouteWatcher } from './route-watcher';
import { SELECTORS, queryFirst } from '../shared/selectors';

export type Command =
  | 'next'
  | 'prev'
  | 'first'
  | 'last'
  | 'enter'
  | 'back'
  | 'pageDown'
  | 'pageUp';

const ACTIVE_ATTR = 'data-xkbd-active';

export interface Navigator {
  dispatch(cmd: Command): void;
  stop(): void;
}

export interface NavigatorDeps {
  registry: Registry;
  router: RouteWatcher;
  navigate?: (url: string) => void;
  goBack?: () => void;
}

export function createNavigator(deps: NavigatorDeps): Navigator {
  const { registry, router } = deps;
  const navigate = deps.navigate ?? ((url: string) => location.assign(url));
  const goBack = deps.goBack ?? (() => history.back());

  let activeId: string | null = null;
  let lastTimelineActiveId: string | null = null;

  const paint = () => {
    document
      .querySelectorAll(`[${ACTIVE_ATTR}="true"]`)
      .forEach((el) => {
        if (el instanceof HTMLElement) el.removeAttribute(ACTIVE_ATTR);
      });
    if (!activeId) return;
    const entry = registry.findById(activeId);
    if (entry) entry.article.setAttribute(ACTIVE_ATTR, 'true');
  };

  const focusAndScroll = () => {
    if (!activeId) return;
    const entry = registry.findById(activeId);
    if (!entry) return;
    entry.article.focus({ preventScroll: true });
    entry.article.scrollIntoView({ block: 'nearest' });
  };

  const ensureActive = (): TweetEntry | undefined => {
    const entries = registry.current();
    if (entries.length === 0) return undefined;
    if (activeId) {
      const hit = registry.findById(activeId);
      if (hit) return hit;
    }
    const near = registry.nearestToViewport();
    if (!near) return undefined;
    activeId = near.id;
    paint();
    return near;
  };

  const moveTo = (id: string) => {
    activeId = id;
    paint();
    focusAndScroll();
  };

  const unsubRegistry = registry.subscribe(() => paint());

  const unsubRouter = router.subscribe((mode) => {
    if (mode === 'thread') {
      activeId = null;
      paint();
      return;
    }
    if (mode === 'timeline' && lastTimelineActiveId) {
      const tryRestore = (): boolean => {
        const hit = registry.findById(lastTimelineActiveId!);
        if (!hit) return false;
        activeId = lastTimelineActiveId;
        paint();
        return true;
      };
      if (!tryRestore()) {
        const off = registry.subscribe(() => {
          if (tryRestore()) off();
        });
      }
    }
  });

  return {
    dispatch(cmd) {
      const entries = registry.current();
      if (entries.length === 0) return;
      const cur = ensureActive();
      if (!cur) return;
      const idx = entries.findIndex((e) => e.id === cur.id);

      switch (cmd) {
        case 'next':
          if (idx < entries.length - 1) moveTo(entries[idx + 1].id);
          break;
        case 'prev':
          if (idx > 0) moveTo(entries[idx - 1].id);
          break;
        case 'first':
          moveTo(entries[0].id);
          break;
        case 'last':
          moveTo(entries[entries.length - 1].id);
          break;
        case 'enter': {
          if (!activeId) return;
          const entry = registry.findById(activeId);
          if (!entry) return;
          const link = queryFirst(
            SELECTORS.PERMALINK_IN_TWEET,
            entry.article,
          ) as HTMLAnchorElement | null;
          if (!link) return;
          if (router.mode() === 'timeline') lastTimelineActiveId = activeId;
          navigate(link.href);
          break;
        }
        case 'back':
          goBack();
          break;
        case 'pageDown':
        case 'pageUp': {
          const dir = cmd === 'pageDown' ? 1 : -1;
          window.scrollBy({
            top: dir * window.innerHeight * 0.9,
            behavior: 'auto',
          });
          requestAnimationFrame(() => {
            const near = registry.nearestToViewport();
            if (near) moveTo(near.id);
          });
          break;
        }
      }
    },
    stop() {
      unsubRegistry();
      unsubRouter();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/navigator.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/content/navigator.ts tests/unit/navigator.test.ts
git commit -m "feat(navigator): active-tweet state, move/enter/back, route-aware restore"
```

---

## Task 6: Key bindings

**Files:**
- Create: `src/content/key-bindings.ts`
- Create: `tests/unit/key-bindings.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/key-bindings.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachKeyBindings } from '../../src/content/key-bindings';

function fireKey(opts: KeyboardEventInit & { key: string; code?: string }) {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts });
  window.dispatchEvent(e);
  return e;
}

function makeDeps() {
  const dispatch = vi.fn();
  const toggleHelp = vi.fn();
  let open = false;
  return {
    dispatch,
    toggleHelp,
    setHelpOpen: (v: boolean) => { open = v; },
    bindings: {
      nav: { dispatch },
      toggleHelp,
      helpOpen: () => open,
    },
  };
}

describe('attachKeyBindings', () => {
  let detach: (() => void) | undefined;

  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { detach?.(); detach = undefined; });

  it('ArrowDown → next; j → next', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: 'ArrowDown' });
    fireKey({ key: 'j' });
    expect(dispatch).toHaveBeenNthCalledWith(1, 'next');
    expect(dispatch).toHaveBeenNthCalledWith(2, 'next');
  });

  it('ArrowUp → prev; k → prev', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: 'ArrowUp' });
    fireKey({ key: 'k' });
    expect(dispatch).toHaveBeenNthCalledWith(1, 'prev');
    expect(dispatch).toHaveBeenNthCalledWith(2, 'prev');
  });

  it('ArrowRight → enter, ArrowLeft/Escape → back', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: 'ArrowRight' });
    fireKey({ key: 'ArrowLeft' });
    fireKey({ key: 'Escape' });
    expect(dispatch).toHaveBeenNthCalledWith(1, 'enter');
    expect(dispatch).toHaveBeenNthCalledWith(2, 'back');
    expect(dispatch).toHaveBeenNthCalledWith(3, 'back');
  });

  it('Home → first, End → last, G → last', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: 'Home' });
    fireKey({ key: 'End' });
    fireKey({ key: 'G', shiftKey: true });
    expect(dispatch).toHaveBeenNthCalledWith(1, 'first');
    expect(dispatch).toHaveBeenNthCalledWith(2, 'last');
    expect(dispatch).toHaveBeenNthCalledWith(3, 'last');
  });

  it('gg sequence → first; single g alone does nothing', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: 'g' });
    expect(dispatch).not.toHaveBeenCalled();
    fireKey({ key: 'g' });
    expect(dispatch).toHaveBeenCalledWith('first');
  });

  it('Space → pageDown, Shift+Space → pageUp', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: ' ', code: 'Space' });
    fireKey({ key: ' ', code: 'Space', shiftKey: true });
    expect(dispatch).toHaveBeenNthCalledWith(1, 'pageDown');
    expect(dispatch).toHaveBeenNthCalledWith(2, 'pageUp');
  });

  it('? toggles help', () => {
    const { toggleHelp, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: '?' });
    expect(toggleHelp).toHaveBeenCalled();
  });

  it('no-op when focus is in a textarea', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    const e = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true });
    ta.dispatchEvent(e);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('no-op when a role=dialog is open', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    const dlg = document.createElement('div');
    dlg.setAttribute('role', 'dialog');
    document.body.appendChild(dlg);
    fireKey({ key: 'j' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('passes through unbound keys (like "l")', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    const e = fireKey({ key: 'l' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('preventDefault + stopImmediatePropagation on bound keys', () => {
    const { bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    const e = fireKey({ key: 'ArrowDown' });
    expect(e.defaultPrevented).toBe(true);
  });

  it('Ctrl/Meta/Alt modifiers are ignored', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: 'j', ctrlKey: true });
    fireKey({ key: 'j', metaKey: true });
    fireKey({ key: 'j', altKey: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('when help is open, ? and Esc route to toggleHelp; others are ignored', () => {
    const d = makeDeps();
    d.setHelpOpen(true);
    detach = attachKeyBindings(d.bindings);
    fireKey({ key: '?' });
    fireKey({ key: 'Escape' });
    fireKey({ key: 'j' });
    expect(d.toggleHelp).toHaveBeenCalledTimes(2);
    expect(d.dispatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/key-bindings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement key-bindings**

Create `src/content/key-bindings.ts`:

```ts
import type { Navigator, Command } from './navigator';

const SEQ_TIMEOUT_MS = 600;

export interface KeyBindingsDeps {
  nav: Pick<Navigator, 'dispatch'>;
  toggleHelp: () => void;
  helpOpen: () => boolean;
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function modalOpen(): boolean {
  return !!document.querySelector('[role="dialog"]');
}

export function attachKeyBindings(deps: KeyBindingsDeps): () => void {
  let pendingG = false;
  let pendingGTimer: number | null = null;

  const clearPendingG = () => {
    pendingG = false;
    if (pendingGTimer != null) {
      clearTimeout(pendingGTimer);
      pendingGTimer = null;
    }
  };

  const resolve = (e: KeyboardEvent): Command | 'help' | null => {
    if (deps.helpOpen()) {
      if (e.key === '?' || e.key === 'Escape') return 'help';
      return null;
    }
    if (isEditable(e.target) || isEditable(document.activeElement)) return null;
    if (modalOpen()) return null;

    if (e.code === 'Space') return e.shiftKey ? 'pageUp' : 'pageDown';

    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        return 'next';
      case 'ArrowUp':
      case 'k':
        return 'prev';
      case 'ArrowRight':
        return 'enter';
      case 'ArrowLeft':
      case 'Escape':
        return 'back';
      case 'Home':
        return 'first';
      case 'End':
      case 'G':
        return 'last';
      case 'g': {
        if (pendingG) {
          clearPendingG();
          return 'first';
        }
        pendingG = true;
        pendingGTimer = window.setTimeout(clearPendingG, SEQ_TIMEOUT_MS);
        return null;
      }
      case '?':
        return 'help';
    }
    return null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const action = resolve(e);
    if (!action) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (action === 'help') deps.toggleHelp();
    else deps.nav.dispatch(action);
  };

  window.addEventListener('keydown', onKeyDown, { capture: true });
  return () => {
    window.removeEventListener('keydown', onKeyDown, { capture: true });
    clearPendingG();
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/key-bindings.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/content/key-bindings.ts tests/unit/key-bindings.test.ts
git commit -m "feat(key-bindings): capture-phase listener with input/modal guards and gg sequence"
```

---

## Task 7: Highlight stylesheet

**Files:**
- Create: `src/styles/highlight.css`

- [ ] **Step 1: Write the stylesheet**

Create `src/styles/highlight.css`:

```css
article[data-xkbd-active="true"] {
  border-radius: 12px;
  box-shadow:
    inset 0 0 0 1px rgb(29, 155, 240),
    0 0 0 3px rgba(29, 155, 240, 0.18);
  transition: box-shadow 0.12s ease;
  outline: none;
}

article[data-xkbd-active="true"]:focus-visible {
  outline: none;
}
```

- [ ] **Step 2: Remove styles placeholder and commit**

Remove `src/styles/.gitkeep`.

```bash
git add src/styles/highlight.css
git rm src/styles/.gitkeep
git commit -m "feat(styles): highlight ring + glow for the active tweet"
```

---

## Task 8: Help overlay

**Files:**
- Create: `src/content/help-overlay.ts`
- Create: `tests/unit/help-overlay.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/help-overlay.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHelpOverlay } from '../../src/content/help-overlay';

describe('createHelpOverlay', () => {
  let overlay: ReturnType<typeof createHelpOverlay> | undefined;
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { overlay?.stop(); overlay = undefined; });

  it('toggle mounts a host element on first call', () => {
    overlay = createHelpOverlay();
    expect(overlay.isOpen()).toBe(false);
    overlay.toggle();
    expect(overlay.isOpen()).toBe(true);
    expect(document.body.querySelectorAll('*').length).toBeGreaterThan(0);
  });

  it('toggle twice closes the overlay', () => {
    overlay = createHelpOverlay();
    overlay.toggle();
    overlay.toggle();
    expect(overlay.isOpen()).toBe(false);
  });

  it('stop closes an open overlay', () => {
    overlay = createHelpOverlay();
    overlay.toggle();
    overlay.stop();
    expect(overlay.isOpen()).toBe(false);
    overlay = undefined;
  });

  it('renders content inside a shadow root', () => {
    overlay = createHelpOverlay();
    overlay.toggle();
    const host = document.body.lastElementChild as HTMLElement;
    expect(host.shadowRoot).not.toBeNull();
    expect(host.shadowRoot!.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/help-overlay.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement help-overlay**

Create `src/content/help-overlay.ts`:

```ts
const BINDINGS: ReadonlyArray<[string, string]> = [
  ['↓ / j', 'Next tweet'],
  ['↑ / k', 'Previous tweet'],
  ['→', 'Open tweet thread'],
  ['← / Esc', 'Back'],
  ['Home / gg', 'First tweet'],
  ['End / G', 'Last tweet'],
  ['Space / ⇧Space', 'Page down / up'],
  ['l', 'Like (X native)'],
  ['r', 'Reply (X native)'],
  ['t', 'Retweet (X native)'],
  ['b', 'Bookmark (X native)'],
  ['n', 'Compose (X native)'],
  ['?', 'Toggle help'],
];

export interface HelpOverlay {
  toggle(): void;
  isOpen(): boolean;
  stop(): void;
}

export function createHelpOverlay(): HelpOverlay {
  let host: HTMLDivElement | null = null;

  const onOutsideClick = (e: MouseEvent) => {
    if (!host) return;
    if (!e.composedPath().includes(host)) close();
  };

  const close = () => {
    window.removeEventListener('click', onOutsideClick, true);
    host?.remove();
    host = null;
  };

  const open = () => {
    host = document.createElement('div');
    host.dataset.xkbdHelp = '';
    const shadow = host.attachShadow({ mode: 'open' });
    const rows = BINDINGS.map(
      ([k, d]) => `<tr><td class="key">${k}</td><td class="desc">${d}</td></tr>`,
    ).join('');
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.6);
          z-index: 2147483647;
          display: flex; align-items: center; justify-content: center;
          font-family: -apple-system, system-ui, "Segoe UI", sans-serif;
        }
        .panel {
          background: #15202b; color: #e7e9ea;
          border-radius: 16px; padding: 22px 26px;
          min-width: 360px; max-width: 520px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        h2 { margin: 0 0 14px; font-size: 17px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 5px 0; font-size: 13px; vertical-align: top; }
        td.key {
          white-space: nowrap; padding-right: 18px;
          color: #1d9bf0;
          font-family: ui-monospace, SFMono-Regular, monospace;
        }
        td.desc { color: #e7e9ea; }
        .hint { margin-top: 14px; color: #8899a6; font-size: 12px; }
      </style>
      <div class="backdrop">
        <div class="panel" role="dialog" aria-label="Keyboard shortcuts">
          <h2>x-keyboard-first — shortcuts</h2>
          <table>${rows}</table>
          <div class="hint">Press ? or Esc to close</div>
        </div>
      </div>
    `;
    document.body.appendChild(host);
    // Defer so the click that opened the overlay does not immediately close it.
    setTimeout(
      () => window.addEventListener('click', onOutsideClick, true),
      0,
    );
  };

  return {
    toggle: () => (host ? close() : open()),
    isOpen: () => host != null,
    stop: () => close(),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/help-overlay.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/content/help-overlay.ts tests/unit/help-overlay.test.ts
git commit -m "feat(help-overlay): shadow-DOM shortcut list, toggle/close lifecycle"
```

---

## Task 9: Wire content script + build + manual load

**Files:**
- Create: `src/content/index.ts`
- Create: `public/icons/README.md` (small note for placeholder icons)
- Remove: `src/content/.gitkeep`

- [ ] **Step 1: Write the content script entry**

Create `src/content/index.ts`:

```ts
import { createRegistry } from './tweet-registry';
import { createRouteWatcher } from './route-watcher';
import { createNavigator } from './navigator';
import { attachKeyBindings } from './key-bindings';
import { createHelpOverlay } from './help-overlay';

function main() {
  const registry = createRegistry();
  const router = createRouteWatcher();
  const nav = createNavigator({ registry, router });
  const help = createHelpOverlay();

  const detach = attachKeyBindings({
    nav,
    toggleHelp: () => help.toggle(),
    helpOpen: () => help.isOpen(),
  });

  window.addEventListener(
    'pagehide',
    () => {
      detach();
      nav.stop();
      help.stop();
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

- [ ] **Step 2: Provide placeholder icons**

Icons must exist for the manifest. Use any three solid-color PNGs.

Run this from the project root:

```bash
node -e "const fs=require('fs');const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');['16','48','128'].forEach(s=>fs.writeFileSync('public/icons/icon-'+s+'.png',png));"
```

Expected: three `.png` files appear in `public/icons/`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Run the full unit suite**

Run: `npx vitest run`
Expected: all tests pass (≈ 36 tests).

- [ ] **Step 5: Build the extension**

Run: `npm run build`
Expected: `dist/` created, contains `manifest.json`, bundled JS for content script, `highlight.css`, and icons.

- [ ] **Step 6: Manual load-unpacked smoke check**

Open Chrome → `chrome://extensions` → toggle "Developer mode" → "Load unpacked" → select the `dist/` folder.

Open `https://x.com/` in a logged-in session. Confirm:
- Pressing `↓` highlights a tweet with the blue ring.
- `↓`/`↑` moves the highlight.
- `→` opens the highlighted tweet's thread.
- `←` returns to the timeline.
- `?` opens the overlay, `?` or `Esc` closes it.
- `l` (lowercase) likes the active tweet via X's native shortcut.
- No console errors under DevTools.

Record any issues and fix before moving on.

- [ ] **Step 7: Commit**

```bash
git add src/content/index.ts public/icons/
git rm src/content/.gitkeep
git commit -m "feat(content): wire modules, finalize manifest, placeholder icons"
```

---

## Task 10: Playwright integration tests against local fixtures

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/fixtures/x-timeline.html`
- Create: `tests/fixtures/x-thread.html`
- Create: `tests/e2e/navigation.spec.ts`

- [ ] **Step 1: Create the Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = resolve(__dirname, 'dist');

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    headless: true,
    launchOptions: {
      args: [
        `--disable-extensions-except=${distPath}`,
        `--load-extension=${distPath}`,
      ],
    },
  },
});
```

- [ ] **Step 2: Create the timeline fixture**

Create `tests/fixtures/x-timeline.html`:

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><title>fixture</title></head>
<body>
<main>
  <div aria-label="Timeline: Home">
    <div data-testid="cellInnerDiv">
      <article data-testid="tweet" tabindex="0">
        <a role="link" href="/user/status/111"><time>1</time></a>
        <div>First tweet</div>
      </article>
    </div>
    <div data-testid="cellInnerDiv">
      <article data-testid="tweet" tabindex="0">
        <a role="link" href="/user/status/222"><time>2</time></a>
        <div>Second tweet</div>
      </article>
    </div>
    <div data-testid="cellInnerDiv">
      <article data-testid="tweet" tabindex="0">
        <a role="link" href="/user/status/333"><time>3</time></a>
        <div>Third tweet</div>
      </article>
    </div>
  </div>
</main>
</body>
</html>
```

- [ ] **Step 3: Create the thread fixture**

Create `tests/fixtures/x-thread.html`:

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><title>fixture-thread</title></head>
<body>
<main>
  <div aria-label="Timeline: Conversation">
    <div data-testid="cellInnerDiv">
      <article data-testid="tweet" tabindex="0">
        <a role="link" href="/user/status/1000"><time>root</time></a>
        <div>Root tweet</div>
      </article>
    </div>
    <div data-testid="cellInnerDiv">
      <article data-testid="tweet" tabindex="0">
        <a role="link" href="/user/status/1001"><time>r1</time></a>
        <div>First reply</div>
      </article>
    </div>
    <div data-testid="cellInnerDiv">
      <article data-testid="tweet" tabindex="0">
        <a role="link" href="/user/status/1002"><time>r2</time></a>
        <div>Second reply</div>
      </article>
    </div>
  </div>
</main>
</body>
</html>
```

- [ ] **Step 4: Update manifest matches so extension loads on the fixtures**

The fixtures are served from `file://`. The MV3 content_script `matches` pattern does not cover `file://` by default. Add a dev-only match by editing `manifest.json` to include a file match for tests, gated behind a build flag, OR — simpler — run the fixtures from a local HTTP server inside the test and navigate to a URL that matches `*://x.com/*`.

Chosen approach: serve fixtures on `http://x.com.localhost/` via a tiny test server. The Chrome matches pattern accepts any host, but MV3 content scripts don't run on non-registered ports unless the host matches. Use `host_permissions` + `matches` updates:

Edit `manifest.json` — replace its `content_scripts[0].matches` with:

```json
"matches": ["*://x.com/*", "*://twitter.com/*", "http://localhost/*", "http://127.0.0.1/*"]
```

Then rebuild (`npm run build`) before running Playwright.

- [ ] **Step 5: Create the navigation spec**

Create `tests/e2e/navigation.spec.ts`:

```ts
import { test, expect, chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '..', 'fixtures');
const distDir = resolve(__dirname, '..', '..', 'dist');

let server: http.Server;
let port = 0;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const name = req.url === '/' || req.url === '/timeline'
      ? 'x-timeline.html'
      : req.url === '/thread'
        ? 'x-thread.html'
        : null;
    if (!name) { res.statusCode = 404; return res.end('nope'); }
    res.setHeader('content-type', 'text/html');
    res.end(readFileSync(resolve(fixturesDir, name)));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test('extension highlights on ArrowDown and moves across tweets', async () => {
  const userDataDir = resolve(__dirname, '.pw-profile');
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // extensions require headful or chromium headless=new
    args: [
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
      '--headless=new',
    ],
  });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/timeline`);
  await page.waitForSelector('article[data-testid="tweet"]');

  // First ArrowDown activates nearest → then next → second tweet
  await page.keyboard.press('ArrowDown');
  await expect(
    page.locator('article[data-xkbd-active="true"]'),
  ).toHaveAttribute('data-testid', 'tweet');

  const ids = await page.$$eval(
    'article[data-testid="tweet"]',
    (els) => els.map((el) => el.querySelector('a[href*="/status/"]')?.getAttribute('href')),
  );
  expect(ids).toEqual([
    '/user/status/111',
    '/user/status/222',
    '/user/status/333',
  ]);

  // Prev goes back
  await page.keyboard.press('ArrowUp');
  const activeHref = await page.$eval(
    'article[data-xkbd-active="true"] a[href*="/status/"]',
    (el) => (el as HTMLAnchorElement).getAttribute('href'),
  );
  expect(activeHref).toBe('/user/status/111');

  await ctx.close();
});

test('? opens the help overlay', async () => {
  const userDataDir = resolve(__dirname, '.pw-profile-2');
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    args: [
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
      '--headless=new',
    ],
  });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/timeline`);
  await page.waitForSelector('article[data-testid="tweet"]');
  await page.keyboard.press('Shift+/'); // produces '?'
  const dialog = await page.locator('div[data-xkbd-help]').first();
  await expect(dialog).toBeVisible();
  await ctx.close();
});
```

- [ ] **Step 6: Install Playwright browsers**

Run: `npx playwright install chromium`
Expected: downloads and installs Chromium build.

- [ ] **Step 7: Run integration tests**

Run: `npm run build && npx playwright test`
Expected: both tests pass.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts tests/fixtures tests/e2e manifest.json
echo ".pw-profile*" >> .gitignore
git add .gitignore
git commit -m "test(e2e): playwright fixtures for timeline nav and help overlay"
```

---

## Task 11: Docs and release prep

**Files:**
- Create: `README.md`
- Create: `TESTING.md`

- [ ] **Step 1: Write `README.md`**

Create `README.md`:

```markdown
# x-keyboard-first

A Chrome extension that makes X (twitter.com / x.com) keyboard-first.

## Features

- Highlights the currently active tweet with a blue ring.
- Arrow keys (+ `j`/`k`) navigate between tweets in any feed.
- `→` opens the highlighted tweet's thread; `←` (or `Esc`) returns.
- Works on home, profile, search, bookmarks, lists, and thread pages.
- Action keys (`l` like, `r` reply, `t` retweet, `b` bookmark, `n` compose) pass through to X's native shortcuts — they target the extension's active tweet automatically.
- `?` opens a shortcut cheat-sheet overlay.

## Install (dev)

```bash
npm install
npm run build
```

1. Chrome → `chrome://extensions` → enable "Developer mode".
2. "Load unpacked" → select the `dist/` folder.
3. Visit `https://x.com/` and start pressing keys.

## Scripts

- `npm run dev` — Vite in watch mode for the content script.
- `npm run build` — Production build into `dist/`.
- `npm test` — Vitest unit suite.
- `npm run e2e` — Playwright against local DOM fixtures.
- `npm run typecheck` — `tsc --noEmit`.

## Architecture

See `docs/superpowers/specs/2026-04-23-x-keyboard-first-design.md`.
```

- [ ] **Step 2: Write `TESTING.md`**

Create `TESTING.md`:

```markdown
# Manual smoke checklist

Run before every release.

**Setup:** `npm run build`, load `dist/` unpacked, sign in to X.

## Home timeline
- [ ] Press `↓`: a tweet gets a visible blue ring.
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
```

- [ ] **Step 3: Commit**

```bash
git add README.md TESTING.md
git commit -m "docs: add README and manual smoke TESTING checklist"
```

- [ ] **Step 4: Final verification**

Run in order:

```bash
npm run typecheck
npm test
npm run build
```

Expected: all exit 0.

- [ ] **Step 5: Final commit if anything is dirty**

```bash
git status
```

Expected: working tree clean. If not, commit any fixes with a descriptive message.
