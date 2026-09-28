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
**Phase 4 — Client intake experience.** Complete.
**Phase 5 — Explainable therapist matching engine.** Complete.

Delivered so far:

- npm-workspace monorepo: `apps/web` (React) and `apps/api` (Fastify), plus a local PostgreSQL.
- A complete, tokenised design system: warm palette, editorial type scale, spacing rhythm, radii,
  shadows, and motion — all in one stylesheet, all contrast-checked.
- An application shell with a journey-aware header, a position indicator, and route transitions
  that do not destroy page state.
- Seven journey routes: `/`, `/start`, the whole of `/intake` and `/recommendation` implemented;
  `/matching`, `/feedback` and `/rematch` present as intentional placeholders for the flow to come.
- **A complete intake** — seven questions, one at a time, in plain language rather than
  vocabulary names, with a review screen, an optional closing note, and honest handling of
  everything that can go wrong. Reasoning in [`docs/intake-flow.md`](docs/intake-flow.md).
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
- `GET /api/v1/intake/vocabulary` and `POST /api/v1/intakes`, so the questions are asked in terms
  of what the database actually holds, and a submission is validated, stored, and safe to retry.
- **A matching engine that can explain itself.** Ten named, separately testable stages from a
  stored intake to one recommendation, with integer-only scoring, a deterministic tie-break, and
  evidence stored as keys rather than prose — so a stored match always reads in the current wording
  and a stored sentence can never drift away from the facts that produced it. Availability is
  compared as real absolute intervals across IANA timezones, twice a year, with daylight-saving and
  midnight-crossing handled rather than approximated. Reasoning in
  [`docs/matching-engine.md`](docs/matching-engine.md).
- `POST /api/v1/matches`, which takes one intake reference and nothing else, and answers with one
  person and the reasons. **No score, no rank, no percentage, no other candidates, no internal
  weights, and no engine internals** — the response schema declares
  `additionalProperties: false`, so adding one of those fails the API's own tests rather than
  quietly reaching a browser.
- **Every candidate the engine considered is stored**, including the ones it set aside and why, so
  the decision stays inspectable. The engine has an internal score for ordering; it is never sent
  anywhere and never described, and a person's eligibility to be shown here is not a judgement
  about them.
- **`/recommendation`**, which introduces one person, gives the reasons in plain sentences, links
  to the full profile, and offers "This feels right" as a control that is present, focusable and
  honest about not existing yet.
- Tests, strict TypeScript, ESLint (type-aware + jsx-a11y), Prettier, and written documentation.

Deliberately **not** built: rematching, feedback behaviour, a reviewer screen, geographic matching,
clinical or diagnostic matching, accounts, payments, scheduling, and any AI service. The internal
ordering figure is not clinically validated — it is a documented prototype heuristic, and the
document says so.

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

| Endpoint                        | Purpose                                        |
| ------------------------------- | ---------------------------------------------- |
| `GET /health`                   | Infrastructure liveness: `{"status":"ok"}`     |
| `GET /api/v1/health`            | Service identity, version and liveness         |
| `GET /api/v1/therapists`        | A page of therapist summaries, ordered by name |
| `GET /api/v1/therapists/:id`    | One full profile, including availability       |
| `GET /api/v1/intake/vocabulary` | Everything an intake may ask about             |
| `POST /api/v1/intakes`          | Store an intake and its preferences            |
| `POST /api/v1/matches`          | One recommendation, and the reasons            |

```bash
curl http://127.0.0.1:4000/api/v1/health
curl 'http://127.0.0.1:4000/api/v1/therapists?take=3&language=hi'
curl http://127.0.0.1:4000/api/v1/therapists/<id>
curl -X POST http://127.0.0.1:4000/api/v1/matches \
  -H 'content-type: application/json' -d '{"intakeId":"<id>"}'
```

`/api/v1/therapists` accepts `take` (1–50), `skip`, `language` (ISO 639-1) and `area` (an
area-of-work key), and answers `{ items, pagination: { total, take, skip, hasMore } }`. A malformed
id is a `400` and an unknown id is a `404` — they mean different things to a caller. Every response
is declared as a JSON Schema that Fastify validates and serialises from.

`POST /api/v1/intakes` takes the structured answers plus two anonymous UUIDs and answers
`{ intakeId, receivedAt }`. It is **safe to retry**: the submission id is unique, so pressing
"Try again" after a failed save stores one intake rather than two. Unknown vocabulary keys, a
missing language, a window that ends before it starts, and a note that is too long are all `400`
with a sentence explaining which, and never with the value back.

