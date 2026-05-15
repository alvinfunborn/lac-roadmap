/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)'],
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/__tests__/__mocks__/obsidian.ts',
    '\\.(css|scss|svg|png)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        target: 'ES2018',
        module: 'commonjs',
        skipLibCheck: true,
      },
      diagnostics: { ignoreCodes: [151001] },
    }],
  },
  setupFiles: ['<rootDir>/__tests__/jest.setup.ts'],
  collectCoverageFrom: [
    'utils/**/*.ts',
    'services/**/*.ts',
    'components/**/*.{ts,tsx}',
    'pages/**/*.{ts,tsx}',
    'repositories/**/*.ts',
    '!**/*.d.ts',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/__mocks__/', '/__tests__/jest.setup.ts'],
};
