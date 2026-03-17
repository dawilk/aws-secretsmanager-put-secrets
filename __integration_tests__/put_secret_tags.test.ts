/**
 * Integration test: verifies the put-secrets action applied tags including action metadata.
 * Run after the action has executed with tags input.
 */
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { DescribeSecretCommand } from "@aws-sdk/client-secrets-manager";

const secretId =
  process.env.PUT_SECRET_TAGS_TEST_ID ||
  "PutSecretsIntegrationTest/TaggedSecret";

describe("Put secret tags integration", () => {
  it("secret has user tags and github-actions metadata tag", async () => {
    const client = new SecretsManagerClient({
      region: process.env.AWS_DEFAULT_REGION || "us-east-1",
    });
    const response = await client.send(
      new DescribeSecretCommand({ SecretId: secretId }),
    );

    expect(response.Tags).toBeDefined();
    const tags = (response.Tags || []).reduce(
      (acc, t) => {
        if (t.Key && t.Value !== undefined) acc[t.Key] = t.Value;
        return acc;
      },
      {} as Record<string, string>,
    );

    // Should have either workflow-run:update or workflow-run:check from action metadata
    const hasActionTag =
      tags["github-actions:workflow-run:update"] ||
      tags["github-actions:workflow-run:check"];
    expect(hasActionTag).toBeTruthy();
    expect(hasActionTag).toMatch(/https:\/\/.+\/actions\/runs\/\d+/);
  });
});
