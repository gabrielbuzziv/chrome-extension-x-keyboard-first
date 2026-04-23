import { describe, it, expect, vi } from 'vitest';
import { createLinkMode, enumerateTargets } from '../../src/content/link-mode';

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
});
