import { Storage } from '@google-cloud/storage';

export async function downloadObjectBytes(params: {
  projectId: string;
  bucketName: string;
  objectKey: string;
}): Promise<Buffer> {
  const storage = new Storage({ projectId: params.projectId });
  const [buf] = await storage.bucket(params.bucketName).file(params.objectKey).download();
  return buf;
}
