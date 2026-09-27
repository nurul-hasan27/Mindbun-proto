# Architecture

Phases 1 and 2 deliver a runnable foundation, a complete visual language, and the communication
architecture that the product will be built on. Product behaviour is still deliberately absent.

- **Phase 1** — foundation + visual design system.
- **Phase 2** — application shell + the frontend/backend contract (`/api/v1`, a typed API client,
  designed loading and error states, and route transitions that preserve page state).

The client side of this is documented in depth in
[`frontend-architecture.md`](./frontend-architecture.md). This file covers the whole system.

---

## 1. The shape of the system

```
┌──────────────────────────────┐
│ React client (apps/web)       │
│                              │
│  page → useApiResource       │
│        → lib/api client      │
└──────────────┬───────────────┘
               │  fetch, typed, with timeout + cancellation
               │  VITE_API_URL, CORS preflight
┌──────────────▼───────────────┐
│ Fastify (apps/api)            │
│                              │
│  /health        liveness      │  unversioned, no CORS
│  /api/v1/health application   │  versioned, CORS, validated
│  /api/v1/…      future        │
└──────────────────────────────┘
```

| Layer    | Choice                                                                   |
| -------- | ------------------------------------------------------------------------ |
| Frontend | React 19, TypeScript, Vite 8, React Router 8, Tailwind CSS 4 (CSS-first) |
| Backend  | Node.js 24, TypeScript, Fastify 5, `@fastify/cors`                       |
| Testing  | Vitest 5, Testing Library, Fastify `inject`                              |
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
├── apps/web              React client
├── apps/api              Fastify service
└── docs                  this file, the frontend architecture, the design system
```

**Why no `packages/` yet.** A shared package is the right answer when two apps genuinely need the
same code _and_ the sharing is worth a build step. Right now they share only compiler settings, and
the one duplicated contract — the health response — is four fields pinned by a test on each side.
Phase 2 deliberately kept the API contract mirrored rather than extracted; the trigger for a
`packages/contracts` workspace is the second domain (`intake`), not this one. See
[`frontend-architecture.md`](./frontend-architecture.md#where-the-types-come-from).

**Why npm workspaces.** The brief specifies them; they also keep one lockfile, one `node_modules`,
and hoisted dev tooling (TypeScript, ESLint, Prettier) so both apps are always on the same version.

## 3. Frontend

### Layers

```
main.tsx          React root; imports the stylesheet once
 └ app/App.tsx    RouterProvider
    └ routes/     route paths, the journey, shared route tree, browser router
       └ layouts/ SiteLayout: skip link, grain, header, main, footer
          └ pages/     one component per route
             └ components/  presentational building blocks
                └ lib/        cx, usePageMeta, useApiResource, useRouteEntrance
                   └ lib/api/ config, client, errors, typed endpoints
```

The dependency arrow only points downwards. Details, state boundaries, and the API client design
are in [`frontend-architecture.md`](./frontend-architecture.md).

### Styling

Tailwind CSS v4 in CSS-first mode: `@import "tailwindcss"` plus a single `@theme` block that
defines every colour, font, size, radius, shadow, and easing as a design token. Tokens become
utilities (`bg-canvas`, `text-display`, `rounded-control`, `shadow-soft`, `ease-gentle`), so
components compose styles from the design system rather than from literals. There is no
`tailwind.config.js` and no safelist to maintain.

The handful of things CSS utilities cannot express — the grain overlay, the loading hairline, the
drawing underline, the skip link, the page washes — live as named classes in `@layer components`,
documented in [`design-system.md`](./design-system.md).

The route entrance is deliberately _not_ in the stylesheet: it is played with the Web Animations
API so that navigating never remounts a page. Phase 1's pathname-keyed `<main>` was removed.

### Fonts

Fraunces (roman + italic) and Inter are self-hosted from `apps/web/public/fonts` (variable, latin
subset, WOFF2, ~200KB total). The display font is preloaded because it renders the `h1`. No Google
Fonts request is made at runtime: a mental-health product should not send a visitor to a third
party on first paint, and self-hosting also removes a render-blocking round trip.

## 4. Backend

```
src/
├── app.ts            buildApp(): instance, CORS, route registration
├── server.ts         process entry: read config, listen, graceful shutdown
├── config/env.ts     readServerConfig(): typed, validated, defaulted environment
├── routes/           unversioned infrastructure routes (/health)
└── api/
    └── v1/
        ├── routes/   one module per endpoint, test beside it
        └── schemas/  JSON Schema + TypeScript interface per response
