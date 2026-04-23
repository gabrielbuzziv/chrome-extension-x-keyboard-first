export type Mode = 'timeline' | 'thread';

export function urlToMode(url: string): Mode {
  const u = new URL(url);
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length >= 3 && parts[1] === 'status') return 'thread';
  return 'timeline';
}

export interface RouteWatcher {
  mode(): Mode;
  subscribe(fn: (mode: Mode, url: string) => void): () => void;
  stop(): void;
}

export function createRouteWatcher(): RouteWatcher {
  let currentMode: Mode = urlToMode(location.href);
  const listeners = new Set<(m: Mode, url: string) => void>();

  const emit = () => {
    currentMode = urlToMode(location.href);
    for (const fn of listeners) fn(currentMode, location.href);
  };

  const origPush = history.pushState;
  const origReplace = history.replaceState;

  history.pushState = function (
    ...args: Parameters<typeof history.pushState>
  ) {
    origPush.apply(history, args);
    emit();
  };

  history.replaceState = function (
    ...args: Parameters<typeof history.replaceState>
  ) {
    origReplace.apply(history, args);
    emit();
  };

  const onPopState = () => emit();
  window.addEventListener('popstate', onPopState);

  return {
    mode: () => currentMode,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    stop: () => {
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener('popstate', onPopState);
      listeners.clear();
    },
  };
}
