import type { FastifyPluginAsync } from 'fastify';

/** Successful health payload. */
export interface HealthResponse {
  status: 'ok';
}

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (): Promise<HealthResponse> => {
    return { status: 'ok' };
  });
};
