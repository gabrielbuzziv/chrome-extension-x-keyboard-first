# x-keyboard-first

A Chrome extension that makes X (twitter.com / x.com) keyboard-first.

## Features

- Highlights the currently active tweet with a blue ring.
- Arrow keys (+ `j`/`k`) navigate between tweets in any feed.
- `→` opens the highlighted tweet's thread; `←` (or `Esc`) returns.
- Works on home, profile, search, bookmarks, lists, and thread pages.
- Action keys (`l` like, `r` reply, `t` retweet, `b` bookmark, `n` compose) pass through to X's native shortcuts — they target the extension's active tweet automatically.
- `?` opens a shortcut cheat-sheet overlay.

## Install (dev)

```bash
npm install
npm run build
```

1. Chrome → `chrome://extensions` → enable "Developer mode".
2. "Load unpacked" → select the `dist/` folder.
3. Visit `https://x.com/` and start pressing keys.

## Scripts

- `npm run dev` — Vite in watch mode for the content script.
- `npm run build` — Production build into `dist/`.
- `npm test` — Vitest unit suite.
- `npm run e2e` — Playwright against local DOM fixtures.
- `npm run typecheck` — `tsc --noEmit`.

## Architecture

See `docs/superpowers/specs/2026-04-23-x-keyboard-first-design.md`.
