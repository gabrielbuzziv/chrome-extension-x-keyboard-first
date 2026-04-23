import { createRegistry } from './tweet-registry';
import { createRouteWatcher } from './route-watcher';
import { createNavigator } from './navigator';
import { attachKeyBindings } from './key-bindings';
import { createHelpOverlay } from './help-overlay';

function main() {
  const registry = createRegistry();
  const router = createRouteWatcher();
  const nav = createNavigator({ registry, router });
  const help = createHelpOverlay();

  const detach = attachKeyBindings({
    nav,
    toggleHelp: () => help.toggle(),
    helpOpen: () => help.isOpen(),
  });

  window.addEventListener(
    'pagehide',
    () => {
      detach();
      nav.stop();
      help.stop();
      registry.stop();
      router.stop();
    },
    { once: true },
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => main(), { once: true });
} else {
  main();
}
