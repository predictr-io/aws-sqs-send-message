# AWS SQS Send Message

A GitHub Action to send messages to AWS SQS queues. Seamlessly integrate message sending into your CI/CD workflows with support for standard and FIFO queues.

## Features

- **Send messages** - Send messages to standard or FIFO SQS queues
- **Message attributes** - Support for custom message attributes
- **Delay delivery** - Schedule message delivery with delay seconds (0-900 seconds)
- **FIFO support** - Full support for FIFO queues with message grouping and deduplication
- **System attributes** - Support for AWS system message attributes
- **Simple integration** - Works with existing SQS queues

## Prerequisites

Configure AWS credentials before using this action.

### Option 1: AWS Credentials (Production)

Use `aws-actions/configure-aws-credentials@v4` for real AWS environments:

```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123456789012:role/my-github-actions-role
    aws-region: us-east-1
```

### Option 2: LocalStack (Testing)

Use LocalStack as a service container for testing within the workflow:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      localstack:
        image: localstack/localstack
        ports:
          - 4566:4566
        env:
          SERVICES: sqs
    steps:
      - name: Send message to LocalStack SQS
        uses: predictr-io/aws-sqs-send-message@v1
        env:
          AWS_ENDPOINT_URL: http://localhost:4566
          AWS_ACCESS_KEY_ID: test
          AWS_SECRET_ACCESS_KEY: test
          AWS_DEFAULT_REGION: us-east-1
        with:
          queue-url: 'http://localhost:4566/000000000000/my-queue'
          message-body: 'Test message'
```

## Usage

### Send Simple Message

Send a basic message to an SQS queue:

```yaml
- name: Send message to SQS
  uses: predictr-io/aws-sqs-send-message@v1
  with:
    queue-url: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue'
    message-body: 'Hello from GitHub Actions!'
```

### Send Message with Attributes

Send a message with custom attributes:

```yaml
- name: Send message with attributes
  uses: predictr-io/aws-sqs-send-message@v1
  with:
    queue-url: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue'
    message-body: '{"orderId": "12345", "amount": 99.99}'
    message-attributes: |
      {
        "OrderType": {
          "DataType": "String",
          "StringValue": "premium"
        },
        "Priority": {
          "DataType": "Number",
          "StringValue": "1"
        }
      }
```

### Send Delayed Message

Send a message with a delivery delay:

```yaml
- name: Send delayed message
  uses: predictr-io/aws-sqs-send-message@v1
  with:
    queue-url: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue'
    message-body: 'This message will be delayed'
    delay-seconds: '300'
```

### Send to FIFO Queue

Send a message to a FIFO queue:

```yaml
- name: Send message to FIFO queue
  uses: predictr-io/aws-sqs-send-message@v1
  with:
    queue-url: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue.fifo'
    message-body: '{"event": "user-signup", "userId": "user123"}'
    message-group-id: 'user-events'
    message-deduplication-id: 'signup-user123-20251126'
```

### Send FIFO with Content-Based Deduplication

For FIFO queues with content-based deduplication enabled:

```yaml
- name: Send to FIFO queue with auto-deduplication
  uses: predictr-io/aws-sqs-send-message@v1
  with:
    queue-url: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue.fifo'
    message-body: '{"event": "deployment", "sha": "${{ github.sha }}"}'
    message-group-id: 'deployments'
```

### Complete Pipeline Example

Trigger downstream processing via SQS:

```yaml
name: Deploy and Notify

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - name: Deploy application
        run: |
          echo "Deploying..."

      - name: Send deployment notification
        id: notify
        uses: predictr-io/aws-sqs-send-message@v1
        with:
          queue-url: ${{ secrets.SQS_QUEUE_URL }}
          message-body: |
            {
              "event": "deployment",
              "repository": "${{ github.repository }}",
              "sha": "${{ github.sha }}",
              "actor": "${{ github.actor }}",
              "timestamp": "${{ github.event.head_commit.timestamp }}"
            }
          message-attributes: |
            {
              "EventType": {
                "DataType": "String",
                "StringValue": "deployment"
              },
              "Environment": {
                "DataType": "String",
                "StringValue": "production"
              }
            }

      - name: Log message ID
        run: |
          echo "Message sent with ID: ${{ steps.notify.outputs.message-id }}"
          echo "MD5: ${{ steps.notify.outputs.md5-of-body }}"
```

## Inputs

### Required Inputs

| Input | Description |
|-------|-------------|
| `queue-url` | SQS queue URL (e.g., `https://sqs.us-east-1.amazonaws.com/123456789012/my-queue`) |
| `message-body` | Message body content (string, max 256 KB) |

### Optional Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `message-attributes` | Message attributes as JSON object | - |
| `delay-seconds` | Delay before message becomes available (0-900 seconds) | `0` |
| `message-group-id` | Message group ID (required for FIFO queues) | - |
| `message-deduplication-id` | Message deduplication ID for FIFO queues | - |
| `system-attributes` | System message attributes as JSON object | - |

## Outputs

| Output | Description |
|--------|-------------|
| `message-id` | Unique identifier assigned to the message by SQS |
| `sequence-number` | Sequence number (only for FIFO queues) |
| `md5-of-body` | MD5 hash of the message body |
| `md5-of-attributes` | MD5 hash of the message attributes |

## Message Attributes Format

Message attributes must be provided as a JSON object with the following structure:

```json
{
  "AttributeName": {
    "DataType": "String|Number|Binary",
    "StringValue": "value",
    "BinaryValue": "base64-encoded-binary"
  }
}
```

