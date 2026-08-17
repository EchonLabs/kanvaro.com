const nextJest = require('next/jest')

// Loads next.config.js and .env files, and wires up the SWC transform so no
// separate ts-jest/babel setup is needed.
const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const customJestConfig = {
  // Most of the suite is server-side logic (services, models, engines), so Node
  // is the default. Component tests opt in with a `@jest-environment jsdom`
  // docblock at the top of the file.
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // One shared in-memory MongoDB for the whole run; workers isolate by database
  // name. Starting one per suite made the integration tests flaky under
  // parallel workers.
  globalSetup: '<rootDir>/jest.global-setup.js',
  globalTeardown: '<rootDir>/jest.global-teardown.js',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
  // Jest's default also matches every file under `__tests__/`, which would treat
  // shared fixtures and harnesses (e.g. `__tests__/helpers/mongo.ts`) as empty
  // suites and fail the run. Only `*.test.*` files are suites.
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  // NOTE: `transformIgnorePatterns` is deliberately not set here. next/jest
  // always prepends '/node_modules/' and documents that custom config "can
  // append to transformIgnorePatterns but not modify it", so an override here
  // has no effect. Any ESM-only dependency that must be transformed (e.g. the
  // unified/remark/rehype chain used by the docs renderer) has to be added to
  // `transpilePackages` in next.config.js instead, which next/jest reads.
  collectCoverageFrom: [
    'src/lib/**/*.{ts,tsx}',
    'src/models/**/*.ts',
    '!src/**/*.d.ts'
  ],
  // mongodb-memory-server downloads a binary on first run and model-level
  // suites are slower than unit tests.
  testTimeout: 30000
}

module.exports = createJestConfig(customJestConfig)
