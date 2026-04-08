/** Internal fetch result before hashing / delta (not the persisted SourceContent). */

export type FetchSuccess = {
  ok: true;
  statusCode: number;
  /** Lowercase header name → single value (last wins if duplicated). */
  headers: Record<string, string>;
  contentType: string | null;
  body: ArrayBuffer;
  etag: string | null;
  lastModified: Date | null;
};

export type FetchFailureKind = 'timeout' | 'network_error' | 'http_error' | 'body_too_large';

export type FetchFailure = {
  ok: false;
  kind: FetchFailureKind;
  statusCode: number | null;
  message: string;
};

export type FetchExecutionResult = FetchSuccess | FetchFailure;
