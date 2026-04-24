import { BINDINGS } from '../shared/bindings';

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
    ([keys, desc], i) => `
      <li style="--i:${i}">
        <span class="combo">${renderKeys(keys)}</span>
        <span class="rail" aria-hidden="true"></span>
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
        background:
          radial-gradient(120% 120% at 30% 20%, rgba(29,155,240,0.18), transparent 60%),
          linear-gradient(180deg, rgba(22,30,38,0.92), rgba(11,16,22,0.94));
        border: 1px solid rgba(29,155,240,0.32);
        color: #6cb8f5;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-shadow: 0 1px 0 rgba(0,0,0,0.5);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.06),
          inset 0 -1px 0 rgba(0,0,0,0.4),
          0 8px 22px -10px rgba(0,0,0,0.7);
        transition:
          transform 200ms cubic-bezier(0.2, 0.7, 0.2, 1),
          border-color 200ms ease,
          color 200ms ease,
          box-shadow 240ms ease;
        will-change: transform, box-shadow;
      }
      .trigger:hover {
        transform: translateY(-1px);
        color: #9bd0fa;
        border-color: rgba(29,155,240,0.7);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.10),
          inset 0 -1px 0 rgba(0,0,0,0.5),
          0 12px 28px -10px rgba(0,0,0,0.8),
          0 0 0 5px rgba(29,155,240,0.10);
      }
      .trigger:active { transform: translateY(0); }
      .trigger:focus-visible {
        outline: none;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.10),
          0 0 0 3px rgba(29,155,240,0.45);
      }
      .glyph { display: inline-block; transform: translateY(-1px); }

      .card {
        position: absolute;
        bottom: calc(100% + 14px);
        left: 0;
        width: 320px;
        padding: 14px 16px 12px;
        border-radius: 14px;
        background:
          radial-gradient(140% 80% at 0% 0%, rgba(29,155,240,0.14), transparent 60%),
          radial-gradient(120% 100% at 100% 100%, rgba(120,86,255,0.06), transparent 60%),
          linear-gradient(180deg, rgba(22,30,38,0.96), rgba(10,14,20,0.96));
        border: 1px solid rgba(255,255,255,0.07);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.05),
          0 28px 64px -18px rgba(0,0,0,0.85),
          0 8px 24px -10px rgba(0,0,0,0.6);
        backdrop-filter: blur(14px) saturate(140%);
        -webkit-backdrop-filter: blur(14px) saturate(140%);
        opacity: 0;
        transform: translateY(6px) scale(0.985);
        transform-origin: bottom left;
        pointer-events: none;
        transition:
          opacity 180ms ease,
          transform 240ms cubic-bezier(0.2, 0.7, 0.2, 1);
      }
      /* Invisible bridge so cursor can travel from button to card without losing hover */
      .card::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 0;
        width: 64px;
        height: 16px;
      }
      .root:hover .card,
      .root:focus-within .card,
      .card:hover {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      .header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin-bottom: 10px;
        padding-bottom: 9px;
        border-bottom: 1px dashed rgba(255,255,255,0.08);
      }
      .title {
        color: #e7e9ea;
        font-size: 10.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.22em;
      }
      .title::before {
        content: '⌘';
        margin-right: 8px;
        color: #1d9bf0;
        font-weight: 600;
      }
      .hint {
        color: #6e7884;
        font-size: 10px;
        letter-spacing: 0.04em;
        font-family: -apple-system, "SF Pro Text", system-ui, sans-serif;
      }

      ul { list-style: none; margin: 0; padding: 0; }
      li {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 10px;
        padding: 4px 0;
        opacity: 0;
        transform: translateY(4px);
      }
      .root:hover li,
      .root:focus-within li,
      .card:hover li {
        animation: pop 320ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
        animation-delay: calc(var(--i) * 14ms + 80ms);
      }
      @keyframes pop {
        to { opacity: 1; transform: translateY(0); }
      }

      .combo {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        flex-wrap: nowrap;
      }
      .sep {
        color: #4a5460;
        font-size: 9.5px;
        padding: 0 1px;
      }
      kbd {
        font: 700 10.5px/1 ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace;
        color: #d6dde4;
        background: linear-gradient(180deg, #1f2832 0%, #131a22 100%);
        border: 1px solid rgba(255,255,255,0.09);
        border-bottom-color: rgba(0,0,0,0.55);
        border-radius: 5px;
        padding: 4px 6px;
        min-width: 14px;
        text-align: center;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.08),
          0 1px 0 rgba(0,0,0,0.5),
          0 2px 0 rgba(0,0,0,0.25);
        text-shadow: 0 1px 0 rgba(0,0,0,0.4);
      }
      .rail {
        height: 1px;
        background: linear-gradient(90deg,
          rgba(255,255,255,0.04),
          rgba(255,255,255,0.10),
          rgba(255,255,255,0.04));
        opacity: 0.55;
      }
      .desc {
        color: #b6c0cc;
        font-size: 12px;
        font-family: -apple-system, "SF Pro Text", system-ui, sans-serif;
        letter-spacing: 0.005em;
        text-align: right;
        white-space: nowrap;
      }

      @media (prefers-reduced-motion: reduce) {
        .trigger, .card, li { transition: none; animation: none; }
        li { opacity: 1; transform: none; }
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
