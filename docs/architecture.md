# Architecture

Phases 1–4 deliver a runnable foundation, a complete visual language, the communication
architecture between the two applications, a database that can make a future recommendation
explain itself, and the intake that fills it.

- **Phase 1** — foundation + visual design system.
- **Phase 2** — application shell + the frontend/backend contract.
- **Phase 3** — domain model + database foundation.
- **Phase 4** — client intake experience.

Matching, ranking and recommendation are still deliberately absent: an intake can be completed
and stored, and nothing yet reads one to choose a therapist.

The client is documented in depth in [`frontend-architecture.md`](./frontend-architecture.md), the
data model in [`domain-model.md`](./domain-model.md), and the intake in
[`intake-flow.md`](./intake-flow.md). This file covers the whole system.

---

## 1. The shape of the system

```
┌──────────────────────────────────────────┐
│ React client (apps/web)                  │
│                                          │
│  page → useApiResource                   │
│        → lib/api client                  │
│            getTherapist() / getTherapists│
└──────────────────┬───────────────────────┘
                   │ fetch, typed, timeout + cancellation
                   │ VITE_API_URL, CORS preflight
┌──────────────────▼───────────────────────┐
│ Fastify (apps/api)                       │
│                                          │
│  /health          infrastructure liveness│  unversioned, no CORS
│  /api/v1/health   service identity       │
│  /api/v1/therapists, /therapists/:id     │  versioned, CORS, validated
│        │                                 │
│        └─ TherapistRepository (port)     │  injected at the composition root
│             └─ Prisma adapter           │
└──────────────────┬───────────────────────┘
                   │ Prisma 7 + @prisma/adapter-pg
┌──────────────────▼───────────────────────┐
│ PostgreSQL 17 (Docker Compose)           │
│  domain tables + shared vocabularies     │
└──────────────────────────────────────────┘
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
| `/intake`         | placeholder | Step 2: the questions                       |
| `/matching`       | placeholder | Step 3: where a recommendation comes from   |
| `/recommendation` | placeholder | Step 4: one person, and the reasons         |
| `/feedback`       | placeholder | Step 5: how it felt                         |
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
├── test/             test-database helpers
└── api/
    └── v1/
        ├── routes/   one module per endpoint, test beside it
        └── schemas/  JSON Schema + TypeScript interface per response
```

- `buildApp()` returns an unstarted instance, which is what makes `app.inject()` testing possible
  without binding a port. `server.ts` is the only file that listens.
- **The repositories are injected.** Routes depend on the `TherapistRepository` and
  `IntakeRepository` interfaces, never on Prisma, so the whole API is testable without a database
  and the composition root (`app.ts`) is the only place that knows which implementation is in use.
  `buildApp()` with no repository wires ones that report `503`, so the process still starts and
  liveness still answers without a database.
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

| Endpoint                     | Purpose                                     | CORS | Versioned |
| ---------------------------- | ------------------------------------------- | ---- | --------- |
| `GET /health`                | Infrastructure liveness for uptime checks   | no   | no        |
| `GET /api/v1/health`         | Service identity and version for the client | yes  | yes       |
| `GET /api/v1/therapists`     | A page of therapist summaries               | yes  | yes       |
| `GET /api/v1/therapists/:id` | One full profile                            | yes  | yes       |

A load balancer can poll a cheap, version-free path while the client talks to a namespace that can
evolve. `/api/v1` is where future domains land: `api/v1/routes/` gains a module per domain, and a
future `/api/v2` can be registered beside it without touching v1.

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
GET /api/v1/therapists?take=3&language=hi
  → { items: [ … 3 summaries … ], pagination: { total: 50, take: 3, skip: 0, hasMore: true } }
```

```
useApiResource(signal => getTherapists({ take: 3 }, undefined, { signal }), [])
  → derived state: loading | ready | error
      → ApiError { kind: 'network' | 'timeout' | 'aborted' | 'http' | 'parse' | 'config' }
```

Verified end to end in a real browser: the development footer reports the API version, and the
profile route renders a profile fetched from PostgreSQL through CORS.

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

## 10. Where Phase 5 attaches

The intake stored everything a first matching pass would need, and nothing was built ahead of it:

| Phase 5 concern    | Where it lands                                                                      |
| ------------------ | ----------------------------------------------------------------------------------- |
| Matching           | Reads `ClientPreference`; the first use of the vocabulary joins                     |
| Timezone overlap   | `ClientAvailability` vs `AvailabilityWindow`, both in IANA zones                    |
| Explaining a match | `Intake.rawText`, stored unanalysed since Phase 4, plus the keys it was stored with |
| `openToGuidance`   | Read it to show breadth rather than pretending to know                              |
| Recommendations    | A new `Recommendation` entity; `Feedback` gains a `recommendationId`                |

Guardrails for those phases, so the visual language survives: no new colour outside the clay and
sage ramps, no component that wears a card unless it is genuinely a surface, no endpoint without a
schema and a test, no `any`, no free-text attribute that something has to match on later, and no
client copy that talks about the person as a user being funnelled.

The one thing Phase 5 must not skip: a match that cannot be explained from these fields is a match
this product has no business making. Every key stored by the intake exists because some future
sentence in a "Why this match?" was going to need it.
