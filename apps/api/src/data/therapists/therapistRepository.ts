import type {
  TherapistListQuery,
  TherapistListResult,
  TherapistProfileView,
} from './therapistView.js';

/**
 * The port the HTTP layer talks to.
 *
 * Routes depend on this interface, never on Prisma. That is what lets the API
 * be tested without a database, and what keeps generated row types from leaking
 * into schemas, handlers, or (via the mirror types) into the frontend.
 */
export interface TherapistRepository {
  list(query: TherapistListQuery): Promise<TherapistListResult>;
  findById(id: string): Promise<TherapistProfileView | null>;
  /** True when a vocabulary key is real, so filters can reject nonsense. */
  hasLanguage(code: string): Promise<boolean>;
  hasArea(key: string): Promise<boolean>;
}
