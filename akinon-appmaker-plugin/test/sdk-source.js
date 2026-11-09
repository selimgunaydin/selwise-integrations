'use strict';

/**
 * Loads a module of the React Native SDK from its TypeScript SOURCE, for tests.
 *
 * ## Why
 *
 * At runtime the plugin reaches the SDK through `require('@selwise/react-native')`
 * — the app's dependency, not the plugin's — so a plugin test cannot resolve
 * it. The plugin's pure UI helpers therefore take the SDK's functions as
 * arguments (`countdownTarget`, `goalStepsCrossed`, `resolveGoalBar`), and a
 * test needs the REAL ones: a hand-written stand-in would test the plugin
 * against an answer the SDK does not give. Copying the functions into the
 * plugin would be a second implementation of a contract rule, which is the
 * class of defect `scripts/sync-vendored-page-targeting.js` exists to stop.
 *
 * So the SDK's own files are transpiled on the fly with the repo's TypeScript.
 * Not shipped: `files` in package.json does not list this directory.
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const SDK_SRC = path.resolve(__dirname, '../../react-native/src');
const cache = new Map();

function load(file) {
  const cached = cache.get(file);
  if (cached) return cached.exports;

  const source = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });

  const module = { exports: {} };
  cache.set(file, module);
  // The SDK spells its relative imports `./x.js` for native ESM; the source
  // file is `./x.ts`.
  const localRequire = (specifier) =>
    specifier.startsWith('.')
      ? load(path.resolve(path.dirname(file), specifier.replace(/\.js$/, '.ts')))
      : require(specifier);

  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', outputText)(localRequire, module, module.exports);
  return module.exports;
}

/** `loadSdkModule('vendor/dynamic-content.ts')` → that file's exports. */
function loadSdkModule(relative) {
  return load(path.join(SDK_SRC, relative));
}

module.exports = { loadSdkModule };
