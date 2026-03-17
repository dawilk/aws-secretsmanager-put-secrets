import packageJson from "../package.json" with { type: "json" };

export const ACTION_VERSION = `v${packageJson.version}`;

export function getUserAgent(): string {
  return `github-action/${ACTION_VERSION}`;
}
