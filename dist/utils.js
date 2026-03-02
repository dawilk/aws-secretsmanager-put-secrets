"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthError = isAuthError;
exports.getSecretValue = getSecretValue;
exports.createSecret = createSecret;
exports.describeSecret = describeSecret;
exports.isJSONString = isJSONString;
exports.jsonEqual = jsonEqual;
exports.valuesEquivalent = valuesEquivalent;
exports.parseTagsInput = parseTagsInput;
exports.buildWorkflowRunUrl = buildWorkflowRunUrl;
exports.mergeTags = mergeTags;
exports.tagsNeedUpdate = tagsNeedUpdate;
exports.putSecretValue = putSecretValue;
exports.tagResource = tagResource;
exports.putSecret = putSecret;
const core = __importStar(require("@actions/core"));
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
require("aws-sdk-client-mock-jest");
const AUTH_ERROR_NAMES = [
    'UnrecognizedClientException',
    'InvalidClientTokenId',
    'ExpiredToken',
    'CredentialsProviderError'
];
/**
 * Checks if an error is an AWS authentication/credentials error
 */
function isAuthError(error) {
    return error instanceof Error && AUTH_ERROR_NAMES.includes(error.name);
}
/**
 * Retrieves a secret from Secrets Manager
 */
function getSecretValue(client, secretId) {
    return __awaiter(this, void 0, void 0, function* () {
        let secretValue = '';
        const data = yield client.send(new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretId }));
        if (data.SecretString) {
            secretValue = data.SecretString;
        }
        else if (data.SecretBinary) {
            secretValue = Buffer.from(data.SecretBinary).toString('ascii');
        }
        if (!data.Name) {
            throw new Error('Invalid name for secret');
        }
        return {
            name: data.Name,
            secretValue
        };
    });
}
/**
 * Creates a new secret in Secrets Manager
 */
function createSecret(client, secretId, secretValue) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield client.send(new client_secrets_manager_1.CreateSecretCommand({
                Name: secretId,
                SecretString: secretValue
            }));
            if (!response.ARN || !response.Name) {
                throw new Error('Invalid response from CreateSecret');
            }
            return { arn: response.ARN, name: response.Name };
        }
        catch (err) {
            if (err instanceof client_secrets_manager_1.InvalidParameterException) {
                throw new Error(`Invalid parameter when creating secret '${secretId}': ${err.message}`);
            }
            if (err instanceof client_secrets_manager_1.LimitExceededException) {
                throw new Error('Too many secrets. Delete unused secrets or request a quota increase.');
            }
            if (err instanceof client_secrets_manager_1.ResourceExistsException) {
                throw new Error(`Secret '${secretId}' already exists (race condition). Retry the action.`);
            }
            throw new Error(`Failed to create secret '${secretId}': ${err instanceof Error ? err.message : String(err)}`);
        }
    });
}
/**
 * Describes a secret to get metadata and tags
 */
function describeSecret(client, secretId) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield client.send(new client_secrets_manager_1.DescribeSecretCommand({ SecretId: secretId }));
        if (!response.ARN) {
            throw new Error('Invalid response from DescribeSecret: missing ARN');
        }
        const tags = {};
        if (response.Tags) {
            for (const tag of response.Tags) {
                if (tag.Key && tag.Value !== undefined) {
                    tags[tag.Key] = tag.Value;
                }
            }
        }
        return { arn: response.ARN, tags };
    });
}
/**
 * Checks if the given string is valid JSON (object, not array or primitive)
 */
function isJSONString(secretValue) {
    try {
        const parsedObject = JSON.parse(secretValue);
        return !!parsedObject && (typeof parsedObject === 'object') && !Array.isArray(parsedObject);
    }
    catch (_a) {
        return false;
    }
}
/**
 * Compares two JSON strings semantically (handles whitespace and key order)
 */
function sortKeys(obj) {
    if (obj === null || typeof obj !== 'object')
        return obj;
    if (Array.isArray(obj))
        return obj.map(sortKeys);
    return Object.keys(obj).sort().reduce((acc, k) => {
        acc[k] = sortKeys(obj[k]);
        return acc;
    }, {});
}
function jsonEqual(a, b) {
    try {
        const objA = JSON.parse(a);
        const objB = JSON.parse(b);
        return JSON.stringify(sortKeys(objA)) === JSON.stringify(sortKeys(objB));
    }
    catch (_a) {
        return false;
    }
}
/**
 * Returns true if existing and input values are equivalent (no update needed)
 * For JSON: semantic comparison. For plain strings: exact match.
 */
