// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require('../package.json');
export const ACTION_VERSION = `v${packageJson.version}`;

export function getUserAgent(): string {
    return `github-action/${ACTION_VERSION}`;
}
