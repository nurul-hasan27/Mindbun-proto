import { buildAppWithStore } from './app.js';
import { readServerConfig } from './config/env.js';
import { closePrismaClient } from './lib/prisma.js';

const config = readServerConfig();
const app = buildAppWithStore({
  logger: { level: config.logLevel },
  corsOrigins: config.corsOrigins,
});

if (config.databaseUrl === '') {
  app.log.warn(
    'DATABASE_URL is not set. Health endpoints will answer; therapist routes will report 503.',
  );
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await closePrismaClient();
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
  await closePrismaClient();
  process.exit(1);
}
