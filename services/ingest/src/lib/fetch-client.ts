import type { FetchExecutionResult } from './fetch-types';

/**
 * Single-endpoint HTTP GET for MVP ingest. No HEAD (many servers block or lie; not reliable enough).
 * Uses conditional headers only when caller provides prior values (future WS4.3+ can wire from registry).
 */

function normalizeHeaderMap(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => {
    out[name.toLowerCase()] = value;
  });
  return out;
}

function parseLastModified(headers: Record<string, string>): Date | null {
  const raw = headers['last-modified'];
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseContentLength(headers: Record<string, string>): number | null {
  const raw = headers['content-length'];
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

export type FetchUrlOptions = {
  url: string;
  timeoutMs: number;
  userAgent: string;
  maxBodyBytes: number;
};

export async function fetchUrlOnce(options: FetchUrlOptions): Promise<FetchExecutionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const res = await fetch(options.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': options.userAgent,
        accept: '*/*',
      },
    });

    const headers = normalizeHeaderMap(res.headers);
    const cl = parseContentLength(headers);
    if (cl !== null && cl > options.maxBodyBytes) {
      return {
        ok: false,
        kind: 'body_too_large',
        statusCode: res.status,
        message: `Content-Length ${cl} exceeds max ${options.maxBodyBytes}`,
      };
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > options.maxBodyBytes) {
      return {
        ok: false,
        kind: 'body_too_large',
        statusCode: res.status,
        message: `Body size ${buf.byteLength} exceeds max ${options.maxBodyBytes}`,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        kind: 'http_error',
        statusCode: res.status,
        message: `HTTP ${res.status}`,
      };
    }

    const etag = headers.etag ?? null;
    return {
      ok: true,
      statusCode: res.status,
      headers,
      contentType: res.headers.get('content-type'),
      body: buf,
      etag,
      lastModified: parseLastModified(headers),
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    const message = e instanceof Error ? e.message : String(e);
    if (name === 'AbortError') {
      return { ok: false, kind: 'timeout', statusCode: null, message: 'Fetch aborted (timeout)' };
    }
    return { ok: false, kind: 'network_error', statusCode: null, message };
  } finally {
    clearTimeout(timeout);
  }
}
