'use strict';

const fs = require('fs');
const path = require('path');

// Metro resolves every `require` when it bundles the app and refuses one whose
// argument is not a string literal ("Invalid call … require(name)"): the whole
// app then fails to build. Shipped files use literal module names only.
function shipped(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'test' ? [] : shipped(full);
    return entry.name.endsWith('.js') && !entry.name.endsWith('.spec.js') ? [full] : [];
  });
}

test('every require in a shipped file names its module literally', () => {
  const root = path.join(__dirname, '..');
  const offenders = [];
  for (const file of shipped(root)) {
    // A local editor extension can append its own instrumentation block to the
    // files a test reads; it is not part of the shipped source.
    const raw = fs.readFileSync(file, 'utf8');
    const cut = raw.indexOf(';function oo_cm(');
    const text = cut === -1 ? raw : raw.slice(0, raw.lastIndexOf('\n', cut));
    text.split('\n').forEach((line, index) => {
      if (/\brequire\(\s*[^'"`\s)]/.test(line) && !/^\s*(\/\/|\*)/.test(line)) {
        offenders.push(`${path.relative(root, file)}:${index + 1}: ${line.trim().slice(0, 120)}`);
      }
    });
  }
  expect(offenders).toEqual([]);
});
