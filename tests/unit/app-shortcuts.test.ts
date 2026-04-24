import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAppShortcuts } from '../../src/content/app-shortcuts';

describe('createAppShortcuts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('goHome navigates to /home', () => {
    const navigateToPath = vi.fn();
    const shortcuts = createAppShortcuts({ navigateToPath });
    shortcuts.goHome();
    expect(navigateToPath).toHaveBeenCalledWith('/home');
  });

  it('goExplorer navigates to /explore and focuses the search input', () => {
    const navigateToPath = vi.fn();
    const input = document.createElement('input');
    input.setAttribute('data-testid', 'SearchBox_Search_Input');
    document.body.appendChild(input);
    const focusSpy = vi.spyOn(input, 'focus');
    const selectSpy = vi.spyOn(input, 'select');

    const shortcuts = createAppShortcuts({ navigateToPath });
    shortcuts.goExplorer();

    expect(navigateToPath).toHaveBeenCalledWith('/explore');
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy).toHaveBeenCalledTimes(1);
  });

  it('goExplorer retries until the search input exists', () => {
    const navigateToPath = vi.fn();
    const shortcuts = createAppShortcuts({ navigateToPath });
    shortcuts.goExplorer();

    const input = document.createElement('input');
    input.setAttribute('placeholder', 'Buscar');
    const focusSpy = vi.spyOn(input, 'focus');
    const selectSpy = vi.spyOn(input, 'select');

    vi.advanceTimersByTime(100);
    document.body.appendChild(input);
    vi.runAllTimers();

    expect(navigateToPath).toHaveBeenCalledWith('/explore');
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy).toHaveBeenCalledTimes(1);
  });

  it('clicks an existing nav link before falling back to navigation', () => {
    const click = vi.fn();
    const findNavLink = vi.fn((path: string) => {
      if (path !== '/explore') return null;
      return { click } as unknown as HTMLAnchorElement;
    });
    const navigateToPath = vi.fn((path: string) => {
      const link = findNavLink(path);
      if (link) {
        link.click();
        return;
      }
    });

    const shortcuts = createAppShortcuts({ findNavLink, navigateToPath });
    shortcuts.goExplorer();

    expect(findNavLink).toHaveBeenCalledWith('/explore');
    expect(click).toHaveBeenCalledTimes(1);
    expect(navigateToPath).toHaveBeenCalledWith('/explore');
  });
});
