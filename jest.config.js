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
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/../../tsconfig.server.json' }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../../coverage',
  testEnvironment: 'node',
};
