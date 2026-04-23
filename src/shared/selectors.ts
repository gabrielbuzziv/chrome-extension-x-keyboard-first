export const SELECTORS = {
  TWEET: ['article[data-testid="tweet"]', 'article[role="article"]'],
  TWEET_TEXT: ['[data-testid="tweetText"]'],
  FEED: ['[aria-label^="Timeline"]', '[data-testid="primaryColumn"]'],
  PERMALINK_IN_TWEET: [
    'a[href*="/status/"][role="link"]:has(time)',
    'a[href*="/status/"]',
  ],
  TABLIST: [
    '[data-testid="primaryColumn"] div[role="tablist"]',
    'div[role="tablist"]',
  ],
  TAB: ['[role="tab"]'],
  SHOW_MORE: [
    '[data-testid="tweet-text-show-more-link"]',
    '[data-testid="tweet-text-show-less-link"]',
    '[data-testid^="tweet-text-show-"]',
    '[data-testid*="show-more"]',
    '[data-testid*="show-less"]',
  ],
  TRANSLATE: [
    '[data-testid="tweet-text-show-translation-button"]',
    '[data-testid="translateTweet-button"]',
    '[data-testid^="tweet-text-show-translation"]',
    '[data-testid*="translate"]',
  ],
  NEW_POSTS_PILL: [
    '[data-testid="pillLabel"]',
    'button[aria-label*="post" i]',
  ],
  QUOTED_TWEET: [
    'div[aria-labelledby] article[data-testid="tweet"]',
    'article[data-testid="tweet"] article[data-testid="tweet"]',
    'article[data-testid="tweet"] [role="link"][tabindex="0"]:has(time)',
  ],
  CARD: [
    '[data-testid="card.wrapper"]',
    '[data-testid^="card.layout"]',
  ],
  IMAGE: [
    '[data-testid="tweetPhoto"] img',
    'a[href*="/photo/"] img',
  ],
  VIDEO: [
    '[data-testid="videoPlayer"] video',
    '[data-testid="videoComponent"] video',
    'video',
  ],
  BODY_URL: [
    '[data-testid="tweetText"] a[role="link"][href^="https://t.co/"]',
    '[data-testid="tweetText"] a[href^="http"]',
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
