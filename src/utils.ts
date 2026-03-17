import * as core from "@actions/core";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  CreateSecretCommand,
  DescribeSecretCommand,
  PutSecretValueCommand,
  TagResourceCommand,
  ResourceNotFoundException,
  InvalidParameterException,
  LimitExceededException,
  ResourceExistsException,
} from "@aws-sdk/client-secrets-manager";
import "aws-sdk-client-mock-jest";

export interface SecretValueResponse {
  name: string;
  secretValue: string;
}

const AUTH_ERROR_NAMES = [
  "UnrecognizedClientException",
  "InvalidClientTokenId",
  "ExpiredToken",
  "CredentialsProviderError",
];

/**
 * Checks if an error is an AWS authentication/credentials error
 */
export function isAuthError(error: unknown): boolean {
  return error instanceof Error && AUTH_ERROR_NAMES.includes(error.name);
}

/**
 * Retrieves a secret from Secrets Manager
 */
export async function getSecretValue(
  client: SecretsManagerClient,
  secretId: string,
): Promise<SecretValueResponse> {
  let secretValue = "";

  const data = await client.send(
    new GetSecretValueCommand({ SecretId: secretId }),
  );

  if (data.SecretString) {
    secretValue = data.SecretString as string;
  } else if (data.SecretBinary) {
    secretValue = Buffer.from(data.SecretBinary).toString("ascii");
  }

  if (!data.Name) {
    throw new Error("Invalid name for secret");
  }

  return {
    name: data.Name,
    secretValue,
  } as SecretValueResponse;
}

/**
 * Creates a new secret in Secrets Manager
 */
