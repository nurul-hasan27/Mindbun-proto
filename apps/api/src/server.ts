import { buildApp } from './app.js';
import { env } from './config/env.js';

const app = buildApp();

try {
  await app.listen({ host: env.host, port: env.port });
} catch (error) {
  app.log.error({ err: error }, 'failed to start server');
  process.exit(1);
}
