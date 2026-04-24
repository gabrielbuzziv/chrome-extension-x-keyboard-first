import { BINDINGS } from '../shared/bindings';
import { THEME } from '../shared/theme';

export interface HintButton {
  stop(): void;
}

export interface HintButtonDeps {
  onClick: () => void;
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => {
    if (c === '&') return '&amp;';
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    if (c === '"') return '&quot;';
    return '&#39;';
  });

const renderKeys = (combo: string): string =>
  combo
    .split(/\s*\/\s*/)
    .map((k) => `<kbd>${escapeHtml(k)}</kbd>`)
    .join('<span class="sep" aria-hidden="true">/</span>');

const renderRows = (): string =>
  BINDINGS.map(
    ([keys, desc]) => `
      <li>
        <span class="combo">${renderKeys(keys)}</span>
        <span class="desc">${escapeHtml(desc)}</span>
      </li>`,
  ).join('');

export function createHintButton(deps: HintButtonDeps): HintButton {
  const host = document.createElement('div');
  host.dataset.xkbdHint = '';
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }

      .root {
        position: fixed;
        bottom: 18px;
        left: 18px;
        z-index: 2147483646;
        font-family: ui-monospace, "JetBrains Mono", "Cascadia Code",
                     "SF Mono", Menlo, Consolas, monospace;
      }

      .trigger {
        all: unset;
        cursor: pointer;
        width: 32px; height: 32px;
        border-radius: 999px;
        display: grid; place-items: center;
        background: ${THEME.surface};
        border: 1px solid ${THEME.accentBorder};
        color: ${THEME.accent};
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
        box-shadow: 0 10px 24px -18px rgba(0,0,0,0.95);
      }
      .trigger:focus-visible {
        outline: 2px solid ${THEME.accent};
        outline-offset: 2px;
      }
      .glyph { display: inline-block; }

      .card {
        display: none;
        position: absolute;
        bottom: calc(100% + 14px);
        left: 0;
        width: 304px;
        padding: 14px 16px 12px;
        border-radius: 12px;
        background: ${THEME.surfaceStrong};
        border: 1px solid ${THEME.border};
        box-shadow: 0 24px 48px -28px rgba(0,0,0,0.95);
      }
      .card::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 0;
        width: 64px;
        height: 16px;
      }
      .root:hover .card,
      .root:focus-within .card {
        display: block;
      }

      .header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin-bottom: 10px;
        padding-bottom: 9px;
        border-bottom: 1px solid ${THEME.border};
      }
      .title {
        color: ${THEME.text};
        font-size: 10.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.22em;
      }
      .hint {
        color: ${THEME.textMuted};
        font-size: 10px;
        letter-spacing: 0.04em;
        font-family: -apple-system, "SF Pro Text", system-ui, sans-serif;
      }

      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }
      li {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: 12px;
      }

      .combo {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        flex-wrap: nowrap;
      }
      .sep {
        color: ${THEME.textMuted};
        font-size: 9.5px;
        padding: 0 1px;
      }
      kbd {
        font: 700 10.5px/1 ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace;
        color: ${THEME.text};
        background: ${THEME.keySurface};
        border: 1px solid ${THEME.keyBorder};
        border-radius: 5px;
        padding: 4px 6px;
        min-width: 14px;
        text-align: center;
      }
      .desc {
        color: ${THEME.textMuted};
        font-size: 12px;
        font-family: -apple-system, "SF Pro Text", system-ui, sans-serif;
        letter-spacing: 0.005em;
        text-align: right;
        white-space: nowrap;
      }
    </style>
    <div class="root">
      <div class="card" role="tooltip" aria-label="Keyboard shortcuts">
        <div class="header">
          <span class="title">Shortcuts</span>
          <span class="hint">click for full help</span>
        </div>
        <ul>${renderRows()}</ul>
      </div>
      <button class="trigger" type="button" aria-label="Show keyboard shortcuts (press ? for full help)">
        <span class="glyph">?</span>
      </button>
    </div>
  `;

  const trigger = shadow.querySelector('.trigger') as HTMLButtonElement;
  const onClick = (e: Event) => {
    e.stopPropagation();
    deps.onClick();
  };
  trigger.addEventListener('click', onClick);

  document.body.appendChild(host);

  return {
    stop: () => {
      trigger.removeEventListener('click', onClick);
      host.remove();
    },
  };
}
