const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const NODE_ENVS = ['development', 'test', 'production'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export type NodeEnv = (typeof NODE_ENVS)[number];

export interface ServerConfig {
  readonly nodeEnv: NodeEnv;
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
  /** Browser origins allowed to call this API, lowest priority first. */
  readonly corsOrigins: readonly string[];
}

const DEFAULTS = {
  nodeEnv: 'development',
  host: '127.0.0.1',
  port: 4000,
  logLevel: 'info',
  corsOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
} as const satisfies ServerConfig;

function readEnum<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
  name: string,
): T {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const value = raw.trim() as T;
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}. Received "${raw}".`);
  }

  return value;
}

function readPort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 65_535) {
    throw new Error(`API_PORT must be an integer between 0 and 65535. Received "${raw}".`);
  }

  return value;
}

function readHost(raw: string | undefined, fallback: string): string {
  const value = raw?.trim();
  return value === undefined || value === '' ? fallback : value;
}

function readOrigins(raw: string | undefined, fallback: readonly string[]): readonly string[] {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error('API_CORS_ORIGIN must list at least one origin, or be left empty.');
  }

  return origins;
}

/**
 * Reads server configuration from the environment. Every value has a safe default so
 * the API can boot with no `.env` file at all. Invalid values fail loudly at start-up
 * rather than surfacing as confusing runtime errors later.
 */
export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    nodeEnv: readEnum(env['NODE_ENV'], NODE_ENVS, DEFAULTS.nodeEnv, 'NODE_ENV'),
    host: readHost(env['API_HOST'], DEFAULTS.host),
    port: readPort(env['API_PORT'], DEFAULTS.port),
    logLevel: readEnum(env['API_LOG_LEVEL'], LOG_LEVELS, DEFAULTS.logLevel, 'API_LOG_LEVEL'),
    corsOrigins: readOrigins(env['API_CORS_ORIGIN'], DEFAULTS.corsOrigins),
  };
}
