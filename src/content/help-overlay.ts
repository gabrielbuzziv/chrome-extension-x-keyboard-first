import { BINDINGS } from '../shared/bindings';

export interface HelpOverlay {
  toggle(): void;
  isOpen(): boolean;
  stop(): void;
}

export function createHelpOverlay(): HelpOverlay {
  let host: HTMLDivElement | null = null;

  const onOutsideClick = (e: MouseEvent) => {
    if (!host) return;
    if (!e.composedPath().includes(host)) close();
  };

  const close = () => {
    window.removeEventListener('click', onOutsideClick, true);
    host?.remove();
    host = null;
  };

  const open = () => {
    host = document.createElement('div');
    host.dataset.xkbdHelp = '';
    const shadow = host.attachShadow({ mode: 'open' });
    const rows = BINDINGS.map(
      ([k, d]) => `<tr><td class="key">${k}</td><td class="desc">${d}</td></tr>`,
    ).join('');
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.6);
          z-index: 2147483647;
          display: flex; align-items: center; justify-content: center;
          font-family: -apple-system, system-ui, "Segoe UI", sans-serif;
        }
        .panel {
          background: #15202b; color: #e7e9ea;
          border-radius: 16px; padding: 22px 26px;
          min-width: 360px; max-width: 520px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        h2 { margin: 0 0 14px; font-size: 17px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 5px 0; font-size: 13px; vertical-align: top; }
        td.key {
          white-space: nowrap; padding-right: 18px;
          color: #1d9bf0;
          font-family: ui-monospace, SFMono-Regular, monospace;
        }
        td.desc { color: #e7e9ea; }
        .hint { margin-top: 14px; color: #8899a6; font-size: 12px; }
      </style>
      <div class="backdrop">
        <div class="panel" role="dialog" aria-label="Keyboard shortcuts">
          <h2>x-keyboard-first — shortcuts</h2>
          <table>${rows}</table>
          <div class="hint">Press ? or Esc to close</div>
        </div>
      </div>
    `;
    document.body.appendChild(host);
    setTimeout(
      () => window.addEventListener('click', onOutsideClick, true),
      0,
    );
  };

  return {
    toggle: () => (host ? close() : open()),
    isOpen: () => host != null,
    stop: () => close(),
  };
}
