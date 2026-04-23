import { SELECTORS, queryAll } from '../shared/selectors';

export interface TweetEntry {
  id: string;
  article: HTMLElement;
  top: number;
}

const STATUS_ID_RE = /\/status\/(\d+)/;

function parseTweetId(article: HTMLElement): string | null {
  const links = queryAll(SELECTORS.PERMALINK_IN_TWEET, article);
  for (const link of links) {
    const href = (link as HTMLAnchorElement).getAttribute('href') ?? '';
    const m = href.match(STATUS_ID_RE);
    if (m) return m[1];
  }
  return null;
}

export function collectTweets(root: ParentNode = document): TweetEntry[] {
  const articles = queryAll(SELECTORS.TWEET, root) as HTMLElement[];
  const seen = new Set<string>();
  const entries: TweetEntry[] = [];
  for (const article of articles) {
    const id = parseTweetId(article);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    entries.push({
      id,
      article,
      top: article.getBoundingClientRect().top,
    });
  }
  return entries;
}

export interface Registry {
  current(): TweetEntry[];
  findById(id: string): TweetEntry | undefined;
  nearestToViewport(): TweetEntry | undefined;
  subscribe(listener: () => void): () => void;
  stop(): void;
}

export function createRegistry(root: ParentNode = document): Registry {
  let entries = collectTweets(root);
  const listeners = new Set<() => void>();
  let rafId: number | null = null;

  const rebuild = () => {
    rafId = null;
    entries = collectTweets(root);
    for (const fn of listeners) fn();
  };

  const schedule = () => {
    if (rafId != null) return;
    rafId = requestAnimationFrame(rebuild);
  };

  const observer = new MutationObserver(schedule);
  const target: Node =
    root instanceof Document ? root.body : (root as unknown as Node);
  observer.observe(target, { childList: true, subtree: true });

  return {
    current: () => entries,
    findById: (id) => entries.find((e) => e.id === id),
    nearestToViewport: () => {
      if (entries.length === 0) return undefined;
      const mid = window.innerHeight / 2;
      let best: TweetEntry | undefined;
      let bestDist = Infinity;
      for (const e of entries) {
        const rect = e.article.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const d = Math.abs(center - mid);
        if (d < bestDist) {
          bestDist = d;
          best = e;
        }
      }
      return best;
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    stop: () => {
      observer.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
      listeners.clear();
    },
  };
}