function valuesEquivalent(existing, input) {
    if (isJSONString(existing) && isJSONString(input)) {
        return jsonEqual(existing, input);
    }
    return existing === input;
}
/**
 * Parses the tags input (JSON object string) into a record
 */
function parseTagsInput(tagsStr) {
    if (!tagsStr || tagsStr.trim() === '') {
        return {};
    }
    try {
        const parsed = JSON.parse(tagsStr);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('Tags must be a JSON object');
        }
        const result = {};
        for (const [k, v] of Object.entries(parsed)) {
            if (typeof k === 'string' && (typeof v === 'string' || typeof v === 'number')) {
                result[k] = String(v);
            }
        }
        return result;
    }
    catch (err) {
        if (err instanceof SyntaxError) {
            throw new Error(`Invalid tags JSON: ${err.message}`);
        }
        throw err;
    }
}
/**
 * Builds the GitHub Actions workflow run URL from environment variables
 */
function buildWorkflowRunUrl() {
    const serverUrl = process.env.GITHUB_SERVER_URL;
    const repository = process.env.GITHUB_REPOSITORY;
    const runId = process.env.GITHUB_RUN_ID;
    if (!serverUrl || !repository || !runId) {
        return undefined;
    }
    return `${serverUrl.replace(/\/$/, '')}/${repository}/actions/runs/${runId}`;
}
/**
 * Merges user tags with a single action metadata tag
 */
function mergeTags(userTags, actionTag) {
    return Object.assign(Object.assign({}, userTags), { [actionTag.key]: actionTag.value });
}
/**
 * Returns true if tags need to be updated (missing keys or different values)
 */
function tagsNeedUpdate(current, desired) {
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
function putSecretValue(client, secretId, secretValue) {
    return __awaiter(this, void 0, void 0, function* () {
        yield client.send(new client_secrets_manager_1.PutSecretValueCommand({
            SecretId: secretId,
            SecretString: secretValue
        }));
    });
}
/**
 * Applies tags to a secret
 */
function tagResource(client, secretId, tags) {
    return __awaiter(this, void 0, void 0, function* () {
        const tagsArray = Object.entries(tags).map(([Key, Value]) => ({ Key, Value }));
        if (tagsArray.length === 0)
            return;
        yield client.send(new client_secrets_manager_1.TagResourceCommand({
            SecretId: secretId,
            Tags: tagsArray
        }));
    });
}
/**
 * Orchestrates the put-secret flow: get/create, compare, put if changed, merge tags, tag if needed
 */
function putSecret(client, inputs) {
    return __awaiter(this, void 0, void 0, function* () {
        const { secretId, secretValue, tags: tagsInput } = inputs;
        const userTags = parseTagsInput(tagsInput);
        const workflowRunUrl = buildWorkflowRunUrl();
        let secretArn;
        let didUpdate = false;
        try {
            const existing = yield getSecretValue(client, secretId);
            secretArn = (yield describeSecret(client, secretId)).arn;
            if (valuesEquivalent(existing.secretValue, secretValue)) {
                core.info(`Secret '${secretId}' is up-to-date.`);
                const actionTag = workflowRunUrl
                    ? { key: 'github-actions:workflow-run:check', value: workflowRunUrl }
                    : null;
                const desiredTags = actionTag ? mergeTags(userTags, actionTag) : userTags;
                if (Object.keys(desiredTags).length > 0) {
                    const { tags: currentTags } = yield describeSecret(client, secretId);
                    if (tagsNeedUpdate(currentTags !== null && currentTags !== void 0 ? currentTags : {}, desiredTags)) {
                        yield tagResource(client, secretArn, desiredTags);
                    }
                }
                return;
            }
            yield putSecretValue(client, secretId, secretValue);
            didUpdate = true;
        }
        catch (err) {
            if (err instanceof client_secrets_manager_1.ResourceNotFoundException) {
                const createResult = yield createSecret(client, secretId, secretValue);
                secretArn = createResult.arn;
                didUpdate = true;
            }
            else {
                throw err;
            }
        }
        if (didUpdate && workflowRunUrl) {
            const actionTag = { key: 'github-actions:workflow-run:update', value: workflowRunUrl };
            const desiredTags = mergeTags(userTags, actionTag);
            if (Object.keys(desiredTags).length > 0) {
                yield tagResource(client, secretArn, desiredTags);
            }
        }
        else if (didUpdate && Object.keys(userTags).length > 0) {
            yield tagResource(client, secretArn, userTags);
        }
    });
}
