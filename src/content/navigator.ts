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
const THREAD_GAP_PX = 4;
const THREAD_MAX_WALK = 3;

function findGroupTop(entries: TweetEntry[], idx: number): TweetEntry {
  let i = idx;
  let walked = 0;
  while (i > 0 && walked < THREAD_MAX_WALK) {
    const prev = entries[i - 1].article.getBoundingClientRect();
    const cur = entries[i].article.getBoundingClientRect();
    if (cur.top - prev.bottom > THREAD_GAP_PX) break;
    i--;
    walked++;
  }
  return entries[i];
}

export interface Navigator {
  dispatch(cmd: Command): void;
  activeArticle(): HTMLElement | null;
  stop(): void;
}

export interface NavigatorDeps {
  registry: Registry;
  router: RouteWatcher;
  openLink?: (link: HTMLAnchorElement) => void;
  goBack?: () => void;
}

export function createNavigator(deps: NavigatorDeps): Navigator {
  const { registry, router } = deps;
  const openLink = deps.openLink ?? ((link: HTMLAnchorElement) => link.click());
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

  const SCROLL_PAD = 8;

  const topObstructionHeight = (): number => {
    if (typeof document.elementFromPoint !== 'function') return 0;
    const x = Math.max(1, Math.floor(window.innerWidth / 2));
    let node: Element | null = document.elementFromPoint(x, 1);
    while (node && node !== document.body) {
      const cs = getComputedStyle(node as HTMLElement);
      const top = parseFloat(cs.top || '0');
      if ((cs.position === 'sticky' || cs.position === 'fixed') && top <= 0) {
        return (node as HTMLElement).getBoundingClientRect().bottom;
      }
      node = node.parentElement;
    }
    return 0;
  };

  const focusAndScroll = () => {
    if (!activeId) return;
    const entry = registry.findById(activeId);
    if (!entry) return;
    entry.article.focus({ preventScroll: true });
    const list = registry.current();
    const idx = list.findIndex((e) => e.id === activeId);
    if (idx < 0) return;
    const groupTop = findGroupTop(list, idx);
    const rect = groupTop.article.getBoundingClientRect();
    const targetTop = topObstructionHeight() + SCROLL_PAD;
    window.scrollBy({ top: rect.top - targetTop, behavior: 'auto' });
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
    activeArticle() {
      const cur = ensureActive();
      return cur ? cur.article : null;
    },
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
        case 'last': {
          const toBottom = cmd === 'last';
          window.scrollTo({
            top: toBottom ? document.documentElement.scrollHeight : 0,
            behavior: 'auto',
          });
          requestAnimationFrame(() => {
            const list = registry.current();
            if (list.length === 0) return;
            moveTo((toBottom ? list[list.length - 1] : list[0]).id);
          });
          break;
        }
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
          openLink(link);
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
