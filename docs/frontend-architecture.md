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

| Route                          | State       | Purpose                                     |
| ------------------------------ | ----------- | ------------------------------------------- |
| `/`                            | implemented | The doorway                                 |
| `/start`                       | implemented | Step 1: what you are looking for            |
| `/intake/companion`            | implemented | Step 2, optional: say it in your own words  |
| `/intake/*`                    | implemented | Step 2: seven questions, and the review     |
| `/matching`                    | implemented | Step 3: the search, and its honest failures |
| `/recommendation`              | implemented | Step 4: one person, and the reasons         |
| `/feedback`                    | implemented | Step 5: what did not fit                    |
| `/rematch`                     | placeholder | Step 6: another attempt                     |
| `/therapists/:id`              | implemented | One therapist profile, outside the journey  |
| `/matching-workspace`          | implemented | **Internal.** Cases waiting for a decision  |
| `/matching-workspace/:matchId` | implemented | **Internal.** One case, in full             |
| `*`                            | implemented | A considered 404                            |

`/therapists/:id` deliberately sits **outside** the journey. A profile is something a
recommendation will point at, so it is reached from there rather than from the journey itself; the
header drops its "Start" link on that route rather than pretending it is the beginning, and
`therapistPath(id)` is the only place a profile URL is built.

### The internal workspace

`/matching-workspace` is also outside the journey, and for a stronger reason: it is not part of the
client's experience at all. Nothing in the journey links into it and no client route leads out of
it, so a person going through the intake cannot reach it by clicking. `journeyIndexOf` returns `-1`
for both of its paths, which is what keeps the client journey's position indicator off them.

It also gets **its own API modules**, `lib/api/workspace.ts` and `lib/api/aiWorkspace.ts`, which no
client page imports and neither of which is exported from `lib/api/index.ts`. That is worth
having, and it is worth being precise about what it is: **a routing boundary, not a security
one.** There is no route from a client page to a case, a decision, a matcher's note, an
alternative candidate or an AI case summary, so a person going through the intake is never shown
one.

The two AI clients are on **opposite sides** of that boundary, and the asymmetry is deliberate.
`lib/api/ai.ts` — the intake companion — is exported from the barrel, because a client page is
supposed to be able to reach it. `lib/api/aiWorkspace.ts` is not, and a test asserts both facts,
so the asymmetry is a decision on the record rather than an omission somebody tidies up later.

