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
  const switchTab = vi.fn();
  const reload = vi.fn();
  let open = false;
  let active: HTMLElement | null = null;
  return {
    dispatch,
    toggleHelp,
    switchTab,
    reload,
    setHelpOpen: (v: boolean) => { open = v; },
    setActive: (el: HTMLElement | null) => { active = el; },
    bindings: {
      nav: { dispatch, activeArticle: () => active },
      toggleHelp,
      switchTab,
      reload,
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

  it('Space clicks "Show more" when focused post has one; Shift+Space still pages up', () => {
    const d = makeDeps();
    const article = document.createElement('article');
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'tweet-text-show-more-link');
    const click = vi.fn();
    btn.addEventListener('click', click);
    article.appendChild(btn);
    document.body.appendChild(article);
    d.setActive(article);
    detach = attachKeyBindings(d.bindings);

    fireKey({ key: ' ', code: 'Space' });
    expect(click).toHaveBeenCalledTimes(1);
    expect(d.dispatch).not.toHaveBeenCalled();

    fireKey({ key: ' ', code: 'Space', shiftKey: true });
    expect(d.dispatch).toHaveBeenCalledWith('pageUp');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('Space falls back to pageDown when focused post has no show-more', () => {
    const d = makeDeps();
    const article = document.createElement('article');
    document.body.appendChild(article);
    d.setActive(article);
    detach = attachKeyBindings(d.bindings);
    fireKey({ key: ' ', code: 'Space' });
    expect(d.dispatch).toHaveBeenCalledWith('pageDown');
  });

  it('t clicks translate button on focused post', () => {
    const d = makeDeps();
    const article = document.createElement('article');
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'tweet-text-show-translation-button');
    const click = vi.fn();
    btn.addEventListener('click', click);
    article.appendChild(btn);
    document.body.appendChild(article);
    d.setActive(article);
    detach = attachKeyBindings(d.bindings);
    const e = fireKey({ key: 't' });
    expect(click).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('t passes through when focused post has no translate button', () => {
    const d = makeDeps();
    const article = document.createElement('article');
    document.body.appendChild(article);
    d.setActive(article);
    detach = attachKeyBindings(d.bindings);
    const e = fireKey({ key: 't' });
    expect(e.defaultPrevented).toBe(false);
  });

  it('Space clicks show-more via text fallback ("Mostrar mais")', () => {
    const d = makeDeps();
    const article = document.createElement('article');
    const btn = document.createElement('button');
    btn.textContent = 'Mostrar mais';
    const click = vi.fn();
    btn.addEventListener('click', click);
    article.appendChild(btn);
    document.body.appendChild(article);
    d.setActive(article);
    detach = attachKeyBindings(d.bindings);
    fireKey({ key: ' ', code: 'Space' });
    expect(click).toHaveBeenCalledTimes(1);
    expect(d.dispatch).not.toHaveBeenCalled();
  });

  it('Space matches show-more via text when wrapped in nested spans with punctuation', () => {
    const d = makeDeps();
    const article = document.createElement('article');
    const btn = document.createElement('button');
    btn.innerHTML = '<span>· </span><span>Mostrar mais</span>';
    const click = vi.fn();
    btn.addEventListener('click', click);
    article.appendChild(btn);
    document.body.appendChild(article);
    d.setActive(article);
    detach = attachKeyBindings(d.bindings);
    fireKey({ key: ' ', code: 'Space' });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('Space matches show-more via aria-label when text is empty', () => {
    const d = makeDeps();
    const article = document.createElement('article');
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Mostrar mais');
    const click = vi.fn();
    btn.addEventListener('click', click);
    article.appendChild(btn);
    document.body.appendChild(article);
    d.setActive(article);
    detach = attachKeyBindings(d.bindings);
    fireKey({ key: ' ', code: 'Space' });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('Space clicks show-more on the focused article even when nav.activeArticle returns a different one', () => {
    const d = makeDeps();

    // nav.activeArticle returns a different, non-truncated article.
    const navActive = document.createElement('article');
    navActive.setAttribute('data-testid', 'tweet');
    document.body.appendChild(navActive);
    d.setActive(navActive);

    // A second article has the show-more and is actually focused.
    const focused = document.createElement('article');
    focused.setAttribute('data-testid', 'tweet');
    focused.tabIndex = 0;
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'tweet-text-show-more-link');
    const click = vi.fn();
    btn.addEventListener('click', click);
    focused.appendChild(btn);
    document.body.appendChild(focused);
    focused.focus();

    detach = attachKeyBindings(d.bindings);
    fireKey({ key: ' ', code: 'Space' });

    expect(click).toHaveBeenCalledTimes(1);
    expect(d.dispatch).not.toHaveBeenCalled();
  });

  it('Space does NOT click show-more inside a nested quoted tweet', () => {
    const d = makeDeps();
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'tweet');

    // Outer tweet text is plain (no show-more).
    const outerText = document.createElement('div');
    outerText.setAttribute('data-testid', 'tweetText');
    outerText.textContent = 'outer post body';
    article.appendChild(outerText);

    // Nested quoted tweet has a show-more button.
    const quoted = document.createElement('article');
    quoted.setAttribute('data-testid', 'tweet');
    const innerText = document.createElement('div');
    innerText.setAttribute('data-testid', 'tweetText');
    quoted.appendChild(innerText);
    const innerBtn = document.createElement('button');
    innerBtn.setAttribute('data-testid', 'tweet-text-show-more-link');
    const click = vi.fn();
    innerBtn.addEventListener('click', click);
    quoted.appendChild(innerBtn);
    article.appendChild(quoted);

    document.body.appendChild(article);
    d.setActive(article);
    detach = attachKeyBindings(d.bindings);

    fireKey({ key: ' ', code: 'Space' });
    expect(click).not.toHaveBeenCalled();
    expect(d.dispatch).toHaveBeenCalledWith('pageDown');
  });

  it('t clicks translate via text fallback ("Mostrar tradução")', () => {
    const d = makeDeps();
    const article = document.createElement('article');
    const btn = document.createElement('button');
    btn.textContent = 'Mostrar tradução';
    const click = vi.fn();
    btn.addEventListener('click', click);
    article.appendChild(btn);
    document.body.appendChild(article);
    d.setActive(article);
    detach = attachKeyBindings(d.bindings);
    fireKey({ key: 't' });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('t passes through when no post is focused', () => {
    const d = makeDeps();
    detach = attachKeyBindings(d.bindings);
    const e = fireKey({ key: 't' });
    expect(e.defaultPrevented).toBe(false);
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

  it('1 → switchTab(0), 2 → switchTab(1)', () => {
    const { switchTab, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    fireKey({ key: '1' });
    fireKey({ key: '2' });
    expect(switchTab).toHaveBeenNthCalledWith(1, 0);
    expect(switchTab).toHaveBeenNthCalledWith(2, 1);
  });

  it('1/2 are swallowed (preventDefault) and do not reach nav dispatch', () => {
    const { dispatch, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    const e1 = fireKey({ key: '1' });
    const e2 = fireKey({ key: '2' });
    expect(e1.defaultPrevented).toBe(true);
    expect(e2.defaultPrevented).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('1/2 do nothing when help is open', () => {
    const d = makeDeps();
    d.setHelpOpen(true);
    detach = attachKeyBindings(d.bindings);
    fireKey({ key: '1' });
    fireKey({ key: '2' });
    expect(d.switchTab).not.toHaveBeenCalled();
  });

  it('1/2 do nothing when focus is editable', () => {
    const { switchTab, bindings } = makeDeps();
    detach = attachKeyBindings(bindings);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const e = new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true });
    input.dispatchEvent(e);
    expect(switchTab).not.toHaveBeenCalled();
  });

  it('r calls reload; R (shifted) also calls reload', () => {
    const d = makeDeps();
    detach = attachKeyBindings(d.bindings);
    fireKey({ key: 'r' });
    fireKey({ key: 'R', shiftKey: true });
    expect(d.reload).toHaveBeenCalledTimes(2);
    expect(d.dispatch).not.toHaveBeenCalled();
  });

  it('r is swallowed (preventDefault)', () => {
    const d = makeDeps();
    detach = attachKeyBindings(d.bindings);
    const e = fireKey({ key: 'r' });
    expect(e.defaultPrevented).toBe(true);
  });

  it('r is ignored when help overlay is open', () => {
    const d = makeDeps();
    d.setHelpOpen(true);
    detach = attachKeyBindings(d.bindings);
    fireKey({ key: 'r' });
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('r is ignored when focus is editable', () => {
    const d = makeDeps();
    detach = attachKeyBindings(d.bindings);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const e = new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true });
    input.dispatchEvent(e);
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('r is ignored when a role=dialog is open', () => {
    const d = makeDeps();
    detach = attachKeyBindings(d.bindings);
    const dlg = document.createElement('div');
    dlg.setAttribute('role', 'dialog');
    document.body.appendChild(dlg);
    fireKey({ key: 'r' });
    expect(d.reload).not.toHaveBeenCalled();
  });

  it('. clicks the new-posts pill when it exists (via data-testid)', () => {
    const d = makeDeps();
    const pill = document.createElement('button');
    const label = document.createElement('span');
    label.setAttribute('data-testid', 'pillLabel');
    label.textContent = 'Mostrar 70 posts';
    pill.appendChild(label);
    const click = vi.fn();
    pill.addEventListener('click', click);
    document.body.appendChild(pill);
    detach = attachKeyBindings(d.bindings);
    const e = fireKey({ key: '.' });
    expect(click).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('. falls back to text match when the data-testid is missing', () => {
    const d = makeDeps();
    const pill = document.createElement('button');
    pill.textContent = 'Show 42 posts';
    const click = vi.fn();
    pill.addEventListener('click', click);
    document.body.appendChild(pill);
    detach = attachKeyBindings(d.bindings);
    fireKey({ key: '.' });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('. passes through when no pill exists (no preventDefault, no click)', () => {
    const d = makeDeps();
    detach = attachKeyBindings(d.bindings);
    const e = fireKey({ key: '.' });
    expect(e.defaultPrevented).toBe(false);
    expect(d.dispatch).not.toHaveBeenCalled();
  });

  it('. is ignored when focus is editable (X native new-post shortcut n stays safe)', () => {
    const d = makeDeps();
    const pill = document.createElement('button');
    pill.setAttribute('data-testid', 'pillLabel');
    pill.textContent = 'Show 5 posts';
    const click = vi.fn();
    pill.addEventListener('click', click);
    document.body.appendChild(pill);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    detach = attachKeyBindings(d.bindings);
    const e = new KeyboardEvent('keydown', { key: '.', bubbles: true, cancelable: true });
    input.dispatchEvent(e);
    expect(click).not.toHaveBeenCalled();
  });

  it('n / N are NOT handled by the extension (X native compose-post preserved)', () => {
    const d = makeDeps();
    detach = attachKeyBindings(d.bindings);
    const e1 = fireKey({ key: 'n' });
    const e2 = fireKey({ key: 'N', shiftKey: true });
    expect(e1.defaultPrevented).toBe(false);
    expect(e2.defaultPrevented).toBe(false);
    expect(d.dispatch).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
  });
});
