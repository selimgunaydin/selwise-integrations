/**
 * Install manifest for Akinon App Maker.
 *
 * `dependencies` is the only field Selwise needs. The SDK is pure JavaScript —
 * no native module, no pod, no Gradle change — so there are deliberately no
 * `android`/`ios` install hooks. Adding empty ones would make the App Maker
 * CLI run a native install step on every build for no reason, and a plugin
 * that touches the native projects cannot be added to a merchant's app without
 * a release.
 */
module.exports = {
  dependencies: {
    // The SDK this plugin is written against: `setCart`, `resolveGoalBar`,
    // `countdownTarget` and, since 0.10.0, `RecommendationWidgetLoader` (strips
    // that follow the basket). Each degrades on an older SDK, but an install
    // should get this one. It was still pinned to 0.7.0, which has none of
    // them. Keep in step with `packages/react-native/package.json`. 1.2.0
    // adds `setAppState`, which the Live View's app heartbeat needs; 1.4.0
    // `trackDeepLink`, which credits a push or an e-mail that opens the app.
    '@selwise/react-native': '1.4.0'
  }
};
