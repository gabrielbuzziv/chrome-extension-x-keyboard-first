import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachKeyBindings } from '../../src/content/key-bindings';

function fireKey(opts: KeyboardEventInit & { key: string; code?: string }) {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts });
  window.dispatchEvent(e);
  return e;
}

function makeDeps() {
  const dispatch = vi.fn();
  const toggleHelp = vi.fn();
  let open = false;
  return {
    dispatch,
    toggleHelp,
    setHelpOpen: (v: boolean) => { open = v; },
    bindings: {
      nav: { dispatch },
      toggleHelp,
      helpOpen: () => open,
    },
  };
}

describe('attachKeyBindings', () => {
  let detach: (() => void) | undefined;

  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { detach?.(); detach = undefined; });

  it('ArrowDown → next; j → next', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: 'ArrowDown' });
    fireKey({ key: 'j' });
    expect(dispatch).toHaveBeenNthCalledWith(1, 'next');
    expect(dispatch).toHaveBeenNthCalledWith(2, 'next');
  });

  it('ArrowUp → prev; k → prev', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: 'ArrowUp' });
    fireKey({ key: 'k' });
    expect(dispatch).toHaveBeenNthCalledWith(1, 'prev');
    expect(dispatch).toHaveBeenNthCalledWith(2, 'prev');
  });

  it('ArrowRight → enter, ArrowLeft/Escape → back', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: 'ArrowRight' });
    fireKey({ key: 'ArrowLeft' });
    fireKey({ key: 'Escape' });
    expect(dispatch).toHaveBeenNthCalledWith(1, 'enter');
    expect(dispatch).toHaveBeenNthCalledWith(2, 'back');
    expect(dispatch).toHaveBeenNthCalledWith(3, 'back');
  });

  it('Home → first, End → last, G → last', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: 'Home' });
    fireKey({ key: 'End' });
    fireKey({ key: 'G', shiftKey: true });
    expect(dispatch).toHaveBeenNthCalledWith(1, 'first');
    expect(dispatch).toHaveBeenNthCalledWith(2, 'last');
    expect(dispatch).toHaveBeenNthCalledWith(3, 'last');
  });

  it('gg sequence → first; single g alone does nothing', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: 'g' });
    expect(dispatch).not.toHaveBeenCalled();
    fireKey({ key: 'g' });
    expect(dispatch).toHaveBeenCalledWith('first');
  });

  it('Space → pageDown, Shift+Space → pageUp', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: ' ', code: 'Space' });
    fireKey({ key: ' ', code: 'Space', shiftKey: true });
    expect(dispatch).toHaveBeenNthCalledWith(1, 'pageDown');
    expect(dispatch).toHaveBeenNthCalledWith(2, 'pageUp');
  });

  it('? toggles help', () => {
    const { toggleHelp, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: '?' });
    expect(toggleHelp).toHaveBeenCalled();
  });

  it('no-op when focus is in a textarea', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    const e = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true });
    ta.dispatchEvent(e);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('no-op when a role=dialog is open', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    const dlg = document.createElement('div');
    dlg.setAttribute('role', 'dialog');
    document.body.appendChild(dlg);
    fireKey({ key: 'j' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('passes through unbound keys (like "l")', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    const e = fireKey({ key: 'l' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('preventDefault + stopImmediatePropagation on bound keys', () => {
    const { bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    const e = fireKey({ key: 'ArrowDown' });
    expect(e.defaultPrevented).toBe(true);
  });

  it('Ctrl/Meta/Alt modifiers are ignored', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: 'j', ctrlKey: true });
    fireKey({ key: 'j', metaKey: true });
    fireKey({ key: 'j', altKey: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('when help is open, ? and Esc route to toggleHelp; others are ignored', () => {
    const d = makeDeps();
    d.setHelpOpen(true);
    detach = attachKeyBindings(d.bindings);
    fireKey({ key: '?' });
    fireKey({ key: 'Escape' });
    fireKey({ key: 'j' });
    expect(d.toggleHelp).toHaveBeenCalledTimes(2);
    expect(d.dispatch).not.toHaveBeenCalled();
  });
});
