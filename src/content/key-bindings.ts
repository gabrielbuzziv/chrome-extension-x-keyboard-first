import type { Navigator, Command } from './navigator';

const SEQ_TIMEOUT_MS = 600;

export interface KeyBindingsDeps {
  nav: Pick<Navigator, 'dispatch'>;
  toggleHelp: () => void;
  helpOpen: () => boolean;
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function modalOpen(): boolean {
  return !!document.querySelector('[role="dialog"]');
}

export function attachKeyBindings(deps: KeyBindingsDeps): () => void {
  let pendingG = false;
  let pendingGTimer: number | null = null;

  const clearPendingG = () => {
    pendingG = false;
    if (pendingGTimer != null) {
      clearTimeout(pendingGTimer);
      pendingGTimer = null;
    }
  };

  const resolve = (e: KeyboardEvent): Command | 'help' | null => {
    if (deps.helpOpen()) {
      if (e.key === '?' || e.key === 'Escape') return 'help';
      return null;
    }
    if (isEditable(e.target) || isEditable(document.activeElement)) return null;
    if (modalOpen()) return null;

    if (e.code === 'Space') return e.shiftKey ? 'pageUp' : 'pageDown';

    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        return 'next';
      case 'ArrowUp':
      case 'k':
        return 'prev';
      case 'ArrowRight':
        return 'enter';
      case 'ArrowLeft':
      case 'Escape':
        return 'back';
      case 'Home':
        return 'first';
      case 'End':
      case 'G':
        return 'last';
      case 'g': {
        if (pendingG) {
          clearPendingG();
          return 'first';
        }
        pendingG = true;
        pendingGTimer = window.setTimeout(clearPendingG, SEQ_TIMEOUT_MS);
        return null;
      }
      case '?':
        return 'help';
    }
    return null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const action = resolve(e);
    if (!action) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (action === 'help') deps.toggleHelp();
    else deps.nav.dispatch(action);
  };

  window.addEventListener('keydown', onKeyDown, { capture: true });
  return () => {
    window.removeEventListener('keydown', onKeyDown, { capture: true });
    clearPendingG();
  };
}
