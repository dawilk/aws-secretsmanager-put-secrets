import { jest } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import {
  GetSecretValueCommand,
  CreateSecretCommand,
  DescribeSecretCommand,
  PutSecretValueCommand,
  ListSecretVersionIdsCommand,
  UpdateSecretVersionStageCommand,
  TagResourceCommand,
  ResourceNotFoundException,
  InvalidParameterException,
  LimitExceededException,
  ResourceExistsException,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const coreMock = {
  getInput: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
};

jest.unstable_mockModule("@actions/core", () => coreMock);

const {
  getSecretValue,
  createSecret,
  describeSecret,
  putSecretValue,
  tagResource,
  putSecret,
  isAuthError,
  isJSONString,
  jsonEqual,
  valuesEquivalent,
  parseTagsInput,
  buildWorkflowRunUrl,
  mergeTags,
  tagsNeedUpdate,
  parseDotenvTextToJsonSecretString,
} = await import("../src/utils.js");
const { ACTION_VERSION, getActionRefOrSha, getUserAgent } =
  await import("../src/constants.js");

const TEST_NAME = "test/secret";
const TEST_VALUE = "test!secret!value!";
const TEST_ARN =
  "arn:aws:secretsmanager:us-east-1:123456789012:secret:test/secret-abc123";

const smClient = new SecretsManagerClient({});
const smMockClient = mockClient(smClient);

describe("getSecretValue", () => {
  beforeEach(() => {
    smMockClient.reset();
  });

  test("retrieves a secret string", async () => {
    smMockClient.on(GetSecretValueCommand).resolves({
      Name: TEST_NAME,
      SecretString: TEST_VALUE,
    });

    const result = await getSecretValue(smClient, TEST_NAME);
    expect(result.secretValue).toStrictEqual(TEST_VALUE);
    expect(result.name).toStrictEqual(TEST_NAME);
  });

  test("retrieves binary secret", async () => {
    const bytes = new TextEncoder().encode(TEST_VALUE);
    smMockClient.on(GetSecretValueCommand).resolves({
      Name: TEST_NAME,
      SecretBinary: bytes,
    });

    const result = await getSecretValue(smClient, TEST_NAME);
    expect(result.secretValue).toStrictEqual(TEST_VALUE);
  });

  test("returns empty string when secret has neither SecretString nor SecretBinary", async () => {
    smMockClient.on(GetSecretValueCommand).resolves({
      Name: TEST_NAME,
    });

    const result = await getSecretValue(smClient, TEST_NAME);
    expect(result.secretValue).toBe("");
    expect(result.name).toBe(TEST_NAME);
  });

  test("throws if unable to retrieve", async () => {
    smMockClient
      .on(GetSecretValueCommand)
      .rejects(
        new ResourceNotFoundException({ $metadata: {}, message: "Error" }),
      );
    await expect(getSecretValue(smClient, TEST_NAME)).rejects.toThrow();
  });

  test("throws if secret value invalid (no name)", async () => {
    smMockClient
      .on(GetSecretValueCommand)
      .resolves({ SecretString: TEST_VALUE });
    await expect(getSecretValue(smClient, TEST_NAME)).rejects.toThrow(
      "Invalid name",
    );
  });
});

describe("createSecret", () => {
  beforeEach(() => {
    smMockClient.reset();
  });

  test("creates secret successfully", async () => {
    smMockClient.on(CreateSecretCommand).resolves({
      ARN: TEST_ARN,
      Name: TEST_NAME,
    });

    const result = await createSecret(smClient, TEST_NAME, TEST_VALUE);
    expect(result.arn).toBe(TEST_ARN);
    expect(result.name).toBe(TEST_NAME);
    expect(smMockClient).toHaveReceivedCommandWith(CreateSecretCommand, {
      Name: TEST_NAME,
      SecretString: TEST_VALUE,
    });
  });

  test("throws when CreateSecret returns invalid response (missing ARN)", async () => {
    smMockClient.on(CreateSecretCommand).resolves({ Name: TEST_NAME });

    await expect(createSecret(smClient, TEST_NAME, TEST_VALUE)).rejects.toThrow(
      "Invalid response from CreateSecret",
    );
  });

  test("throws descriptive error on InvalidParameterException", async () => {
    smMockClient
      .on(CreateSecretCommand)
      .rejects(
        new InvalidParameterException({ $metadata: {}, message: "Bad name" }),
      );

    await expect(createSecret(smClient, TEST_NAME, TEST_VALUE)).rejects.toThrow(
      "Invalid parameter when creating secret 'test/secret': Bad name",
    );
  });

  test("throws descriptive error on LimitExceededException", async () => {
    smMockClient.on(CreateSecretCommand).rejects(
      new LimitExceededException({
        $metadata: {},
        message: "Quota exceeded",
      }),
    );

    await expect(createSecret(smClient, TEST_NAME, TEST_VALUE)).rejects.toThrow(
      "Too many secrets. Delete unused secrets or request a quota increase.",
    );
  });

  test("throws descriptive error on ResourceExistsException (race condition)", async () => {
    smMockClient.on(CreateSecretCommand).rejects(
      new ResourceExistsException({
        $metadata: {},
        message: "Already exists",
      }),
    );

    await expect(createSecret(smClient, TEST_NAME, TEST_VALUE)).rejects.toThrow(
      "Secret 'test/secret' already exists (race condition). Retry the action.",
    );
  });

  test("throws generic error for other CreateSecret failures", async () => {
    smMockClient
      .on(CreateSecretCommand)
      .rejects(new Error("Internal server error"));

    await expect(createSecret(smClient, TEST_NAME, TEST_VALUE)).rejects.toThrow(
      "Failed to create secret 'test/secret': Internal server error",
    );
  });

  test("throws generic error when CreateSecret rejects a non-Error", async () => {
    smMockClient.on(CreateSecretCommand).rejects("not-an-error-object");

    await expect(createSecret(smClient, TEST_NAME, TEST_VALUE)).rejects.toThrow(
      "Failed to create secret 'test/secret': not-an-error-object",
    );
  });
});

describe("describeSecret", () => {
  beforeEach(() => {
    smMockClient.reset();
  });

  test("returns ARN and tags", async () => {
    smMockClient.on(DescribeSecretCommand).resolves({
      ARN: TEST_ARN,
      Tags: [
        { Key: "Env", Value: "prod" },
        { Key: "Team", Value: "platform" },
      ],
    });

    const result = await describeSecret(smClient, TEST_NAME);
    expect(result.arn).toBe(TEST_ARN);
    expect(result.tags).toEqual({ Env: "prod", Team: "platform" });
  });

  test("returns empty tags when none", async () => {
    smMockClient.on(DescribeSecretCommand).resolves({ ARN: TEST_ARN });

    const result = await describeSecret(smClient, TEST_NAME);
    expect(result.arn).toBe(TEST_ARN);
    expect(result.tags).toEqual({});
  });

  test("throws when DescribeSecret returns no ARN", async () => {
    smMockClient.on(DescribeSecretCommand).resolves({ Tags: [] });

    await expect(describeSecret(smClient, TEST_NAME)).rejects.toThrow(
      "Invalid response from DescribeSecret: missing ARN",
    );
  });

  test("skips tags with missing Key or Value", async () => {
    smMockClient.on(DescribeSecretCommand).resolves({
      ARN: TEST_ARN,
      Tags: [
        { Key: "Valid", Value: "ok" },
        { Key: "", Value: "skip" },
        { Key: "NoValue", Value: undefined },
      ],
    });

    const result = await describeSecret(smClient, TEST_NAME);
    expect(result.tags).toEqual({ Valid: "ok" });
  });
});

describe("putSecretValue", () => {
  beforeEach(() => {
    smMockClient.reset();
    jest.clearAllMocks();
  });

  test("calls PutSecretValueCommand", async () => {
    smMockClient.on(PutSecretValueCommand).resolves({});

    await putSecretValue(smClient, TEST_NAME, TEST_VALUE);

    expect(smMockClient).toHaveReceivedCommandWith(PutSecretValueCommand, {
      SecretId: TEST_NAME,
      SecretString: TEST_VALUE,
    });
  });

  test("rethrows non-limit errors from PutSecretValue without recovery", async () => {
    smMockClient
      .on(PutSecretValueCommand)
      .rejects(new Error("network failure"));

    await expect(
      putSecretValue(smClient, TEST_NAME, TEST_VALUE),
    ).rejects.toThrow("network failure");

    expect(smMockClient).not.toHaveReceivedCommand(ListSecretVersionIdsCommand);
  });

  test("on version limit, deprecates non-current versions and retries put", async () => {
    const oldDate = new Date("2020-01-01T00:00:00.000Z");
    const newDate = new Date("2020-06-01T00:00:00.000Z");

    smMockClient
      .on(PutSecretValueCommand)
      .rejectsOnce(
        new LimitExceededException({
          $metadata: {},
          message: "Too many versions",
        }),
      )
      .resolves({});

    smMockClient.on(ListSecretVersionIdsCommand).resolves({
      Versions: [
        {
          VersionId: "ver-old",
          VersionStages: ["AWSPREVIOUS"],
          CreatedDate: oldDate,
        },
        {
          VersionId: "ver-current",
          VersionStages: ["AWSCURRENT"],
          CreatedDate: newDate,
        },
      ],
    });

    smMockClient.on(UpdateSecretVersionStageCommand).resolves({});

    await putSecretValue(smClient, TEST_NAME, TEST_VALUE);

    expect(coreMock.warning).toHaveBeenCalledWith(
      expect.stringContaining("Secret version limit reached"),
    );
    expect(smMockClient).toHaveReceivedCommandWith(
      ListSecretVersionIdsCommand,
      {
        SecretId: TEST_NAME,
        IncludeDeprecated: true,
      },
    );
    expect(smMockClient).toHaveReceivedCommandWith(
      UpdateSecretVersionStageCommand,
      {
        SecretId: TEST_NAME,
        VersionStage: "AWSPREVIOUS",
        RemoveFromVersionId: "ver-old",
      },
    );
    expect(smMockClient.commandCalls(PutSecretValueCommand).length).toBe(2);
  });

  test("rethrows with context when retry after version limit fails", async () => {
    smMockClient.on(PutSecretValueCommand).rejects(
      new LimitExceededException({
        $metadata: {},
        message: "Too many versions",
      }),
    );

    smMockClient.on(ListSecretVersionIdsCommand).resolves({
      Versions: [
        {
          VersionId: "ver-old",
          VersionStages: ["AWSPREVIOUS"],
          CreatedDate: new Date("2020-01-01"),
        },
        {
          VersionId: "ver-current",
          VersionStages: ["AWSCURRENT"],
          CreatedDate: new Date("2020-06-01"),
        },
      ],
    });

    smMockClient.on(UpdateSecretVersionStageCommand).resolves({});

    await expect(
      putSecretValue(smClient, TEST_NAME, TEST_VALUE),
    ).rejects.toThrow(
      /PutSecretValue failed after attempting to free secret versions/,
    );
  });

  test("retry failure includes non-Error rejection message", async () => {
    smMockClient
      .on(PutSecretValueCommand)
      .rejectsOnce(
        new LimitExceededException({
          $metadata: {},
          message: "Too many versions",
        }),
      )
      .rejectsOnce("quota");

    smMockClient.on(ListSecretVersionIdsCommand).resolves({
      Versions: [
        {
          VersionId: "ver-old",
          VersionStages: ["AWSPREVIOUS"],
          CreatedDate: new Date("2020-01-01"),
        },
        {
          VersionId: "ver-current",
          VersionStages: ["AWSCURRENT"],
          CreatedDate: new Date("2020-06-01"),
        },
      ],
    });

    smMockClient.on(UpdateSecretVersionStageCommand).resolves({});

    await expect(
      putSecretValue(smClient, TEST_NAME, TEST_VALUE),
    ).rejects.toThrow(
      /PutSecretValue failed after attempting to free secret versions: quota/,
    );
  });

  test("paginates ListSecretVersionIds when deprecating", async () => {
    const oldDate = new Date("2020-01-01T00:00:00.000Z");
    const newDate = new Date("2020-06-01T00:00:00.000Z");

    smMockClient
      .on(PutSecretValueCommand)
      .rejectsOnce(
        new LimitExceededException({
          $metadata: {},
          message: "Too many versions",
        }),
      )
      .resolves({});

    smMockClient
      .on(ListSecretVersionIdsCommand)
      .resolvesOnce({
        Versions: [
          {
            VersionId: "ver-old",
            VersionStages: ["AWSPREVIOUS"],
            CreatedDate: oldDate,
          },
        ],
        NextToken: "next-page",
      })
      .resolvesOnce({
        Versions: [
          {
            VersionId: "ver-current",
            VersionStages: ["AWSCURRENT"],
            CreatedDate: newDate,
          },
        ],
      });

    smMockClient.on(UpdateSecretVersionStageCommand).resolves({});

    await putSecretValue(smClient, TEST_NAME, TEST_VALUE);

    const listCalls = smMockClient.commandCalls(ListSecretVersionIdsCommand);
    expect(listCalls.length).toBe(2);
    expect(listCalls[1].args[0].input).toMatchObject({
      NextToken: "next-page",
    });
  });

  test("skips version entries with no VersionId when deprecating", async () => {
    smMockClient
      .on(PutSecretValueCommand)
      .rejectsOnce(
        new LimitExceededException({
          $metadata: {},
          message: "Too many versions",
        }),
      )
      .resolves({});

    smMockClient.on(ListSecretVersionIdsCommand).resolves({
      Versions: [
        {
          VersionStages: ["AWSPREVIOUS"],
          CreatedDate: new Date("2019-01-01"),
        },
        {
          VersionId: "ver-current",
          VersionStages: ["AWSCURRENT"],
          CreatedDate: new Date("2020-06-01"),
        },
      ],
    });

    smMockClient.on(UpdateSecretVersionStageCommand).resolves({});

    await putSecretValue(smClient, TEST_NAME, TEST_VALUE);

    expect(smMockClient).not.toHaveReceivedCommand(
      UpdateSecretVersionStageCommand,
    );
  });

  test("deprecates versions missing CreatedDate and skips empty VersionStages", async () => {
    smMockClient
      .on(PutSecretValueCommand)
      .rejectsOnce(
        new LimitExceededException({
          $metadata: {},
          message: "Too many versions",
        }),
      )
      .resolves({});

    smMockClient.on(ListSecretVersionIdsCommand).resolves({
      Versions: [
        {
          VersionId: "ver-old",
          VersionStages: ["AWSPREVIOUS"],
        },
        {
          VersionId: "ver-no-stages",
          CreatedDate: new Date("2019-01-01"),
          VersionStages: [],
        },
        {
          VersionId: "ver-current",
          VersionStages: ["AWSCURRENT"],
          CreatedDate: new Date("2020-06-01"),
        },
      ],
    });

    smMockClient.on(UpdateSecretVersionStageCommand).resolves({});

    await putSecretValue(smClient, TEST_NAME, TEST_VALUE);

    expect(smMockClient).toHaveReceivedCommandWith(
      UpdateSecretVersionStageCommand,
      {
        SecretId: TEST_NAME,
        VersionStage: "AWSPREVIOUS",
        RemoveFromVersionId: "ver-old",
      },
    );
    const updateCalls = smMockClient.commandCalls(
      UpdateSecretVersionStageCommand,
    );
    expect(updateCalls.length).toBe(1);
  });
});

describe("tagResource", () => {
  beforeEach(() => {
    smMockClient.reset();
  });

  test("calls TagResourceCommand with tags array", async () => {
    smMockClient.on(TagResourceCommand).resolves({});

    await tagResource(smClient, TEST_NAME, { Env: "prod", Team: "platform" });

    expect(smMockClient).toHaveReceivedCommandWith(TagResourceCommand, {
      SecretId: TEST_NAME,
      Tags: [
        { Key: "Env", Value: "prod" },
        { Key: "Team", Value: "platform" },
      ],
    });
  });

  test("does not call when tags empty", async () => {
    await tagResource(smClient, TEST_NAME, {});

    expect(smMockClient).not.toHaveReceivedCommand(TagResourceCommand);
  });
});

describe("isAuthError", () => {
  test("returns true for UnrecognizedClientException", () => {
    const err = new Error("token invalid");
    err.name = "UnrecognizedClientException";
    expect(isAuthError(err)).toBe(true);
  });

  test("returns true for InvalidClientTokenId", () => {
    const err = new Error("bad token");
    err.name = "InvalidClientTokenId";
    expect(isAuthError(err)).toBe(true);
  });

  test("returns true for ExpiredToken", () => {
    const err = new Error("token expired");
    err.name = "ExpiredToken";
    expect(isAuthError(err)).toBe(true);
  });

  test("returns true for CredentialsProviderError", () => {
    const err = new Error("credentials failed");
    err.name = "CredentialsProviderError";
    expect(isAuthError(err)).toBe(true);
  });

  test("returns false for ResourceNotFoundException", () => {
    const err = new ResourceNotFoundException({
      $metadata: {},
      message: "Not found",
    });
    expect(isAuthError(err)).toBe(false);
  });

  test("returns false for generic Error", () => {
    expect(isAuthError(new Error("something"))).toBe(false);
  });
});

describe("isJSONString", () => {
  test("returns false for number", () => {
    expect(isJSONString("100")).toBe(false);
  });

  test("returns false for array", () => {
    expect(isJSONString('["a", "b"]')).toBe(false);
  });

  test("returns false for invalid JSON", () => {
    expect(isJSONString('{ a: "100" }')).toBe(false);
    expect(isJSONString("")).toBe(false);
  });

  test("returns true for valid JSON object", () => {
    expect(isJSONString('{"a": "yes", "b": "no"}')).toBe(true);
    expect(isJSONString('{"nested": {"x": 1}}')).toBe(true);
  });
});

describe("jsonEqual", () => {
  test("returns true for identical JSON", () => {
    expect(jsonEqual('{"a":1,"b":2}', '{"a":1,"b":2}')).toBe(true);
  });

  test("returns true for equivalent JSON with different key order - all same key-values present", () => {
    // Real-world: database config stored with different key order
    const dbConfigA =
      '{"host":"db.example.com","port":5432,"database":"app","user":"admin","password":"secret"}';
    const dbConfigB =
      '{"password":"secret","user":"admin","database":"app","port":5432,"host":"db.example.com"}';
    expect(jsonEqual(dbConfigA, dbConfigB)).toBe(true);
  });

  test("returns true for nested JSON with different key order at each level", () => {
    const apiCredsA = '{"api":{"key":"abc123","secret":"xyz"},"env":"prod"}';
    const apiCredsB = '{"env":"prod","api":{"secret":"xyz","key":"abc123"}}';
    expect(jsonEqual(apiCredsA, apiCredsB)).toBe(true);
  });

  test("returns true for complex nested object - keys reversed throughout", () => {
    const a = '{"z":3,"y":{"c":"val","b":2,"a":1},"x":"top"}';
    const b = '{"x":"top","y":{"a":1,"b":2,"c":"val"},"z":3}';
    expect(jsonEqual(a, b)).toBe(true);
  });

  test("returns true for equivalent JSON with different whitespace", () => {
    expect(jsonEqual('{"a": 1}', '{"a":1}')).toBe(true);
  });

  test("returns true when object values include arrays", () => {
    expect(jsonEqual('{"ids":[1,2,3]}', '{"ids":[1,2,3]}')).toBe(true);
  });

  test("returns false for different JSON", () => {
    expect(jsonEqual('{"a":1}', '{"a":2}')).toBe(false);
    expect(jsonEqual('{"a":1}', '{"b":1}')).toBe(false);
  });

  test("returns false when one string is invalid JSON", () => {
    expect(jsonEqual('{"a":1}', "not json")).toBe(false);
    expect(jsonEqual("{broken", '{"a":1}')).toBe(false);
  });

  test("returns false for same keys but different values", () => {
    expect(jsonEqual('{"a":1,"b":2}', '{"a":1,"b":99}')).toBe(false);
  });
});

describe("valuesEquivalent", () => {
  test("both JSON identical", () => {
    expect(valuesEquivalent('{"a":1}', '{"a":1}')).toBe(true);
  });

  test("both JSON different", () => {
    expect(valuesEquivalent('{"a":1}', '{"a":2}')).toBe(false);
  });

  test("both plain string identical", () => {
    expect(valuesEquivalent("hello", "hello")).toBe(true);
  });

  test("both plain string different", () => {
    expect(valuesEquivalent("hello", "world")).toBe(false);
  });

  test("mixed JSON and plain - not equivalent", () => {
    expect(valuesEquivalent('{"a":1}', "hello")).toBe(false);
    expect(valuesEquivalent("hello", '{"a":1}')).toBe(false);
  });

  test("real-world: database config JSON equivalent despite key order", () => {
    const existing =
      '{"host":"db.prod.com","port":3306,"database":"users","ssl":true}';
    const input =
      '{"database":"users","host":"db.prod.com","port":3306,"ssl":true}';
    expect(valuesEquivalent(existing, input)).toBe(true);
  });

  test("real-world: API credentials JSON - values differ", () => {
    const existing = '{"api_key":"old-key","api_secret":"old-secret"}';
    const input = '{"api_key":"new-key","api_secret":"new-secret"}';
    expect(valuesEquivalent(existing, input)).toBe(false);
  });
});

describe("parseTagsInput", () => {
  test("returns empty for empty string", () => {
    expect(parseTagsInput("")).toEqual({});
    expect(parseTagsInput("   ")).toEqual({});
  });

  test("parses valid JSON object", () => {
    expect(parseTagsInput('{"Env":"prod","Team":"platform"}')).toEqual({
      Env: "prod",
      Team: "platform",
    });
  });

  test("parses tags with numeric values (converts to string)", () => {
    expect(parseTagsInput('{"Version":1,"Count":42}')).toEqual({
      Version: "1",
      Count: "42",
    });
  });

  test("skips non-string non-number values", () => {
    const result = parseTagsInput(
      '{"valid":"ok","nested":{"a":1},"arr":["x"]}',
    );
    expect(result).toEqual({ valid: "ok" });
  });

  test("throws for invalid JSON", () => {
    expect(() => parseTagsInput("invalid json")).toThrow("Invalid tags JSON");
  });

  test("throws for array", () => {
    expect(() => parseTagsInput('["a","b"]')).toThrow();
  });
});

describe("buildWorkflowRunUrl", () => {
  const OLD_ENV = process.env;

  afterEach(() => {
    process.env = OLD_ENV;
  });

  test("builds URL from env vars", () => {
    process.env = {
      ...OLD_ENV,
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_RUN_ID: "12345",
    };
    expect(buildWorkflowRunUrl()).toBe(
      "https://github.com/owner/repo/actions/runs/12345",
    );
  });

  test("strips trailing slash from server URL", () => {
    process.env = {
      ...OLD_ENV,
      GITHUB_SERVER_URL: "https://github.com/",
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_RUN_ID: "12345",
    };
    expect(buildWorkflowRunUrl()).toBe(
      "https://github.com/owner/repo/actions/runs/12345",
    );
  });

  test("returns undefined when vars missing", () => {
    delete process.env.GITHUB_SERVER_URL;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_RUN_ID;
    expect(buildWorkflowRunUrl()).toBeUndefined();
  });
});

describe("mergeTags", () => {
  test("merges user tags with action tag", () => {
    const result = mergeTags(
      { Env: "prod" },
      {
        key: "github-actions:workflow-run:update",
        value: "https://example.com/run/1",
      },
    );
    expect(result).toEqual({
      Env: "prod",
      "github-actions:workflow-run:update": "https://example.com/run/1",
    });
  });
});

describe("tagsNeedUpdate", () => {
  test("returns true when key missing", () => {
    expect(tagsNeedUpdate({}, { Env: "prod" })).toBe(true);
  });

  test("returns true when value different", () => {
    expect(tagsNeedUpdate({ Env: "dev" }, { Env: "prod" })).toBe(true);
  });

  test("returns false when all match", () => {
    expect(tagsNeedUpdate({ Env: "prod" }, { Env: "prod" })).toBe(false);
  });

  test("returns false when current has extra keys not in desired", () => {
    expect(tagsNeedUpdate({ Env: "prod", Extra: "x" }, { Env: "prod" })).toBe(
      false,
    );
  });
});

describe("putSecret orchestration", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    smMockClient.reset();
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      AWS_DEFAULT_REGION: "us-east-1",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_RUN_ID: "12345",
    };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  test("creates secret when not found", async () => {
    smMockClient
      .on(GetSecretValueCommand)
      .rejects(
        new ResourceNotFoundException({ $metadata: {}, message: "Not found" }),
      )
      .on(CreateSecretCommand)
      .resolves({ ARN: TEST_ARN, Name: TEST_NAME });

    await putSecret(smClient, {
      secretId: TEST_NAME,
      secretValue: TEST_VALUE,
      tags: "",
    });

    expect(smMockClient).toHaveReceivedCommand(CreateSecretCommand);
    expect(smMockClient).toHaveReceivedCommand(TagResourceCommand);
  });

  test("updates when value changed", async () => {
    smMockClient
      .on(GetSecretValueCommand)
      .resolves({ Name: TEST_NAME, SecretString: "old-value" })
      .on(DescribeSecretCommand)
      .resolves({ ARN: TEST_ARN })
      .on(PutSecretValueCommand)
      .resolves({})
      .on(TagResourceCommand)
      .resolves({});

    await putSecret(smClient, {
      secretId: TEST_NAME,
      secretValue: TEST_VALUE,
      tags: "",
    });

    expect(smMockClient).toHaveReceivedCommand(PutSecretValueCommand);
    expect(smMockClient).toHaveReceivedCommandWith(PutSecretValueCommand, {
      SecretId: TEST_NAME,
      SecretString: TEST_VALUE,
    });
  });

  test("logs up-to-date when equivalent", async () => {
    smMockClient
      .on(GetSecretValueCommand)
      .resolves({ Name: TEST_NAME, SecretString: TEST_VALUE })
      .on(DescribeSecretCommand)
      .resolves({ ARN: TEST_ARN, Tags: [] })
      .on(TagResourceCommand)
      .resolves({});

    await putSecret(smClient, {
      secretId: TEST_NAME,
      secretValue: TEST_VALUE,
      tags: "",
    });

    expect(coreMock.info).toHaveBeenCalledWith(
      `Secret '${TEST_NAME}' is up-to-date.`,
    );
    expect(smMockClient).not.toHaveReceivedCommand(PutSecretValueCommand);
  });

  test("up-to-date with workflow URL does not tag when workflow-run:check already matches", async () => {
    smMockClient
      .on(GetSecretValueCommand)
      .resolves({ Name: TEST_NAME, SecretString: TEST_VALUE })
      .on(DescribeSecretCommand)
      .resolves({
        ARN: TEST_ARN,
        Tags: [
          {
            Key: "github-actions:workflow-run:check",
            Value: "https://github.com/owner/repo/actions/runs/12345",
          },
        ],
      });

    await putSecret(smClient, {
      secretId: TEST_NAME,
      secretValue: TEST_VALUE,
      tags: "",
    });

    expect(coreMock.info).toHaveBeenCalledWith(
      `Secret '${TEST_NAME}' is up-to-date.`,
    );
    expect(smMockClient).not.toHaveReceivedCommand(TagResourceCommand);
  });

  test("up-to-date without workflow URL and no user tags skips tag refresh", async () => {
    delete process.env.GITHUB_SERVER_URL;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_RUN_ID;

    smMockClient
      .on(GetSecretValueCommand)
      .resolves({ Name: TEST_NAME, SecretString: TEST_VALUE })
      .on(DescribeSecretCommand)
      .resolves({ ARN: TEST_ARN, Tags: [] });

    await putSecret(smClient, {
      secretId: TEST_NAME,
      secretValue: TEST_VALUE,
      tags: "",
    });

    expect(coreMock.info).toHaveBeenCalledWith(
      `Secret '${TEST_NAME}' is up-to-date.`,
    );
    expect(smMockClient).not.toHaveReceivedCommand(TagResourceCommand);
    expect(smMockClient.commandCalls(DescribeSecretCommand).length).toBe(1);
  });

  test("updates secret and applies user tags when no workflow URL (e.g. local run)", async () => {
    delete process.env.GITHUB_SERVER_URL;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_RUN_ID;

    smMockClient
      .on(GetSecretValueCommand)
      .rejects(
        new ResourceNotFoundException({ $metadata: {}, message: "Not found" }),
      )
      .on(CreateSecretCommand)
      .resolves({ ARN: TEST_ARN, Name: TEST_NAME })
      .on(TagResourceCommand)
      .resolves({});

    await putSecret(smClient, {
      secretId: TEST_NAME,
      secretValue: TEST_VALUE,
      tags: '{"Environment":"local","Source":"test"}',
    });

    expect(smMockClient).toHaveReceivedCommand(CreateSecretCommand);
    expect(smMockClient).toHaveReceivedCommandWith(TagResourceCommand, {
      SecretId: TEST_ARN,
      Tags: expect.arrayContaining([
        { Key: "Environment", Value: "local" },
        { Key: "Source", Value: "test" },
      ]),
    });
  });

  test("real-world: JSON secret equivalent by key order does not trigger update", async () => {
    const dbConfig = '{"host":"db.example.com","port":5432,"database":"app"}';
    const dbConfigReordered =
      '{"database":"app","host":"db.example.com","port":5432}';

    smMockClient
      .on(GetSecretValueCommand)
      .resolves({ Name: TEST_NAME, SecretString: dbConfig })
      .on(DescribeSecretCommand)
      .resolves({ ARN: TEST_ARN, Tags: [] })
      .on(TagResourceCommand)
      .resolves({});

    await putSecret(smClient, {
      secretId: TEST_NAME,
      secretValue: dbConfigReordered,
      tags: "",
    });

    expect(coreMock.info).toHaveBeenCalledWith(
      `Secret '${TEST_NAME}' is up-to-date.`,
    );
    expect(smMockClient).not.toHaveReceivedCommand(PutSecretValueCommand);
  });
});

