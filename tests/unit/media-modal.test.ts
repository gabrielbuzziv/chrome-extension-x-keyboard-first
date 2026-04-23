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
