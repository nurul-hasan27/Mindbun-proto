# Mindbun Matching Prototype

> How can therapist matching be made more transparent without turning therapy into a
> therapist-shopping experience?

An independent prototype for a service that helps someone find a therapist who may fit
them, **understands why that therapist was suggested**, and can say so when it does not feel
right — without ever being asked to become an expert at choosing therapists.

> **This is not a Mindbun product.** It is an independent prototype and is not affiliated
> with, endorsed by, or connected to Mindbun or any healthcare provider. No logos,
> illustrations, or marketing material have been reproduced. **Every therapist, quote and
> match in this prototype is synthetic** — invented for demonstration, not a real person.
> No therapist data has been scraped or copied from any directory or website.

---

## Product idea

Someone arrives having had a hard month. They do not know what "CBT" or "attachment-based"
means, they have no idea how many therapists there are, and they have no way to tell a good
fit from a plausible-sounding one. What they can tell is whether an explanation makes
sense.

So the product does three things, in this order:

1. **Asks what matters, in plain language.** Seven questions, one at a time, three of them
   optional. Nothing scored, nothing required, no clinical vocabulary to learn first.
2. **Shows its reasoning.** Every recommendation arrives with the reasons, written out as
   sentences a person can read — generated from stored evidence, so they cannot drift away
   from the facts that produced them.
3. **Accepts that it can be wrong.** Saying it was not the right fit changes the next
   search, and the next recommendation says what is genuinely different about it. When
   nothing is different, the page says nothing.

And underneath all of it, a **person makes the final call**. The engine suggests; a
matcher reviews the evidence and either agrees or chooses somebody else, with a reason.
The client is shown whoever was chosen and is told nothing about the machinery.

---

## Why I built it

Most therapist-matching products are directories with a filter, and the filter produces a
list. A list has to be ranked, ranking needs an ordering, and an ordering is a number
attached to a person. From there it is a short step to a percentage, a star rating, and a
"best match" badge — none of which any client can act on, because none of them can be
explained.

**Finding someone to talk to is not shopping.** A person choosing a therapist is not
optimising a utility function, and a "94% match" is not information: it is a number the
client cannot check, argue with, or use. The honest alternative is worse for a marketing
page and better for the person: say what you actually know, say why, and let them decide.

This prototype exists to make that alternative buildable rather than merely virtuous. The
interesting problems turn out to be elsewhere:

- How do you say _"they work in a way that emphasises exploration"_ without that becoming a
  claim about a person?
- How do you take "this was not right for me" seriously without turning it into a clinical
  judgement about a therapist?
- How do you record that a person disagreed with your engine without pretending the
  engine agreed with them?

None of those are marketing problems. They are modelling problems, and the answers are in
[`docs/`](docs/).

---

## Core journey

```
/                    a calm page that says what this is
 ↓
/start               what you will be asked, and that you need not know the vocabulary
 ↓
/intake/*            seven questions, one at a time, three optional
 ↓
/intake/review       "You told us…" — change anything, then send
 ↓
/matching            "we're looking through the therapists who may fit"
 ↓
/recommendation      one person, and the reasons, in sentences
 ↓  "I'd like another option"
/feedback            what didn't fit — about the interaction, never about the person
 ↓
/matching            the same engine, asked again
 ↓
/recommendation      someone else, and what is genuinely different
```

And the internal side, which a client never sees:

```
/matching-workspace                       cases waiting for a decision
/matching-workspace/:matchId              needs · suggestion · alternatives · decision · history
```

---

## Matching philosophy

**A stated preference is a weight, not a gate.** Someone who says "I would like someone
exploratory" gets a search that counts it, not a search that eliminates everyone else. This
is the single most consequential decision in the engine, and it is why the engine can
sometimes suggest somebody whose style the client did not ask for. That is a real
limitation, deliberately accepted, and it is the case a human matcher exists to catch.

**Requirements come only from what the client insisted on.** The intake records the
difference between "I would like" and "I need", and only the second becomes a condition
that can rule a candidate out.

**No client-facing number of any kind.** The engine has an internal integer used solely to
order candidates. It decides an order and then disappears. There is no percentage, no rank,
no star rating, no "top match", and no list of alternatives on a client page. Every response
schema declares `additionalProperties: false`, so adding one fails the API's own tests
rather than quietly reaching a browser.

**Every sentence is backed by a stored key.** A reason is not written beside a match; it is
generated from a row that was saved when the match ran. Change the wording in the vocabulary
tomorrow and the page reads in tomorrow's words — and a stored sentence can never drift away
from the facts that produced it.

