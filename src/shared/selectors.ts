export const SELECTORS = {
  TWEET: ['article[data-testid="tweet"]', 'article[role="article"]'],
  FEED: ['[aria-label^="Timeline"]', '[data-testid="primaryColumn"]'],
  PERMALINK_IN_TWEET: [
    'a[href*="/status/"][role="link"]:has(time)',
    'a[href*="/status/"]',
  ],
} as const;

export function queryFirst(
  selectors: readonly string[],
  root: ParentNode = document,
): Element | null {
  for (const s of selectors) {
    const el = root.querySelector(s);
    if (el) return el;
  }
  return null;
}

export function queryAll(
  selectors: readonly string[],
  root: ParentNode = document,
): Element[] {
  for (const s of selectors) {
    const nodes = root.querySelectorAll(s);
    if (nodes.length > 0) return Array.from(nodes);
  }
  return [];
}
