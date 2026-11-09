module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx'],
  // Source imports carry explicit `.js` extensions so the emitted ESM resolves
  // under Node's native ESM as well as Metro. TypeScript maps `./x.js` back to
  // `./x.ts`; Jest's resolver does not, so it is mapped here.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};
