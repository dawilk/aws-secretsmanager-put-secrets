/**
 * Integration test: verifies the put-secrets action successfully created/updated a basic string secret.
 * Run after the action has executed. Uses env vars set by workflow to match action inputs.
 */
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const secretId =
  process.env.PUT_SECRET_TEST_ID || "PutSecretsIntegrationTest/BasicSecret";
const expectedValue =
  process.env.PUT_SECRET_TEST_VALUE || "integration-test-basic-value";

describe("Put secret basic integration", () => {
  it("secret exists in AWS and has expected value", async () => {
    const client = new SecretsManagerClient({
      region: process.env.AWS_DEFAULT_REGION || "us-east-1",
    });
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretId }),
    );

    expect(response.SecretString).toBe(expectedValue);
    expect(response.Name).toBe(secretId);
  });
});
