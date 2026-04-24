import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  beforeEach(() => {
    document.body.innerHTML = '';
    document.elementFromPoint = vi.fn(() => null);
    window.scrollBy = vi.fn() as unknown as typeof window.scrollBy;
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });

  it('first next dispatch activates the first tweet', () => {
    const entries = buildEntries(['a', 'b', 'c']);
    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      openLink: vi.fn(),
      goBack: vi.fn(),
    });
    nav.dispatch('next');
    expect(entries[0].article.getAttribute('data-xkbd-active')).toBe('true');
    expect(entries[1].article.getAttribute('data-xkbd-active')).toBeNull();
    nav.stop();
  });

  it('first next dispatch skips entries above the sticky tabs', () => {
    const entries = buildEntries(['a', 'b', 'c']);
    mockRect(entries[0].article, -300, 100);
    mockRect(entries[1].article, 80, 100);
    mockRect(entries[2].article, 260, 100);

    const scrollBy = vi.fn();
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy;

    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      openLink: vi.fn(),
      goBack: vi.fn(),
    });
    nav.dispatch('next');
    expect(entries[1].article.getAttribute('data-xkbd-active')).toBe('true');
    expect(scrollBy).toHaveBeenCalledWith({ top: 72, behavior: 'auto' });
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
    nav.dispatch('next'); // activates a
    nav.dispatch('next'); // a -> b
    nav.dispatch('prev'); // b -> a
    expect(entries[0].article.getAttribute('data-xkbd-active')).toBe('true');
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
    const router = makeRouter('timeline');
    const goBack = vi.fn();
    const navigateHome = vi.fn();
    const nav = createNavigator({
      registry: makeRegistry(entries),
      router,
      openLink: vi.fn(),
      goBack,
      navigateHome,
    });
    nav.dispatch('next');
    nav.dispatch('enter');
    router._setMode('thread');
    nav.dispatch('back');
    expect(goBack).toHaveBeenCalled();
    expect(navigateHome).not.toHaveBeenCalled();
    nav.stop();
  });

  it('back falls back to home timeline when there is no local history', () => {
    const entries = buildEntries(['a']);
    const goBack = vi.fn();
    const navigateHome = vi.fn();
    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter('thread'),
      openLink: vi.fn(),
      goBack,
      navigateHome,
    });
    nav.dispatch('back');
    expect(goBack).not.toHaveBeenCalled();
    expect(navigateHome).toHaveBeenCalled();
    nav.stop();
  });

  it('back does nothing on timeline', () => {
    const entries = buildEntries(['a']);
    const goBack = vi.fn();
    const navigateHome = vi.fn();
    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter('timeline'),
      openLink: vi.fn(),
      goBack,
      navigateHome,
    });

    nav.dispatch('back');

    expect(goBack).not.toHaveBeenCalled();
    expect(navigateHome).not.toHaveBeenCalled();
    nav.stop();
  });

  it('back on a direct-entry thread navigates to timeline without using history', () => {
    const entries = buildEntries(['a']);
    const goBack = vi.fn();
    const navigateHome = vi.fn();
    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter('thread'),
      openLink: vi.fn(),
      goBack,
      navigateHome,
    });

    nav.dispatch('back');

    expect(goBack).not.toHaveBeenCalled();
    expect(navigateHome).toHaveBeenCalledTimes(1);
    nav.stop();
  });

  it('restores activeId when returning to timeline mode', () => {
    const entries = buildEntries(['a', 'b', 'c']);
    const registry = makeRegistry(entries);
    const router = makeRouter('timeline');
    const nav = createNavigator({
      registry, router, openLink: vi.fn(), goBack: vi.fn(),
    });
    nav.dispatch('next'); nav.dispatch('next'); nav.dispatch('next'); // active is now 'c'
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
    nav.dispatch('next'); nav.dispatch('next'); // active 'b'
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
    nav.dispatch('next'); // activates 'a'
    expect(nav.activeArticle()).toBe(entries[0].article);
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
    nav.dispatch('next'); nav.dispatch('next'); // 'b'
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

  it('next scrolls the active article to the top padding on first activation', () => {
    const entries = buildEntries(['a', 'b', 'c']);
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
    nav.dispatch('next');
    expect(entries[0].article.getAttribute('data-xkbd-active')).toBe('true');
    expect(scrollBy).toHaveBeenCalledWith({ top: 492, behavior: 'auto' });
    nav.stop();
  });

  it('next respects the sticky navigation tabs offset when scrolling', () => {
    const entries = buildEntries(['a', 'b']);
    mockRect(entries[0].article, 420, 100);
    mockRect(entries[1].article, 700, 100);

    const stickyTabs = document.createElement('div');
    stickyTabs.style.position = 'sticky';
    stickyTabs.style.top = '0px';
    stickyTabs.getBoundingClientRect = () =>
      ({
        top: 0,
        bottom: 52,
        left: 0,
        right: 800,
        width: 800,
        height: 52,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(stickyTabs);
    document.elementFromPoint = vi.fn(() => stickyTabs);

    const scrollBy = vi.fn();
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy;

    const nav = createNavigator({
      registry: makeRegistry(entries),
      router: makeRouter(),
      openLink: vi.fn(),
      goBack: vi.fn(),
    });
    nav.dispatch('next');
    expect(scrollBy).toHaveBeenCalledWith({ top: 360, behavior: 'auto' });
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
