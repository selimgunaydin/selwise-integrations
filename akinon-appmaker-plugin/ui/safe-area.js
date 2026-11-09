'use strict';

/**
 * Safe-area insets, with a fallback.
 *
 * The App Maker root is wrapped in `SafeAreaProvider`, so the real hook is
 * available — but this plugin must not hard-fail in an app that dropped the
 * provider or on a host that never installed the library. Docking a surface at
 * `top: 0` without the inset puts the merchant's copy under the status bar,
 * which is a visible defect rather than a graceful degradation, so the fallback
 * is a platform-shaped guess rather than zero.
 */

const { Platform, StatusBar } = require('react-native');

let hook = null;
try {
  // eslint-disable-next-line global-require
  const context = require('react-native-safe-area-context');
  if (context && typeof context.useSafeAreaInsets === 'function') {
    hook = context.useSafeAreaInsets;
  }
} catch (error) {
  hook = null;
}

const FALLBACK = {
  // A notched iPhone's status bar is 44-59pt; Android reports its own height.
  top: Platform.OS === 'ios' ? 47 : StatusBar.currentHeight || 24,
  bottom: Platform.OS === 'ios' ? 34 : 0,
  left: 0,
  right: 0,
};

function useSafeAreaInsets() {
  if (hook) {
    try {
      return hook();
    } catch (error) {
      // Thrown when there is no provider above this component.
      return FALLBACK;
    }
  }
  return FALLBACK;
}

module.exports = { useSafeAreaInsets, FALLBACK };
