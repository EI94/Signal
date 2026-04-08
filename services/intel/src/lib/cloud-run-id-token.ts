import { GoogleAuth } from 'google-auth-library';

/**
 * Su Cloud Run (`K_SERVICE`), ottiene `Authorization: Bearer <id-token>` per chiamare un altro
 * servizio Cloud Run nello stesso progetto quando il caller ha `roles/run.invoker` sul target.
 * In locale non fa nulla (undefined).
 */
export async function getCloudRunAuthorizationHeader(
  targetAudienceBaseUrl: string,
): Promise<string | undefined> {
  if (!process.env.K_SERVICE) {
    return undefined;
  }
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(targetAudienceBaseUrl);
  const headers = await client.getRequestHeaders();
  return headers.get('Authorization') ?? undefined;
}
