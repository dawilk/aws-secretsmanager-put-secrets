Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const tslib_1 = require("tslib");
const core = tslib_1.__importStar(require("@actions/core"));
const net_1 = require("net");
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const utils_1 = require("./utils");
const constants_1 = require("./constants");
function run() {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        try {
            // Node 20 introduced automatic family selection for dual-stack endpoints. When the runner
            // sits far away from the secrets manager endpoint it sometimes timeouts on negotiation between
            // A and AAAA records. This behaviour was described in the https://github.com/nodejs/node/issues/54359
            const timeout = Number(core.getInput("auto-select-family-attempt-timeout"));
            if (timeout < 10 || Number.isNaN(timeout)) {
                core.setFailed(`Invalid value for 'auto-select-family-attempt-timeout': ${timeout}. Must be a number greater than or equal to 10.`);
                return;
            }
            (0, net_1.setDefaultAutoSelectFamilyAttemptTimeout)(timeout);
            const client = new client_secrets_manager_1.SecretsManagerClient({
                region: process.env.AWS_DEFAULT_REGION,
                customUserAgent: (0, constants_1.getUserAgent)(),
            });
            const secretId = core.getInput("secret-id", { required: true });
            const secretValue = core.getInput("secret-value", { required: true });
            const tags = core.getInput("tags");
            yield (0, utils_1.putSecret)(client, { secretId, secretValue, tags });
            core.info("Completed putting secret.");
        }
        catch (error) {
            if ((0, utils_1.isAuthError)(error)) {
                core.setFailed("Failed to authenticate with AWS. Ensure configure-aws-credentials runs before this step and has valid credentials.");
                return;
            }
            if (error instanceof Error) {
                core.setFailed(error.message);
            }
        }
    });
}
run();
//# sourceMappingURL=index.js.map
