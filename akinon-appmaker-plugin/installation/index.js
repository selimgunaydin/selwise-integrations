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
    // The SDK this plugin is written against. Its client holds the screen, the
    // product, the basket, the language and the consent answer this plugin feeds
    // it, and `@selwise/react-native/ui` (2.0.0) draws campaigns, strips, search
    // and enrichment with this plugin as the host. An older SDK has neither.
    // Keep in step with `packages/react-native/package.json`.
    '@selwise/react-native': '2.0.0'
  }
};