```

- `buildApp()` returns an unstarted instance, which is what makes `app.inject()` testing possible
  without binding a port. `server.ts` is the only file that listens.
- Routes are Fastify plugins registered on the instance, each owning its JSON schema, so responses
  are validated and serialised from one declaration.
- Every endpoint declares both a JSON Schema (enforced at runtime by Fastify) and a TypeScript
  interface (for callers inside the service). The client mirrors the interface.
- Environment parsing is hand-rolled and about a hundred lines. A schema library would be more
  machinery than five variables with defaults justify — but invalid values (a non-numeric port, an
  unknown log level, an empty CORS origin list) fail loudly at start-up instead of becoming
  confusing runtime errors.
- Logging is Fastify's built-in Pino, silenced in tests by default.
- `SIGINT`/`SIGTERM` close the server before exiting.

### Two API surfaces, on purpose

| Endpoint             | Purpose                                   | CORS | Versioned |
| -------------------- | ----------------------------------------- | ---- | --------- |
| `GET /health`        | Infrastructure liveness for uptime checks | no   | no        |
| `GET /api/v1/health` | The application API the client talks to   | yes  | yes       |

Keeping them apart means a load balancer can poll a cheap, stable, version-free path, while the
client talks to a namespace that can evolve. `/api/v1` is the place future domains land:
`api/v1/routes/` gains a module per domain, and a future `/api/v2` can be registered beside it
without touching v1.

### CORS

Registered in `buildApp` only when origins are configured, from `API_CORS_ORIGIN`
(comma-separated). Without it a browser on `localhost:5173` cannot read a response from
`127.0.0.1:4000`, no matter how correct the client is — so this is a functional requirement of the
client/backend contract, not a nicety. It is the only added runtime dependency in Phase 2, and it is
one that earns its place.

## 5. The request path, end to end

```
GET /api/v1/health  →  200
{
  "status": "ok",
  "service": "why-this-match-api",
  "version": "0.2.0",
  "timestamp": "2026-09-28T10:00:00.000Z"
}
```

```
useApiResource(signal => fetchHealthStatus(apiClient, { signal }), [])
  → derived state: loading | ready | error
      → ApiError { kind: 'network' | 'timeout' | 'aborted' | 'http' | 'parse' | 'config' }
```

Verified end to end in a real browser: the network log shows
`200 http://127.0.0.1:4000/api/v1/health`, and the development-only footer line reports
`API ok · v0.2.0`. With the API stopped, the same line reports `API unreachable (network)` with a
retry action, and the request is retried on demand.

## 6. Testing

