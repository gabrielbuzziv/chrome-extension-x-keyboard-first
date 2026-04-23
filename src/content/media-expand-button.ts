import type { Registry } from './tweet-registry';
import type { MediaModal, MediaItem } from './media-modal';
import { SELECTORS, queryAll } from '../shared/selectors';

export interface MediaExpandButton {
  stop(): void;
}

export interface MediaExpandButtonDeps {
  nav: { activeArticle: () => HTMLElement | null };
  registry: Pick<Registry, 'subscribe'>;
  mediaModal: Pick<MediaModal, 'open'>;
}

export function createMediaExpandButton(
  deps: MediaExpandButtonDeps,
): MediaExpandButton {
  const rendered: HTMLElement[] = [];
  let repositionRaf: number | null = null;
  let listening = false;

  const reposition = (): void => {
    if (rendered.length === 0) return;
    const article = deps.nav.activeArticle();
    if (!article) return;
    const videos = queryAll(SELECTORS.VIDEO, article) as HTMLVideoElement[];
    rendered.forEach((host, i) => {
      const video = videos[i];
      if (!video) return;
      const rect = video.getBoundingClientRect();
      host.style.top = `${rect.top + window.scrollY + 6}px`;
      host.style.left = `${rect.right + window.scrollX - 34}px`;
    });
  };

  const scheduleReposition = (): void => {
    if (repositionRaf != null) return;
    repositionRaf = requestAnimationFrame(() => {
      repositionRaf = null;
      reposition();
    });
  };

  const onScrollOrResize = (): void => scheduleReposition();

  const ensureListeners = (): void => {
    if (listening) return;
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    listening = true;
  };

  const removeListeners = (): void => {
    if (!listening) return;
    window.removeEventListener('scroll', onScrollOrResize);
    window.removeEventListener('resize', onScrollOrResize);
    listening = false;
  };

  const clear = () => {
    removeListeners();
    if (repositionRaf != null) {
      cancelAnimationFrame(repositionRaf);
      repositionRaf = null;
    }
    while (rendered.length) rendered.pop()?.remove();
  };

  const collectMedia = (article: HTMLElement): MediaItem[] => {
    const items: MediaItem[] = [];
    const imgs = queryAll(SELECTORS.IMAGE, article) as HTMLImageElement[];
    imgs.forEach((img) => items.push({ kind: 'image', src: img.src }));
    const videos = queryAll(SELECTORS.VIDEO, article) as HTMLVideoElement[];
    videos.forEach((el) => items.push({ kind: 'video', el }));
    return items;
  };

  const paint = () => {
    clear();
    const article = deps.nav.activeArticle();
    if (!article) return;
    const videos = queryAll(SELECTORS.VIDEO, article) as HTMLVideoElement[];
    if (videos.length === 0) return;
    const items = collectMedia(article);
    videos.forEach((video) => {
      const host = document.createElement('div');
      host.dataset.xkbdExpand = '';
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>
          :host { all: initial; position: absolute; z-index: 2147483645; }
          button {
            all: unset; cursor: pointer;
            width: 28px; height: 28px; border-radius: 999px;
            background: rgba(0,0,0,0.65); color: #fff;
            display: grid; place-items: center;
            box-shadow: 0 0 0 1px rgba(29,155,240,0.35);
            font: 700 14px/1 ui-monospace, Menlo, monospace;
          }
          button:hover { background: rgba(0,0,0,0.85); }
        </style>
        <button type="button" aria-label="Expand video">⤢</button>
      `;
      const rect = video.getBoundingClientRect();
      host.style.position = 'absolute';
      host.style.top = `${rect.top + window.scrollY + 6}px`;
      host.style.left = `${rect.right + window.scrollX - 34}px`;
      const btn = shadow.querySelector('button') as HTMLButtonElement;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const index = items.findIndex((m) => m.kind === 'video' && m.el === video);
        if (index >= 0) deps.mediaModal.open(items, index);
      });
      document.body.appendChild(host);
      rendered.push(host);
    });
    if (rendered.length > 0) ensureListeners();
  };

  const unsub = deps.registry.subscribe(paint);

  return {
    stop() { clear(); unsub(); },
  };
}
