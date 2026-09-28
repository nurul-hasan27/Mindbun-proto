/**
 * One error type for every way the database cannot be used.
 *
 * It lives here rather than beside one domain because it is a property of the
 * *store*, not of therapists or intakes: any repository that cannot reach
 * PostgreSQL throws it, and the route layer turns it into one honest 503.
 */
export class DataStoreUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DataStoreUnavailableError';
  }
}