**A reason is not a verdict.** Feedback means "the client reported that this did not feel
like a fit, and said so in these terms". Not that a therapist is ineffective, not that they
lack experience. The data model cannot express those claims, which is the point: a table
that could would eventually be read as making them.

**Nothing sensitive is inferred.** Contextual experience is something a therapist states
about themselves. It is never derived from a name, a place, or a biography — and the engine
is structurally given only two kinds of input, the client's chosen keys and a therapist's
declared attributes, so it _cannot_ use anything else.

**Deterministic, and the same every time.** The same intake, the same feedback and the same
dataset produce the same person, with no randomness and no clock in the scoring. Which is
what makes "what changed this time" a claim that can be checked.

**No AI of any kind.** No model, no embeddings, no LLM, no semantic search. Every sentence
is a template chosen by a stored key, every weight is a named integer, and the whole thing
runs in milliseconds — so a spinner longer than that would be theatre.

---

## Human-in-the-loop design

> **The system assists the matcher. The matcher decides.**

A deterministic engine is auditable but not infallible, and the phase that added the
workspace produced the clearest demonstration of that: for a client who asked for an
exploratory conversation, the engine suggested someone Direct and Structured, while an
alternative who did match the stated preference sat level on score. That is not a bug — a
preference is a weight — and it is exactly what a person is for. **The seed and the engine
were both left alone rather than tuned to make the demo look better.**

Three facts have to stay separate, and the schema is shaped around it:

|                           | What it is               | Where it lives                              |
| ------------------------- | ------------------------ | ------------------------------------------- |
| **System match**          | what the engine produced | a `Match` row, written once, never touched  |
| **Human decision**        | what a matcher selected  | a `MatchingDecision` row, beside it         |
| **Client recommendation** | who is actually shown    | **not stored** — derived from the first two |

A stored "who we showed them" column would be a third fact free to disagree with the other
two, and the disagreement would be invisible: every page would still render, from its own
copy of the wrong answer. The repository a decision is written through has no method that
could update a `Match`, so the audit trail is a property of the code rather than a promise.

**A matcher may not choose someone the engine set aside for missing a stated must-have.**
A human overrule would put a therapist who does not speak their language in front of a client
whose page said they did. They choose freely among everyone the engine considered viable.

**The client learns that a person was chosen, and nothing else.** No decision, no note, no
candidate list, no score. The client-facing response gained no field at all.

Full account in [`docs/human-matching.md`](docs/human-matching.md).

---

## Architecture

```
Browser (React)
  └─ lib/api client          typed, timeout + cancellation
      └─ HTTP (+ CORS)
          └─ Fastify
              ├─ /health            infrastructure liveness (unversioned, no CORS)
              └─ /api/v1/*           the versioned application API
                  ├─ therapist · intake · matching · feedback · matching-workspace
                  └─ Prisma → PostgreSQL
```

An npm-workspaces monorepo with two applications and no shared library. Four repository
ports sit between the routes and Prisma, each injected at the composition root, so the whole
API is testable without a database and `app.ts` is the only place that knows which
implementation is wired.

The port that matters most for this phase is `WorkspaceRepository`, which holds **no method
that writes a `Match`**.

Full documentation, with what each document is for:

| Document                                                         | What it is for                                                                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`docs/matching-engine.md`](docs/matching-engine.md)             | The ten-stage pipeline, the weights and why they are not clinically validated, the timezone-correct availability algorithm |
| [`docs/rematching.md`](docs/rematching.md)                       | The feedback model, why the rating column was removed, exclusions, history, and how "what changed" decides what it may say |
| [`docs/human-matching.md`](docs/human-matching.md)               | The review workflow, the decision model, the audit trail, and why authentication is absent                                 |
| [`docs/domain-model.md`](docs/domain-model.md)                   | The data model, and the reasoning behind it                                                                                |
| [`docs/architecture.md`](docs/architecture.md)                   | Repository shape, the request path, testing strategy                                                                       |
| [`docs/frontend-architecture.md`](docs/frontend-architecture.md) | Routing, the API client, and where state is allowed to live                                                                |
| [`docs/design-system.md`](docs/design-system.md)                 | Philosophy, tokens, components, motion, accessibility                                                                      |
| [`docs/intake-flow.md`](docs/intake-flow.md)                     | Every question, the human wording mapped to database keys                                                                  |
| [`docs/demo.md`](docs/demo.md)                                   | **How to walk someone through it**                                                                                         |

