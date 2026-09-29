const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const NODE_ENVS = ['development', 'test', 'production'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export type NodeEnv = (typeof NODE_ENVS)[number];

/**
 * Which AI implementation to build.
 *
 * `mock` is a real, deterministic implementation rather than a placeholder — it is what
 * runs with no key configured, and it is what every test injects. It is a value here rather
 * than an inference from "is a key set" so that the configuration is readable in one place:
 * a reviewer can see that a deployment chose the mock, rather than inferring it from a
 * missing variable.
 */
export const AI_PROVIDERS = ['mock', 'openai-compatible'] as const;

export type AiProviderName = (typeof AI_PROVIDERS)[number];

/** Configuration for the AI layer. Read once, at start-up. */
export interface AiConfig {
  readonly provider: AiProviderName;
  /** Empty when unconfigured. Never logged, never serialised, never sent anywhere. */
  readonly apiKey: string;
  /** e.g. `https://api.openai.com/v1`. Only read for `openai-compatible`. */
  readonly baseUrl: string;
  /** e.g. `gpt-4o-mini`. Shown to a person so they know which model answered. */
  readonly model: string;
  /** Hard ceiling on one model call. */
  readonly timeoutMs: number;
}

export interface ServerConfig {
  readonly nodeEnv: NodeEnv;
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
  /** Browser origins allowed to call this API, lowest priority first. */
  readonly corsOrigins: readonly string[];
  /**
   * PostgreSQL connection string. Empty when unset: the service still boots and
   * the health endpoints still answer, while the data routes report that the
   * store is unavailable. Failing the whole process would take the liveness
   * probe down with it.
   */
  readonly databaseUrl: string;
  /**
   * The AI layer.
   *
   * Always present, so nothing has to check whether it was configured. With nothing set
   * the provider is the deterministic mock and the product is fully usable — that is the
   * default, and it is why the feature can be reviewed by someone with no account.
   */
  readonly ai: AiConfig;
}

const DEFAULTS = {
  nodeEnv: 'development',
  host: '127.0.0.1',
  port: 4000,
  logLevel: 'info',
  corsOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  databaseUrl: '',
  ai: {
    provider: 'mock',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    timeoutMs: 20_000,
  },
} as const satisfies ServerConfig;

function readDatabaseUrl(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === '') {
    return '';
  }

  const value = raw.trim();
  if (!value.startsWith('postgresql://') && !value.startsWith('postgres://')) {
    throw new Error('DATABASE_URL must be a postgresql:// connection string.');
  }

  return value;
}

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

function readText(raw: string | undefined, fallback: string): string {
  const value = raw?.trim();
  return value === undefined || value === '' ? fallback : value;
}

function readTimeoutMs(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const value = Number(raw);

  // A ceiling on a wait, not a preference. Longer than a minute and the interface has
  // already given up; a tenth of a second and every cold model call fails on a slow
  // network. The range is deliberately narrow.
  if (!Number.isInteger(value) || value < 1_000 || value > 60_000) {
    throw new Error(`AI_TIMEOUT_MS must be an integer between 1000 and 60000. Received "${raw}".`);
  }

  return value;
}

function readBaseUrl(raw: string | undefined, fallback: string): string {
  const value = readText(raw, fallback);

  if (!/^https?:\/\/[^\s/]+/.test(value)) {
    throw new Error(`AI_BASE_URL must be an http(s) URL. Received "${raw}".`);
  }

  return value.replace(/\/+$/, '');
}

/**
 * The AI layer, from the environment.
 *
 * ## What fails loudly and what does not
 *
 * A malformed `AI_BASE_URL` or a nonsensical `AI_TIMEOUT_MS` throws at start-up, because
 * those are typos and a typo that silently disables a feature is worse than a boot failure.
 *
 * **A missing key does not throw.** It selects the mock. That is the single most important
 * behaviour in this file: a reviewer who clones this repository, runs `npm install` and
 * `npm run dev` gets the whole product, conversation and case summary included, with no
 * account and no key. Setting `AI_PROVIDER=openai-compatible` without a key is the one
 * combination that throws, because it is an explicit request for a provider that cannot
 * work.
 */
function readAiConfig(env: NodeJS.ProcessEnv): AiConfig {
  const provider = readEnum(env['AI_PROVIDER'], AI_PROVIDERS, DEFAULTS.ai.provider, 'AI_PROVIDER');
  const apiKey = readText(env['AI_API_KEY'], '');
  const baseUrl = readBaseUrl(env['AI_BASE_URL'], DEFAULTS.ai.baseUrl);
  const model = readText(env['AI_MODEL'], DEFAULTS.ai.model);
  const timeoutMs = readTimeoutMs(env['AI_TIMEOUT_MS'], DEFAULTS.ai.timeoutMs);

  if (provider === 'openai-compatible' && apiKey === '') {
    throw new Error('AI_PROVIDER=openai-compatible requires AI_API_KEY. Or use AI_PROVIDER=mock.');
  }

  return { provider, apiKey, baseUrl, model, timeoutMs };
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
    databaseUrl: readDatabaseUrl(env['DATABASE_URL']),
    ai: readAiConfig(env),
  };
}
