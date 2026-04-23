import { SELECTORS, queryAll } from '../shared/selectors';

export type LinkTargetKind =
  | 'bodyUrl'
  | 'cardLink'
  | 'quotedTweet'
  | 'image'
  | 'video';

export interface LinkTarget {
  kind: LinkTargetKind;
  el: HTMLElement;
}

const MAX_TARGETS = 9;

export function enumerateTargets(article: HTMLElement): LinkTarget[] {
  const seen = new Set<HTMLElement>();
  const all: LinkTarget[] = [];
  const add = (kind: LinkTargetKind, el: HTMLElement) => {
    if (seen.has(el)) return;
    seen.add(el);
    all.push({ kind, el });
  };

  // Body URLs: scoped to outer tweetText (avoid nested quoted tweet text).
  const outerText = article.querySelector<HTMLElement>(
    ':scope > div [data-testid="tweetText"], :scope [data-testid="tweetText"]:not(article article [data-testid="tweetText"])',
  );
  if (outerText) {
    const urls = queryAll(SELECTORS.BODY_URL, outerText) as HTMLAnchorElement[];
    for (const a of urls) add('bodyUrl', a);
  }

  // Card wrapper.
  const cards = queryAll(SELECTORS.CARD, article) as HTMLElement[];
  for (const c of cards) add('cardLink', c);

  // Quoted tweet — nested article that is not the outer article.
  const quoted = Array.from(
    article.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
  ).filter((n) => n !== article);
  for (const q of quoted) add('quotedTweet', q);

  // Images.
  const imgs = queryAll(SELECTORS.IMAGE, article) as HTMLElement[];
  for (const i of imgs) add('image', i);

  // Video.
  const videos = queryAll(SELECTORS.VIDEO, article) as HTMLElement[];
  for (const v of videos) add('video', v);

  // Return in DOM order across categories using a document-order sort.
  all.sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  return all.slice(0, MAX_TARGETS);
}
