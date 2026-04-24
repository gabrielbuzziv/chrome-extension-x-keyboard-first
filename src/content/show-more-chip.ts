import type { Registry } from './tweet-registry';
import { findShowMore } from './key-bindings';
import { THEME } from '../shared/theme';

export interface ShowMoreChip {
  stop(): void;
}

export interface ShowMoreChipDeps {
  nav: { activeArticle: () => HTMLElement | null };
  registry: Pick<Registry, 'subscribe'>;
}

export function createShowMoreChip(deps: ShowMoreChipDeps): ShowMoreChip {
  let host: HTMLDivElement | null = null;
  let repositionRaf: number | null = null;
  let listening = false;

  const clear = (): void => {
    host?.remove();
    host = null;
  };

  const detachListeners = (): void => {
    if (!listening) return;
    window.removeEventListener('scroll', scheduleReposition);
    window.removeEventListener('resize', scheduleReposition);
    listening = false;
  };

  const attachListeners = (): void => {
    if (listening) return;
    window.addEventListener('scroll', scheduleReposition, { passive: true });
    window.addEventListener('resize', scheduleReposition, { passive: true });
    listening = true;
  };

  const positionHost = (): void => {
    const article = deps.nav.activeArticle();
    const showMore = article ? findShowMore(article) : null;
    if (!host || !showMore) {
      clear();
      detachListeners();
      return;
    }
    const rect = showMore.getBoundingClientRect();
    host.style.top = `${rect.top + window.scrollY + Math.max(0, (rect.height - 24) / 2)}px`;
    host.style.left = `${rect.right + window.scrollX + 8}px`;
  };

  function scheduleReposition(): void {
    if (repositionRaf != null) return;
    repositionRaf = requestAnimationFrame(() => {
      repositionRaf = null;
      positionHost();
    });
  }

  const paint = (): void => {
    const article = deps.nav.activeArticle();
    const showMore = article ? findShowMore(article) : null;
    if (!showMore) {
      clear();
      detachListeners();
      return;
    }
    if (!host) {
      host = document.createElement('div');
      host.dataset.xkbdShowMoreChip = '';
      host.style.position = 'absolute';
      host.style.zIndex = '2147483645';
      host.style.pointerEvents = 'none';
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>
          :host { all: initial; }
          .chip {
            display: inline-flex;
            align-items: center;
            min-height: 24px;
            border-radius: 7px;
            border: 1px solid ${THEME.keyBorder};
            background: ${THEME.keySurface};
            color: ${THEME.text};
            padding: 0 8px;
            font: 700 12px/1 ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace;
            box-shadow:
              0 0 0 1px rgba(0, 0, 0, 0.18),
              0 8px 18px -12px rgba(0, 0, 0, 0.75);
            white-space: nowrap;
          }
        </style>
        <div class="chip" aria-hidden="true">Space</div>
      `;
      document.body.appendChild(host);
    }
    attachListeners();
    positionHost();
  };

  const unsub = deps.registry.subscribe(paint);

  return {
    stop(): void {
      unsub();
      detachListeners();
      if (repositionRaf != null) {
        cancelAnimationFrame(repositionRaf);
        repositionRaf = null;
      }
      clear();
    },
  };
}
