import { createRegistry } from './tweet-registry';
import { createRouteWatcher } from './route-watcher';
import { createNavigator } from './navigator';
import { createTabSwitcher } from './tab-switcher';
import { attachKeyBindings } from './key-bindings';
import { createHelpOverlay } from './help-overlay';
import { createHintButton } from './hint-button';
import { createMediaModal } from './media-modal';
import { createLinkMode } from './link-mode';
import { createMediaExpandButton } from './media-expand-button';
import { createAppShortcuts } from './app-shortcuts';
import { isSupportedXHost } from '../shared/host';

function main() {
  const registry = createRegistry();
  const router = createRouteWatcher();
  const nav = createNavigator({ registry, router });
  const tabs = createTabSwitcher({});
  const help = createHelpOverlay();
  const hint = createHintButton({ onClick: () => help.toggle() });
  const mediaModal = createMediaModal();
  const linkMode = createLinkMode({ nav, registry, router, mediaModal });
  const expandBtn = createMediaExpandButton({ nav, registry, mediaModal });
  const appShortcuts = createAppShortcuts();

  const detach = attachKeyBindings({
    nav,
    switchTab: (i) => tabs.switchTo(i),
    goHome: () => appShortcuts.goHome(),
    goExplorer: () => appShortcuts.goExplorer(),
    toggleHelp: () => help.toggle(),
    helpOpen: () => help.isOpen(),
    mediaModal,
    linkMode,
  });

  window.addEventListener(
    'pagehide',
    () => {
      detach();
      linkMode.stop();
      expandBtn.stop();
      mediaModal.stop();
      nav.stop();
      help.stop();
      hint.stop();
      registry.stop();
      router.stop();
    },
    { once: true },
  );
}

function boot(): void {
  if (!isSupportedXHost(location.href)) return;
  main();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => boot(), { once: true });
} else {
  boot();
}
