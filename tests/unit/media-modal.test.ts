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

  it('handleKey Escape closes the modal', () => {
    modal = createMediaModal();
    modal.open(itemsFor(1), 0);
    modal.handleKey(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(modal.isOpen()).toBe(false);
  });
});
