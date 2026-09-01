/**
 * Jest runs the Nest server suites only.
 *
 * The frontend uses Vitest (see vitest.config.ts, which excludes src/server).
 * Keeping the two runners split means the backend's 18 existing suites carry
 * over from louella-be unchanged rather than being rewritten as part of a
 * deployment change.
 */
module.exports = {
  rootDir: 'src/server',
  moduleFileExtensions: ['js', 'json', 'ts'],
  // Server code shares the RBAC manifest with the frontend via the `@/` alias
  // (tsconfig paths). rootDir is src/server, so Jest needs the mapping spelled
  // out or those imports fail to resolve under ts-jest.
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/../$1' },
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/../../tsconfig.server.json' }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../../coverage',
  testEnvironment: 'node',
};
