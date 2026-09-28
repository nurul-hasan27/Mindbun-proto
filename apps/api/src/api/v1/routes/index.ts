import type { FastifyPluginCallback, FastifyPluginOptions } from 'fastify';
import type { AiProvider } from '../../../ai/aiProvider.js';
import { createUnavailableAiProvider } from '../../../ai/buildAiProvider.js';
import type { IntakeRepository } from '../../../data/intake/intakeRepository.js';
import type { FeedbackRepository } from '../../../data/matching/feedbackRepository.js';
import type { MatchRepository } from '../../../data/matching/matchRepository.js';
import type { WorkspaceRepository } from '../../../data/matching/workspaceRepository.js';
import type { TherapistRepository } from '../../../data/therapists/therapistRepository.js';
import { v1HealthRoute } from './health.js';
import { buildIntakeRoutes } from './intake.js';
import { buildFeedbackRoutes } from './feedback.js';
import { buildMatchRoutes } from './matches.js';
import { buildWorkspaceRoutes } from './workspace.js';
import { buildTherapistRoutes } from './therapists.js';
import { buildAiRoutes } from './ai.js';
import { buildAiWorkspaceRoutes } from './aiWorkspace.js';

export interface V1RouteOptions {
  readonly therapists: TherapistRepository;
  readonly intakes: IntakeRepository;
  readonly matches: MatchRepository;
  readonly feedback: FeedbackRepository;
  readonly workspace: WorkspaceRepository;
  /**
   * The AI layer.
   *
   * A dependency like every other store, and defaulted to an honest "unavailable" so that a
   * test which does not care about AI can omit it and get a `503` rather than a crash. The
   * composition root in `app.ts` is the only place that knows whether a real model, the
   * deterministic mock, or nothing at all is behind it.
   */
  readonly ai?: AiProvider;
}

/**
 * Everything under `/api/v1`.
 *
 * Repositories are handed in rather than imported, so the composition root in
 * `app.ts` is the only place that knows which implementation is in use. Future
 * domains (recommendation, feedback) register here as siblings, and a future
 * `/api/v2` can sit beside this without touching it.
 */
export const v1Routes: FastifyPluginCallback<FastifyPluginOptions & V1RouteOptions> = (
  app,
  options,
  done,
) => {
  app.register(v1HealthRoute);
  app.register(buildTherapistRoutes(options.therapists));
  app.register(buildIntakeRoutes(options.intakes));
  // Matching needs both stores: the intake to match and the therapists to match
  // against. It is the first route that does, which is why it is also the first to
  // make dependency injection obvious.
  // The feedback store is needed here too, not only on the feedback routes. `POST
  // /matches` answers with the *current* recommendation, and after a rematch that means
  // naming who the client came away from and what is demonstrably different. Without it
  // the page loses both on a refresh — a visitor who reloads would see the right person
  // with none of the framing that explains why they are seeing a second one.
  // The match route carries the workspace because the client must be shown whoever a
  // matcher chose. It is the only client-facing route with an internal dependency, and the
  // schema it sends is unchanged by that — see `buildMatchRoutes`.
  app.register(
    buildMatchRoutes(options.matches, options.therapists, options.feedback, options.workspace),
  );
  // Feedback needs three stores: the match it responds to, the candidates to search,
  // and the vocabulary of reasons. It is the first route that reads all three, which is
  // also the first to make "everything is derived here, nothing is sent" load-bearing.
  app.register(buildFeedbackRoutes(options.feedback, options.matches, options.therapists));

  // The reviewer's side, namespaced and separate. It reads the engine's records and adds a
  // decision beside them; it has no method that could write a `Match`, which is what keeps
  // the audit trail from being a promise rather than a property of the code.
  // The feedback store is here for its *vocabulary*, not its data: the case timeline and the
  // AI case summary both need the client's reasons in words, and the keys alone are not
  // readable. Nothing in either reads free text.
  app.register(
    buildWorkspaceRoutes(options.workspace, options.matches, options.therapists, options.feedback),
  );

  // The AI layer. Two surfaces, and they are deliberately not the same route builder.
  //
  // The intake companion is client-facing: it interprets someone's own words and returns
  // vocabulary keys, and it writes nothing. It sits with the other client routes.
  const ai = options.ai ?? createUnavailableAiProvider();
  app.register(buildAiRoutes({ ai, intakes: options.intakes }));

  // The case summary is not. It reads a case, so it lives under the reviewer's namespace
  // and inherits the boundary Phase 7 established — no client route reaches it, and no
  // client page imports the client that calls it.
  app.register(
    buildAiWorkspaceRoutes({
      workspace: options.workspace,
      matches: options.matches,
      therapists: options.therapists,
      feedback: options.feedback,
      ai,
    }),
  );

  done();
};
