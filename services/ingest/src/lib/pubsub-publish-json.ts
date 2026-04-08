import { PubSub } from '@google-cloud/pubsub';

/**
 * Publishes a JSON object as UTF-8 payload (no schema registry; consumer validates).
 */
export async function publishJsonToTopic(params: {
  projectId: string;
  topicName: string;
  /** JSON-serializable payload (validated upstream). */
  json: unknown;
}): Promise<void> {
  const pubsub = new PubSub({ projectId: params.projectId });
  const dataBuffer = Buffer.from(JSON.stringify(params.json), 'utf8');
  await pubsub.topic(params.topicName).publishMessage({ data: dataBuffer });
}
