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
