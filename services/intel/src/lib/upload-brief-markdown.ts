import { Storage } from '@google-cloud/storage';

/** Uploads UTF-8 markdown body to the raw archive bucket (operational artifact, not editorial CMS). */
export async function uploadBriefMarkdownArtifact(params: {
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
      metadata: { contentType: 'text/markdown; charset=utf-8' },
      resumable: false,
    });
}
