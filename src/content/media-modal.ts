export type MediaItem =
  | { kind: 'image'; src: string; alt?: string }
  | { kind: 'video'; el: HTMLVideoElement };

export interface MediaModal {
  open(items: MediaItem[], index: number): void;
  close(): void;
  isOpen(): boolean;
  handleKey(e: KeyboardEvent): void;
  stop(): void;
}

function upgradeImageSrc(src: string): string {
  if (/[?&]name=/.test(src)) {
    return src.replace(/([?&])name=\w+/, '$1name=large');
  }
  return src + (src.includes('?') ? '&' : '?') + 'name=large';
}

export function createMediaModal(): MediaModal {
  let host: HTMLDivElement | null = null;
  let shadow: ShadowRoot | null = null;
  let items: MediaItem[] = [];
  let index = 0;

  const mount = () => {
    host = document.createElement('div');
    host.dataset.xkbdMedia = '';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.92);
                    z-index: 2147483647; display: flex; align-items: center;
                    justify-content: center;
                    font-family: -apple-system, system-ui, sans-serif; }
        .stage { position: relative; width: 90vw; height: 90vh;
                 display: flex; align-items: center; justify-content: center; }
        .stage img, .stage video {
          max-width: 100%; max-height: 100%; object-fit: contain;
          border-radius: 8px; background: #000;
        }
        .close, .nav {
          position: absolute; border: 0; cursor: pointer;
          background: rgba(0,0,0,0.55); color: #fff;
          width: 36px; height: 36px; border-radius: 999px;
          font-size: 18px; line-height: 1; display: grid; place-items: center;
        }
        .close { top: 10px; right: 10px; width: 32px; height: 32px; font-size: 20px; }
        .nav.prev { left: 10px; top: 50%; transform: translateY(-50%); }
        .nav.next { right: 10px; top: 50%; transform: translateY(-50%); }
        .counter { position: absolute; top: 10px; left: 10px;
                   color: #cfd5dc; font-size: 12px;
                   background: rgba(0,0,0,0.55); padding: 4px 8px; border-radius: 999px; }
        .thumbs { position: absolute; bottom: 10px; left: 50%;
                  transform: translateX(-50%); display: flex; gap: 6px; }
        .thumb { width: 34px; height: 24px; border: 0; border-radius: 4px;
                 background: #333; cursor: pointer; padding: 0; }
        .thumb.is-current { box-shadow: 0 0 0 2px #1d9bf0; }
      </style>
      <div class="backdrop">
        <div class="stage"></div>
      </div>
    `;
    document.body.appendChild(host);
  };

  const unmount = () => {
    host?.remove();
    host = null;
    shadow = null;
  };

  interface Reparented {
    el: HTMLVideoElement;
    parent: Node;
    nextSibling: Node | null;
  }
  let reparented: Reparented | null = null;

  const reparentVideo = (video: HTMLVideoElement) => {
    const parent = video.parentNode;
    if (!parent) return;
    reparented = { el: video, parent, nextSibling: video.nextSibling };
  };

  const restoreVideo = () => {
    if (!reparented) return;
    const { el, parent, nextSibling } = reparented;
    // If the parent was detached mid-flight, skip — X will re-render on scroll-back.
    if (parent.isConnected) {
      if (nextSibling && nextSibling.parentNode === parent) {
        parent.insertBefore(el, nextSibling);
      } else {
        parent.appendChild(el);
      }
    }
    reparented = null;
  };

  const doClose = () => {
    if (!host) return;
    restoreVideo();
    items = [];
    index = 0;
    unmount();
  };

  const setIndex = (next: number) => {
    const clamped = Math.max(0, Math.min(next, items.length - 1));
    if (clamped === index) return;
    index = clamped;
    render();
  };

  const render = () => {
    if (!shadow) return;
    const backdrop = shadow.querySelector('.backdrop') as HTMLElement;
    const stage = shadow.querySelector('.stage') as HTMLElement;
    stage.innerHTML = '';
    // Remove any prior overlays
    shadow.querySelectorAll('.close, .nav, .counter, .thumbs').forEach((n) => n.remove());

    const item = items[index];
    if (!item) return;

    if (item.kind === 'image') {
      const img = document.createElement('img');
      const upgraded = upgradeImageSrc(item.src);
      img.src = upgraded;
      img.alt = item.alt ?? '';
      img.addEventListener(
        'error',
        () => { if (img.src !== item.src) img.src = item.src; },
        { once: true },
      );
      stage.appendChild(img);
    } else {
      if (!reparented || reparented.el !== item.el) {
        restoreVideo();
        reparentVideo(item.el);
      }
      stage.appendChild(item.el);
    }

    const close = document.createElement('button');
    close.className = 'close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', () => doClose());
    backdrop.appendChild(close);

    if (items.length > 1) {
      const prev = document.createElement('button');
      prev.className = 'nav prev';
      prev.type = 'button';
      prev.setAttribute('aria-label', 'Previous');
      prev.textContent = '‹';
      prev.addEventListener('click', () => setIndex(index - 1));
      backdrop.appendChild(prev);

      const next = document.createElement('button');
      next.className = 'nav next';
      next.type = 'button';
      next.setAttribute('aria-label', 'Next');
      next.textContent = '›';
      next.addEventListener('click', () => setIndex(index + 1));
      backdrop.appendChild(next);

      const counter = document.createElement('div');
      counter.className = 'counter';
      counter.textContent = `${index + 1} / ${items.length}`;
      backdrop.appendChild(counter);

      const thumbs = document.createElement('div');
      thumbs.className = 'thumbs';
      items.forEach((_, i) => {
        const b = document.createElement('button');
        b.className = 'thumb' + (i === index ? ' is-current' : '');
        b.type = 'button';
        b.setAttribute('aria-label', `Show item ${i + 1}`);
        b.addEventListener('click', () => setIndex(i));
        thumbs.appendChild(b);
      });
      backdrop.appendChild(thumbs);
    }
  };

  return {
    open(nextItems, nextIndex) {
      if (nextItems.length === 0) return;
      items = nextItems;
      index = Math.max(0, Math.min(nextIndex, items.length - 1));
      if (!host) mount();
      render();
    },
    close() { doClose(); },
    isOpen() {
      return host !== null;
    },
    handleKey(e: KeyboardEvent) {
      if (!host) return;
      switch (e.key) {
        case 'ArrowRight':
          setIndex(index + 1);
          return;
        case 'ArrowLeft':
          setIndex(index - 1);
          return;
        case 'Escape':
          doClose();
          return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const target = Number(e.key) - 1;
        if (target < items.length) setIndex(target);
      }
    },
    stop() {
      restoreVideo();
      unmount();
    },
  };
}
