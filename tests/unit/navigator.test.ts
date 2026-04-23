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

describe('createNavigator', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('first dispatch activates nearest-to-viewport tweet', () => {
    const entries = buildEntries(['a', 'b', 'c']);
    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      openLink: vi.fn(),
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
      openLink: vi.fn(),
      goBack: vi.fn(),
    });
    nav.dispatch('next'); // a -> b
    nav.dispatch('next'); // b -> c
    nav.dispatch('prev'); // c -> b
    expect(entries[1].article.getAttribute('data-xkbd-active')).toBe('true');
    nav.stop();
  });

  it('first/last go to boundaries', async () => {
    const entries = buildEntries(['a', 'b', 'c']);
    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      openLink: vi.fn(),
      goBack: vi.fn(),
    });
    nav.dispatch('last');
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(entries[2].article.getAttribute('data-xkbd-active')).toBe('true');
    nav.dispatch('first');
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(entries[0].article.getAttribute('data-xkbd-active')).toBe('true');
    nav.stop();
  });

  it('enter clicks the permalink anchor (so X SPA router handles nav)', () => {
    const entries = buildEntries(['77']);
    const openLink = vi.fn();
    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter('timeline'),
      openLink,
      goBack: vi.fn(),
    });
    nav.dispatch('next'); // activates '77'
    nav.dispatch('enter');
    expect(openLink).toHaveBeenCalledTimes(1);
    const link = openLink.mock.calls[0][0] as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('/user/status/77');
    nav.stop();
  });

  it('back calls goBack', () => {
    const entries = buildEntries(['a']);
    const goBack = vi.fn();
    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      openLink: vi.fn(),
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
      registry, router, openLink: vi.fn(), goBack: vi.fn(),
    });
    nav.dispatch('next'); nav.dispatch('next'); // active is now 'c'
    nav.dispatch('enter'); // saves lastTimelineActiveId = 'c'
    router._setMode('thread');
    expect(entries[2].article.getAttribute('data-xkbd-active')).toBeNull();
    router._setMode('timeline');
    expect(entries[2].article.getAttribute('data-xkbd-active')).toBe('true');
    nav.stop();
  });

  it('re-applies active attribute after registry rebuild (virtualization)', () => {
    const entries = buildEntries(['a', 'b']);
    const registry = makeRegistry(entries);
    const nav = createNavigator({
      registry, router: makeRouter(), openLink: vi.fn(), goBack: vi.fn(),
    });
    nav.dispatch('next'); nav.dispatch('next'); // activate 'b'
    entries[1].article.remove();
    const newB = makeArticle('b');
    entries[1] = { id: 'b', article: newB, top: 0 };
    registry.fire();
    expect(newB.getAttribute('data-xkbd-active')).toBe('true');
    nav.stop();
  });

  it('polling restore works when tweet re-mounts after registry rebuild', () => {
    const entries = buildEntries(['a', 'b', 'c']);
    const registry = makeRegistry(entries);
    const router = makeRouter('timeline');
    const nav = createNavigator({
      registry, router, openLink: vi.fn(), goBack: vi.fn(),
    });
    nav.dispatch('next'); // active 'b'
    nav.dispatch('enter'); // saves 'b'
    router._setMode('thread');

    // Simulate 'b' being unmounted while on thread
    const originalB = entries[1];
    entries.splice(1, 1); // remove 'b' from registry's array
    router._setMode('timeline');

    // 'b' is not present — polling subscription should be active
    expect(originalB.article.getAttribute('data-xkbd-active')).toBeNull();

    // Now 'b' comes back (new DOM node after re-mount)
    const newB = makeArticle('b');
    entries.splice(1, 0, { id: 'b', article: newB, top: 0 });
    registry.fire();

    expect(newB.getAttribute('data-xkbd-active')).toBe('true');
    nav.stop();
  });

  it('activeArticle returns the currently active article element', () => {
    const entries = buildEntries(['a', 'b', 'c']);
    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      openLink: vi.fn(),
      goBack: vi.fn(),
    });
    nav.dispatch('next'); // activates 'b'
    expect(nav.activeArticle()).toBe(entries[1].article);
    nav.stop();
  });

  it('activeArticle returns null when registry is empty', () => {
    const nav = createNavigator({
      registry: makeRegistry([]),
      router: makeRouter(),
      openLink: vi.fn(),
      goBack: vi.fn(),
    });
    expect(nav.activeArticle()).toBeNull();
    nav.stop();
  });

  it('stop cancels a pending restore subscription', () => {
    const entries = buildEntries(['a', 'b']);
    const registry = makeRegistry(entries);
    const router = makeRouter('timeline');
    const nav = createNavigator({
      registry, router, openLink: vi.fn(), goBack: vi.fn(),
    });
    nav.dispatch('next'); // 'b'
    nav.dispatch('enter'); // saves 'b'
    router._setMode('thread');
    entries.splice(1, 1); // remove 'b'
    router._setMode('timeline'); // triggers polling subscribe
    nav.stop();

    // Add 'b' back; since nav.stop() cleared the pending subscription,
    // firing the registry should NOT mutate DOM activation state.
    const newB = makeArticle('b');
    entries.splice(1, 0, { id: 'b', article: newB, top: 0 });
    registry.fire();
    expect(newB.getAttribute('data-xkbd-active')).toBeNull();
  });

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
});