### Supported Data Types

- **String** - Text data
- **Number** - Numeric data (integers and floats)
- **Binary** - Base64-encoded binary data

### Example

```yaml
message-attributes: |
  {
    "Author": {
      "DataType": "String",
      "StringValue": "John Doe"
    },
    "Priority": {
      "DataType": "Number",
      "StringValue": "5"
    },
    "Metadata": {
      "DataType": "Binary",
      "BinaryValue": "aGVsbG8gd29ybGQ="
    }
  }
```

## FIFO Queues

### Message Group ID

Required for FIFO queues. Messages with the same group ID are processed in order:

```yaml
message-group-id: 'user-123-events'
```

### Message Deduplication ID

Optional for FIFO queues with content-based deduplication enabled. Required otherwise:

```yaml
message-deduplication-id: 'unique-id-12345'
```

### Sequence Numbers

For FIFO queues, the action outputs a sequence number:

```yaml
- name: Send to FIFO
  id: send
  uses: predictr-io/aws-sqs-send-message@v1
  with:
    queue-url: ${{ vars.FIFO_QUEUE_URL }}
    message-body: 'Test'
    message-group-id: 'group1'

- name: Check sequence
  run: echo "Sequence: ${{ steps.send.outputs.sequence-number }}"
```

## Delay Seconds

Set a delay before the message becomes available for processing:

- **Range**: 0-900 seconds (0 seconds to 15 minutes)
- **Default**: 0 (immediate delivery)
- **Note**: For FIFO queues, the delay applies to all messages in the same message group

```yaml
delay-seconds: '600'
```

## System Attributes

Send AWS system message attributes:

```yaml
system-attributes: |
  {
    "AWSTraceHeader": {
      "DataType": "String",
      "StringValue": "Root=1-5759e988-bd862e3fe1be46a994272793"
    }
  }
```

## Error Handling

The action handles common scenarios:

- **Invalid queue URL**: Fails with validation error
- **Message too large**: Fails with size limit error (max 256 KB)
- **Missing FIFO parameters**: Fails if `message-group-id` not provided for FIFO queues
- **AWS permission errors**: Fails with AWS SDK error message
- **Invalid JSON**: Fails with JSON parsing error for attributes

## Queue URL Format

### Standard Queue

```
https://sqs.{region}.amazonaws.com/{account-id}/{queue-name}
```

### FIFO Queue

```
https://sqs.{region}.amazonaws.com/{account-id}/{queue-name}.fifo
```

You can find your queue URL in the AWS Console or using AWS CLI:

```bash
aws sqs get-queue-url --queue-name my-queue
```

## Development

### Setup

Clone and install dependencies:

```bash
git clone https://github.com/predictr-io/aws-sqs-send-message.git
cd aws-sqs-send-message
npm install
```

### Development Scripts

```bash
# Build the action (compile TypeScript + bundle with dependencies)
npm run build

# Run TypeScript type checking
npm run type-check

# Run ESLint
npm run lint

# Run all checks (type-check + lint)
npm run check
```

### Build Process

The build process uses `@vercel/ncc` to compile TypeScript and bundle all dependencies into a single `dist/index.js` file:

```bash
npm run build
```

**Output:**
- `dist/index.js` - Bundled action (includes AWS SDK)
- `dist/index.js.map` - Source map for debugging
- `dist/licenses.txt` - License information for bundled dependencies

**Important:** The `dist/` directory **must be committed** to git. GitHub Actions runs the compiled code directly from the repository.

### Making Changes

1. **Edit source files** in `src/`
2. **Run checks** to validate:
   ```bash
   npm run check
   ```
3. **Build** to update `dist/`:
   ```bash
   npm run build
   ```
4. **Test locally** (optional) - Use [act](https://github.com/nektos/act) or create a test workflow
5. **Commit everything** including `dist/`:
   ```bash
   git add src/ dist/
   git commit -m "Description of changes"
   ```

### Release Process

Follow these steps to create a new release:

#### 1. Make and Test Changes

```bash
# Make your changes to src/
# Run checks
npm run check

# Build
npm run build

# Commit source and dist/
git add .
git commit -m "Add new feature"
git push origin main
```

#### 2. Create Version Tag

```bash
# Create annotated tag (use semantic versioning)
git tag -a v1.0.0 -m "Release v1.0.0: Initial release"

# Push tag to trigger release workflow
git push origin v1.0.0
```

#### 3. Automated Release

GitHub Actions automatically:
- ✓ Verifies `dist/` is committed
- ✓ Verifies `dist/` is up-to-date with source
- ✓ Creates GitHub Release with auto-generated notes
- ✓ Updates major version tag (e.g., `v1` → `v1.0.0`)

#### 4. Version References

Users can reference the action:
- **Recommended:** `predictr-io/aws-sqs-send-message@v1` (floating major version, gets updates)
- **Pinned:** `predictr-io/aws-sqs-send-message@v1.0.0` (specific version, never changes)

### Troubleshooting

**Release workflow fails with "dist/ is out of date":**
```bash
npm run build
git add dist/
git commit -m "Update dist/ for release"
git tag -f v1.0.0
git push -f origin v1.0.0
```

**ESLint errors:**
```bash
npm run lint
# Fix issues, then:
npm run check
```

**TypeScript errors:**
```bash
npm run type-check
```

## License

MIT

## Contributing

Contributions welcome! Please submit a Pull Request.
