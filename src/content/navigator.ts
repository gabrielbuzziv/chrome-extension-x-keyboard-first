import type { Registry, TweetEntry } from './tweet-registry';
import type { RouteWatcher } from './route-watcher';
import { SELECTORS, queryFirst } from '../shared/selectors';

export type Command =
  | 'next'
  | 'prev'
  | 'first'
  | 'last'
  | 'enter'
  | 'back'
  | 'pageDown'
  | 'pageUp';

const ACTIVE_ATTR = 'data-xkbd-active';

export interface Navigator {
  dispatch(cmd: Command): void;
  stop(): void;
}

export interface NavigatorDeps {
  registry: Registry;
  router: RouteWatcher;
  navigate?: (url: string) => void;
  goBack?: () => void;
}

export function createNavigator(deps: NavigatorDeps): Navigator {
  const { registry, router } = deps;
  const navigate = deps.navigate ?? ((url: string) => location.assign(url));
  const goBack = deps.goBack ?? (() => history.back());

  let activeId: string | null = null;
  let lastTimelineActiveId: string | null = null;
  let pendingRestoreOff: (() => void) | null = null;

  const cancelPendingRestore = () => {
    if (pendingRestoreOff) {
      pendingRestoreOff();
      pendingRestoreOff = null;
    }
  };

  const paint = () => {
    document
      .querySelectorAll(`[${ACTIVE_ATTR}="true"]`)
      .forEach((el) => {
        if (el instanceof HTMLElement) el.removeAttribute(ACTIVE_ATTR);
      });
    if (!activeId) return;
    const entry = registry.findById(activeId);
    if (entry) entry.article.setAttribute(ACTIVE_ATTR, 'true');
  };

  const focusAndScroll = () => {
    if (!activeId) return;
    const entry = registry.findById(activeId);
    if (!entry) return;
    entry.article.focus({ preventScroll: true });
    entry.article.scrollIntoView?.({ block: 'nearest' });
  };

  const ensureActive = (): TweetEntry | undefined => {
    const entries = registry.current();
    if (entries.length === 0) return undefined;
    if (activeId) {
      const hit = registry.findById(activeId);
      if (hit) return hit;
    }
    const near = registry.nearestToViewport();
    if (!near) return undefined;
    activeId = near.id;
    paint();
    return near;
  };

  const moveTo = (id: string) => {
    activeId = id;
    paint();
    focusAndScroll();
  };

  const unsubRegistry = registry.subscribe(() => paint());

  const unsubRouter = router.subscribe((mode) => {
    cancelPendingRestore();
    if (mode === 'thread') {
      activeId = null;
      paint();
      return;
    }
    if (mode === 'timeline' && lastTimelineActiveId) {
      const tryRestore = (): boolean => {
        const hit = registry.findById(lastTimelineActiveId!);
        if (!hit) return false;
        activeId = lastTimelineActiveId;
        paint();
        return true;
      };
      if (!tryRestore()) {
        pendingRestoreOff = registry.subscribe(() => {
          if (tryRestore()) cancelPendingRestore();
        });
      }
    }
  });

  return {
    dispatch(cmd) {
      const entries = registry.current();
      if (entries.length === 0) return;
      const cur = ensureActive();
      if (!cur) return;
      const idx = entries.findIndex((e) => e.id === cur.id);

      switch (cmd) {
        case 'next':
          if (idx < entries.length - 1) moveTo(entries[idx + 1].id);
          break;
        case 'prev':
          if (idx > 0) moveTo(entries[idx - 1].id);
          break;
        case 'first':
          moveTo(entries[0].id);
          break;
        case 'last':
          moveTo(entries[entries.length - 1].id);
          break;
        case 'enter': {
          if (!activeId) return;
          const entry = registry.findById(activeId);
          if (!entry) return;
          const link = queryFirst(
            SELECTORS.PERMALINK_IN_TWEET,
            entry.article,
          ) as HTMLAnchorElement | null;
          if (!link) return;
          if (router.mode() === 'timeline') lastTimelineActiveId = activeId;
          navigate(link.href);
          break;
        }
        case 'back':
          goBack();
          break;
        case 'pageDown':
        case 'pageUp': {
          const dir = cmd === 'pageDown' ? 1 : -1;
          window.scrollBy({
            top: dir * window.innerHeight * 0.9,
            behavior: 'auto',
          });
          requestAnimationFrame(() => {
            const near = registry.nearestToViewport();
            if (near) moveTo(near.id);
          });
          break;
        }
      }
    },
    stop() {
      cancelPendingRestore();
      unsubRegistry();
      unsubRouter();
    },
  };
}
