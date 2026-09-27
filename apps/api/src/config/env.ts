import { loadRootEnvFile } from './load-env-file.js';

loadRootEnvFile();

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly isProduction: boolean;
  readonly host: string;
  readonly port: number;
  /** Browser origins allowed to call the API. */
  readonly corsOrigins: readonly string[];
  readonly logLevel: string;
}

const nodeEnvs: readonly NodeEnv[] = ['development', 'test', 'production'];

function readNodeEnv(): NodeEnv {
  const value = process.env.NODE_ENV;

  if (value === undefined || value === '') {
    return 'development';
  }

  if (!nodeEnvs.includes(value as NodeEnv)) {
    throw new Error(`Invalid NODE_ENV: "${value}". Expected one of: ${nodeEnvs.join(', ')}.`);
  }

  return value as NodeEnv;
}

function readPort(): number {
  const value = process.env.API_PORT;

  if (value === undefined || value === '') {
    return 4000;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid API_PORT: "${value}". Expected an integer between 1 and 65535.`);
  }

  return port;
}

function readCorsOrigins(): readonly string[] {
  const value = process.env.API_CORS_ORIGIN;

  if (value === undefined || value === '') {
    return ['http://localhost:5173'];
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

const nodeEnv = readNodeEnv();

export const env: AppConfig = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  host: process.env.API_HOST || '127.0.0.1',
  port: readPort(),
  corsOrigins: readCorsOrigins(),
  logLevel: process.env.API_LOG_LEVEL || 'info',
});
