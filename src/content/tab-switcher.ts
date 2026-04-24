import { SELECTORS, queryFirst, queryAll } from '../shared/selectors';

export interface TabSwitcher {
  switchTo(index: number): void;
}

export interface TabSwitcherDeps {
  isHome?: () => boolean;
}

const defaultIsHome = (): boolean => location.pathname === '/home';

export function createTabSwitcher(deps: TabSwitcherDeps = {}): TabSwitcher {
  const isHome = deps.isHome ?? defaultIsHome;
  return {
    switchTo(index: number) {
      if (!isHome()) return;
      const tablist = queryFirst(SELECTORS.TABLIST);
      if (!tablist) return;
      const tabs = queryAll(SELECTORS.TAB, tablist);
      const tab = tabs[index];
      if (tab instanceof HTMLElement) tab.click();
    },
  };
}
