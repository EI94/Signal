import { z } from 'zod';
import type { RuntimeEnvName, ServerRuntimeConfig } from './types';

const RUNTIME_ENV_NAMES = ['development', 'staging', 'production'] as const;

const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

/**
 * Maps NODE_ENV to a known runtime name. Empty or unknown values become `development`
 * (same behaviour as the previous getEnvName helper).
 */
export function parseRuntimeEnvName(nodeEnv: string | undefined): RuntimeEnvName {
  const raw = typeof nodeEnv === 'string' ? nodeEnv.trim() : '';
  if (raw === '') return 'development';
  if ((RUNTIME_ENV_NAMES as readonly string[]).includes(raw)) {
    return raw as RuntimeEnvName;
  }
  return 'development';
}

function parsePortString(raw: string | undefined, defaultPort: number): number {
  if (raw === undefined || raw.trim() === '') return defaultPort;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid PORT: "${raw}". Must be an integer between 1 and 65535.`);
  }
  return n;
}

const rawServerEnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  SIGNAL_SERVICE_VERSION: z.string().optional(),
  npm_package_version: z.string().optional(),
});

export function formatConfigError(context: string, error: z.ZodError): never {
  const details = error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  throw new Error(`Invalid ${context}: ${details}`);
}

export function parseServerRuntimeEnv<S extends 'api' | 'ingest' | 'intel'>(options: {
  serviceName: S;
  defaultPort: number;
  env: NodeJS.ProcessEnv;
}): ServerRuntimeConfig<S> {
  const parsedRaw = rawServerEnvSchema.safeParse({
    NODE_ENV: options.env.NODE_ENV,
    PORT: options.env.PORT,
    LOG_LEVEL: options.env.LOG_LEVEL,
    SIGNAL_SERVICE_VERSION: options.env.SIGNAL_SERVICE_VERSION,
    npm_package_version: options.env.npm_package_version,
  });

  if (!parsedRaw.success) {
    formatConfigError('runtime environment shape', parsedRaw.error);
  }

  const data = parsedRaw.data;
  const environment = parseRuntimeEnvName(data.NODE_ENV);

  let port: number;
  try {
    port = parsePortString(data.PORT, options.defaultPort);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid runtime config: ${msg}`);
  }

  const logRaw =
    data.LOG_LEVEL === undefined || data.LOG_LEVEL.trim() === ''
      ? 'info'
      : data.LOG_LEVEL.trim().toLowerCase();
  const logParsed = logLevelSchema.safeParse(logRaw);
  if (!logParsed.success) {
    throw new Error(
      `Invalid runtime config: LOG_LEVEL must be one of fatal, error, warn, info, debug, trace, silent (got "${data.LOG_LEVEL ?? ''}").`,
    );
  }

  const logLevel = logParsed.data;
  const version =
    data.SIGNAL_SERVICE_VERSION?.trim() || data.npm_package_version?.trim() || '0.0.0';

  return Object.freeze({
    serviceName: options.serviceName,
    environment,
    port,
    logLevel,
    version,
    isProduction: environment === 'production',
  }) as ServerRuntimeConfig<S>;
}
