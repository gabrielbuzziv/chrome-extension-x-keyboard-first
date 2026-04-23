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

  const render = () => {
    // Real rendering lands in later tasks; skeleton only mounts and unmounts.
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
      unmount();
    },
  };
}
