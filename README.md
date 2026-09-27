# Why This Match

> How can therapist matching be made more transparent without turning therapy into a
> therapist-shopping experience?

**Why This Match** is an independent portfolio prototype. The product it points towards would let
someone describe what they are looking for in their own words, have those preferences structured,
be matched with a therapist, **understand why that therapist was recommended**, say so when it does
not feel right, and receive a rematch based on that feedback.

> **This is not a Mindbun product.** It is an independent prototype and is not affiliated with,
> endorsed by, or connected to Mindbun or any healthcare provider. No logos, illustrations, or
> marketing material have been reproduced. **Every therapist, quote and match in this prototype is
> synthetic** — invented for demonstration, not a real person. No therapist data has been scraped or
> copied from any directory or website.

| Landing                                               | Start                                             | A therapist profile                                          |
| ----------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| ![Landing page](docs/screenshots/landing-desktop.jpg) | ![Start page](docs/screenshots/start-desktop.jpg) | ![Therapist profile](docs/screenshots/therapist-profile.jpg) |

---

## Current phase

**Phase 1 — Foundation + visual design system.** Complete.
**Phase 2 — Application shell + frontend/backend contract.** Complete.
**Phase 3 — Domain model + database foundation.** Complete.

Delivered so far:

- npm-workspace monorepo: `apps/web` (React) and `apps/api` (Fastify), plus a local PostgreSQL.
- A complete, tokenised design system: warm palette, editorial type scale, spacing rhythm, radii,
  shadows, and motion — all in one stylesheet, all contrast-checked.
- An application shell with a journey-aware header, a position indicator, and route transitions
  that do not destroy page state.
- Seven journey routes: `/` and `/start` implemented; `/intake`, `/matching`, `/recommendation`,
  `/feedback` and `/rematch` present as intentional placeholders for the flow to come.
- A typed API client with timeouts, cancellation, typed errors, and loading and error states in the
  product's own voice.
- A versioned backend API under `/api/v1`, with Fastify response schemas, CORS, and an
  infrastructure probe at `/health` kept intact.
- **A PostgreSQL domain model** for clients, therapists, structured matching attributes and
  availability — designed so that a future recommendation can explain itself from data we
  already hold. Reasoning in [`docs/domain-model.md`](docs/domain-model.md).
- **50 synthetic therapists**, seeded deterministically, across 28 regions and 17 timezones, with
  coherent language/region/availability combinations rather than random noise.
- `GET /api/v1/therapists` and `GET /api/v1/therapists/:id`, and one editorial profile page at
  `/therapists/:id` that presents a person rather than a catalogue entry.
- Tests, strict TypeScript, ESLint (type-aware + jsx-a11y), Prettier, and written documentation.

Deliberately **not** built: the intake form, preference capture, matching, recommendation
explanation, feedback and rematch behaviour, persistence of anything a person has written,
authentication, and any AI service.

## Tech stack

| Layer    | Choice                                                                        |
| -------- | ----------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite 8, React Router 8, Tailwind CSS 4 (CSS-first)      |
| Backend  | Node.js 24, TypeScript, Fastify 5, `@fastify/cors`                            |
| Database | PostgreSQL 17 (Docker Compose), Prisma 7 (schema, migrations, seed)           |
| Testing  | Vitest 5, Testing Library, Fastify `inject`, and a real-database test project |
| Tooling  | ESLint 9 (flat config, type-aware), Prettier 3, npm workspaces                |

No ORM beyond Prisma, no auth, no AI APIs, no Next.js, no Python — by design.

## Requirements