`POST /api/v1/matches` takes one thing — the intake reference — and nothing else. There is no way to
ask "does this therapist match me?", because that would put the decision in the place it must not be.
It answers `{ matchId, decidedAt, therapist, whyThisMatch }`, or `{ outcome: "no_candidate",
considered }` — a `200`, because nobody qualifying is an answer rather than an error. It is safe to
call repeatedly: an intake is evaluated once, enforced by a unique index rather than by
application logic, and a retry returns the stored decision instead of searching again.

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
│   ├── intake-flow.md          the questions, the mapping, the state, the payload
│   ├── matching-engine.md      the pipeline, the weights, availability, evidence, limits
│   ├── design-system.md        the visual language
│   └── screenshots/
└── package.json              npm workspaces root
```

## Documentation

- [`docs/matching-engine.md`](docs/matching-engine.md) — the ten-stage pipeline, how requirements
  are derived, the weights and why they are not clinically validated, the timezone-correct
  availability algorithm, the evidence model, how explanations are generated, how reasons are
  prioritised, the tie-break, and the honest limitations.
- [`docs/intake-flow.md`](docs/intake-flow.md) — every question, the human wording mapped to
  database keys, the state model, persistence, the API payload, and the privacy decisions.
- [`docs/domain-model.md`](docs/domain-model.md) — the data model, and the reasoning behind it.
- [`docs/frontend-architecture.md`](docs/frontend-architecture.md) — routing, layouts, the API
  client, and where state is allowed to live.
- [`docs/architecture.md`](docs/architecture.md) — repository shape, the request path, testing
  strategy, and the seams Phase 6 will plug into.
- [`docs/design-system.md`](docs/design-system.md) — philosophy, tokens, components, motion,
  accessibility rules.

## Privacy

- **All data is synthetic.** The 50 therapists are invented. No real profile was copied, scraped or
  photographed, and the product stores no photographs at all — a profile shows a generated monogram.
- **Clients carry no identity.** A `Client` is a UUID and two timestamps. No name, email, phone,
  address, or demographics, because none of them help a match and all of them could hurt someone.
- **`Intake.rawText` is the most sensitive field in the system.** Someone's own words about their
  life. It is never logged, never sent to a third party, and is not analysed at all. Prisma logs
  `warn` and `error` _events_, never query arguments, so client text cannot reach a log by
  accident; and a test asserts that a failed request's response body contains neither the note
  nor a connection string.
- **The draft lives in `sessionStorage`, not `localStorage`.** A refresh preserves it; closing the
  tab destroys it. A draft cannot outlive the tab on a shared machine, and it is removed the
  moment the intake is sent or someone chooses to start over.
- **Nothing sensitive is inferred.** Contextual experience (diaspora, relocation, family
  expectations) is data a therapist states about themselves, never derived from a name, a place, or
  anything a person wrote. The matching engine is given two types — the client's chosen keys and a
  therapist's declared attributes — and has no access to a name, a biography, a location, a note or
  a clock, so it _cannot_ use them. That is a stronger guarantee than promising it will not.
- **What someone wrote never reaches a match.** `Intake.rawText` and `ClientPreference.note` are
  stored and left unparsed, by both the intake flow and the engine. The reasons a client reads are
  built only from the keys they selected and the attributes a therapist declared.
- **The recommendation response carries nothing that identifies the client.** No intake id, no
  client id, no answers, no score, no count of who else was considered. Asserted against the wire,
  not only against the schema.
- **After the intake is sent, the browser keeps one reference and nothing else.** A receipt —
  an identifier and a timestamp — so a refresh returns to the same recommendation. No answer, no
  words. "Start over" removes it.

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
- Layouts are designed at 320/390/834/1440px, not simply scaled down. The profile page, all eight
  intake screens and the recommendation have no horizontal overflow at any of them, verified by
  measuring `scrollWidth` against `clientWidth` in a real browser.
- The recommendation's reasons are a real `<ul>` of `<li>` inside a region labelled by its own
  heading, so a screen reader can count them. The unavailable "This feels right" control is
  `aria-disabled` rather than `disabled` — still focusable, still announced, and pointing at a
  visible line that says why it does nothing.
- Every choice in the intake is a real `<input type="checkbox">` or `type="radio">`, so arrow keys
  and Space work without being reimplemented. A chosen row is marked four ways — rule, tint, mark
  and type weight — so the state never depends on colour alone.
- Refusing to continue shows an alert _and_ moves focus to the answers, so a keyboard user is
  already where the fix has to happen.
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
