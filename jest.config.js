/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  // Ignore the Next.js app directory since it has special build requirements
  modulePathIgnorePatterns: ['.next', 'node_modules'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};

module.exports = config;