- Node.js **>= 22.18** (Prisma 7's floor; developed on 24.7)
- npm 10+
- **Docker Desktop** — only for the database

## Getting started

```bash
npm install          # installs both workspaces, and generates the Prisma client
npm run db:up        # starts PostgreSQL in Docker, and waits for it to be healthy
npm run db:migrate   # applies migrations, then seeds 50 therapists
npm run dev          # web on http://localhost:5173, api on http://127.0.0.1:4000
```

`npm run dev` starts both apps together. In development, the footer shows the API's health and a
link to a sample therapist profile, so the whole path is visible at a glance.

### Commands

| Command               | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `npm run dev`         | Runs web and api together                                       |
| `npm run dev:web`     | **Frontend** dev server (Vite), http://localhost:5173           |
| `npm run dev:api`     | **Backend** dev server (Fastify via tsx), http://127.0.0.1:4000 |
| `npm run db:up`       | Starts PostgreSQL (`docker compose up -d postgres`)             |
| `npm run db:down`     | Stops it, keeping data                                          |
| `npm run db:migrate`  | Creates/applies a migration for local development               |
| `npm run db:deploy`   | Applies existing migrations only (CI, production)               |
| `npm run db:seed`     | Clears and reseeds the synthetic dataset, deterministically     |
| `npm run db:reset`    | Drops, re-migrates and reseeds the database                     |
| `npm run db:studio`   | Opens Prisma Studio to look at the data                         |
| `npm run build`       | Type-checks and builds both workspaces                          |
| `npm run preview:web` | Serves the production web build locally                         |
| `npm test`            | Every test that does **not** need a database                    |
| `npm run test:db`     | The database-backed suite (needs `npm run db:up` first)         |
| `npm run typecheck`   | `tsc --noEmit` for both workspaces                              |
| `npm run lint`        | ESLint across the repo (`lint:fix` to autofix)                  |
| `npm run format`      | Prettier write (`format:check` to verify)                       |
| `npm run check`       | typecheck → lint → format:check → test, in one go               |

> **Adding a dependency?** Prefer editing `package.json` and running `npm install` over
> `npm install <pkg>`. Incremental installs have been observed to drop esbuild's platform-specific
> optional binary from the lockfile on this machine, which breaks the API's `tsx` dev server. A
> clean `rm -rf node_modules package-lock.json && npm install` restores it.

## API

```
Browser (React)
  └─ lib/api client          typed, with timeout + cancellation
      └─ HTTP (+ CORS)       VITE_API_URL
          └─ Fastify
              ├─ /health            infrastructure liveness (unversioned, no CORS)
              └─ /api/v1/*           the versioned application API
                  └─ Prisma → PostgreSQL
```

| Endpoint                     | Purpose                                        |
| ---------------------------- | ---------------------------------------------- |
| `GET /health`                | Infrastructure liveness: `{"status":"ok"}`     |
| `GET /api/v1/health`         | Service identity, version and liveness         |
| `GET /api/v1/therapists`     | A page of therapist summaries, ordered by name |
| `GET /api/v1/therapists/:id` | One full profile, including availability       |

```bash
curl http://127.0.0.1:4000/api/v1/health
curl 'http://127.0.0.1:4000/api/v1/therapists?take=3&language=hi'
curl http://127.0.0.1:4000/api/v1/therapists/<id>
```

`/api/v1/therapists` accepts `take` (1–50), `skip`, `language` (ISO 639-1) and `area` (an
area-of-work key), and answers `{ items, pagination: { total, take, skip, hasMore } }`. A malformed
id is a `400` and an unknown id is a `404` — they mean different things to a caller. Every response
is declared as a JSON Schema that Fastify validates and serialises from.

## Database

PostgreSQL 17 in Docker Compose, with a development database and a separate test database created
on first boot. Migrations are committed; the seed is deterministic, so the same 50 therapists exist
on every machine and in CI.

```bash
npm run db:up        # start
npm run db:migrate   # migrate + seed
npm run db:seed      # reset to the 50 synthetic therapists
npm run db:reset     # drop everything, re-migrate, re-seed
npm run db:studio    # browse the data
```

Entities: `Client`, `Intake`, `ClientPreference`, `ClientAvailability`, `Therapist`,
`TherapistProfile`, `AvailabilityWindow`, `Feedback`, and the shared vocabularies — `Language`,
`TherapeuticApproach`, `AreaOfWork`, `CommunicationStyle`, `ContextualExperience`, `SessionFormat`,
`FeedbackReason`. What each one is for, and what is deliberately missing, is in
[`docs/domain-model.md`](docs/domain-model.md).

## Environment configuration

Copy `.env.example` to `.env` at the repo root. Every value has a safe default, so `.env` is
optional for everything except talking to a database.

| Variable              | Default                                                   | Applies to | Purpose                         |
| --------------------- | --------------------------------------------------------- | ---------- | ------------------------------- |
| `NODE_ENV`            | `development`                                             | api        | Runtime mode                    |
| `API_HOST`            | `127.0.0.1`                                               | api        | Bind address                    |
| `API_PORT`            | `4000`                                                    | api        | Bind port                       |
| `API_LOG_LEVEL`       | `info`                                                    | api        | Pino log level                  |
| `API_CORS_ORIGIN`     | `http://localhost:5173,http://127.0.0.1:5173`             | api        | Browser origins allowed to call |
| `DATABASE_URL`        | `postgresql://wtm:wtm@127.0.0.1:5432/why_this_match`      | api        | Development database            |
| `TEST_DATABASE_URL`   | `postgresql://wtm:wtm@127.0.0.1:5432/why_this_match_test` | api        | Test database (must differ)     |
| `VITE_API_URL`        | `http://127.0.0.1:4000` in dev, unset in a build          | web        | API base URL                    |
| `VITE_API_TIMEOUT_MS` | `8000`                                                    | web        | Per-request timeout             |

Only `VITE_`-prefixed variables reach the browser bundle. The API refuses to start a database client
without `DATABASE_URL` — and, if it is missing, the health endpoints still answer while the
therapist routes report `503`. Liveness should not go down because a database is absent.

## Project structure

```
.
├── apps/
│   ├── api/                  Fastify service
│   │   ├── prisma/           schema, migrations, deterministic seed + its data
│   │   └── src/
│   │       ├── api/v1/       the versioned application API
│   │       │   ├── routes/   one module per endpoint, test beside it
│   │       │   └── schemas/  JSON Schema + TypeScript interface per response
│   │       ├── data/         the repository port and its Prisma adapter
│   │       ├── lib/          the Prisma client
│   │       ├── routes/       unversioned infrastructure routes
│   │       ├── config/       environment reading and validation
│   │       ├── app.ts        buildApp(): instance, CORS, route registration
│   │       └── server.ts     process entry: config, listen, shutdown
│   └── web/                  React client
│       ├── public/fonts/     self-hosted Fraunces + Inter (OFL 1.1)
│       └── src/
│           ├── app/          application bootstrap (App)
│           ├── components/   presentational building blocks
│           ├── layouts/      shared page frame (SiteLayout)
│           ├── lib/          helpers, and lib/api/ the typed client
│           ├── pages/        one component per route
│           ├── routes/       paths, journey, route tree, browser router
│           ├── styles/       design tokens + base layer
│           └── test/         test setup and render helpers
├── docker/                   local PostgreSQL init scripts
├── docker-compose.yml
├── docs/
│   ├── architecture.md         the whole system, and why
│   ├── frontend-architecture.md routing, state boundaries, API client
│   ├── domain-model.md         entities, relationships, constraints
│   ├── design-system.md        the visual language
│   └── screenshots/
└── package.json              npm workspaces root
```

## Documentation

- [`docs/domain-model.md`](docs/domain-model.md) — the data model, and the reasoning behind it.
- [`docs/frontend-architecture.md`](docs/frontend-architecture.md) — routing, layouts, the API
  client, and where state is allowed to live.
- [`docs/architecture.md`](docs/architecture.md) — repository shape, the request path, testing
  strategy, and the seams Phase 4 will plug into.
- [`docs/design-system.md`](docs/design-system.md) — philosophy, tokens, components, motion,
  accessibility rules.

## Privacy

- **All data is synthetic.** The 50 therapists are invented. No real profile was copied, scraped or
  photographed, and the product stores no photographs at all — a profile shows a generated monogram.
- **Clients carry no identity.** A `Client` is a UUID and two timestamps. No name, email, phone,
  address, or demographics, because none of them help a match and all of them could hurt someone.
- **`Intake.rawText` is the most sensitive field in the system.** It is never logged, never sent to
  a third party, and is not a matching input in this phase. Prisma is configured to log warnings and
  errors only — never query arguments — so client text cannot reach a log by accident.
- **Nothing sensitive is inferred.** Contextual experience (diaspora, relocation, family
  expectations) is data a therapist states about themselves, never derived from a name, a place, or
  anything a person wrote.

## Accessibility

Verified in a real browser, not assumed:

- Semantic landmarks, one `h1` per route, and profile sections as real headings, checked on every
  route by an automated test.
- Visible focus ring on every interactive element (2px clay outline, 3px offset), and a skip link
  as the first tab stop.
- The journey position indicator is not interactive, and carries a text alternative.
- Body and secondary text pass WCAG AA; the accent action colour passes on `--color-surface` at 5.3:1.
- All decorative SVG is `aria-hidden`; the one meaningful diagram carries a screen-reader caption.
- `prefers-reduced-motion: reduce` removes every animation, verified with `getAnimations()`.
- Layouts are designed at 320/390/834/1440px, not simply scaled down. The profile page has no
  horizontal overflow at any of them.
- Error states never lead with a technical message; the detail is in a collapsed disclosure and in
  the console.

## Notes and licences

- Fonts: [Fraunces](https://fonts.google.com/specimen/Fraunces) and
  [Inter](https://fonts.google.com/specimen/Inter), both SIL Open Font License 1.1, self-hosted so
  the prototype makes no third-party requests.
- `npm audit` reports advisories in Prisma's own CLI dependencies (`deepmerge-ts`, and a `mysql2`
  this project never uses). They are not reachable from the running service, which depends on
  `fastify`, `@prisma/client`, `@prisma/adapter-pg` and `pg`. Downgrading to Prisma 6 would be a
  breaking change for the schema and config conventions, so it is documented rather than forced.
- This prototype is not medical advice and not a healthcare service.