describe("parseDotenvTextToJsonSecretString", () => {
  it("parses lines, comments, and first '=' split", () => {
    const input = `  # intro
FOO=bar
BAZ=qux=z
`;
    expect(parseDotenvTextToJsonSecretString(input)).toBe(
      '{"FOO":"bar","BAZ":"qux=z"}',
    );
  });

  it("last duplicate key wins", () => {
    expect(parseDotenvTextToJsonSecretString("A=1\nA=2")).toBe('{"A":"2"}');
  });

  it("escapes values for JSON", () => {
    const out = parseDotenvTextToJsonSecretString('X=hello "world"');
    expect(JSON.parse(out)).toStrictEqual({ X: 'hello "world"' });
  });

  it("throws on line without equals", () => {
    expect(() => parseDotenvTextToJsonSecretString("not-a-key-value")).toThrow(
      /Invalid dotenv line/,
    );
  });

  it("throws on empty key", () => {
    expect(() => parseDotenvTextToJsonSecretString("=value")).toThrow(
      /empty key/,
    );
  });

  it("truncates long invalid lines in the error message", () => {
    const longLine = `x${"y".repeat(90)}`;
    expect(() => parseDotenvTextToJsonSecretString(longLine)).toThrow(
      /^Invalid dotenv line.*\.\.\.$/,
    );
  });
});

