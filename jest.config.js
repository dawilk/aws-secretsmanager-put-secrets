// See: https://jestjs.io/docs/configuration

/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: ["./src/**"],
  coverageDirectory: "./coverage",
  coveragePathIgnorePatterns: ["/node_modules/", "/dist/"],
  coverageReporters: ["json-summary", "text", "lcov"],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 85,
      lines: 90,
      statements: 90,
    },
  },
  extensionsToTreatAsEsm: [".ts"],
  moduleFileExtensions: ["ts", "js"],
  preset: "ts-jest",
  reporters: ["default"],
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  testPathIgnorePatterns: ["/dist/", "/node_modules/", "/__integration_tests__/"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^aws-sdk-client-mock-jest$":
      "<rootDir>/node_modules/aws-sdk-client-mock-jest/dist/cjs/jest.js",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
        useESM: true,
      },
    ],
  },
  verbose: true,
};
