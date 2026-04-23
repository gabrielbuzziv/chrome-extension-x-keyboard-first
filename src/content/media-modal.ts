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
        .backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.92);
          z-index: 2147483647;
          display: flex; align-items: center; justify-content: center;
          font-family: -apple-system, system-ui, "Segoe UI", sans-serif;
        }
        .stage { position: relative; width: 90vw; height: 90vh;
                 display: flex; align-items: center; justify-content: center; }
        .stage img, .stage video {
          max-width: 100%; max-height: 100%; object-fit: contain;
          border-radius: 8px; background: #000;
        }
      </style>
      <div class="backdrop"><div class="stage"></div></div>
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

  const render = () => {
    if (!shadow) return;
    const stage = shadow.querySelector('.stage') as HTMLElement;
    stage.innerHTML = '';
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
      return;
    }
    // video
    if (!reparented || reparented.el !== item.el) {
      restoreVideo();
      reparentVideo(item.el);
    }
    stage.appendChild(item.el);
  };

  return {
    open(nextItems, nextIndex) {
      if (nextItems.length === 0) return;
      items = nextItems;
      index = Math.max(0, Math.min(nextIndex, items.length - 1));
      if (!host) mount();
      render();
    },
    close() {
      if (!host) return;
      restoreVideo();
      items = [];
      index = 0;
      unmount();
    },
    isOpen() {
      return host !== null;
    },
    handleKey(_e: KeyboardEvent) {
      // Fleshed out in a later task.
    },
    stop() {
      restoreVideo();
      unmount();
    },
  };
}