describe("Version Constants", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.GITHUB_ACTION_REF;
    delete process.env.GITHUB_ACTION_PATH;
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("should have a valid package semver format", () => {
    expect(ACTION_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it("uses package semver when no GitHub action env is set", () => {
    expect(getActionRefOrSha()).toBe(ACTION_VERSION);
    expect(getUserAgent()).toBe(`github-action/${ACTION_VERSION}`);
  });

  it("prefers GITHUB_ACTION_REF when set", () => {
    process.env.GITHUB_ACTION_REF = "refs/tags/v3.0.0";
    expect(getActionRefOrSha()).toBe("refs/tags/v3.0.0");
    expect(getUserAgent()).toBe("github-action/refs/tags/v3.0.0");
  });

  it("uses 40-char SHA from GITHUB_ACTION_PATH basename when GITHUB_ACTION_REF is unset", () => {
    const sha = "a1b2c3d4e5f6789012345678901234567890abcd";
    process.env.GITHUB_ACTION_PATH = `/home/runner/work/_actions/org/repo/${sha}`;
    expect(getActionRefOrSha()).toBe(sha);
    expect(getUserAgent()).toBe(`github-action/${sha}`);
  });

  it("ignores GITHUB_ACTION_PATH basename when it is not a full git SHA", () => {
    process.env.GITHUB_ACTION_PATH =
      "/home/runner/work/_actions/org/repo/v1.2.3";
    expect(getActionRefOrSha()).toBe(ACTION_VERSION);
  });
});
