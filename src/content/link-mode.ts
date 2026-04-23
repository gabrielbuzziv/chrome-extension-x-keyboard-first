import { SELECTORS, queryAll } from '../shared/selectors';
import type { Registry } from './tweet-registry';
import type { RouteWatcher } from './route-watcher';
import type { MediaItem, MediaModal } from './media-modal';

export type LinkTargetKind =
  | 'bodyUrl'
  | 'cardLink'
  | 'quotedTweet'
  | 'image'
  | 'video';

export interface LinkTarget {
  kind: LinkTargetKind;
  el: HTMLElement;
}

const MAX_TARGETS = 9;

export function enumerateTargets(article: HTMLElement): LinkTarget[] {
  const seen = new Set<HTMLElement>();
  const all: LinkTarget[] = [];
  const add = (kind: LinkTargetKind, el: HTMLElement) => {
    if (seen.has(el)) return;
    seen.add(el);
    all.push({ kind, el });
  };

  // Body URLs: scoped to outer tweetText (avoid nested quoted tweet text).
  const outerText = article.querySelector<HTMLElement>(
    ':scope > div [data-testid="tweetText"], :scope [data-testid="tweetText"]:not(article article [data-testid="tweetText"])',
  );
  if (outerText) {
    const urls = queryAll(SELECTORS.BODY_URL, outerText) as HTMLAnchorElement[];
    for (const a of urls) add('bodyUrl', a);
  }

  // Card wrapper.
  const cards = queryAll(SELECTORS.CARD, article) as HTMLElement[];
  for (const c of cards) add('cardLink', c);

  // Quoted tweet — nested article that is not the outer article.
  const quoted = Array.from(
    article.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
  ).filter((n) => n !== article);
  for (const q of quoted) add('quotedTweet', q);

  // Images.
  const imgs = queryAll(SELECTORS.IMAGE, article) as HTMLElement[];
  for (const i of imgs) add('image', i);

  // Video.
  const videos = queryAll(SELECTORS.VIDEO, article) as HTMLElement[];
  for (const v of videos) add('video', v);

  // Return in DOM order across categories using a document-order sort.
  all.sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  return all.slice(0, MAX_TARGETS);
}

export interface LinkMode {
  enter(): boolean;
  exit(): void;
  isActive(): boolean;
  handleKey(e: KeyboardEvent): void;
  stop(): void;
}

export interface LinkModeDeps {
  nav: { activeArticle: () => HTMLElement | null };
  registry: Pick<Registry, 'subscribe'>;
  router: Pick<RouteWatcher, 'subscribe'>;
  mediaModal: Pick<MediaModal, 'open'>;
}

export function createLinkMode(deps: LinkModeDeps): LinkMode {
  let active = false;
  let targets: LinkTarget[] = [];
  let article: HTMLElement | null = null;
  let host: HTMLDivElement | null = null;
  let shadow: ShadowRoot | null = null;
  let unsubRegistry: (() => void) | null = null;
  let unsubRouter: (() => void) | null = null;

  const paintBadges = (): void => {
    host = document.createElement('div');
    host.dataset.xkbdLinkMode = '';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .badge {
          position: absolute; pointer-events: none;
          background: linear-gradient(180deg, #1f2832, #131a22);
          color: #d6dde4; font: 700 12px/1 ui-monospace, Menlo, monospace;
          padding: 2px 6px; border-radius: 4px;
          box-shadow: 0 0 0 1px rgba(29,155,240,0.45),
                      0 4px 10px -4px rgba(0,0,0,0.7);
          z-index: 2147483646;
        }
      </style>
    `;
    document.body.appendChild(host);
    reposition();
  };

  const reposition = (): void => {
    if (!shadow) return;
    shadow.querySelectorAll('.badge').forEach((b) => b.remove());
    targets.forEach((t, i) => {
      const rect = t.el.getBoundingClientRect();
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.dataset.digit = String(i + 1);
      badge.textContent = String(i + 1);
      badge.style.top = `${rect.top + window.scrollY + 4}px`;
      badge.style.left = `${rect.left + window.scrollX + 4}px`;
      shadow!.appendChild(badge);
    });
  };

  const unpaintBadges = (): void => {
    host?.remove();
    host = null;
    shadow = null;
  };

  const doExit = (): void => {
    if (!active) return;
    active = false;
    targets = [];
    article = null;
    unpaintBadges();
    unsubRegistry?.();
    unsubRegistry = null;
    unsubRouter?.();
    unsubRouter = null;
  };

  const buildMediaItems = (root: HTMLElement): MediaItem[] => {
    const items: MediaItem[] = [];
    enumerateTargets(root).forEach((t) => {
      if (t.kind === 'image') {
        items.push({ kind: 'image', src: (t.el as HTMLImageElement).src });
      } else if (t.kind === 'video') {
        items.push({ kind: 'video', el: t.el as HTMLVideoElement });
      }
    });
    return items;
  };

  const activate = (t: LinkTarget): void => {
    switch (t.kind) {
      case 'bodyUrl':
      case 'cardLink': {
        const href =
          t.el instanceof HTMLAnchorElement
            ? t.el.href
            : (t.el.querySelector('a[href]') as HTMLAnchorElement | null)?.href;
        if (href) window.open(href, '_blank', 'noopener,noreferrer');
        return;
      }
      case 'quotedTweet': {
        const link = t.el.querySelector<HTMLAnchorElement>(
          'a[href*="/status/"][role="link"]',
        );
        if (link) link.click();
        return;
      }
      case 'image':
      case 'video': {
        const items = buildMediaItems(article!);
        const index = items.findIndex((m) =>
          m.kind === 'video' ? m.el === t.el : m.src === (t.el as HTMLImageElement).src,
        );
        if (index >= 0) deps.mediaModal.open(items, index);
        return;
      }
    }
  };

  return {
    enter(): boolean {
      if (active) return true;
      article = deps.nav.activeArticle();
      if (!article) return false;
      targets = enumerateTargets(article);
      if (targets.length === 0) return false;
      active = true;
      paintBadges();
      unsubRegistry = deps.registry.subscribe(() => {
        if (!article || !article.isConnected) doExit();
        else reposition();
      });
      unsubRouter = deps.router.subscribe(() => doExit());
      return true;
    },
    exit(): void {
      doExit();
    },
    isActive(): boolean {
      return active;
    },
    handleKey(e: KeyboardEvent): void {
      if (!active) return;
      if (e.key === 'Escape') {
        doExit();
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (i < targets.length) activate(targets[i]);
        doExit();
        return;
      }
      // Any other printable / functional key exits silently.
      doExit();
    },
    stop(): void {
      doExit();
    },
  };
}
