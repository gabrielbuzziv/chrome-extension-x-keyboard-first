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
});
