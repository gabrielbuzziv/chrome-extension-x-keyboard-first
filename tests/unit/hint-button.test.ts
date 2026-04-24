import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BINDINGS } from '../../src/shared/bindings';
import { createHintButton } from '../../src/content/hint-button';

describe('createHintButton', () => {
  let hint: ReturnType<typeof createHintButton> | undefined;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    hint?.stop();
    hint = undefined;
  });

  it('mounts a host element and removes it on stop', () => {
    hint = createHintButton({ onClick: vi.fn() });
    const host = document.querySelector('[data-xkbd-hint]') as HTMLElement | null;
    expect(host).not.toBeNull();
    hint.stop();
    expect(document.querySelector('[data-xkbd-hint]')).toBeNull();
    hint = undefined;
  });

  it('calls onClick when the trigger is pressed', () => {
    const onClick = vi.fn();
    hint = createHintButton({ onClick });
    const host = document.querySelector('[data-xkbd-hint]') as HTMLElement;
    const trigger = host.shadowRoot!.querySelector('.trigger') as HTMLButtonElement;
    trigger.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders simplified rows with hover and focus selectors', () => {
    hint = createHintButton({ onClick: vi.fn() });
    const host = document.querySelector('[data-xkbd-hint]') as HTMLElement;
    const shadow = host.shadowRoot!;
    const rows = shadow.querySelectorAll('li');
    expect(rows).toHaveLength(BINDINGS.length);
    expect(shadow.querySelector('.rail')).toBeNull();

    const styles = shadow.querySelector('style')?.textContent ?? '';
    expect(styles).toContain('.root:hover .card');
    expect(styles).toContain('.root:focus-within .card');
    expect(styles).not.toContain('transition:');
    expect(styles).not.toContain('@keyframes');
    expect(styles).not.toContain('animation:');
    expect(styles).not.toContain('translate');
    expect(styles).not.toContain('scale(');
  });
});
