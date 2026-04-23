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