| Suite          | What it covers                                                                                                                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api`          | `/api/v1/health` payload, exact field set, ISO timestamp, query tolerance, wrong path, wrong method; `/health` still works; unknown routes 404; CORS allowed, refused, and preflight; environment parsing and its failure modes                                      |
| `web — api`    | Client success, query building, JSON bodies, `http` / `network` / `parse` / `timeout` / `aborted` / `config` failures, timeout, cancellation, URL normalisation; health endpoint and payload validation; config defaults and fallbacks                               |
| `web — state`  | `useApiResource`: loading → ready, failure → `ApiError`, retry, dependency change, abort on unmount, abort is not an error                                                                                                                                           |
| `web — shell`  | `main` is the same DOM node across navigation (the Phase 1 remount regression), the entrance plays per change and is skipped under reduced motion, skip link, back/forward, deep links, 404, one `h1` and landmarks on every route, journey indicator vs. start link |
| `web — states` | `LoadingNote` wording and hidden hairline; `ErrorNote` never leads with a technical message, keeps the detail tucked away, and offers recovery only when retrying can help                                                                                           |
| `web — pages`  | Landing, start, and all five journey placeholders (heading, honest "not built yet" note, no "coming soon", heading structure, correct back link)                                                                                                                     |

Frontend tests render the real route tree through a memory router and query by role and accessible
name, so a change that breaks an accessible name fails a test. No frontend test needs a running
backend: `stubFetch` stands in for `fetch` and honours `AbortSignal`, which is what lets the timeout
and cancellation paths be tested honestly.

Vitest runs without globals, so every spec imports `describe`/`it`/`expect` explicitly, and
Testing Library's auto-cleanup and `window.scrollTo` are stubbed in `src/test/setup.ts`.

`npm run check` runs typecheck → lint → format check → tests, which is the single command to run
before committing.

## 7. Tooling

- **TypeScript strict**, with `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noImplicitReturns`, `verbatimModuleSyntax`, and `noPropertyAccessFromIndexSignature` enabled in
  `tsconfig.base.json`. No `any`; no non-null assertions in application code.
- The two apps differ deliberately: `apps/web` uses bundler resolution and `jsx: react-jsx`;
  `apps/api` uses `NodeNext` and emits real JavaScript (plus declarations and source maps) from
  `tsconfig.build.json`.
- **ESLint 9 flat config**: type-aware `strictTypeChecked` + `stylisticTypeChecked` scoped to
  TypeScript files, `react-hooks` (including the newer `refs` and `set-state-in-effect` rules),
  `react-refresh`, and `jsx-a11y` scoped to the web app, plus `no-console` in the API. The
  type-aware presets are remapped onto `**/*.{ts,tsx}` so plain JavaScript config files are linted
  without type information.
- **Prettier** with `prettier-plugin-tailwindcss`, so class order is stable and diffs stay readable.
- **tsx** for API development, `tsc` for the API build, Vite for the web build. Node's built-in
  `--env-file-if-exists` loads `.env`, which is why there is no dotenv dependency.

## 8. Dependencies

Deliberately small, and each one earns its place:

`react`, `react-dom`, `react-router`, `fastify`, `@fastify/cors` — runtime.
`vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `typescript`, `vitest`,
`jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `tsx`, `@types/*` — build and test.
`eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`,
`eslint-plugin-react-refresh`, `eslint-plugin-jsx-a11y`, `prettier`,
`prettier-plugin-tailwindcss`, `concurrently` — tooling.

No CSS-in-JS, no component library, no state library, no HTTP library (the platform `fetch` plus
`AbortController` is enough), no `clsx` (there is a three-line `cx`), no `dotenv` (Node loads it),
no validation framework, no date library, no icon package (one arrow glyph is a character).

## 9. Where Phase 3 attaches

The seams are already in place:

| Phase 3 concern         | Where it lands                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Intake questions        | `src/api/v1/schemas/intake.ts` + `src/api/v1/routes/intake.ts`; a page under `src/pages` |
| Preference structuring  | Validation at the API boundary, schemas like the ones already there                      |
| In-progress answers     | Local state in the page that asks them — the shell no longer remounts pages              |
| Matching + explanations | New API route modules; the "why this match" view becomes its own page                    |
| Feedback and rematch    | A route pair; the journey list grows, the shell needs no change                          |
| Real content            | `src/lib/api/*` typed endpoints, with synthetic fixtures clearly labelled                |

Guardrails for those phases, so the visual language survives: no new colour outside the clay and
sage ramps, no component that wears a card unless it is genuinely a surface, no endpoint without a
schema and a test, no `any`, and no client copy that talks about the person as a user being
funnelled.
