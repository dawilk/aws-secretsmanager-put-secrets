import path from "node:path";
import packageJson from "../package.json" with { type: "json" };

/** Package semver (e.g. v2.0.11); used when the action ref cannot be resolved at runtime. */
export const ACTION_VERSION = `v${packageJson.version}`;

const FULL_SHA_HEX = /^[a-f0-9]{40}$/i;

/**
 * Resolves the action ref or commit SHA available at runtime on GitHub Actions, or the package
 * semver when running locally or when the runner does not expose ref metadata.
 */
export function getActionRefOrSha(): string {
  const actionRef = process.env.GITHUB_ACTION_REF?.trim();
  if (actionRef) {
    return actionRef;
  }

  const actionPath = process.env.GITHUB_ACTION_PATH?.trim();
  if (actionPath) {
    const base = path.basename(actionPath);
    if (FULL_SHA_HEX.test(base)) {
      return base;
    }
  }

  return ACTION_VERSION;
}

export function getUserAgent(): string {
  return `github-action/${getActionRefOrSha()}`;
}
