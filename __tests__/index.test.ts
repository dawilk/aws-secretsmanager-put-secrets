import { jest } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import {
  GetSecretValueCommand,
  CreateSecretCommand,
  DescribeSecretCommand,
  PutSecretValueCommand,
  TagResourceCommand,
  ResourceNotFoundException,
  InvalidParameterException,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const coreMock = {
  getInput: jest.fn(),
  setFailed: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

const netMock = {
  setDefaultAutoSelectFamilyAttemptTimeout: jest.fn(),
};

jest.unstable_mockModule("@actions/core", () => coreMock);
jest.unstable_mockModule("net", () => netMock);

const { run } = await import("../src/index.js");

const DEFAULT_TEST_ENV = {
  AWS_DEFAULT_REGION: "us-east-1",
  GITHUB_SERVER_URL: "https://github.com",
  GITHUB_REPOSITORY: "owner/repo",
  GITHUB_RUN_ID: "12345",
};

const smMockClient = mockClient(SecretsManagerClient);

const SECRET_ID = "my/secret";
const SECRET_VALUE = "my-secret-value";
const SECRET_ARN =
  "arn:aws:secretsmanager:us-east-1:123456789012:secret:my/secret-abc123";
const DEFAULT_TIMEOUT = "1000";

function mockGetInput(overrides: Record<string, string> = {}) {
  coreMock.getInput.mockImplementation((name: string) => {
    const defaults: Record<string, string> = {
      "auto-select-family-attempt-timeout": DEFAULT_TIMEOUT,
      "secret-id": SECRET_ID,
      "secret-value": SECRET_VALUE,
      tags: "",
    };
    return overrides[name] ?? defaults[name] ?? "";
  });
}

describe("put-secrets action", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    smMockClient.reset();
    process.env = { ...OLD_ENV, ...DEFAULT_TEST_ENV };
    mockGetInput();
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  test("auth error throws clear error", async () => {
    const authError = new Error(
      "The security token included in the request is invalid",
    );
    authError.name = "UnrecognizedClientException";
    smMockClient.on(GetSecretValueCommand).rejects(authError);

    await run();

    expect(coreMock.setFailed).toHaveBeenCalledWith(
      "Failed to authenticate with AWS. Ensure configure-aws-credentials runs before this step and has valid credentials.",
    );
  });

  test("secret not found creates secret with CreateSecret", async () => {
    smMockClient
      .on(GetSecretValueCommand)
      .rejects(
        new ResourceNotFoundException({
          $metadata: {},
          message: "Secret not found",
        }),
      )
      .on(CreateSecretCommand, { Name: SECRET_ID, SecretString: SECRET_VALUE })
      .resolves({ ARN: SECRET_ARN, Name: SECRET_ID });

    await run();

    expect(coreMock.setFailed).not.toHaveBeenCalled();
    expect(smMockClient).toHaveReceivedCommand(CreateSecretCommand);
    expect(smMockClient).toHaveReceivedCommandWith(CreateSecretCommand, {
      Name: SECRET_ID,
      SecretString: SECRET_VALUE,
    });
  });

  test("CreateSecret fails with descriptive error", async () => {
    smMockClient
      .on(GetSecretValueCommand)
      .rejects(
        new ResourceNotFoundException({
          $metadata: {},
          message: "Secret not found",
        }),
      )
      .on(CreateSecretCommand)
      .rejects(
        new InvalidParameterException({
          $metadata: {},
          message: "Invalid name format",
        }),
      );

    await run();

    expect(coreMock.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Invalid parameter when creating secret"),
    );
  });

  test("read fails throws clear error", async () => {
    smMockClient.on(GetSecretValueCommand).resolves({ Name: SECRET_ID }); // No SecretString or SecretBinary - invalid response

    await run();

    expect(coreMock.setFailed).toHaveBeenCalled();
  });

  test("JSON identical logs up-to-date and sets workflow-run:check tag", async () => {
    const jsonValue = '{"user":"admin","pass":"secret"}';
    mockGetInput({ "secret-value": jsonValue });

    smMockClient
      .on(GetSecretValueCommand)
      .resolves({ Name: SECRET_ID, SecretString: jsonValue })
      .on(DescribeSecretCommand)
      .resolves({ ARN: SECRET_ARN, Tags: [] })
      .on(TagResourceCommand)
      .resolves({});

    await run();

    expect(coreMock.setFailed).not.toHaveBeenCalled();
    expect(coreMock.info).toHaveBeenCalledWith(
      `Secret '${SECRET_ID}' is up-to-date.`,
    );
    expect(smMockClient).not.toHaveReceivedCommand(PutSecretValueCommand);
    expect(smMockClient).toHaveReceivedCommand(TagResourceCommand);
    const tagCalls = smMockClient.commandCalls(TagResourceCommand);
    expect(tagCalls.length).toBeGreaterThan(0);
    const tags = tagCalls[0].args[0].input.Tags ?? [];
    expect(tags).toContainEqual({
      Key: "github-actions:workflow-run:check",
      Value: "https://github.com/owner/repo/actions/runs/12345",
    });
  });

  test("non-JSON string equivalent logs up-to-date and does not put", async () => {
    smMockClient
      .on(GetSecretValueCommand)
      .resolves({ Name: SECRET_ID, SecretString: SECRET_VALUE })
      .on(DescribeSecretCommand)
      .resolves({ ARN: SECRET_ARN, Tags: [] })
      .on(TagResourceCommand)
      .resolves({});

    await run();

    expect(coreMock.setFailed).not.toHaveBeenCalled();
    expect(coreMock.info).toHaveBeenCalledWith(
      `Secret '${SECRET_ID}' is up-to-date.`,
    );
    expect(smMockClient).not.toHaveReceivedCommand(PutSecretValueCommand);
  });

  test("value changed puts secret and sets workflow-run:update tag", async () => {
    const newValue = "new-secret-value";
    mockGetInput({ "secret-value": newValue });

    smMockClient
      .on(GetSecretValueCommand)
      .resolves({ Name: SECRET_ID, SecretString: SECRET_VALUE })
      .on(DescribeSecretCommand)
      .resolves({ ARN: SECRET_ARN, Tags: [] })
      .on(PutSecretValueCommand)
      .resolves({})
      .on(TagResourceCommand)
      .resolves({});

    await run();

    expect(coreMock.setFailed).not.toHaveBeenCalled();
    expect(smMockClient).toHaveReceivedCommandWith(PutSecretValueCommand, {
      SecretId: SECRET_ID,
      SecretString: newValue,
    });
    const tagCalls = smMockClient.commandCalls(TagResourceCommand);
    expect(tagCalls.length).toBeGreaterThan(0);
    const tags = tagCalls[0].args[0].input.Tags ?? [];
    expect(tags).toContainEqual({
      Key: "github-actions:workflow-run:update",
      Value: "https://github.com/owner/repo/actions/runs/12345",
    });
  });

  test("tags merged and updated", async () => {
    mockGetInput({
      tags: '{"Environment":"prod","Team":"platform"}',
      "secret-value": "new-value",
    });

    smMockClient
      .on(GetSecretValueCommand)
      .resolves({ Name: SECRET_ID, SecretString: SECRET_VALUE })
      .on(DescribeSecretCommand)
      .resolves({ ARN: SECRET_ARN, Tags: [] })
      .on(PutSecretValueCommand)
      .resolves({})
      .on(TagResourceCommand)
      .resolves({});

    await run();

    const tagCalls = smMockClient.commandCalls(TagResourceCommand);
    expect(tagCalls.length).toBeGreaterThan(0);
    const tags = tagCalls[0].args[0].input.Tags ?? [];
    expect(tags).toContainEqual({ Key: "Environment", Value: "prod" });
    expect(tags).toContainEqual({ Key: "Team", Value: "platform" });
    expect(tags).toContainEqual({
      Key: "github-actions:workflow-run:update",
      Value: "https://github.com/owner/repo/actions/runs/12345",
    });
  });

  test("invalid tags JSON fails", async () => {
    mockGetInput({ tags: "invalid json {{{" });

    smMockClient
      .on(GetSecretValueCommand)
      .resolves({ Name: SECRET_ID, SecretString: SECRET_VALUE })
      .on(DescribeSecretCommand)
      .resolves({ ARN: SECRET_ARN });

    await run();

    expect(coreMock.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Invalid tags JSON"),
    );
  });

  test("handles invalid timeout string", async () => {
    mockGetInput({ "auto-select-family-attempt-timeout": "abc" });

    await run();

    expect(coreMock.setFailed).toHaveBeenCalled();
  });

  test("handles invalid timeout value (less than 10)", async () => {
    mockGetInput({ "auto-select-family-attempt-timeout": "9" });

    await run();

    expect(coreMock.setFailed).toHaveBeenCalled();
  });

  test("handles valid timeout value", async () => {
    mockGetInput({ "auto-select-family-attempt-timeout": "3000" });
    smMockClient
      .on(GetSecretValueCommand)
      .resolves({ Name: SECRET_ID, SecretString: SECRET_VALUE })
      .on(DescribeSecretCommand)
      .resolves({ ARN: SECRET_ARN });

    await run();

    expect(netMock.setDefaultAutoSelectFamilyAttemptTimeout).toHaveBeenCalledWith(
      3000,
    );
  });
});