| Landing                                               | Start                                             | A therapist profile                                          |
| ----------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| ![Landing page](docs/screenshots/landing-desktop.jpg) | ![Start page](docs/screenshots/start-desktop.jpg) | ![Therapist profile](docs/screenshots/therapist-profile.jpg) |

The feedback loop — turning a recommendation down, and what happens next:

| Saying what did not fit                                    | Looking again                                                 | A second recommendation, and what changed                             |
| ---------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| ![The feedback page](docs/screenshots/p6-feedback-390.jpg) | ![The search](docs/screenshots/p6-matching-searching-390.jpg) | ![What changed this time](docs/screenshots/p6-recommendation-390.jpg) |

| Nobody left                                                    | The same pages on a phone                                  | On a tablet                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| ![Nobody left](docs/screenshots/p6-matching-exhausted-390.jpg) | ![Feedback at 320px](docs/screenshots/p6-feedback-320.jpg) | ![Recommendation at 834px](docs/screenshots/p6-recommendation-834.jpg) |

The internal workspace (`/matching-workspace`, unauthenticated) — where a person reviews what the
engine produced and decides:

| The queue                                             | What the client needs                                    |
| ----------------------------------------------------- | -------------------------------------------------------- |
| ![The queue](docs/screenshots/p7-workspace-queue.jpg) | ![Client needs](docs/screenshots/p7-workspace-needs.jpg) |

| The system's suggestion, and its evidence                          | The alternatives, with their evidence and gaps                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------- |
| ![System suggestion](docs/screenshots/p7-workspace-suggestion.jpg) | ![Alternatives](docs/screenshots/p7-workspace-alternatives.jpg) |

| Choosing another, and saying why | What the record says afterwards |
| -------------------------------- | ------------------------------- |

---

## Screenshots

| Landing                                               | Start                                             | A therapist profile                                          |
| ----------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| ![Landing page](docs/screenshots/landing-desktop.jpg) | ![Start page](docs/screenshots/start-desktop.jpg) | ![Therapist profile](docs/screenshots/therapist-profile.jpg) |

The feedback loop — turning a recommendation down, and what happens next:

| Saying what did not fit                                    | Looking again                                                 | A second recommendation, and what changed                             |
| ---------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| ![The feedback page](docs/screenshots/p6-feedback-390.jpg) | ![The search](docs/screenshots/p6-matching-searching-390.jpg) | ![What changed this time](docs/screenshots/p6-recommendation-390.jpg) |

| Nobody left                                                    | The same pages on a phone                                  | On a tablet                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| ![Nobody left](docs/screenshots/p6-matching-exhausted-390.jpg) | ![Feedback at 320px](docs/screenshots/p6-feedback-320.jpg) | ![Recommendation at 834px](docs/screenshots/p6-recommendation-834.jpg) |

The internal workspace (`/matching-workspace`, unauthenticated) — where a person reviews what the
engine produced and decides:

| The queue                                             | What the client needs                                    |
| ----------------------------------------------------- | -------------------------------------------------------- |
| ![The queue](docs/screenshots/p7-workspace-queue.jpg) | ![Client needs](docs/screenshots/p7-workspace-needs.jpg) |

| The system's suggestion, and its evidence                          | The alternatives, with their evidence and gaps                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------- |
| ![System suggestion](docs/screenshots/p7-workspace-suggestion.jpg) | ![Alternatives](docs/screenshots/p7-workspace-alternatives.jpg) |

| Choosing another, and saying why | What the record says afterwards |
| -------------------------------- | ------------------------------- |

---

## Tech stack

| Layer    | Choice                                                                        |
| -------- | ----------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite 8, React Router 8, Tailwind CSS 4 (CSS-first)      |
| Backend  | Node.js 24, TypeScript, Fastify 5, `@fastify/cors`                            |
| Database | PostgreSQL 17 (Docker Compose), Prisma 7 (schema, migrations, seed)           |
| Testing  | Vitest 5, Testing Library, Fastify `inject`, and a real-database test project |
| Tooling  | ESLint 9 (flat config, type-aware), Prettier 3, npm workspaces                |

No ORM beyond Prisma, no auth, no AI APIs, no Next.js, no Python — by design. There is also no
state-management library, no UI framework and no animation library, and each of those absences
is a decision rather than an oversight.

## Running locally

### Requirements

