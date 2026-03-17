module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  collectCoverage: true,
  collectCoverageFrom: ["./src/**"],
  coverageReporters: ["json-summary", "text", "lcov"],
  coverageDirectory: "./coverage",
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/__integration_tests__/",
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 85,
      lines: 90,
      statements: 90,
    },
  },
};
