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

| Route             | State       | Purpose                                    |
| ----------------- | ----------- | ------------------------------------------ |
| `/`               | implemented | The doorway                                |
| `/start`          | implemented | Step 1: what you are looking for           |
| `/intake/*`       | implemented | Step 2: seven questions, and the review    |
| `/matching`       | placeholder | Step 3: where a recommendation comes from  |
| `/recommendation` | placeholder | Step 4: one person, and the reasons        |
| `/feedback`       | placeholder | Step 5: how it felt                        |
| `/rematch`        | placeholder | Step 6: another attempt                    |
| `/therapists/:id` | implemented | One therapist profile, outside the journey |
| `*`               | implemented | A considered 404                           |

`/therapists/:id` deliberately sits **outside** the journey. A profile is something a
recommendation will point at, so it is reached from there rather than from the journey itself; the
header drops its "Start" link on that route rather than pretending it is the beginning, and
`therapistPath(id)` is the only place a profile URL is built.

### The journey

`routes/journey.ts` is one ordered list that knows the step order, the plain-language name of each
step, and whether that step exists yet. It is used for three things and nothing else:

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
  payload really is a health response, and the therapist endpoints verify they got a page and a
  profile, so a misconfigured proxy becomes a calm error rather than a crash three components away —
  without pulling in a validation library.
- **The API namespace is a constant.** `API_V1 = '/api/v1'` lives in `lib/api/version.ts` and is
  documented against the Fastify prefix in `apps/api/src/app.ts`. A change to one is a change to both.

### The therapist endpoints

```ts
getTherapists(filters?, client?, options?): Promise<TherapistPage>
getTherapist(id, client?, options?): Promise<TherapistProfile>
```

Both take an optional `ApiClient`, so a test can pass a client backed by a stub `fetch`, and both
structurally check what came back. A `404` stays a `404` on the client (`kind: 'http'`), which is
what lets the profile page say "we don't have anyone at this address" rather than "something went
wrong" — two situations that deserve different words.

### Where the types come from

The backend owns the contract: each endpoint declares a JSON Schema that Fastify validates and
serialises responses from (`apps/api/src/api/v1/schemas/`), and each declares the matching
TypeScript interface. The client's `types.ts` mirrors those shapes, and tests on both sides pin
them: the API test asserts a response has exactly the fields the schema lists, and the client tests
reject a payload missing any of them.

**Prisma's generated types never reach this side.** They stop at
`apps/api/src/data/therapists/therapistView.ts`, which is why the frontend type-checks with no
database and no generated client, and why the schema can be reshaped without moving the HTTP
contract underneath anyone.

The trigger for a shared `packages/contracts` has now arrived: intake made this the second domain,
and the mirrored vocabulary, window and payload shapes are more than a handful of hand-copied
types should be asked to carry. It is still not extracted — doing it properly means a build step
and a versioning policy, which is Phase 5's decision rather than something to bolt on here. What is
in place instead is that the mirrored types are asserted against the wire format by tests on both
sides, so drift fails a test rather than a person.

What still stops at the API boundary is Prisma's generated code, exactly as it does for therapists:
`data/intake/intakeTypes.ts` is the vocabulary both sides agree on, and no generated row type
appears in the client, in a schema, or in a payload.

## 6. State boundaries

| Kind                | Where it lives                                                      | Why                                                                                    |
| ------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Server data         | Nowhere persistent. `useApiResource` in the component that needs it | A remount re-fetches. There is no cache yet, and pretending otherwise would be a lie.  |
| One async resource  | `useApiResource(load, deps)`                                        | Derived `loading`, abortable, no global store                                          |
| In-progress answers | `IntakeProvider`, above the question routes                         | Survives navigation, because navigating swaps the question and not the state behind it |
| URL                 | The only state that survives a refresh                              | Deep links, back/forward, and shareable links all work for free                        |
| Configuration       | `lib/api/config.ts`, read once at module load                       | Build-time constants, not runtime state                                                |

There is no context, no store, and no cache. When several pages need the same data, the first
honest step is to put it in a hook or the URL — not to reach for a global store.

## 7. Loading and error states

Both are components, both speak the product's voice, and neither is used for decoration.

- **`LoadingNote`** — one line of plain words and a hairline that breathes. No spinners, no
  skeleton grids, no dots. The motion stops under reduced motion.
- **`ErrorNote`** — a plain-language title, one sentence about what to do, an optional "Try again"
  action, and the technical detail inside a collapsed disclosure. `role="alert"` announces it when
  it appears.
- **`DevStatus`** and **`DevSampleProfile`** — the only places the client calls the API outside a
  page's own data. Both live in the footer, render only in a development build, and exist to prove
  that client → CORS → Fastify → `/api/v1` → PostgreSQL works, and to make a real profile one click
  away. No visitor ever sees a connection badge.

## 8. A therapist profile

`/therapists/:id` is the first page that fetches anything, and the first to have to answer a
question this product should care about: _what does a person look like when we are describing them
honestly?_

Three decisions carry it:

- **One person, in their own words.** The biography is prose they wrote, set as running text. The
  structured attributes below it are their statements too — languages, areas of work, approach,
  style, context — presented as labelled lists, not as tags, chips, or a data table.
- **No photographs.** The monogram is two initials in a hairline ring. No real therapist has agreed
  to have their image used here, and a stock portrait would turn a person into a catalogue entry,
  which is the thing this product argues against.
- **Nothing to score.** No match percentage, no rank, no reviews, no "best match", and no buttons
  other than a way back. A test asserts those words never appear, so the page cannot drift into a
  marketplace by accident.

Availability is shown in the therapist's own timezone, named in words ("Local time in India Standard
Time"), because those times are a fact about their wall clock rather than an instant, and converting
them would imply a precision the matching calculation does not have yet.

## 9. The intake, in this architecture

The intake is the first thing that has to hold someone's attention, so the state design is the
part worth understanding. The full reasoning is in [`intake-flow.md`](./intake-flow.md); three
things here are architectural rather than editorial.

**The provider sits above the routes, not inside a step.** `IntakeEntry` wraps the whole
`/intake` subtree, so navigating between questions swaps the rendered question and never the state
behind it. No pathname is used as a React key, exactly as in the shell — which is what makes
"Back" free, and what would have been broken by a key.

**Each question still has its own URL.** The URL says _where_; the draft says _what they answered_.
That split is why a refresh, a bookmark and a shared link all work without a single special case.

**The draft is a value in `sessionStorage`, and the reason is privacy.** Refreshing mid-flow has to
preserve it; closing the tab has to destroy it. Session storage is the only browser store that does
both, and `localStorage` — which would outlive the tab on a shared machine — was rejected on those
grounds rather than on convenience.

### Where the vocabulary comes from

`GET /api/v1/intake/vocabulary` is read once when the flow starts, and the questions offer only
terms the database actually holds. This is not a nicety: a phrase whose key the server has never
heard of would be a 400 at submission, discovered after someone had answered five questions. The
one list that _is_ the data rather than our copy of it is the language list.

## 10. Adding the next feature

The recommendation step is the next thing to exercise this structure. In rough order:

1. Add `src/api/v1/schemas/recommendation.ts` and `routes/recommendation.ts` on the server.
2. Add a `src/lib/api/recommendation.ts` with `getRecommendations()` and mirror the types.
3. Add a page under `src/pages/`, render `<LoadingNote />` / `<ErrorNote />` around the request.
4. Add the step to `journey` when it becomes real — nothing else in the shell needs to change.

Decide at that point whether the mirrored shapes have outgrown hand-copying and want
`packages/contracts`. No new dependency, and no change to the design system, should be required.
