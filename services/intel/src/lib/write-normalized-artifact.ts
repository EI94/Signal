import { Storage } from '@google-cloud/storage';

export async function uploadNormalizedTextArtifact(params: {
  projectId: string;
  bucketName: string;
  objectKey: string;
  body: Buffer;
}): Promise<void> {
  const storage = new Storage({ projectId: params.projectId });
  await storage
    .bucket(params.bucketName)
    .file(params.objectKey)
    .save(params.body, {
      metadata: { contentType: 'text/plain; charset=utf-8' },
      resumable: false,
    });
}
