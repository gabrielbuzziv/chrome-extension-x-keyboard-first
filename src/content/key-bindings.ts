import type { Navigator, Command } from './navigator';
import { SELECTORS, queryFirst } from '../shared/selectors';

const SEQ_TIMEOUT_MS = 600;

const SHOW_MORE_TEXTS = [
  'show more',
  'show less',
  'mostrar mais',
  'mostrar menos',
  'ver mais',
  'ver menos',
  'voir plus',
  'voir moins',
  'mehr anzeigen',
  'weniger anzeigen',
];

const TRANSLATE_TEXTS = [
  'translate post',
  'translate tweet',
  'show translation',
  'mostrar tradução',
  'traduzir post',
  'traduzir tweet',
  'mostrar traducción',
  'traducir',
  'afficher la traduction',
  'traduire',
];

const NEW_POSTS_PILL_RE = /^\s*(show|mostrar|ver)\s+\d+\s+(posts?|tweets?|postagens?)\b/i;

function findNewPostsPill(root: ParentNode = document): HTMLElement | null {
  const direct = queryFirst(SELECTORS.NEW_POSTS_PILL, root) as HTMLElement | null;
  if (direct) {
    const clickable = direct.closest('button, [role="button"]') as HTMLElement | null;
    return clickable ?? direct;
  }
  const nodes = root.querySelectorAll<HTMLElement>(
    'button, a, [role="button"], [role="link"]',
  );
  for (const node of nodes) {
    const text = node.textContent || node.getAttribute('aria-label') || '';
    if (NEW_POSTS_PILL_RE.test(text.trim())) return node;
  }
  return null;
}

export interface KeyBindingsDeps {
  nav: Pick<Navigator, 'dispatch' | 'activeArticle'>;
  toggleHelp: () => void;
  helpOpen: () => boolean;
  switchTab: (index: number) => void;
  reload?: () => void;
  mediaModal: { isOpen: () => boolean; handleKey: (e: KeyboardEvent) => void };
  linkMode: {
    isActive: () => boolean;
    enter: () => void;
    handleKey: (e: KeyboardEvent) => void;
  };
}

type ResolvedAction =
  | { kind: 'nav'; cmd: Command }
  | { kind: 'help' }
  | { kind: 'tab'; index: number }
  | { kind: 'click'; target: 'showMore' | 'translate' | 'newPostsPill' }
  | { kind: 'reload' }
  | { kind: 'enterLinkMode' };

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findByText(
  root: HTMLElement,
  texts: readonly string[],
): HTMLElement | null {
  const nodes = root.querySelectorAll<HTMLElement>(
    'button, a, [role="button"], [role="link"]',
  );
  const needles = texts.map(normalize);
  for (const node of nodes) {
    const haystack = normalize(
      node.textContent || node.getAttribute('aria-label') || '',
    );
    if (!haystack) continue;
    if (needles.some((t) => haystack === t || haystack.includes(t))) return node;
  }
  return null;
}

function findShowMore(article: HTMLElement): HTMLElement | null {
  // Restrict the search to the outer tweet's text area so a show-more inside
  // a quoted sub-tweet does not hijack the Space press.
  const outerText = queryFirst(SELECTORS.TWEET_TEXT, article) as HTMLElement | null;
  const scope: HTMLElement = outerText?.parentElement ?? article;
  const direct = queryFirst(SELECTORS.SHOW_MORE, scope) as HTMLElement | null;
  if (direct && !isInsideNestedTweet(direct, article)) return direct;
  const byText = findByText(scope, SHOW_MORE_TEXTS);
  if (byText && !isInsideNestedTweet(byText, article)) return byText;
  return null;
}

function isInsideNestedTweet(el: HTMLElement, article: HTMLElement): boolean {
  const nested = el.closest('article[data-testid="tweet"]');
  return nested != null && nested !== article;
}

