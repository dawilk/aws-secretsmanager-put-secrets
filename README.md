# Put secrets in AWS Secrets Manager from GitHub Actions

> This action is functionally the CREATE/PUT counterpart to the GET version: [aws-actions/aws-secretsmanager-get-secrets\_](https://github.com/aws-actions/aws-secretsmanager-get-secrets).

This GitHub Action creates or updates secrets in AWS Secrets Manager. Use it to sync secrets from GitHub (e.g. `${{ secrets.API_KEY }}`) into AWS, or to keep AWS secrets in sync with your workflow.

The action checks if the secret exists, compares the value, and only updates when needed. If the secret does not exist, it creates it. Optional tags (including GitHub Actions workflow run metadata) are merged and applied.

![Coverage](./badges/coverage.svg)

## Prerequisites

Configure AWS credentials before this step using [configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials). Prefer **Assume role directly using GitHub OIDC provider** for short-lived credentials.

## Usage examples

### Basic: put a secret from a GitHub secret

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v6
  with:
    role-to-assume: arn:aws:iam::123456789012:role/MyRole
    aws-region: us-east-1

- name: Put secret to AWS Secrets Manager
  uses: aws-actions/aws-secretsmanager-put-secrets@v2
  with:
    secret-id: my-app/api-key
    secret-value: ${{ secrets.API_KEY }}
```

### Put a JSON secret with tags

```yaml
- name: Put JSON secret with tags
  uses: aws-actions/aws-secretsmanager-put-secrets@v2
  with:
    secret-id: my-app/database-config
    secret-value: ${{ secrets.DATABASE_CONFIG }}
    tags: '{"Environment":"prod","Team":"platform"}'
```

### Secret is created if it does not exist

On first run, if the secret does not exist in AWS Secrets Manager, the action creates it. No manual setup required.

```yaml
- name: Put secret (creates if missing)
  uses: aws-actions/aws-secretsmanager-put-secrets@v2
  with:
    secret-id: my-app/new-secret
    secret-value: ${{ secrets.NEW_SECRET_VALUE }}
```

## Inputs

| Input                                | Description                                                                          | Required | Default |
| ------------------------------------ | ------------------------------------------------------------------------------------ | -------- | ------- |
| `secret-id`                          | The name or ARN of the secret to create or update                                    | Yes      | -       |
| `secret-value`                       | The secret value (raw text or JSON string) to store                                  | Yes      | -       |
| `tags`                               | JSON object string of tags to apply, e.g. `{"Environment":"prod","Team":"platform"}` | No       | `""`    |
| `auto-select-family-attempt-timeout` | Timeout (ms) for dual-stack DNS. Use for geographically distant runners.             | No       | `1000`  |

## Outputs

This action does not produce outputs.

## IAM permissions

The IAM role used by `configure-aws-credentials` must allow:

| Permission                      | Purpose                              |
| ------------------------------- | ------------------------------------ |
| `secretsmanager:GetSecretValue` | Read existing secret for comparison  |
| `secretsmanager:CreateSecret`   | Create secret when it does not exist |
| `secretsmanager:DescribeSecret` | Read secret metadata and tags        |
| `secretsmanager:PutSecretValue` | Update secret value                  |
| `secretsmanager:TagResource`    | Apply or update tags                 |

If secrets use a customer-managed KMS key, also include `kms:Decrypt` and `kms:GenerateDataKey` on that key.

## Tag behavior

The action merges your `tags` input with metadata tags:

- **`github-actions:workflow-run:update`** – Set when the secret value was updated (create or put). Value is the URL of the workflow run.
- **`github-actions:workflow-run:check`** – Set when the value was compared and found identical (no update). Value is the URL of the workflow run.

These tags help trace which workflow run last modified or verified the secret.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.