It is _not_ a security boundary, and it would be easy to mistake it for one. This is a single-page
application: the workspace's code is in the same bundle as the client's, and the endpoints are
unauthenticated. Someone who types `/matching-workspace`, or reads the bundle, can reach all of it.
The thing that would make it a boundary is an account, and that is deliberately not built — see
[`human-matching.md`](human-matching.md#authentication-deliberately-not-implemented). A test asserts
the true half of this claim: that no client-journey page imports either workspace module, and a
second assertion covers the barrel so the boundary holds for a file that has not been written
yet.

**Unauthenticated.** There is no login, no session and no token anywhere in this codebase, and a
fake login would be faking authentication rather than modelling it. The route is marked `Internal`
in the page, the API paths are one greppable family, and `docs/human-matching.md` says plainly that
on a deployed instance anyone who can reach the path can read every case. The architecture is shaped
so that putting it behind a guard is one mount; the guard itself does not exist yet.

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

| Kind                | Where it lives                                                        | Why                                                                                    |
| ------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Server data         | Nowhere persistent. `useApiResource` in the component that needs it   | A remount re-fetches. There is no cache yet, and pretending otherwise would be a lie.  |
| One async resource  | `useApiResource(load, deps)`                                          | Derived `loading`, abortable, no global store                                          |
| In-progress answers | `IntakeProvider`, above the question routes                           | Survives navigation, because navigating swaps the question and not the state behind it |
| A conversation      | The component, plus `sessionStorage` via `lib/intake/conversation.ts` | The tab is the right lifetime for what somebody typed. See below                       |
| URL                 | The only state that survives a refresh                                | Deep links, back/forward, and shareable links all work for free                        |
| Configuration       | `lib/api/config.ts`, read once at module load                         | Build-time constants, not runtime state                                                |

There is no context, no store, and no cache. When several pages need the same data, the first
honest step is to put it in a hook or the URL — not to reach for a global store.

### The AI layer adds no state of its own

Worth being explicit, because a "conversation" is exactly the kind of thing that invites a store.

**The transcript is not a store.** It is a `useState` in `IntakeCompanionPage`, mirrored to
`sessionStorage` by one small module. There is no context, no reducer, no provider, and no
persisted suggestion — because a persisted _suggestion_ is a persisted inference about someone,
which is a different kind of thing to leave on a device than something they typed.

**The assistant cannot write to the draft.** `lib/intake/suggestions.ts` is the whole of the
mechanism: `applySuggestion` is a `switch` over the `target` the server sent, and every branch
ends in one of the draft's own `toggle*` functions. There is no path from a suggestion to
`update()` that does not go through there, and no function in this codebase that would let one.

**The case summary is not state either.** `CaseSummaryPanel` holds one discriminated union —
unrequested, loading, ready, refused — and that is all. It is a read of a derived view, refetched
on demand, and there is nothing to keep in sync because nothing on the page changes when it
arrives.

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

### The conversation assistant, in this architecture

`/intake/companion` is mounted **inside** the `/intake` subtree, which is what gives it the same
`IntakeProvider` the questions use. It is not a parallel flow with its own answers; it is a way of
arriving at the same ones.

Three consequences, all of them the point:

- **Confirmed suggestions become the draft**, through `applySuggestion`, and the review page then
  reads one object. There is no merge step, because there is no second object.
- **`Change` navigates to the question that would adjust it**, so a suggestion that is roughly right
  is corrected where the person chose it rather than in a bespoke editor.
- **The questions are always one link away**, and there are at least two such links on the page in
  every state. A conversation that trapped someone would be a worse intake than the one it
  replaced.

The performance rules are structural rather than remembered. One request per sent message, from a
submit handler; no request on a keystroke; the only effect that runs on mount renders a local
greeting, and it is the reason a double-invoked effect cannot produce two turns. A superseded turn
is aborted through the same `AbortSignal` the rest of this client uses.

## 9a. The AI case summary, in this architecture

On the case page, between the alternatives and the decision.

**It is below the evidence, not above it.** The summary describes the evidence above it, so a
matcher who read it first would be reading a description of something they had not yet looked at.
That is how a second reading becomes the first authority.

**It is on demand.** `unrequested` is the initial state, and the fetch lives in the click handler.

**It is not exported.** `lib/api/aiWorkspace.ts` is a sibling of `lib/api/workspace.ts` and, like
it, is not re-exported from `lib/api/index.ts`. `workspaceBoundary.test.ts` asserts both facts, so
a new client page cannot reach it by accident and a future file cannot be added past the rule.

**It has no controls that touch the decision.** One button, _write it again_. There is no route
from this component to eligibility, ranking, or `MatchingDecision`, and a test enumerates the
buttons on screen to keep that true.

### Where the vocabulary comes from

`GET /api/v1/intake/vocabulary` is read once when the flow starts, and the questions offer only
terms the database actually holds. This is not a nicety: a phrase whose key the server has never
heard of would be a 400 at submission, discovered after someone had answered five questions. The
one list that _is_ the data rather than our copy of it is the language list.

## 10. The feedback loop, in this architecture

Three things about `/feedback` and `/matching` are architectural rather than visual, and the
reasoning is in [`rematching.md`](./rematching.md).

**Two keys in `sessionStorage`, and both are pointers.** `wtm.intake.receipt.v1` holds an intake
reference and a timestamp. `wtm.match.current.v1` holds a match id, a name the person has already
been shown, a pass number, and the id and name of the match it replaced. Neither holds an answer,
neither holds anything a person wrote, and `clearReceipt` — which "Start over" calls — removes
both. A prototype with no account should leave nothing behind.

**The framing comes from the response, not from storage.** Whether a page is a first match or a
rematch is `recommendation.attempt > 1` and `recommendation.previousTherapistName`, both of which
arrive in the body. The browser's record exists so the _feedback page_ can act; it is not what the
recommendation page renders from. Getting that backwards is invisible until someone reloads, and
then the page shows a second recommendation with no explanation of why there was one.

**`/matching` navigates in an effect, never during render.** It runs the search on mount and
replaces itself with the recommendation when there is one. Navigating in a render body would fire
twice under Strict Mode and make the page's behaviour depend on the renderer. Relatedly, it has **no
"has started" ref guard**: an earlier version had one, and under Strict Mode the guard stopped the
second effect run while the first run's cleanup had already aborted its request, so the page hung
on "one moment" having finished zero searches. The duplicate that Strict Mode permits in
development is safe at the server, which treats a second request for the same match as a retry.

The loading copy is the same shape as the recommendation's and the same restraint: "Looking through
the therapists who may fit, using what you told us", announced with `aria-live="polite"`. No
"analysing", no "AI is thinking", no scan, and no manufactured delay — the whole search is
milliseconds and a spinner longer than that would be theatre.

## 11. The recommendation, in this architecture

`/recommendation` is the second built step, and it is the one that decides whether the whole
prototype is honest. Three things about it are architectural rather than visual.

**It reuses the profile presentation rather than inventing its own.** `Monogram`, `ProfileSection`,
the hairline between blocks and the display serif all come from Phase 3, because a recommendation
that looked different from the profile it links to would be two design languages on one journey. The
new pieces are `WhyThisMatch` (a labelled list of sentences) and the page shell.

**The reasons arrive as sentences, not as data to render.** The server decides which handful of
reasons to show and in what order, and phrases each one from stored evidence. The client renders
`<li>{reason.sentence}</li>` and does no assembly, no formatting of times, and no choosing. That
matters because a client that assembled its own explanations would be a second implementation of the
explanation rules, free to drift from the first.

**It never holds the answer.** The page keeps only a _reference_ to the intake — an identifier and a
timestamp, in `sessionStorage` under `wtm.intake.receipt.v1`. The answers themselves are gone from
the browser the moment they are sent, as they were in Phase 4; what survives is a pointer, so a
refresh returns to the same recommendation and the receipt can be forgotten by "Start over". A
test asserts the stored value contains exactly two keys and none of the words someone typed.

The four states are `loading | ready | error` from `useApiResource`, plus two that are not API states
and are handled before the request is made: no receipt at all ("there's nothing here to explain
yet"), and a stored run that recommended nobody ("we couldn't find someone who fits all of the
things you marked as important"). The second is a `200`, not an error, because nobody qualifying is
an answer to the question that was asked.

## 12. Adding the next feature

The feedback loop exercised the structure in a way the recommendation step did not, and one thing
came out of it worth keeping: **when a response shape stops being two shapes, it becomes one
schema.** `POST /matches` and `POST /matches/:id/rematch` used to differ, and the rematch version
grew fields the first one needed too — a duplicate, a second `additionalProperties: false` to keep
in step, and a page that had to detect which shape it had. They now share
`schemas/recommendation.ts`, and every field is present in both, so "there is no change to report"
is a value rather than a missing key.

So, in rough order:

1. Add the schema to `src/api/v1/schemas/`, reusing an existing one if the shape is a variant of
   something already there rather than a new one.
2. Add a module in `src/lib/api/` and mirror the types, re-exporting an existing type where the
   shape is genuinely the same.
3. Add a page under `src/pages/`, render `<LoadingNote />` / `<ErrorNote />` around the request.
4. Add the step to `journey` when it becomes real — nothing else in the shell needs to change.

**One thing Phase 7 added to that list:** an internal surface gets its own API module, and nothing
in the client journey imports it. The client and internal halves of this application share a
database, a design system and a component library, and share nothing else — which is what makes
"a client cannot see any of this" a structural claim rather than a review item.

At three domains, `packages/contracts` is now clearly worth the build step. No new dependency, and
no change to the design system, should be required.
