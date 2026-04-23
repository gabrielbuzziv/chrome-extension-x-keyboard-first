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
