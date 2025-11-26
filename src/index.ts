import * as core from '@actions/core';
import { SQSClient } from '@aws-sdk/client-sqs';
import {
  sendMessage,
  MessageConfig
} from './sqs';

async function run(): Promise<void> {
  try {
    // Get inputs
    const queueUrl = core.getInput('queue-url', { required: true });
    const messageBody = core.getInput('message-body', { required: true });
    const messageAttributes = core.getInput('message-attributes') || undefined;
    const delaySecondsStr = core.getInput('delay-seconds') || '0';
    const messageGroupId = core.getInput('message-group-id') || undefined;
    const messageDeduplicationId = core.getInput('message-deduplication-id') || undefined;
    const systemAttributes = core.getInput('system-attributes') || undefined;

    core.info('AWS SQS Send Message');
    core.info(`Queue URL: ${queueUrl}`);

    // Parse delay seconds
    const delaySeconds = parseInt(delaySecondsStr, 10);
    if (isNaN(delaySeconds)) {
      throw new Error(`Invalid delay-seconds value: "${delaySecondsStr}". Must be a number.`);
    }

    // Create SQS client (uses AWS credentials from environment)
    const client = new SQSClient({});

    // Build configuration
    const config: MessageConfig = {
      queueUrl,
      messageBody,
      messageAttributes,
      delaySeconds,
      messageGroupId,
      messageDeduplicationId,
      systemAttributes
    };

    // Send message
    const result = await sendMessage(client, config);

    // Handle result
    if (!result.success) {
      throw new Error(result.error || 'Failed to send message');
    }

    // Set outputs
    if (result.messageId) {
      core.setOutput('message-id', result.messageId);
    }
    
    if (result.sequenceNumber) {
      core.setOutput('sequence-number', result.sequenceNumber);
    }
    
    if (result.md5OfBody) {
      core.setOutput('md5-of-body', result.md5OfBody);
    }
    
    if (result.md5OfAttributes) {
      core.setOutput('md5-of-attributes', result.md5OfAttributes);
    }

    // Summary
    core.info('');
    core.info('='.repeat(50));
    core.info('Message sent successfully');
    if (result.messageId) {
      core.info(`Message ID: ${result.messageId}`);
    }
    if (result.sequenceNumber) {
      core.info(`Sequence Number: ${result.sequenceNumber}`);
    }
    core.info('='.repeat(50));

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(errorMessage);
  }
}

run();
