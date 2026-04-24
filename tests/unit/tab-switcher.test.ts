import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTabSwitcher } from '../../src/content/tab-switcher';

function buildTablist(
  labels: ReadonlyArray<string>,
): { tabs: HTMLElement[]; tablist: HTMLElement } {
  const col = document.createElement('div');
  col.setAttribute('data-testid', 'primaryColumn');
  const tablist = document.createElement('div');
  tablist.setAttribute('role', 'tablist');
  const tabs = labels.map((label) => {
    const tab = document.createElement('a');
    tab.setAttribute('role', 'tab');
    tab.textContent = label;
    tablist.appendChild(tab);
    return tab;
  });
  col.appendChild(tablist);
  document.body.appendChild(col);
  return { tabs, tablist };
}

describe('createTabSwitcher', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('switchTo(0) clicks the first tab when on /home', () => {
    const { tabs } = buildTablist(['For you', 'Following']);
    const spies = tabs.map((t) => {
      const s = vi.fn();
      t.addEventListener('click', s);
      return s;
    });
    const sw = createTabSwitcher({ isHome: () => true });
    sw.switchTo(0);
    expect(spies[0]).toHaveBeenCalledTimes(1);
    expect(spies[1]).not.toHaveBeenCalled();
  });

  it('switchTo(1) clicks the second tab when on /home', () => {
    const { tabs } = buildTablist(['For you', 'Following']);
    const spies = tabs.map((t) => {
      const s = vi.fn();
      t.addEventListener('click', s);
      return s;
    });
    const sw = createTabSwitcher({ isHome: () => true });
    sw.switchTo(1);
    expect(spies[1]).toHaveBeenCalledTimes(1);
    expect(spies[0]).not.toHaveBeenCalled();
  });

  it('no-op when not on /home', () => {
    const { tabs } = buildTablist(['For you', 'Following']);
    const spies = tabs.map((t) => {
      const s = vi.fn();
      t.addEventListener('click', s);
      return s;
    });
    const sw = createTabSwitcher({ isHome: () => false });
    sw.switchTo(0);
    sw.switchTo(1);
    expect(spies[0]).not.toHaveBeenCalled();
    expect(spies[1]).not.toHaveBeenCalled();
  });

  it('no-op when tablist is missing', () => {
    const sw = createTabSwitcher({ isHome: () => true });
    expect(() => sw.switchTo(0)).not.toThrow();
  });

  it('no-op when requested index is beyond available tabs', () => {
    const { tabs } = buildTablist(['For you', 'Following']);
    const spies = tabs.map((t) => {
      const s = vi.fn();
      t.addEventListener('click', s);
      return s;
    });
    const sw = createTabSwitcher({ isHome: () => true });
    sw.switchTo(5);
    expect(spies[0]).not.toHaveBeenCalled();
    expect(spies[1]).not.toHaveBeenCalled();
  });

  it('prefers tablist inside primaryColumn when multiple exist', () => {
    const stray = document.createElement('div');
    stray.setAttribute('role', 'tablist');
    const strayTab = document.createElement('a');
    strayTab.setAttribute('role', 'tab');
    const strayClick = vi.fn();
    strayTab.addEventListener('click', strayClick);
    stray.appendChild(strayTab);
    document.body.appendChild(stray);

    const { tabs } = buildTablist(['For you', 'Following']);
    const primaryClick = vi.fn();
    tabs[0].addEventListener('click', primaryClick);

    const sw = createTabSwitcher({ isHome: () => true });
    sw.switchTo(0);
    expect(primaryClick).toHaveBeenCalledTimes(1);
    expect(strayClick).not.toHaveBeenCalled();
  });
});
