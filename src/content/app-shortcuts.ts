// src/content/app-shortcuts.ts
interface AppShortcuts {
  goHome: () => void;
  goExplorer: () => void;
}

interface AppShortcutsDeps {
  findNavLink?: (path: string) => HTMLAnchorElement | null;
  navigateToPath?: (path: string) => void;
  findSearchInput?: () => HTMLInputElement | null;
  schedule?: (task: () => void, delayMs: number) => number;
}

const HOME_PATH = '/home';
const EXPLORER_PATH = '/explore';
const SEARCH_INPUT_SELECTORS = [
  'input[data-testid="SearchBox_Search_Input"]',
  'input[aria-label*="Search" i]',
  'input[aria-label*="Buscar" i]',
  'input[placeholder*="Search" i]',
  'input[placeholder*="Buscar" i]',
];
const FOCUS_ATTEMPTS = 24;

function defaultFindNavLink(path: string): HTMLAnchorElement | null {
  const link = document.querySelector(`a[href="${path}"]`);
  return link instanceof HTMLAnchorElement ? link : null;
}

function defaultFindSearchInput(): HTMLInputElement | null {
  for (const selector of SEARCH_INPUT_SELECTORS) {
    const el = document.querySelector(selector);
    if (el instanceof HTMLInputElement) return el;
  }
  return null;
}

function focusExplorerSearch(
  findSearchInput: () => HTMLInputElement | null,
  schedule: (task: () => void, delayMs: number) => number,
  attempt = 0,
): void {
  const input = findSearchInput();
  if (input) {
    input.focus({ preventScroll: true });
    input.select();
    return;
  }
  if (attempt >= FOCUS_ATTEMPTS) return;
  schedule(() => focusExplorerSearch(findSearchInput, schedule, attempt + 1), 50);
}

export function createAppShortcuts(deps: AppShortcutsDeps = {}): AppShortcuts {
  const findNavLink = deps.findNavLink ?? defaultFindNavLink;
  const navigateToPath = deps.navigateToPath ?? ((path: string): void => {
    const link = findNavLink(path);
    if (link) {
      link.click();
      return;
    }
    if (location.pathname !== path) location.assign(path);
  });
  const findSearchInput = deps.findSearchInput ?? defaultFindSearchInput;
  const schedule = deps.schedule ?? ((task: () => void, delayMs: number): number =>
    window.setTimeout(task, delayMs));

  return {
    goHome(): void {
      navigateToPath(HOME_PATH);
    },
    goExplorer(): void {
      navigateToPath(EXPLORER_PATH);
      focusExplorerSearch(findSearchInput, schedule);
    },
  };
}
