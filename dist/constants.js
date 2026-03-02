"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTION_VERSION = void 0;
exports.getUserAgent = getUserAgent;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require('../package.json');
exports.ACTION_VERSION = `v${packageJson.version}`;
function getUserAgent() {
    return `github-action/${exports.ACTION_VERSION}`;
}