function findTranslate(article: HTMLElement): HTMLElement | null {
  return (
    (queryFirst(SELECTORS.TRANSLATE, article) as HTMLElement | null) ??
    findByText(article, TRANSLATE_TEXTS)
  );
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function modalOpen(): boolean {
  return !!document.querySelector('[role="dialog"]');
}

export function attachKeyBindings(deps: KeyBindingsDeps): () => void {
  const reload = deps.reload ?? (() => {
    window.scrollTo(0, 0);
    location.reload();
  });

  let pendingG = false;
  let pendingGTimer: number | null = null;

  const clearPendingG = () => {
    pendingG = false;
    if (pendingGTimer != null) {
      clearTimeout(pendingGTimer);
      pendingGTimer = null;
    }
  };

  const nav = (cmd: Command): ResolvedAction => ({ kind: 'nav', cmd });

  const resolve = (e: KeyboardEvent): ResolvedAction | null => {
    if (deps.helpOpen()) {
      if (e.key === '?' || e.key === 'Escape') return { kind: 'help' };
      return null;
    }
    if (isEditable(e.target) || isEditable(document.activeElement)) return null;
    if (modalOpen()) return null;

    if (e.code === 'Space') {
      if (!e.shiftKey) {
        const focusedArticle =
          (document.activeElement as HTMLElement | null)?.closest(
            'article[data-testid="tweet"]',
          ) as HTMLElement | null;
        const article = focusedArticle ?? deps.nav.activeArticle();
        if (article && findShowMore(article)) {
          return { kind: 'click', target: 'showMore' };
        }
      }
      return nav(e.shiftKey ? 'pageUp' : 'pageDown');
    }

    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        return nav('next');
      case 'ArrowUp':
      case 'k':
        return nav('prev');
      case 'ArrowRight':
        return nav('enter');
      case 'ArrowLeft':
      case 'Escape':
        return nav('back');
      case 'Home':
        return nav('first');
      case 'End':
      case 'G':
        return nav('last');
      case 'g': {
        if (pendingG) {
          clearPendingG();
          return nav('first');
        }
        pendingG = true;
        pendingGTimer = window.setTimeout(clearPendingG, SEQ_TIMEOUT_MS);
        return null;
      }
      case '1':
        return { kind: 'tab', index: 0 };
      case '2':
        return { kind: 'tab', index: 1 };
      case 't':
      case 'T': {
        const article = deps.nav.activeArticle();
        if (article && findTranslate(article)) {
          return { kind: 'click', target: 'translate' };
        }
        return null;
      }
      case 'r':
      case 'R':
        return { kind: 'reload' };
      case '.': {
        if (findNewPostsPill(document)) {
          return { kind: 'click', target: 'newPostsPill' };
        }
        return null;
      }
      case 'o':
      case 'O':
        if (!deps.nav.activeArticle()) return null;
        return { kind: 'enterLinkMode' };
      case '?':
        return { kind: 'help' };
    }
    return null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (deps.mediaModal.isOpen()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      deps.mediaModal.handleKey(e);
      return;
    }
    if (deps.linkMode.isActive()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      deps.linkMode.handleKey(e);
      return;
    }
    const action = resolve(e);
    if (!action) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    switch (action.kind) {
      case 'help': deps.toggleHelp(); break;
      case 'nav': deps.nav.dispatch(action.cmd); break;
      case 'tab': deps.switchTab(action.index); break;
      case 'reload': reload(); break;
      case 'enterLinkMode': deps.linkMode.enter(); break;
      case 'click': {
        if (action.target === 'newPostsPill') {
          findNewPostsPill(document)?.click();
          break;
        }
        const focusedArticle =
          (document.activeElement as HTMLElement | null)?.closest(
            'article[data-testid="tweet"]',
          ) as HTMLElement | null;
        const article = focusedArticle ?? deps.nav.activeArticle();
        if (!article) break;
        const btn =
          action.target === 'showMore'
            ? findShowMore(article)
            : findTranslate(article);
        btn?.click();
        break;
      }
    }
  };

  window.addEventListener('keydown', onKeyDown, { capture: true });
  return () => {
    window.removeEventListener('keydown', onKeyDown, { capture: true });
    clearPendingG();
  };
}
