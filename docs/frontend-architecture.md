# Frontend architecture

How the client is put together after Phase 2: routing, layouts, the API client, and — most
importantly — where state is allowed to live.

---

## 1. The request path

```
React component
  └─ useApiResource          turns a promise into loading / ready / error
      └─ typed endpoint      fetchHealthStatus() and friends
          └─ ApiClient       timeouts, cancellation, JSON, typed failures
              └─ fetch      the platform API, nothing else
                  └─ HTTP + CORS
                      └─ Fastify /api/v1
```

Each layer has exactly one job, and only the bottom two know that HTTP exists. A component never
calls `fetch`, never builds a URL, and never sees an `unknown` error: it receives a discriminated
`ResourceState` and renders one of three things.

## 2. Layers

```
main.tsx           React root; imports the stylesheet once
 └ app/App.tsx     RouterProvider
    └ routes/      paths, journey, shared route tree, browser router
       └ layouts/  SiteLayout: skip link, grain, header, main, footer
          └ pages/      one component per route
             └ components/  presentational building blocks
                └ lib/        cx, usePageMeta, useApiResource, useRouteEntrance
                   └ lib/api/ config, client, errors, typed endpoints
```

The dependency arrow only points downwards. `lib/api` knows nothing about React; `components` know
nothing about routes or the API; pages compose components and are the only place where a route
meets a request.

## 3. Routing

- `routes/paths.ts` is the single source of truth for internal URLs. Nothing hard-codes `'/start'`.
- `routes/router.tsx` exports `routeConfig`, a plain `RouteObject[]`.
- `routes/appRouter.tsx` wraps that config in `createBrowserRouter` for the app.
- Tests build a `createMemoryRouter` from **the same `routeConfig`**, so what is tested is what
  ships. There is no second, drifting route tree.
- Internal navigation always uses React Router (`Link`, `router.navigate`). `window.location` is
  never used for anything inside the app; deep links work because Vite serves `index.html` for
  unknown paths, and the splat route keeps unknown addresses honest instead of silently landing on
  the home page.

### Routes

| Route             | State       | Purpose                                   |
| ----------------- | ----------- | ----------------------------------------- |
| `/`               | implemented | The doorway                               |
| `/start`          | implemented | Step 1: what you are looking for          |
| `/intake`         | placeholder | Step 2: the questions                     |
| `/matching`       | placeholder | Step 3: where a recommendation comes from |
| `/recommendation` | placeholder | Step 4: one person, and the reasons       |
| `/feedback`       | placeholder | Step 5: how it felt                       |
| `/rematch`        | placeholder | Step 6: another attempt                   |
| `*`               | implemented | A considered 404                          |

### The journey

`routes/journey.ts` is the groundwork for the real flow. It is one ordered list that knows the
step order, the plain-language name of each step, and whether that step exists yet. It is used for
three things and nothing else:

- the position indicator in the header
- the "Back" link on each step
- the accessible label for the indicator

Each placeholder page owns only its own copy and delegates everything structural to
`JourneyPlaceholder`, so the five placeholders cannot drift apart. **Adding a step is a two-line
change**: add the route, add the entry to `journey`.

There is deliberately no progress percentage and no link between steps. The indicator says where
you are, not how far along you are, and nothing pretends a step is complete when it is not.

## 4. Route transitions

Phase 1 keyed `<main>` on `pathname` to replay its entrance animation, which threw away page state
on every navigation. That trade-off is gone.

`useRouteEntrance` now animates the **existing** element with the Web Animations API:

- React's tree is never touched, so any state inside a page survives navigation.
- The animation is skipped entirely when `prefers-reduced-motion` is set, and is a no-op in
  environments without `Element.animate` (jsdom, very old browsers).
- `fill: 'backwards'` applies the first keyframe only _before_ the animation starts, so there is
  no flash of the settled state.

The behaviour is pinned by two tests: the `main` element is asserted to be the **same DOM node**
before and after navigation, and the animation is asserted to be requested on each change (and not
requested at all under reduced motion).

## 5. The API client

`lib/api` is the only place in the app that knows about HTTP.

| File        | Responsibility                                                   |
| ----------- | ---------------------------------------------------------------- |
| `config.ts` | Reads `VITE_API_URL` / `VITE_API_TIMEOUT_MS` once, with defaults |
| `types.ts`  | The response shapes the API returns                              |
| `errors.ts` | `ApiError` with a `kind` discriminant, plus `toApiError`         |
| `client.ts` | `createApiClient`: timeouts, cancellation, JSON, failure mapping |
| `health.ts` | `fetchHealthStatus()` and the versioned namespace constant       |
| `index.ts`  | The public surface, so features import one module                |

