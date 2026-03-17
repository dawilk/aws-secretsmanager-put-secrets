/**
 * Integration test: verifies the put-secrets action successfully created/updated a JSON secret.
 * Run after the action has executed with a JSON secret-value.
 */
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const secretId =
  process.env.PUT_SECRET_JSON_TEST_ID || "PutSecretsIntegrationTest/JsonSecret";
const expectedJson =
  process.env.PUT_SECRET_JSON_TEST_VALUE ||
  '{"api_user":"user","api_key":"key","config":{"active":"true"}}';

describe("Put secret JSON integration", () => {
  it("JSON secret exists and matches expected structure", async () => {
    const client = new SecretsManagerClient({
      region: process.env.AWS_DEFAULT_REGION || "us-east-1",
    });
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretId }),
    );

    expect(response.SecretString).toBeDefined();
    const parsed = JSON.parse(response.SecretString!);
    const expected = JSON.parse(expectedJson);
    expect(parsed).toEqual(expected);
  });
});
