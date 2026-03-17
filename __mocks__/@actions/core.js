/* Manual mock for @actions/core (ESM-only) so Jest can resolve it in CommonJS tests. */
module.exports = {
  getInput: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  exportVariable: jest.fn(),
  setSecret: jest.fn(),
  addPath: jest.fn(),
  addMask: jest.fn(),
  isDebug: jest.fn(),
  toPosixPath: jest.fn((p) => p),
  toWin32Path: jest.fn((p) => p),
  ExitCode: { Success: 0, Failure: 1 },
};
