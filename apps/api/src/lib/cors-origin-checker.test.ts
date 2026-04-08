import { describe, expect, it } from 'vitest';
import { buildCorsOriginChecker } from './cors-origin-checker';

function check(origins: readonly string[], origin: string | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    const checker = buildCorsOriginChecker(origins);
    checker(origin, (_err, result) => resolve(result));
  });
}

describe('buildCorsOriginChecker', () => {
  const origins = [
    'https://signal-ac219.web.app',
    'http://localhost:3000',
    'https://signal-tau-plum.vercel.app',
    'https://*-pierpaolo-lauritos-projects-25e7d30a.vercel.app',
  ];

  it('allows exact match', async () => {
    expect(await check(origins, 'https://signal-ac219.web.app')).toBe(true);
  });

  it('allows localhost', async () => {
    expect(await check(origins, 'http://localhost:3000')).toBe(true);
  });

  it('allows wildcard match for per-deployment Vercel URL', async () => {
    expect(
      await check(
        origins,
        'https://signal-epcye66xf-pierpaolo-lauritos-projects-25e7d30a.vercel.app',
      ),
    ).toBe(true);
  });

  it('allows exact stable short alias', async () => {
    expect(await check(origins, 'https://signal-tau-plum.vercel.app')).toBe(true);
  });

  it('allows wildcard match for team-scoped stable alias', async () => {
    expect(
      await check(origins, 'https://signal-ei94-pierpaolo-lauritos-projects-25e7d30a.vercel.app'),
    ).toBe(true);
  });

  it('rejects unrelated origin', async () => {
    expect(await check(origins, 'https://evil.example.com')).toBe(false);
  });

  it('rejects partial domain spoof', async () => {
    expect(
      await check(
        origins,
        'https://evil.pierpaolo-lauritos-projects-25e7d30a.vercel.app.attacker.com',
      ),
    ).toBe(false);
  });

  it('allows non-browser requests (undefined origin)', async () => {
    expect(await check(origins, undefined)).toBe(true);
  });

  it('works with no wildcard origins', async () => {
    const exact = ['https://example.com'];
    expect(await check(exact, 'https://example.com')).toBe(true);
    expect(await check(exact, 'https://other.com')).toBe(false);
  });
});
