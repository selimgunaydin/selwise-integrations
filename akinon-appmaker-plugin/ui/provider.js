'use strict';

/**
 * The SDK's provider, connected to this plugin: shared by the `ui` entry and by
 * the screens the plugin ships, which mount their own.
 */

const React = require('react');
const sdk = require('@selwise/react-native/ui');
const plugin = require('../integration/index.js');
const { hostOf } = require('./host.js');

const h = React.createElement;

/**
 * The SDK's provider, connected to this plugin. Mount it once, around the app:
 *
 * ```jsx
 * <SelwiseProvider>
 *   <BaseApp {...props} />
 *   <SelwiseSurfaces />
 * </SelwiseProvider>
 * ```
 *
 * `host` overrides any part of what the plugin answers (a different `navigate`,
 * say). Without a configured plugin there is no client, and the children render
 * as they are.
 */
function SelwiseProvider(props) {
  const own = hostOf(plugin);
  const extra = props.host;
  const host = React.useMemo(() => (extra ? Object.assign({}, own, extra) : own), [own, extra]);
  if (!plugin.selwise) return h(React.Fragment, null, props.children);
  return h(sdk.SelwiseProvider, { client: plugin.selwise, host: host }, props.children);
}

module.exports = { SelwiseProvider };
