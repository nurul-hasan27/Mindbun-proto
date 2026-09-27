import { buildApp } from './app.js';
import { readServerConfig } from './config/env.js';

const config = readServerConfig();
const app = buildApp({
  logger: { level: config.logLevel },
  corsOrigins: config.corsOrigins,
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
