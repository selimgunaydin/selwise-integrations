import * as fs from 'fs';
import * as path from 'path';

/**
 * The package is compiled by the app's own Metro + Babel, whose React Native
 * preset does not transform every syntax TypeScript lets through. Each pattern
 * here once broke (or would break) an app's bundle with "should be first
 * transformed by …".
 */
const UNSUPPORTED: ReadonlyArray<[RegExp, string]> = [
  [/^\s*export \* as \w+ from /m, '`export * as name from` (needs @babel/plugin-transform-export-namespace-from)'],
];

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'test' ? [] : sources(full);
    return /\.tsx?$/.test(entry.name) && !/\.spec\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('syntax an app bundler can read', () => {
  it('uses none of the syntax the React Native Babel preset refuses', () => {
    const offenders: string[] = [];
    for (const file of sources(path.join(__dirname))) {
      const text = fs.readFileSync(file, 'utf8');
      for (const [pattern, what] of UNSUPPORTED) {
        if (pattern.test(text)) offenders.push(`${path.relative(__dirname, file)}: ${what}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
