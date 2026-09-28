import type { IntakeReceipt, IntakeRequest, IntakeVocabulary } from './intakeTypes.js';

/**
 * The port the HTTP layer talks to.
 *
 * As with therapists, routes depend on this interface and never on Prisma: the
 * whole intake API can then be tested without a database, and `app.ts` is the
 * only place that knows which implementation is in use.
 */
export interface IntakeRepository {
  readVocabulary(): Promise<IntakeVocabulary>;

  /**
   * Stores one intake and the preferences that came with it.
   *
   * Called only with a request that has already been validated. Implementations
   * must treat `submissionId` as idempotent: a second call with the same value
   * returns the first receipt rather than storing the answers twice.
   */
  submit(request: IntakeRequest): Promise<IntakeReceipt>;
}
