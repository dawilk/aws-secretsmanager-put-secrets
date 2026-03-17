import * as core from "@actions/core";
import { setDefaultAutoSelectFamilyAttemptTimeout } from "net";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { putSecret, isAuthError } from "./utils.js";
import { getUserAgent } from "./constants.js";

export async function run(): Promise<void> {
  try {
    // Node 20 introduced automatic family selection for dual-stack endpoints. When the runner
    // sits far away from the secrets manager endpoint it sometimes timeouts on negotiation between
    // A and AAAA records. This behaviour was described in the https://github.com/nodejs/node/issues/54359
    const timeout = Number(core.getInput("auto-select-family-attempt-timeout"));
    if (timeout < 10 || Number.isNaN(timeout)) {
      core.setFailed(
        `Invalid value for 'auto-select-family-attempt-timeout': ${timeout}. Must be a number greater than or equal to 10.`,
      );
      return;
    }
    setDefaultAutoSelectFamilyAttemptTimeout(timeout);

    const client = new SecretsManagerClient({
      region: process.env.AWS_DEFAULT_REGION,
      customUserAgent: getUserAgent(),
    });

    const secretId = core.getInput("secret-id", { required: true });
    const secretValue = core.getInput("secret-value", { required: true });
    const tags = core.getInput("tags");

    await putSecret(client, { secretId, secretValue, tags });
    core.info("Completed putting secret.");
  } catch (error) {
    if (isAuthError(error)) {
      core.setFailed(
        "Failed to authenticate with AWS. Ensure configure-aws-credentials runs before this step and has valid credentials.",
      );
      return;
    }
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run();
