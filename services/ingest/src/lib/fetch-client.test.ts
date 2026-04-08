import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUrlOnce } from './fetch-client';

describe('fetchUrlOnce', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns success with metadata on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('body', {
          status: 200,
          headers: {
            'content-type': 'text/html',
            etag: '"t1"',
            'last-modified': 'Sat, 04 Apr 2026 12:00:00 GMT',
          },
        });
      }),
    );

    const r = await fetchUrlOnce({
      url: 'https://example.com',
      timeoutMs: 5000,
      userAgent: 'test-agent',
      maxBodyBytes: 1024,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.statusCode).toBe(200);
      expect(r.etag).toBe('"t1"');
      expect(r.lastModified?.getUTCFullYear()).toBe(2026);
      expect(new TextDecoder().decode(r.body)).toBe('body');
    }
  });

  it('maps generic failures to network_error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('dns failure'))),
    );
    const r = await fetchUrlOnce({
      url: 'https://example.com',
      timeoutMs: 5000,
      userAgent: 'ua',
      maxBodyBytes: 1024,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe('network_error');
    }
  });

  it('returns http_error for non-2xx after reading body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('err', { status: 503, headers: { 'content-type': 'text/plain' } }),
      ),
    );
    const r = await fetchUrlOnce({
      url: 'https://example.com',
      timeoutMs: 5000,
      userAgent: 'ua',
      maxBodyBytes: 1024,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe('http_error');
      expect(r.statusCode).toBe(503);
    }
  });
});
