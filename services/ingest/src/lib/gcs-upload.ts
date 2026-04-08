import { Storage } from '@google-cloud/storage';

export async function uploadObjectBytes(params: {
  projectId: string;
  bucketName: string;
  objectKey: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  const storage = new Storage({ projectId: params.projectId });
  await storage
    .bucket(params.bucketName)
    .file(params.objectKey)
    .save(params.body, {
      metadata: { contentType: params.contentType },
      resumable: false,
    });
}
