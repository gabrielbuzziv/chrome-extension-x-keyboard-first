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
      registry, router: makeRouter(), navigate: vi.fn(), goBack: vi.fn(),
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
      registry, router, navigate: vi.fn(), goBack: vi.fn(),
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

  it('stop cancels a pending restore subscription', () => {
    const entries = buildEntries(['a', 'b']);
    const registry = makeRegistry(entries);
    const router = makeRouter('timeline');
    const nav = createNavigator({
      registry, router, navigate: vi.fn(), goBack: vi.fn(),
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
});