- Node.js **>= 22.18** (Prisma 7's floor; developed on 24.7)
- npm 10+
- **Docker Desktop** — only for the database

### Getting started

```bash
npm install          # installs both workspaces, and generates the Prisma client
npm run db:up        # starts PostgreSQL in Docker, and waits for it to be healthy
npm run db:migrate   # applies migrations, then seeds 50 therapists
npm run dev          # web on http://localhost:5173, api on http://127.0.0.1:4000
```

`npm run dev` starts both apps together. In development, the footer shows the API's health and a
link to a sample therapist profile, so the whole path is visible at a glance.

### Commands

| Command                     | What it does                                                    |
| --------------------------- | --------------------------------------------------------------- |
| `npm run dev`               | Runs web and api together                                       |
| `npm run dev:web`           | **Frontend** dev server (Vite), http://localhost:5173           |
| `npm run dev:api`           | **Backend** dev server (Fastify via tsx), http://127.0.0.1:4000 |
| `npm run db:up`             | Starts PostgreSQL (`docker compose up -d postgres`)             |
| `npm run db:down`           | Stops it, keeping data                                          |
| `npm run db:migrate`        | Creates/applies a migration for local development               |
| `npm run db:deploy`         | Applies existing migrations only (CI, production)               |
| `npm run db:seed`           | Clears and reseeds the synthetic dataset, deterministically     |
| `npm run db:reset`          | Drops, re-migrates and reseeds the database                     |
| `npm run db:studio`         | Opens Prisma Studio to look at the data                         |
| `npm run db:demo:workspace` | Creates one case waiting in `/matching-workspace`, idempotent   |
| `npm run build`             | Type-checks and builds both workspaces                          |
| `npm run preview:web`       | Serves the production web build locally                         |
| `npm test`                  | Every test that does **not** need a database                    |
| `npm run test:db`           | The database-backed suite (needs `npm run db:up` first)         |
| `npm run typecheck`         | `tsc --noEmit` for both workspaces                              |
| `npm run lint`              | ESLint across the repo (`lint:fix` to autofix)                  |
| `npm run format`            | Prettier write (`format:check` to verify)                       |
| `npm run check`             | typecheck → lint → format:check → test, in one go               |

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

| Endpoint                            | Purpose                                        |
| ----------------------------------- | ---------------------------------------------- |
| `GET /health`                       | Infrastructure liveness: `{"status":"ok"}`     |
| `GET /api/v1/health`                | Service identity, version and liveness         |
| `GET /api/v1/therapists`            | A page of therapist summaries, ordered by name |
| `GET /api/v1/therapists/:id`        | One full profile, including availability       |
| `GET /api/v1/intake/vocabulary`     | Everything an intake may ask about             |
| `POST /api/v1/intakes`              | Store an intake and its preferences            |
| `POST /api/v1/matches`              | One recommendation, and the reasons            |
| `GET /api/v1/feedback/reasons`      | The terms someone can pick from                |
| `POST /api/v1/matches/:id/feedback` | What did not fit, about one match              |
| `POST /api/v1/matches/:id/rematch`  | Look again, taking that into account           |

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
It answers `{ matchId, decidedAt, attempt, previousTherapistName, therapist, whyThisMatch,
whatChanged, adjustedFor }`, or `{ outcome: "no_candidate", considered }` — a `200`, because nobody
qualifying is an answer rather than an error. It is safe to call repeatedly: an existing pass is
returned rather than recomputed, enforced by a unique index rather than by application logic. It
answers with the **latest** pass, so after a rematch you get the person the client is on rather than
the one they turned down.

`POST /api/v1/matches/:id/feedback` takes `{ reasons, rawText? }` and marks that match `DECLINED`.
`POST /api/v1/matches/:id/rematch` takes **no body at all** — not an empty object, and not a
`content-type` — and both share one response schema with `POST /matches`, so a first match and a
rematch are the same shape. A rematch without feedback is a `409`, because rematching without a
reason is the endless shuffle this phase exists to prevent. A pool with nobody left in it is a
`200` with `outcome: "no_candidate"`.

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

One more, for the internal workspace:

```bash
# A case waiting in /matching-workspace, so the review flow has something to open.
# Goes through the real HTTP routes in-process, so it cannot drift from the product.
npm run db:demo:workspace
```

Entities: `Client`, `Intake`, `ClientPreference`, `ClientAvailability`, `Therapist`,
`TherapistProfile`, `AvailabilityWindow`, `Match`, `MatchEvidence`, `Feedback`, `FeedbackReason`,
`MatchingDecision`, `MatchingDecisionReason`, and the shared vocabularies — `Language`,
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
│   ├── rematching.md           feedback, signals, exclusions, history, what changed
│   ├── human-matching.md       the review workflow, the decision, the audit trail
│   ├── design-system.md        the visual language
│   └── screenshots/
└── package.json              npm workspaces root
```

## Documentation

- [`docs/human-matching.md`](docs/human-matching.md) — the internal review workflow: the three
  facts that must never be confused, the decision model and why `selectedMatchId` is a foreign key,
  the one limit on a matcher's authority, the decision reasons, what a reviewer sees, alternatives
  and why there are only four, what a candidate does not carry, the audit trail, the opt-in on
  free text, the API contract, the privacy boundary, why authentication is deliberately absent, and
  the limitations.
- [`docs/rematching.md`](docs/rematching.md) — the feedback model and why the rating column was
  removed, the feedback-to-signal mapping and what it must never become, exclusion behaviour and
  scope, the rematch lifecycle, the matching history, how "what changed" decides what it may say,
  the no-match case, the API contract, and the limitations.
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
  strategy, and what is left for a future phase.
- [`docs/design-system.md`](docs/design-system.md) — philosophy, tokens, components, motion,
  accessibility rules.
- [`docs/demo.md`](docs/demo.md) — the four demonstration scenarios, step by step, with what to
  say at each one.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — branch naming, commit style, the house rules, and the
  traps that have already bitten in this repository.

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
- **What someone wrote never reaches a match.** `Intake.rawText`, `ClientPreference.note` and
  `Feedback.text` are stored and left unparsed — never a matching input, never logged, never read
  at all. The reasons a client reads are built only from the keys they selected and the attributes a
  therapist declared, and a "what changed" sentence is built only from two therapists' declared
  attributes. Verified by scanning every key that has ever appeared in a log line: request ids,
  methods, urls, status codes and timings, and **zero** request bodies, headers or payloads.
- **Feedback is a report, and the model cannot state it as a verdict.** A row means "the client
  reported that this match did not feel like a fit, and said so in these terms." There is no rating
  column, no score and no sentiment on it, and nothing downstream infers anything about a
  therapist's skill, their effectiveness, or what they are like to work with.
- **Feedback is reachable only through a match id**, and "I don't know that match" and "not your
  match" are the same answer in the same words — so a caller cannot confirm an id exists by asking
  about someone else's. No response carries a client id, an intake id, a therapist id, the declined
  therapist's identifier, an exclusion list, or anything the client wrote.
- **The recommendation response carries nothing that identifies the client.** No intake id, no
  client id, no answers, no score, no count of who else was considered. Asserted against the wire,
  not only against the schema.
- **After the intake is sent, the browser keeps two references and nothing else.** A receipt — an
  identifier and a timestamp — so a refresh returns to the same recommendation, and a record of the
  match being shown: its id, the name the person has already been shown, the pass number, and the id
  and name of the match it replaced. No answer, no words, no profile. "Start over" removes both.
- **Declines do not follow a person around.** The exclusion set is scoped to one intake, which is
  the matching journey. A therapist declined on one search is perfectly recommendable to somebody
  else, or to the same person on a different intake later — otherwise the pool would quietly shrink
  each time someone came back, for reasons they could not see and could not undo.

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
  intake screens, the recommendation, the feedback form and the "looking again" step have no
  horizontal overflow at any of them, verified by measuring `scrollWidth` against `clientWidth`
  **and** by asking for any element whose right edge passes the viewport, so an overflow hidden
  behind a clipping ancestor still fails.
- **A visually hidden control still shows a focus ring.** An `sr-only` checkbox is one pixel wide,
  so the browser draws its ring on a one-pixel box and nobody sees it; the visible focus has to be
  carried by the label wrapping it. `.focus-within-ring` gives it the same 2px clay outline the rest
  of the product uses, rather than a one-pixel border colour change on a state that already has a
  border. Verified by tabbing through the form and reading the computed outline of each wrapper.
- **A submit in flight is guarded, not just styled.** `aria-disabled` is a description, not a
  mechanism — the native form submit does not consult it, so two fast clicks would send twice. The
  handler refuses as well, and a test presses the disabled-looking button again to prove it.
- **The waiting states claim nothing.** No "analysing", no "AI is thinking", no scan, no countdown,
  no progress bar, no numbered stage — the search is milliseconds and there is no stage to count.
  What it is doing is announced with `aria-live="polite"`.
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

## Demo

Four scenarios, about five minutes each, in [`docs/demo.md`](docs/demo.md):

|                                                                |                                          |
| -------------------------------------------------------------- | ---------------------------------------- |
| **A — a client gets a recommendation they can understand**     | The whole journey, ending on the reasons |
| **B — saying it was not right, and getting someone different** | Feedback, and what genuinely changed     |
| **C — the system suggests, and a person agrees**               | The workspace, and the decision record   |
| **D — the system suggests, and a person disagrees**            | The scenario the whole phase exists for  |

To have something waiting in the workspace first:

```bash
npm run db:demo:workspace
```

## Testing

```bash
npm run check        # typecheck → lint → format check → every non-database test
npm run test:db      # the database-backed suite (needs the database up)
npm run build        # type-check and build both workspaces
```

| Suite    | Count | What only it can catch                                  |
| -------- | ----- | ------------------------------------------------------- |
| API unit | 317   | What the endpoints refuse, and what they refuse to send |
| Web      | 435   | What a person sees, and in what order they see it       |
| Database | 81    | Whether the _history_ survives being written            |

The database suite is mostly read-back rather than assertions about return values. A service
that writes the right row and a database that stores a different one pass every other test in
the project; only reading the rows back finds that.

Beyond the suites, the client journey and the workspace have been driven end to end in a real
headless browser: every route at 320, 390, 834 and 1440px measuring `scrollWidth` against
`clientWidth`, keyboard-only traversal with the computed focus ring read at every stop,
`prefers-reduced-motion` verified to leave zero elements animating, and the network panel read
to confirm no endpoint is called twice in a journey and that no free text reaches a request.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for how to run, and for the conventions.

## Known limitations

**There is no authentication.** No login, no session, no token, and no fake login either —
inventing one would be faking authentication rather than modelling it. On a deployed instance,
anyone who can reach `/matching-workspace` can read every case and record decisions. This is a
prototype boundary, documented in
[`docs/human-matching.md`](docs/human-matching.md#authentication-deliberately-not-implemented),
not a security posture. It is also a routing boundary and no more: the workspace ships in the
same bundle as the client, so the code is readable even though nothing links to it.

**A stated preference can lose to an unstated one.** The engine weighs preferences and gates
only on requirements, so it can suggest someone whose conversation style the client did not
ask for while an alternative who does match sits level on score. Left as it is, because a
preference is not a requirement — and surfaced in the workspace as a line under the engine's
own suggestion, which is the case a human matcher exists for.

**"This feels right" is not built.** Recording that a match felt right is genuinely absent. The
control is present, focusable, and says so.

**"Revisit what you told us" is not built.** Loosening a requirement and searching again is
real work on the matching side. Present, focusable, honest.

**Alternatives are capped at four.** A case with fifty near-identical viable candidates will
not show the matcher the full shortlist, and the engine's own order decides which four.

**The internal ordering figure is not clinically validated.** It is a documented prototype
heuristic, and [`docs/matching-engine.md`](docs/matching-engine.md) says exactly which parts
are principled and which are chosen.

**No geographic matching.** Location is shown on a profile and never used to match, so
`location-mismatch` was removed from the feedback vocabulary — offering a reason the system
cannot act on is worse than offering none.

**Deliberately not built at all:** accounts, authentication, payments, scheduling, a
therapist-facing dashboard, messaging, video, notifications, analytics, and any AI service of
any kind.

## Notes and licences

- Fonts: [Fraunces](https://fonts.google.com/specimen/Fraunces) and
  [Inter](https://fonts.google.com/specimen/Inter), both SIL Open Font License 1.1, self-hosted so
  the prototype makes no third-party requests.

### Dependency audit

`npm audit --omit=dev` reports **4 high-severity advisories**, and they are recorded here
rather than silenced, because "no advisories" achieved by forcing a downgrade is not the same
as "no reachable risk".

| Advisory                                                  | Comes from       | Reachable at runtime? |
| --------------------------------------------------------- | ---------------- | --------------------- |
| `deepmerge-ts` (via `@prisma/config`)                     | the `prisma` CLI | **No**                |
| `mysql2` — auth-plugin downgrade, and a zlib inflate bomb | the `prisma` CLI | **No**                |

The whole chain is `prisma` → `mysql2`, and `prisma` is a **devDependency** of the API. This
project talks to PostgreSQL, so a MySQL driver is dead weight in the CLI's own dependency tree
and nothing here can open a MySQL connection.

Checked rather than assumed — the built service's own imports are:

```
fastify · @fastify/cors · @prisma/client · @prisma/adapter-pg
```

and `grep -r mysql2 apps/api/dist` finds nothing. The advisories are in the tool that reads
`schema.prisma` during a migration.

`npm audit fix --force` would install `prisma@6.19.3`. That is a **breaking change**: Prisma 7
moved configuration into `prisma7.config.ts` and changed how the client receives its driver
adapter, so the downgrade would mean rewriting the schema tooling and the client construction
to silence warnings about code that never runs in production. That trade is not worth making,
and the finding is documented instead.

Re-checked on every dependency change; the numbers above are from the current lockfile.

- This prototype is not medical advice and not a healthcare service.

---

## What each phase added

A record of what was built and why, in the order it was built. The sections above are the product; this is the history.

**Phase 1 — Foundation + visual design system.** Complete.
**Phase 2 — Application shell + frontend/backend contract.** Complete.
**Phase 3 — Domain model + database foundation.** Complete.
**Phase 4 — Client intake experience.** Complete.
**Phase 5 — Explainable therapist matching engine.** Complete.
**Phase 6 — Feedback and explainable rematching.** Complete.
**Phase 7 — Human-in-the-loop matching workspace (internal).** Complete.
**Phase 8 — End-to-end product polish and repository hygiene.** Complete.

Delivered so far:

- npm-workspace monorepo: `apps/web` (React) and `apps/api` (Fastify), plus a local PostgreSQL.
- A complete, tokenised design system: warm palette, editorial type scale, spacing rhythm, radii,
  shadows, and motion — all in one stylesheet, all contrast-checked.
- An application shell with a journey-aware header, a position indicator, and route transitions
  that do not destroy page state.
- Six journey routes, all of them implemented: `/`, `/start`, the whole of `/intake`, `/matching`,
  `/recommendation` and `/feedback`. Every step in the indicator is one the journey actually visits —
  including the search step, which a first pass used to skip. `/rematch` remains an intentional
  placeholder: a second pass arrives through the feedback loop, and a step that exists only to be
  clicked is worse than one that does not exist yet.
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
- **A feedback loop, and what it actually does.** A recommendation can be turned down with
  structured reasons and an optional note, and asking again runs **the same engine** with two
  differences: everyone already declined on this journey is left out, and the categories the person
  mentioned count for more, up to a ceiling. That is the whole mechanism — no model, nothing stored
  about the client beyond this journey, and the same intake with the same feedback always producing
  the same next person. "We took your feedback into account" is true of that; "the system learns"
  would not be, and a test fails if a page ever says it.
- **A first-class `Feedback` record, and a rating column deliberately removed.** A Phase 2 sketch
  had `sentiment` holding `GOOD | MIXED | POOR`. `POOR` is a verdict on a person, and this product
  does not issue verdicts on people; worse, it is not what the person said. A row now means
  exactly "the client reported that this match did not feel like a fit, and said so in these
  terms" — and the model cannot express a claim about the therapist's skill at all.
- **Feedback never becomes a requirement.** "The communication style didn't feel right" makes style
  count for more; it never becomes "only show me someone with a different style", which would go on
  eliminating candidates on someone's behalf for a condition they never stated. A candidate who
  shares none of the stated style stays eligible however much style is boosted, and a test on the
  real engine says so.
- **Two reasons do less than you would expect, honestly.** "I did not feel understood" and
  "Something else" adjust nothing: not feeling understood is not evidence about a conversational
  style, and treating it as one would quietly turn a report about an interaction into a claim about
  a person. They still remove the therapist and get someone different next; they do not claim an
  adjustment that is not there.
- **Exclusions scoped to the journey, and a reason removed for honesty.** A therapist declined on
  one intake is perfectly recommendable to somebody else, or to the same person later — nothing
  about one search follows a person around the service. And `location-mismatch` was dropped from the
  reason list, because this phase does no geographic matching and offering it would collect something
  the system cannot act on. A reason we cannot use is worse than no reason: it is a promise with
  nothing behind it.
- **An auditable matching history.** Pass 1 is never rewritten. Each pass writes all fifty
  candidates under its own attempt number, the previous recommendation keeps its evidence and its
  reasons, and `RECOMMENDED → DECLINED` is the only transition in the system.
- **"What changed this time", which is the hardest page to write honestly.** A change is reported
  only when the person mentioned it, the attributes really are different, and the new person covers
  their stated preference strictly better — measured with the same share the engine scores with. It
  says "a more exploratory style" only when the intake said exploratory and the new therapist has
  it and the last one did not, and it says nothing at all when nothing changed. The stated
  preference is read from the intake rather than from the previous match's evidence, because a
  preference only appears in evidence when the therapist happened to share it — and the case worth
  describing is precisely when they did not.
- **A security model that is structural rather than a list of checks.** Every endpoint in the
  client loop and the workspace takes one thing: a reference. There is no field through which a
  browser could name a client, name a therapist, add to the exclusion list, submit a weight, ask for
  a particular person, or claim a decision was something it was not. "I don't know that match" and
  "not your match" are the same answer, in the same words.
- **An internal matching workspace, where the system assists and the person decides.**
  `/matching-workspace` lists the cases waiting for review; a case page shows what the client asked
  for, what the engine suggested and the evidence for it, a small set of other candidates with their
  evidence **and what they do not offer**, and two calm paths — _use this recommendation_ or
  _choose another therapist_, the second requiring a reason. Reasoning in
  [`docs/human-matching.md`](docs/human-matching.md).
- **Three things a reviewer must never be shown, and does not get.** No score, no rank, no
  percentage, no weight: the engine's internal figure decides an order and then disappears, because
  a reviewer's case for disagreeing is evidence and a number is an oracle they would learn to defer
  to. No clinical anything — there is nowhere to store a diagnosis, a severity or a risk. And no
  arbitrary identifier: no endpoint accepts a client id, an intake id or a therapist id, so a
  caller cannot steer a review of a person they did not choose.
- **One real limit on a matcher's authority, stated rather than implied.** A matcher may not choose
  someone the engine set aside for missing something the client marked as a must-have — a human
  overrule would put a therapist who does not speak their language in front of a client whose
  recommendation page said they did. They choose freely among everyone the engine considered
  viable, and "viable" is a statement about the client's conditions rather than about anyone's
  worth.
- **An audit trail that is a property of the code, not a promise.** A decision is a new
  `MatchingDecision` row _beside_ the engine's recommendation, never an edit of it: the
  repository a decision is written through has no method that could update a `Match`. Keeping the
  system suggestion and choosing someone else are recorded as two different facts about the same
  case, and the client's recommendation is _derived_ from the two rather than stored as a third
  fact free to disagree with them. A test reads the rows back from the database and asserts the
  engine's `therapistId`, `score`, `status` and evidence are all exactly as it left them.
- **The client learns that a person was chosen, and nothing else.** No decision, no note, no
  candidate list, no score, no "an AI chose someone else". The client-facing response schema gained
  no field, and a test asserts the serialised key set is identical before and after a decision.
  After a human review the client is shown whoever the matcher chose, with that person's evidence —
  a page pairing one person with another's reasons would contradict itself in front of the person
  least able to check it.
- **The client's own words, behind an opt-in that can be audited.** They are not in the case
  payload at all, and reaching for them is a _second request_ — visible in a network log — rather
  than a field that happened to be populated. Only the exact word `reveal` opens it; `true`, `1`
  and an empty string all leave it out. Never logged.
- **The honest finding this phase produced, left unfixed on purpose.** For a client who asked for an
  exploratory conversation, the engine suggests someone Direct and Structured, and an alternative
  who does match what was asked for sits level with them on score. That is not a bug: a stated
  preference is a weight, not a gate. It is the case a human matcher exists for, and the workspace
  surfaces it as a line under the engine's own suggestion. The seed and the engine were both left
  alone rather than tuned to make the demo look better.
- **The limitation stated plainly: there is no authentication.** No login, no session, no token, and
  no fake login either — inventing one would be faking authentication rather than modelling it. On
  a deployed instance, anyone who can reach `/matching-workspace` can read every case and record
  decisions. The paths are one greppable family and every endpoint is reached from a case's match
  id, so putting the surface behind a guard when there is something to guard with is one mount.
- **A journey that keeps its own promises.** The search step is listed in the position indicator as
  the third of six, and until this phase a first pass went from the questions straight to the
  recommendation without visiting it. It does now, on both a first search and a rematch, and says
  what it is doing without pretending the work takes longer than it does.
- Tests, strict TypeScript, ESLint (type-aware + jsx-a11y), Prettier, and written documentation.

Deliberately **not** built: geographic matching, clinical or diagnostic matching, accounts,
authentication, payments, scheduling, a therapist-facing dashboard, messaging, video, notifications,
analytics, and any AI service of any kind. The internal ordering figure is not clinically validated
— it is a documented prototype heuristic, and the document says so.
