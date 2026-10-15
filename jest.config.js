/** @type {import('jest').Config} */
const config = {
  testMatch: ['**/tests/unit/**/*.[jt]s?(x)'],
  collectCoverageFrom: ['src/**/*.ts'],
  collectCoverage: true,
  transform: {
    '^.+\\.ts?$': ['ts-jest', { tsconfig: { types: ['node', 'jest'] } }],
  },
};

module.exports = config;
