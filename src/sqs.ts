import {
  SQSClient,
  SendMessageCommand,
  SendMessageCommandInput,
  MessageAttributeValue
} from '@aws-sdk/client-sqs';
import * as core from '@actions/core';

export interface MessageConfig {
  queueUrl: string;
  messageBody: string;
  messageAttributes?: string; // JSON string
  delaySeconds?: number;
  messageGroupId?: string;
  messageDeduplicationId?: string;
  systemAttributes?: string; // JSON string
}

export interface MessageResult {
  success: boolean;
  messageId?: string;
  sequenceNumber?: string;
  md5OfBody?: string;
  md5OfAttributes?: string;
  error?: string;
}

/**
 * Parse message attributes from JSON string to SQS format
 */
export function parseMessageAttributes(
  attributesJson: string
): Record<string, MessageAttributeValue> {
  try {
    const parsed = JSON.parse(attributesJson);
    const attributes: Record<string, MessageAttributeValue> = {};
    const attributeKeys = Object.keys(parsed);

    // Validate: max 10 attributes
    if (attributeKeys.length > 10) {
      throw new Error(
        `Too many message attributes: ${attributeKeys.length}. Maximum allowed is 10.`
      );
    }

    // Valid data types
    const validDataTypes = ['String', 'Number', 'Binary'];

    for (const [key, value] of Object.entries(parsed)) {
      const attr = value as {
        DataType: string;
        StringValue?: string;
        BinaryValue?: string;
      };
      
      // Validate: DataType is required
      if (!attr.DataType) {
        throw new Error(
          `Missing DataType for attribute "${key}". Must be one of: ${validDataTypes.join(', ')}`
        );
      }

      // Validate: DataType is valid
      if (!validDataTypes.includes(attr.DataType)) {
        throw new Error(
          `Invalid DataType "${attr.DataType}" for attribute "${key}". Must be one of: ${validDataTypes.join(', ')}`
        );
      }

      // Validate: has appropriate value for the DataType
      if (attr.DataType === 'String' || attr.DataType === 'Number') {
        if (attr.StringValue === undefined) {
          throw new Error(
            `Missing StringValue for attribute "${key}" with DataType "${attr.DataType}"`
          );
        }
      } else if (attr.DataType === 'Binary') {
        if (attr.BinaryValue === undefined) {
          throw new Error(
            `Missing BinaryValue for attribute "${key}" with DataType "Binary"`
          );
        }
      }

      const messageAttr: MessageAttributeValue = {
        DataType: attr.DataType
      };

      if (attr.StringValue !== undefined) {
        messageAttr.StringValue = String(attr.StringValue);
      }
      if (attr.BinaryValue !== undefined) {
        // Convert base64 string to Uint8Array
        const buffer = Buffer.from(attr.BinaryValue, 'base64');
        messageAttr.BinaryValue = new Uint8Array(buffer);
      }

      attributes[key] = messageAttr;
    }

    return attributes;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse message attributes: ${errorMessage}`);
  }
}

/**
 * Parse system attributes from JSON string to SQS format
 */
export function parseSystemAttributes(
  attributesJson: string
): Record<string, MessageAttributeValue> {
  // System attributes use the same format as message attributes
  return parseMessageAttributes(attributesJson);
}

/**
 * Validate FIFO queue requirements
 */
export function validateFifoQueue(queueUrl: string, messageGroupId?: string): void {
  const isFifo = queueUrl.endsWith('.fifo');
  
  if (isFifo && !messageGroupId) {
    throw new Error(
      'message-group-id is required for FIFO queues (queue URL ends with .fifo)'
    );
  }
  
  if (!isFifo && messageGroupId) {
    core.warning(
      'message-group-id is provided but queue URL does not end with .fifo. ' +
      'This parameter will be ignored for standard queues.'
    );
  }
}

/**
 * Validate queue URL format
 */
export function validateQueueUrl(queueUrl: string): void {
  const urlPattern = /^https:\/\/sqs\.[a-z0-9-]+\.amazonaws\.com(\.cn)?\/\d+\/.+$/;
  
  if (!urlPattern.test(queueUrl)) {
    throw new Error(
      `Invalid queue URL format: "${queueUrl}". ` +
      'Expected format: https://sqs.{region}.amazonaws.com/{account-id}/{queue-name}'
    );
  }
}

/**
 * Validate message body size (max 256 KB)
 */
export function validateMessageBody(messageBody: string): void {
  const sizeInBytes = Buffer.byteLength(messageBody, 'utf8');
  const maxSizeBytes = 256 * 1024; // 256 KB

  if (sizeInBytes > maxSizeBytes) {
    throw new Error(
      `Message body size (${sizeInBytes} bytes) exceeds maximum allowed size (${maxSizeBytes} bytes / 256 KB)`
    );
  }
}

/**
 * Validate delay seconds (0-900)
 */
export function validateDelaySeconds(delaySeconds?: number): void {
  if (delaySeconds !== undefined) {
    if (delaySeconds < 0 || delaySeconds > 900) {
      throw new Error(
        `delay-seconds must be between 0 and 900 (got ${delaySeconds})`
      );
    }
  }
}

/**
 * Send a message to an SQS queue
 */
export async function sendMessage(
  client: SQSClient,
  config: MessageConfig
): Promise<MessageResult> {
  try {
    // Validate inputs
    validateQueueUrl(config.queueUrl);
    validateMessageBody(config.messageBody);
    validateDelaySeconds(config.delaySeconds);
    validateFifoQueue(config.queueUrl, config.messageGroupId);

    core.info(`Sending message to queue: ${config.queueUrl}`);
    core.info(`Message body size: ${Buffer.byteLength(config.messageBody, 'utf8')} bytes`);

    // Build command input
    const input: SendMessageCommandInput = {
      QueueUrl: config.queueUrl,
      MessageBody: config.messageBody
    };

    // Add optional parameters
    if (config.delaySeconds !== undefined && config.delaySeconds > 0) {
      input.DelaySeconds = config.delaySeconds;
      core.info(`Delay: ${config.delaySeconds} seconds`);
    }

    if (config.messageAttributes) {
      input.MessageAttributes = parseMessageAttributes(config.messageAttributes);
      core.info(`Message attributes: ${Object.keys(input.MessageAttributes).length} attribute(s)`);
    }

    if (config.systemAttributes) {
      input.MessageSystemAttributes = parseSystemAttributes(config.systemAttributes);
      core.info(`System attributes: ${Object.keys(input.MessageSystemAttributes).length} attribute(s)`);
    }

    // FIFO queue parameters
    if (config.messageGroupId) {
      input.MessageGroupId = config.messageGroupId;
      core.info(`Message group ID: ${config.messageGroupId}`);
    }

    if (config.messageDeduplicationId) {
      input.MessageDeduplicationId = config.messageDeduplicationId;
      core.info(`Message deduplication ID: ${config.messageDeduplicationId}`);
    }

    // Send message
    const command = new SendMessageCommand(input);
    const response = await client.send(command);

    core.info('✓ Message sent successfully');
    if (response.MessageId) {
      core.info(`Message ID: ${response.MessageId}`);
    }
    if (response.SequenceNumber) {
      core.info(`Sequence number: ${response.SequenceNumber}`);
    }

    return {
      success: true,
      messageId: response.MessageId,
      sequenceNumber: response.SequenceNumber,
      md5OfBody: response.MD5OfMessageBody,
      md5OfAttributes: response.MD5OfMessageAttributes
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.error(`Failed to send message: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage
    };
  }
}
