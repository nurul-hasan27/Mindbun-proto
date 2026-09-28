# Architecture

Phases 1–7 are delivered: a runnable foundation, a complete visual language, the communication
architecture between the two applications, a database that can make a recommendation explain
itself, the intake that fills it, a deterministic matching engine, feedback-driven rematching, and
the internal workspace where a human reviews what the engine produced.

- **Phase 1** — foundation + visual design system.
- **Phase 2** — application shell + the frontend/backend contract.
- **Phase 3** — domain model + database foundation.
- **Phase 4** — client intake experience.
- **Phase 5** — explainable deterministic matching engine.
- **Phase 6** — feedback + rematching.
- **Phase 7** — human-in-the-loop matching workspace (internal, unauthenticated).

The client is documented in depth in [`frontend-architecture.md`](./frontend-architecture.md), the
data model in [`domain-model.md`](./domain-model.md), the intake in
[`intake-flow.md`](./intake-flow.md), the engine in [`matching-engine.md`](./matching-engine.md),
the feedback loop in [`rematching.md`](./rematching.md), and the internal review workflow in
[`human-matching.md`](./human-matching.md). This file covers the whole system.

---

## 1. The shape of the system

```
┌───────────────────────────────────────────────┐
│ React client (apps/web)                       │
│                                               │
│  the client journey:                          │
│    page → useApiResource → lib/api client     │
│      therapists · intakes · matches · feedback │
│                                               │
│  the internal workspace (/matching-workspace): │
│    workspace.ts — a separate client, and the   │
│      only file a client page cannot import     │
└───────────────────┬───────────────────────────┘
                    │ fetch, typed, timeout + cancellation
                    │ VITE_API_URL, CORS preflight
┌───────────────────▼───────────────────────────┐
│ Fastify (apps/api)                            │
│                                               │
│  /health          infrastructure liveness     │  unversioned, no CORS
│  /api/v1/health   service identity            │
│  /api/v1/therapists, /intakes, /matches,      │  the client journey
│    /matches/:id/feedback, /matches/:id/rematch │
│  /api/v1/matching-workspace/*                 │  INTERNAL, unauthenticated
│        │                                      │
│  four repository ports, injected at the root: │
│    TherapistRepository   the directory        │
│    IntakeRepository      what a client asked  │
│    MatchRepository       the engine           │
│    FeedbackRepository    the conversation     │
│    WorkspaceRepository   the reviewer's read  │
└───────────────────┬───────────────────────────┘
                    │ Prisma 7 + @prisma/adapter-pg
┌───────────────────▼───────────────────────────┐
│ PostgreSQL 17 (Docker Compose)                │
│  domain tables + shared vocabularies          │
└───────────────────────────────────────────────┘
```

| Layer    | Choice                                                                   |
| -------- | ------------------------------------------------------------------------ |
| Frontend | React 19, TypeScript, Vite 8, React Router 8, Tailwind CSS 4 (CSS-first) |
| Backend  | Node.js 24, TypeScript, Fastify 5, `@fastify/cors`                       |
| Database | PostgreSQL 17, Prisma 7 (schema, migrations, deterministic seed)         |
| Testing  | Vitest 5, Testing Library, Fastify `inject`, and a real-database project |
| Tooling  | ESLint 9 (flat config, type-aware), Prettier 3, npm workspaces           |

## 2. Repository shape

An npm-workspaces monorepo with two applications and no shared library package.

```
root
├── package.json          workspaces: ["apps/*"], scripts, dev tooling
├── tsconfig.base.json    strict compiler options shared by both apps
├── eslint.config.js      flat config, type-aware, scoped per app
├── .prettierrc.json      + prettier-plugin-tailwindcss (class order)
├── .env.example
├── docker-compose.yml    one PostgreSQL service
├── docker/               init scripts: creates the test database
├── apps/web              React client
├── apps/api              Fastify service
└── docs
```

