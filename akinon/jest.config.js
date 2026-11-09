/**
 * Test runner for the Akinon integration kit.
 *
 * The kit ships plain browser JS (it is pasted into Django templates and Next
 * `<Script>` tags, not bundled), so this config is deliberately transform-free.
 */
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.spec.js'],
};
