# Architecture — Phase 1

Phase 1 delivers two things: a runnable foundation (monorepo, tooling, tests, CI-ready scripts) and
a complete visual language. It deliberately delivers no product behaviour yet, so the interesting
decisions here are about structure, restraint, and where Phase 2 will attach.

---

## 1. Repository shape

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
└── docs                  this file, the design system, screenshots
```

**Why no `packages/` yet.** A shared package is the right answer when two apps genuinely need the
same code. Right now they share nothing but compiler settings, and a `packages/ui` with two
consumers would be ceremony. Phase 2 should introduce one the moment the second consumer exists —
most likely `packages/api-client` (typed fetch layer + response types) rather than UI.

**Why npm workspaces.** The brief specifies them; they also keep one lockfile, one `node_modules`,
and hoisted dev tooling (TypeScript, ESLint, Prettier) so both apps are always on the same version.

## 2. Frontend

### Layers

```
main.tsx          React root; imports the stylesheet once
 └ app/App.tsx    RouterProvider
    └ routes/     route paths, shared route tree, browser router
       └ layouts/ SiteLayout: skip link, header, main, footer
          └ pages/     LandingPage, StartPage, NotFoundPage
             └ components/  presentational building blocks
                └ lib/        cx(), usePageMeta()
```

The dependency arrow only points downwards. Pages compose components; components know nothing about
pages, routes, or the API. There is no global store, no context, and no data-fetching layer,
because there is no data yet.

### Routing

- `routes/paths.ts` is the single source of truth for internal URLs. Nothing hard-codes `'/start'`.
- `routes/router.tsx` exports `routeConfig`, a plain `RouteObject[]`.
- `routes/appRouter.tsx` wraps that config in `createBrowserRouter` for the app.
- Tests build a `createMemoryRouter` from **the same `routeConfig`**, so what is tested is what
  ships. There is no second, drifting route tree.

### The route frame

`SiteLayout` owns everything shared: the skip link, the paper-grain layer, the header, the outlet,
the footer, and `<ScrollRestoration />`. The `<main>` element is keyed on `location.pathname`, which
is what replays the entrance animation on each route change.

_Trade-off, deliberately accepted in Phase 1:_ keying on the pathname remounts the page subtree on
navigation. That is invisible today because no route holds local state. When a multi-step flow
arrives in Phase 2, the transition should move to a route-boundary wrapper so that in-progress
answers are not lost.

### Styling

Tailwind CSS v4 in CSS-first mode: `@import "tailwindcss"` plus a single `@theme` block that defines
every colour, font, size, radius, shadow, and easing as a design token. Tokens become utilities
(`bg-canvas`, `text-display`, `rounded-control`, `shadow-soft`, `ease-gentle`), so components
compose styles from the design system rather than from literals. There is no `tailwind.config.js`
and no safelist to maintain.

The handful of things CSS utilities cannot express — the grain overlay, the route entrance, the
drawing underline, the skip link, the page washes — live as named classes in `@layer components`,
documented in [`design-system.md`](./design-system.md).

### Fonts

Fraunces (roman + italic) and Inter are self-hosted from `apps/web/public/fonts` (variable, latin
subset, WOFF2, ~200KB total). The display font is preloaded because it renders the `h1`. No Google
Fonts request is made at runtime: a mental-health product should not leak a visitor to a third
party on first paint, and self-hosting also removes a render-blocking round trip.

### State and data

None. `lib/usePageMeta` is the only hook, and it only maintains `document.title` and the meta
description per route.

## 3. Backend

```
src/
├── app.ts            buildApp(): an unstarted Fastify instance with routes registered
├── server.ts         process entry: read config, listen, graceful shutdown
├── config/env.ts     readServerConfig(): typed, validated, defaulted environment
└── routes/health.ts  one module per endpoint, schema included, test beside it
```

- `buildApp()` returns an unstarted instance, which is what makes `app.inject()` testing possible
  without binding a port. `server.ts` is the only file that listens.
- Routes are Fastify plugins registered on the instance, each owning its JSON schema, so responses
  are serialised and validated from one declaration.
- Environment parsing is hand-rolled and ~70 lines. A schema library would be more machinery than
  four variables with defaults justify — but invalid values (a non-numeric port, an unknown log
  level) fail loudly at start-up instead of becoming confusing runtime errors.
- Logging is Fastify's built-in Pino, silenced in tests by default.
- `SIGINT`/`SIGTERM` close the server before exiting.

**Endpoint (the only one in Phase 1)**

```http
GET /health  →  200  { "status": "ok" }
```

## 4. Testing

| Suite | What it covers                                                                                                                                                                                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api` | `/health` payload, status, content type, exact field set; 404 for unknown routes; environment parsing and its failure modes                                                                                                                                      |
| `web` | Landing: promise, single `h1`, the one way onward, absence of pricing/testimonial/"AI-powered" copy, document title, the three ideas, prototype disclaimer. Start: heading, the unavailable action and its description, the way back, document title. 404 route. |