Design decisions worth stating:

- **A factory plus one default instance.** `createApiClient({ baseUrl, timeoutMs, fetchImpl })` means
  tests construct their own client against a stub `fetch` — no module mocking, no shared global
  state, and no test that depends on a running backend. The app uses the exported `apiClient`.
- **Cancellation is part of the contract.** Every request accepts an `AbortSignal`, and
  `useApiResource` gives each run its own. Leaving a view aborts its request; an abort is not an
  error and never reaches the UI.
- **Timeouts are explicit.** A request that outlives `timeoutMs` fails as `kind: 'timeout'` rather
  than hanging, and the message names the duration.
- **Failures are typed, not stringly.** `ApiError.kind` is one of `network`, `timeout`, `aborted`,
  `http`, `parse`, `config`. The UI maps kinds to words; the details stay in logs and in a
  collapsed disclosure.
- **No Axios.** The platform `fetch` plus 40 lines of `AbortController` covers everything needed,
  and the dependency would have brought more behaviour than the app requires.
- **Responses are structurally checked where it matters.** `fetchHealthStatus` verifies the
  payload really is a health response, so a misconfigured proxy becomes a calm error rather than a
  broken screen — without pulling in a validation library.
- **The API namespace is a constant.** `API_V1 = '/api/v1'` is used by the client and documented in
  `apps/api/src/app.ts`, where the Fastify prefix lives. A change to one is a change to both.

### Where the types come from

The backend owns the contract: each endpoint declares a JSON Schema that Fastify validates and
serialises responses from (`apps/api/src/api/v1/schemas/`), and each declares the matching
TypeScript interface. The client's `types.ts` mirrors that shape, and `health.test.ts` on both
sides pins it: the API test asserts the response has exactly the fields the schema lists, and the
client test rejects a payload that is missing any of them.

A shared `packages/contracts` was considered and deliberately deferred. With one endpoint, the
build ordering a shared TypeScript package would require is more machinery than the drift risk it
removes. The trigger for introducing it is the second domain: when `intake` lands, both sides need
more than a handful of shapes, and that is the moment to extract one package with a real build step.

## 6. State boundaries

| Kind                | Where it lives                                                      | Why                                                                                   |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Server data         | Nowhere persistent. `useApiResource` in the component that needs it | A remount re-fetches. There is no cache yet, and pretending otherwise would be a lie. |
| One async resource  | `useApiResource(load, deps)`                                        | Derived `loading`, abortable, no global store                                         |
| In-progress answers | The page that asks them (Phase 3)                                   | Survives navigation now that `<main>` is no longer remounted                          |
| URL                 | The only state that survives a refresh                              | Deep links, back/forward, and shareable links all work for free                       |
| Configuration       | `lib/api/config.ts`, read once at module load                       | Build-time constants, not runtime state                                               |

There is no context, no store, and no cache in Phase 2. When several pages need the same data, the
first honest step is to put it in a hook or the URL — not to reach for a global store.

## 7. Loading and error states

Both are components, both speak the product's voice, and neither is used for decoration.

- **`LoadingNote`** — one line of plain words and a hairline that breathes. No spinners, no
  skeleton grids, no dots. The motion stops under reduced motion.
- **`ErrorNote`** — a plain-language title, one sentence about what to do, an optional "Try again"
  action, and the technical detail inside a collapsed disclosure. `role="alert"` announces it when
  it appears.
- **`DevStatus`** — the only client that calls the API in Phase 2. It lives in the footer, renders
  only in a development build, and is the proof that client → CORS → Fastify → `/api/v1` works. No
  visitor ever sees a connection badge.

## 8. Adding a real feature later

The intake flow is the first thing that will exercise this structure. In rough order:

1. Add `src/api/v1/schemas/intake.ts` and `src/api/v1/routes/intake.ts` on the server.
2. Add a `src/lib/api/intake.ts` with `submitIntake()` and mirror the types.
3. Add a page under `src/pages/`, give it its own local state, and render `<LoadingNote>` /
   `<ErrorNote />` around the request.
4. Add the step to `journey` when it becomes real — nothing else in the shell needs to change.

No new dependency, and no change to the design system, should be required.