**Why no `packages/` yet.** A shared package is the right answer when two apps genuinely need the
same code _and_ the sharing is worth a build step. The one thing both sides need is the API
contract, and with a single domain it is mirrored rather than extracted: the backend owns the JSON
Schema that Fastify enforces, and the frontend has hand-written interfaces in `lib/api/types.ts`
that a test pins to the same shape. The trigger for `packages/contracts` is the **second** domain
(`intake`), where both sides will need more than a handful of shapes — documented in
[`frontend-architecture.md`](./frontend-architecture.md#where-the-types-come-from).

**Prisma-generated types stay inside the API.** `TherapistProfile` (generated) never leaves
`src/data/therapists/`; the port, the routes, the schemas and the client all speak the plain
`TherapistSummary` / `TherapistProfile` view types. That is what makes it safe to reshape the
schema, and it is why the frontend can be type-checked without a database or a generated client.

## 3. Frontend

### Layers

```
main.tsx          React root; imports the stylesheet once
 └ app/App.tsx    RouterProvider
    └ routes/     route paths, the journey, shared route tree, browser router
       └ layouts/ SiteLayout: skip link, grain, header, main, footer
          └ pages/     one component per route
             └ components/  presentational building blocks
                └ lib/        cx, format, useApiResource, useRouteEntrance
                   └ lib/api/ config, client, errors, typed endpoints
```

The dependency arrow only points downwards. Details, state boundaries, and the API client design
are in [`frontend-architecture.md`](./frontend-architecture.md).

### Routes

| Route             | State       | Purpose                                     |
| ----------------- | ----------- | ------------------------------------------- |
| `/`               | implemented | The doorway                                 |
| `/start`          | implemented | Step 1: what you are looking for            |
| `/intake`         | implemented | Step 2: the questions                       |
| `/matching`       | implemented | Step 3: the search, and the honest failures |
| `/recommendation` | implemented | Step 4: one person, and the reasons         |
| `/feedback`       | implemented | Step 5: what did not fit                    |
| `/rematch`        | placeholder | Step 6: another attempt                     |
| `/therapists/:id` | implemented | One therapist profile (outside the journey) |
| `*`               | implemented | A considered 404                            |

The profile route is deliberately **outside** the journey: a profile is something a recommendation
will point at, so it is reached from there rather than from the journey itself. The header drops
its "Start" link on that route rather than pretending it is the beginning.

### Styling

Tailwind CSS v4 in CSS-first mode: `@import "tailwindcss"` plus a single `@theme` block defining
every colour, font, size, radius, shadow and easing as a design token. Tokens become utilities
(`bg-canvas`, `text-display`, `rounded-panel`, `shadow-soft`, `ease-gentle`), so components compose
styles from the design system rather than from literals. There is no `tailwind.config.js`.

The handful of things CSS utilities cannot express — the grain overlay, the loading hairline, the
skip link, the page washes — live as named classes in `@layer components`, documented in
[`design-system.md`](./design-system.md). The route entrance is played with the Web Animations API
so that navigating never remounts a page.

## 4. Backend

```
src/
├── app.ts            buildApp(): instance, CORS, route registration
│                     buildAppWithStore(): the production wiring
├── server.ts         process entry: config, listen, graceful shutdown
├── config/env.ts     readServerConfig(): typed, validated, defaulted environment
├── lib/prisma.ts     createPrismaClient(): the only place a client is built
├── routes/           unversioned infrastructure routes (/health)
├── data/therapists/  the repository port, its Prisma adapter, view types,
│                     and profileDraft validation
├── data/intake/      the intake port, its Prisma adapter, and hand-written
│                     request validation that answers in sentences
├── data/matching/    the matching engine, one module per pipeline stage, plus
│                     its port and Prisma adapter
├── test/             test-database helpers
└── api/
    └── v1/
        ├── routes/   one module per endpoint, test beside it
        └── schemas/  JSON Schema + TypeScript interface per response
```

- `buildApp()` returns an unstarted instance, which is what makes `app.inject()` testing possible
  without binding a port. `server.ts` is the only file that listens.
- **The repositories are injected.** Routes depend on the `TherapistRepository`, `IntakeRepository`
  and `MatchRepository` interfaces, never on Prisma, so the whole API is testable without a database
  and the composition root (`app.ts`) is the only place that knows which implementation is in use.
  `buildApp()` with no repository wires ones that report `503`, so the process still starts and
  liveness still answers without a database. `/matches` is the first route needing two stores, which
  is why the injection is now visible rather than hypothetical.
- **The AJV validator is configured to reject rather than strip.** Fastify's default validator
  _removes_ properties a schema marks as additional, which would mean a declared
  `additionalProperties: false` quietly discards something a caller sent and then answers as if it
  had not been sent. On `/matches` that would mean a caller naming a therapist and receiving a match
  for someone else with no warning at all, so `removeAdditional: false` makes every declared schema
  mean what it says.
- **One error shape for the whole application API**, including the two failures that would
  otherwise answer in Fastify's own words: a body that is not JSON, and a body that does not match
  a schema. The request is still logged, so nothing is lost for whoever is debugging.
- **Request validation is hand-written where the answer matters.** `data/intake/intakeValidation.ts`
  reports sentences rather than JSON Schema paths, because a 400 is read by whoever is building
  the client.
- Every response is declared as a JSON Schema that Fastify validates and serialises from, next to a
  TypeScript interface for callers inside the service. Errors share one shape: `{ statusCode, error,
message }`.
- Request validation is done by the handler, not by the schema, wherever the framework's own
  message would be technical (`querystring/skip must match pattern …`). The response schemas stay
  strict; the request side speaks plain words.
- Environment parsing is hand-rolled and about a hundred lines: five variables with defaults,
  validated loudly at start-up rather than becoming confusing runtime errors.
- Logging is Fastify's built-in Pino, silenced in tests. `SIGINT`/`SIGTERM` close the server and the
  database pool.

### Two API surfaces, on purpose

| Endpoint                                                      | Purpose                                     | CORS | Versioned |
| ------------------------------------------------------------- | ------------------------------------------- | ---- | --------- |
| `GET /health`                                                 | Infrastructure liveness for uptime checks   | no   | no        |
| `GET /api/v1/health`                                          | Service identity and version for the client | yes  | yes       |
| `GET /api/v1/therapists`                                      | A page of therapist summaries               | yes  | yes       |
| `GET /api/v1/therapists/:id`                                  | One full profile                            | yes  | yes       |
| `GET /api/v1/intake/vocabulary`                               | Everything an intake may ask about          | yes  | yes       |
| `POST /api/v1/intakes`                                        | Store an intake and its preferences         | yes  | yes       |
| `POST /api/v1/matches`                                        | One recommendation, and the reasons         | yes  | yes       |
| `GET /api/v1/feedback/reasons`                                | The terms someone can pick from             | yes  | yes       |
| `POST /api/v1/matches/:id/feedback`                           | What did not fit, about one match           | yes  | yes       |
| `POST /api/v1/matches/:id/rematch`                            | Look again, differently                     | yes  | yes       |
| `GET /api/v1/matching-workspace/cases`                        | Cases waiting for a human decision          | yes  | yes       |
| `GET /api/v1/matching-workspace/cases/:matchId`               | One case, in full                           | yes  | yes       |
| `GET /api/v1/matching-workspace/cases/:matchId/clients-words` | Free text, opt-in                           | yes  | yes       |
| `POST /api/v1/matching-workspace/cases/:matchId/decision`     | Record a decision                           | yes  | yes       |

A load balancer can poll a cheap, version-free path while the client talks to a namespace that can
evolve. `/api/v1` is where future domains land: `api/v1/routes/` gains a module per domain, and a
future `/api/v2` can be registered beside it without touching v1.

The last four rows are **internal and unauthenticated.** There is no login, no session and no token
anywhere in this codebase, and the rows are grouped so that they are greppable as a family and can
be mounted behind a guard in one place when there is something to guard with. Each of them says so
in its own OpenAPI description, in the place an integrator would read it. See
[`human-matching.md`](./human-matching.md#authentication-deliberately-not-implemented).

`POST /api/v1/matches/:id/decision` takes `{ selectedMatchId, reasons, note? }` and nothing else.
There is no client id, no intake id and no therapist id in the body, and no `decisionType` — the
server derives that from which candidate was named. The fields are declared without types and
validated by hand, because Fastify's AJV coerces by default: with a type declared, `[7]` arrives as
`["7"]`, and a caller could then persist a reason key the vocabulary has never heard of,
stringified, as though a matcher had chosen it.

The two match endpoints whose responses are deliberately _small_ are `POST /api/v1/matches` and
`POST /api/v1/matches/:id/rematch`. Each carries one therapist and a handful of sentences, and both
use **one shared schema** in `schemas/recommendation.ts`, declared `additionalProperties: false` on
every field, so a score added on that side fails the API's own tests rather than quietly reaching a
browser. A first match is a rematch with an empty exclusion set and no feedback, and sharing the
schema says so in the type system rather than in a comment. See
[`matching-engine.md`](./matching-engine.md) and
[`rematching.md`](./rematching.md) for what is excluded and why.

`POST /api/v1/matches/:id/rematch` takes **no body at all** — not an empty object, and not a
`content-type`. There is no field through which a caller could name a client, a therapist, an
exclusion or a weight, because all of those are derived from the match id the path already
carries. That is the whole of the security model for this phase, and it is structural rather than
a list of checks that could be forgotten.

### CORS

Registered in `buildApp` only when origins are configured, from `API_CORS_ORIGIN`. Without it a
browser on `localhost:5173` cannot read a response from `127.0.0.1:4000`, so it is a functional
requirement of the client/backend contract, not a nicety.

## 5. Database

PostgreSQL 17 in Docker Compose: one service, one volume, a development database, and a test
database created by an init script on first boot.

```bash
npm run db:up        # start, wait for healthy
npm run db:migrate   # create/apply a migration (local development)
npm run db:deploy    # apply committed migrations only (CI, production)
npm run db:seed      # clear and reseed, deterministically
npm run db:reset     # drop, re-migrate, re-seed
npm run db:studio    # browse the data
```

- **Migrations are committed** and applied with `migrate deploy` in any environment that is not a
  developer's laptop. `migrate dev` creates them.
- **Prisma 7** keeps the connection string out of the schema: the CLI reads it from
  `prisma7.config.ts`, and the client receives a driver adapter (`@prisma/adapter-pg`). The schema
  file describes the domain; `src/lib/prisma.ts` is the only place that opens a connection.
- **The seed is deterministic**: a fixed-seed PRNG over hand-written profiles and region presets
  produces the same 50 therapists on every machine, so a test written against the data means
  something. It clears the domain tables first, so running it twice cannot duplicate a row.
- **Profiles are validated where they are written** (`data/therapists/profileDraft.ts`) rather than
  by database CHECK constraints, which Prisma does not model — see
  [`domain-model.md`](./domain-model.md#availabilitywindow).
- **Two migrations.** `init` creates the domain. `add_intake_session` adds the two identifiers an
  anonymous intake needs — `clients.sessionId` and the `UNIQUE intakes.submissionId` that makes a
  retry safe — plus `client_preferences.openToGuidance`, which records "I'm not sure yet" as a real
  answer rather than an empty list. The new columns are added nullable, backfilled with
  `gen_random_uuid()`, and only then made `NOT NULL`: the migration Prisma would have generated
  fails outright on a database that already holds a client or an intake.

## 6. The request path, end to end

```
POST /api/v1/intakes            { sessionId, submissionId, areasOfWork, languages, … }
  → { intakeId, receivedAt }

POST /api/v1/matches            { intakeId }
  → { matchId, decidedAt, therapist: { …one person… }, whyThisMatch: [ { key, sentence, detail } ] }
  → or { outcome: 'no_candidate', considered: 50 }
```

```
useApiResource(signal => requestMatch(receipt.intakeId, undefined, { signal }), [intakeId])
  → derived state: loading | ready | error
      → ApiError { kind: 'network' | 'timeout' | 'aborted' | 'http' | 'parse' | 'config' }
```

A note on what the matching request is _not_: it is not a `GET`, even though it is idempotent. A
`POST` is what a caller reaching the server to have it _decide_ something looks like, and the
idempotency that a `GET` would imply is guaranteed anyway — the server evaluates an intake once and
returns the same stored decision to a retry.

Verified end to end in a real browser at 320, 390, 834 and 1440px: Landing → Start → all seven
questions → review → submit → recommendation, with the response body captured and checked for the
absence of a score, a rank, another candidate, an identifier and anything the client wrote.

## 7. Testing

| Project | Needs a database            | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `unit`  | no                          | The API through its repository port with an in-memory fake: `/api/v1/therapists` and `/therapists/:id` including pagination, filters, 404, malformed ids, store failure, and that an error body never leaks a connection string. Health and config. Profile-draft validation. On the client: the API client, the therapist endpoints, `useApiResource`, the loading and error primitives, the shell, and every page including the profile's loading, error and missing states. |
| `db`    | **yes** (`npm run test:db`) | The migrated schema, therapist creation with every relationship, cascade deletes, the repository against a real database, and the API end to end. Its setup applies migrations and seeds, which is also the proof that a migration works from an empty database.                                                                                                                                                                                                               |

`npm test` runs the `unit` project only, so a machine without Docker still gets a green suite.
`npm run test:db` is opt-in and needs `npm run db:up` first; if the database is not reachable it
fails with an explanation rather than a wall of connection errors, and it **refuses to run at all**
if `TEST_DATABASE_URL` and `DATABASE_URL` are the same value.

Frontend tests render the real route tree through a memory router and query by role and accessible
name, so a change that breaks an accessible name fails a test. No frontend test needs a running
backend: `stubFetch` stands in for `fetch` and honours `AbortSignal`, which is what lets the timeout
and cancellation paths be tested honestly.

## 8. Tooling

- **TypeScript strict**, with `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noImplicitReturns`, `verbatimModuleSyntax`, and `noPropertyAccessFromIndexSignature` enabled in
  `tsconfig.base.json`. No `any`; no non-null assertions in application code.
- The two apps differ deliberately: `apps/web` uses bundler resolution and `jsx: react-jsx`;
  `apps/api` uses `NodeNext` and emits real JavaScript (plus declarations and source maps) from
  `tsconfig.build.json`.
- **ESLint 9 flat config**: type-aware `strictTypeChecked` + `stylisticTypeChecked` scoped to
  TypeScript files, `react-hooks` (including the newer `refs` and `set-state-in-effect` rules),
  `react-refresh`, and `jsx-a11y` scoped to the web app. `no-console` applies to the service, where
  a stray log is a leak, and not to the seed, where the console is the tool's output.
- **Prettier** with `prettier-plugin-tailwindcss`, so class order is stable and diffs stay readable.
- **Prisma client generation** is a `postinstall` and a build step, so a fresh clone type-checks
  without extra ceremony. The generated directory is git-ignored and excluded from lint and format.

## 9. Dependencies

Deliberately small, and each one earns its place:

`react`, `react-dom`, `react-router`, `fastify`, `@fastify/cors`, `@prisma/client`,
`@prisma/adapter-pg`, `pg` — runtime.
`prisma`, `dotenv` (the CLI reads `.env` from the repository root), `vite`, `@vitejs/plugin-react`,
`tailwindcss`, `@tailwindcss/vite`, `typescript`, `vitest`, `jsdom`, `@testing-library/react`,
`@testing-library/jest-dom`, `tsx`, `@types/*` — build and test.
`eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`,
`eslint-plugin-react-refresh`, `eslint-plugin-jsx-a11y`, `prettier`,
`prettier-plugin-tailwindcss`, `concurrently` — tooling.

No CSS-in-JS, no component library, no state library, no HTTP library (the platform `fetch` plus
`AbortController` is enough), no validation framework, no migration tool beyond Prisma, no
`clsx` (there is a three-line `cx`), no `dotenv` in the service (Node loads it), no icon package.

## 10. Phases 6, 7 and 8, and what comes next

Phase 6 is delivered: feedback, and a rematch that takes it into account. The full account is in
[`rematching.md`](./rematching.md).

Phase 7 is delivered too: the internal workspace where a matcher reviews a case and decides, in
[`human-matching.md`](./human-matching.md).

Phase 8 is polish and repository hygiene rather than new capability, and the one change to the
shape of the system is worth recording here: **a first search now goes through `/matching`**,
not straight to the recommendation.

It did not before, because a first match had nowhere to wait — `/recommendation` asked for it
and showed the result in the same place. That left the journey indicator promising a step that
a first pass never visited: the header listed six steps and the path went from _the questions_
to _the recommendation_. A small inconsistency a person notices without being able to name it.

`/matching` already existed for a rematch, and already held the honest failures. It now takes
a first search as well, and the two differ only in what is true to say: "leaving past the
person you just turned down" is added for a rematch and never for a first pass, because a
person who has not been shown anyone has not been shown anyone. No new endpoint, no new
business logic, and the same effect-based pattern it already used.

**What it costs, stated rather than glossed.** A first pass now calls `POST /api/v1/matches`
twice: once on `/matching`, and once on `/recommendation` when it asks for the same thing.
That is the price of a transition step that has something to wait for — without the first
call the page would have nothing to hold and would flash, which is what routing around it was
meant to avoid.

The second call is a **retry, not a second search**, and the distinction is checkable rather
than asserted: both responses are byte-identical including `decidedAt` (which comes from the
stored row, not a fresh clock reading), and the database holds exactly one pass of fifty
candidate rows afterwards. `recommendTherapist` reads the existing pass before it evaluates
anything, so the engine does not run twice.

The alternative — having the recommendation page render from the match record — was rejected
because that record deliberately holds an id and a name rather than the evidence, and widening
it would mean keeping a client's recommendation in `sessionStorage`, which is the opposite of
what the privacy design is for.

One prediction this document made before Phase 6 was wrong, and it is worth recording rather than
quietly editing out. It said rematching would be _a new intake, not a mutation_. It is not: a
rematch is another **pass over the same intake**, which is what scoping the exclusion set to the
journey requires. `Match.attempt` carries the pass number and
`@@unique([intakeId, attempt, therapistId])` keeps a candidate to once per pass, so pass 1 is never
rewritten and the history is a sequence rather than a set of parallel intakes.

What that leaves for a future phase:

| Concern                 | Where it lands                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~A reviewer screen~~   | **Delivered in Phase 7.** The engine's `CandidateTrace` was what was waiting for it, and the workspace renders the shortlist from the stored pass                |
| Loosening a requirement | A real change to `deriveRequirements` plus a way to re-run a pass with different answers. Both no-match pages link to it and say it is not built                 |
| Geographic matching     | A new structured `TherapistProfile` attribute. Not a free-text location lookup                                                                                   |
| "This feels right"      | Recording that a match felt right. The control is present, focusable and honest about not existing yet                                                           |
| Reviewer authentication | The one thing Phase 7 could not do. `/matching-workspace` is unauthenticated, and `MatchingDecision` has no `decidedBy` because inventing one would be faking it |

Guardrails for those phases, so the visual language survives: no new colour outside the clay and
sage ramps, no component that wears a card unless it is genuinely a surface, no endpoint without a
schema and a test, no `any`, no free-text attribute that something has to match on later, and no
client copy that talks about the person as a user being funnelled.

The one thing Phase 6 kept, having now had the chance to break it, and Phase 7 tested by trying:
the internal score and the full candidate list are for a reviewer, never for a client.
`CandidateTrace` is a separate type from `CandidateEvaluation` precisely so that adding it to a
response is never a small change. Feedback extends what a client may _say_ and what a client may be
_shown next_ — it does not extend what a client may be shown _at all_. A human decision extends the
same boundary in the same direction: it changes _which_ therapist, never _what kind of information_.

Phase 7's structural answer to "the client must not see any of this" was to give the client API and
the internal API separate schemas, with no field in the first that anything in the second could
travel in. There is nothing to redact later, and no future field can leak by accident without
someone also adding it to a client-facing schema — which is a reviewable act.

The one thing Phase 5 established, and a later phase should not quietly undo: a match that cannot be
explained from stored evidence is a match this product has no business making. Every key the intake
stores exists because some sentence in a "Why we thought you might connect" was going to need it,
and that is now a sentence someone can read.