Frontend tests render the real route tree through a memory router and query by role and accessible
name — the same way assistive technology does — so a change that breaks an accessible name fails a
test. Vitest runs without globals, so every spec imports `describe`/`it`/`expect` explicitly, and
Testing Library's auto-cleanup is registered manually in `src/test/setup.ts` (it does not register
itself when globals are off).

`npm run check` runs typecheck → lint → format check → tests, which is the single command to run
before committing.

## 5. Tooling

- **TypeScript strict**, with `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noImplicitReturns`, `verbatimModuleSyntax`, and `noPropertyAccessFromIndexSignature` enabled in
  `tsconfig.base.json`. No `any`; no non-null assertions in application code.
- The two apps differ deliberately: `apps/web` uses bundler resolution and `jsx: react-jsx`;
  `apps/api` uses `NodeNext` and emits real JavaScript (plus declarations and source maps) from
  `tsconfig.build.json`.
- **ESLint 9 flat config**: type-aware `strictTypeChecked` + `stylisticTypeChecked` scoped to
  TypeScript files, `react-hooks`, `react-refresh`, and `jsx-a11y` scoped to the web app, plus
  `no-console` in the API. The type-aware presets are remapped onto `**/*.{ts,tsx}` so plain
  JavaScript config files are linted without type information.
- **Prettier** with `prettier-plugin-tailwindcss`, so class order is stable and diffs stay readable.
- **tsx** for API development, `tsc` for the API build, Vite for the web build. Node's built-in
  `--env-file-if-exists` loads `.env`, which is why there is no dotenv dependency.

## 6. Dependencies

Deliberately small, and each one earns its place:

`react`, `react-dom`, `react-router` · `fastify` — runtime.
`vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `typescript`, `vitest`,
`jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `tsx`, `@types/*` — build and test.
`eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`,
`eslint-plugin-react-refresh`, `eslint-plugin-jsx-a11y`, `prettier`,
`prettier-plugin-tailwindcss`, `concurrently` — tooling.

No CSS-in-JS, no component library, no state library, no `clsx` (there is a 3-line `cx`), no
`dotenv` (Node loads it), no date library, no icon package (one arrow glyph is a character).

## 7. Where Phase 2 attaches

The seams are already in place:

| Phase 2 concern         | Where it lands                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Intake questions        | New pages under `apps/web/src/pages`, routed in `routes/router.tsx`                     |
| Preference structuring  | `apps/web/src/lib` + a typed `apps/api` route; validation at the API boundary           |
| Matching + explanations | New API route modules; the "why this match" view becomes its own page                   |
| Feedback and rematch    | A route pair; state kept in the URL or a session store, not global app state            |
| Real content            | `apps/web/src/lib/content.ts` (or API-driven), with synthetic fixtures clearly labelled |

Guardrails for those phases, so the visual language survives: no new colour outside the clay and
sage ramps, no component that wears a card unless it is genuinely a surface, no endpoint without a
schema and a test, and no client copy that talks about the person as a user being funnelled.
