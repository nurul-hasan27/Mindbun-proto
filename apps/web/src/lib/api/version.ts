/**
 * The versioned application API namespace.
 *
 * It matches the Fastify route prefix in `apps/api/src/app.ts`, where the value
 * is defined. Keeping it in its own module lets both endpoint modules use it
 * without importing each other.
 */
export const API_V1 = '/api/v1';