export async function createSecret(
  client: SecretsManagerClient,
  secretId: string,
  secretValue: string,
): Promise<{ arn: string; name: string }> {
  try {
    const response = await client.send(
      new CreateSecretCommand({
        Name: secretId,
        SecretString: secretValue,
      }),
    );

    if (!response.ARN || !response.Name) {
      throw new Error("Invalid response from CreateSecret");
    }

    return { arn: response.ARN, name: response.Name };
  } catch (err) {
    if (err instanceof InvalidParameterException) {
      throw new Error(
        `Invalid parameter when creating secret '${secretId}': ${err.message}`,
      );
    }
    if (err instanceof LimitExceededException) {
      throw new Error(
        "Too many secrets. Delete unused secrets or request a quota increase.",
      );
    }
    if (err instanceof ResourceExistsException) {
      throw new Error(
        `Secret '${secretId}' already exists (race condition). Retry the action.`,
      );
    }
    throw new Error(
      `Failed to create secret '${secretId}': ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Describes a secret to get metadata and tags
 */
export async function describeSecret(
  client: SecretsManagerClient,
  secretId: string,
): Promise<{ arn: string; tags?: Record<string, string> }> {
  const response = await client.send(
    new DescribeSecretCommand({ SecretId: secretId }),
  );

  if (!response.ARN) {
    throw new Error("Invalid response from DescribeSecret: missing ARN");
  }

  const tags: Record<string, string> = {};
  if (response.Tags) {
    for (const tag of response.Tags) {
      if (tag.Key && tag.Value !== undefined) {
        tags[tag.Key] = tag.Value;
      }
    }
  }

  return { arn: response.ARN, tags };
}

/**
 * Checks if the given string is valid JSON (object, not array or primitive)
 */
export function isJSONString(secretValue: string): boolean {
  try {
    const parsedObject = JSON.parse(secretValue);
    return (
      !!parsedObject &&
      typeof parsedObject === "object" &&
      !Array.isArray(parsedObject)
    );
  } catch {
    return false;
  }
}

/**
 * Compares two JSON strings semantically (handles whitespace and key order)
 */
function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  return Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce(
      (acc, k) => {
        (acc as Record<string, unknown>)[k] = sortKeys(
          (obj as Record<string, unknown>)[k],
        );
        return acc;
      },
      {} as Record<string, unknown>,
    );
}

export function jsonEqual(a: string, b: string): boolean {
  try {
    const objA = JSON.parse(a);
    const objB = JSON.parse(b);
    return JSON.stringify(sortKeys(objA)) === JSON.stringify(sortKeys(objB));
  } catch {
    return false;
  }
}

/**
 * Returns true if existing and input values are equivalent (no update needed)
 * For JSON: semantic comparison. For plain strings: exact match.
 */
export function valuesEquivalent(existing: string, input: string): boolean {
  if (isJSONString(existing) && isJSONString(input)) {
    return jsonEqual(existing, input);
  }
  return existing === input;
}

/**
 * Parses the tags input (JSON object string) into a record
 */
export function parseTagsInput(tagsStr: string): Record<string, string> {
  if (!tagsStr || tagsStr.trim() === "") {
    return {};
  }
  try {
    const parsed = JSON.parse(tagsStr);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("Tags must be a JSON object");
    }
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (
        typeof k === "string" &&
        (typeof v === "string" || typeof v === "number")
      ) {
        result[k] = String(v);
      }
    }
    return result;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid tags JSON: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Builds the GitHub Actions workflow run URL from environment variables
 */
export function buildWorkflowRunUrl(): string | undefined {
  const serverUrl = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!serverUrl || !repository || !runId) {
    return undefined;
  }
  return `${serverUrl.replace(/\/$/, "")}/${repository}/actions/runs/${runId}`;
}

/**
 * Merges user tags with a single action metadata tag
 */
export function mergeTags(
  userTags: Record<string, string>,
  actionTag: { key: string; value: string },
): Record<string, string> {
  return { ...userTags, [actionTag.key]: actionTag.value };
}

/**
 * Returns true if tags need to be updated (missing keys or different values)
 */
export function tagsNeedUpdate(
  current: Record<string, string>,
  desired: Record<string, string>,
): boolean {
  for (const [key, value] of Object.entries(desired)) {
    if (current[key] !== value) {
      return true;
    }
  }
  return false;
}

/**
 * Puts a new secret value (updates existing secret)
 */
export async function putSecretValue(
  client: SecretsManagerClient,
  secretId: string,
  secretValue: string,
): Promise<void> {
  await client.send(
    new PutSecretValueCommand({
      SecretId: secretId,
      SecretString: secretValue,
    }),
  );
}

/**
 * Applies tags to a secret
 */
export async function tagResource(
  client: SecretsManagerClient,
  secretId: string,
  tags: Record<string, string>,
): Promise<void> {
  const tagsArray = Object.entries(tags).map(([Key, Value]) => ({
    Key,
    Value,
  }));
  if (tagsArray.length === 0) return;

  await client.send(
    new TagResourceCommand({
      SecretId: secretId,
      Tags: tagsArray,
    }),
  );
}

export interface PutSecretInputs {
  secretId: string;
  secretValue: string;
  tags: string;
}

/**
 * Orchestrates the put-secret flow: get/create, compare, put if changed, merge tags, tag if needed
 */
export async function putSecret(
  client: SecretsManagerClient,
  inputs: PutSecretInputs,
): Promise<void> {
  const { secretId, secretValue, tags: tagsInput } = inputs;
  const userTags = parseTagsInput(tagsInput);
  const workflowRunUrl = buildWorkflowRunUrl();

  let secretArn: string;
  let didUpdate = false;

  try {
    const existing = await getSecretValue(client, secretId);
    secretArn = (await describeSecret(client, secretId)).arn;

    if (valuesEquivalent(existing.secretValue, secretValue)) {
      core.info(`Secret '${secretId}' is up-to-date.`);
      const actionTag = workflowRunUrl
        ? { key: "github-actions:workflow-run:check", value: workflowRunUrl }
        : null;
      const desiredTags = actionTag ? mergeTags(userTags, actionTag) : userTags;
      if (Object.keys(desiredTags).length > 0) {
        const { tags: currentTags } = await describeSecret(client, secretId);
        if (tagsNeedUpdate(currentTags ?? {}, desiredTags)) {
          await tagResource(client, secretArn, desiredTags);
        }
      }
      return;
    }

    await putSecretValue(client, secretId, secretValue);
    didUpdate = true;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      const createResult = await createSecret(client, secretId, secretValue);
      secretArn = createResult.arn;
      didUpdate = true;
    } else {
      throw err;
    }
  }

  if (didUpdate && workflowRunUrl) {
    const actionTag = {
      key: "github-actions:workflow-run:update",
      value: workflowRunUrl,
    };
    const desiredTags = mergeTags(userTags, actionTag);
    if (Object.keys(desiredTags).length > 0) {
      await tagResource(client, secretArn, desiredTags);
    }
  } else if (didUpdate && Object.keys(userTags).length > 0) {
    await tagResource(client, secretArn, userTags);
  }
}
