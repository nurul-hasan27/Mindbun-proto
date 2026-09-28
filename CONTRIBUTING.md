# Contributing

Notes for working on this prototype, written down so the next person — or the next
you, in six months — does not have to reverse-engineer the conventions.

There is one contributor and one reviewer (the same person), so most of this is
about keeping a public repository legible rather than about process.

---

## What this project is

A prototype for therapist matching that can explain itself. The argument it makes
is in [`README.md`](README.md) and the reasoning is in [`docs/`](docs/); the short
version is that finding someone to talk to is not shopping, so the product has no
scores, no star ratings, and no ranked lists.

Three properties are load-bearing, and a change that breaks one is a change that
needs a much better reason than "it would be simpler":

1. **Every sentence a client reads is backed by stored evidence.** Not a
   paraphrase of it, not a summary written beside it — the sentence is generated
   from a key that was stored when the match ran. This is why evidence rows exist
   and why a stored match can be re-read in tomorrow's wording.
2. **No client-facing number of any kind.** The engine has an internal integer used
   only to order candidates. It decides an order and then disappears.
3. **The three decisions stay separate.** What the engine produced, what a human
   matcher chose, and what the client is shown are three facts. The third is derived
   from the first two rather than stored, so it cannot disagree with them.

---

## Getting set up

```bash
git clone git@github.com:nurul-hasan27/Mindbun-proto.git
cd Mindbun-proto
npm install                 # both workspaces; also generates the Prisma client
cp .env.example .env        # optional — every variable has a safe default

open -a Docker              # the database runs in Docker
npm run db:up               # start PostgreSQL and wait for it to be healthy
npm run db:migrate          # apply migrations and seed
```

Then, in two terminals:

```bash
npm run dev --workspace apps/api     # http://127.0.0.1:4000
npm run dev --workspace apps/web     # http://localhost:5173
```

If `npm install` behaves strangely — a platform binary for `esbuild` going missing is
the usual symptom — remove `node_modules` and `package-lock.json` and install again.
Do not try to patch it in place.

### Requirements

- Node.js **>= 22.18** (Prisma 7's floor; developed on 24.7)
- npm 10+
- Docker Desktop, for the database only

---

## Branches

| Branch | What lives there |
| --- | --- |
| `main` | Everything that has been finished and reviewed |
| `feat/phase-N-…` | One phase, one branch, merged when it is done |

A phase gets its own branch, and the branch is pushed before the work is reviewed —
so a phase in progress is visible rather than a dozen unreviewable commits on `main`.

**Never work on `main` directly.** Never force-push a shared branch, and never
rewrite history that has been pushed. If a commit needs changing after review, add
another commit.

### Naming

```
feat/     a new capability        feat/human-in-the-loop-matching
fix/      a defect                fix/rematch-excludes-declined-therapist
docs/     documentation only      docs/explain-the-weights
chore/    tooling or dependencies chore/add-pull-request-template
refactor/ no behaviour change     refactor/extract-the-evidence-reader
test/     tests only              test/cover-the-decision-endpoints
```

Scope prefixes from Conventional Commits, so `git log --oneline` reads as a history
of the product rather than of whoever happened to be working.

---

## Commits

One commit does one thing, and the message says why rather than what — the diff
already says what.

```
<type>: <summary in the imperative>

<why this, and what it rules out>
```

Real examples from this history:

```
feat: add feedback-informed rematching

A recommendation that cannot be turned down is a ranking list wearing
different words. This adds the turn-down, and takes it into account:
categories the person mentioned count for more, up to a ceiling.

No model, nothing stored about the client beyond this journey, and the
same intake with the same feedback always producing the same next
person. "We took your feedback into account" is true of that; "the
system learns" would not be.
```

The body earns its length by explaining **a decision that could have gone the other
way**. "Renamed X to Y" does not need a body. "Chose a foreign key to a candidate row
over a plain therapist id" does.

Keep the subject line under about 72 characters and in the imperative mood.

---

## Tests

```bash
npm run check        # typecheck, lint, format check, and every non-database test
npm run test:db      # the database-backed suite (needs the database up)
npm run build        # typecheck and build both workspaces
```

Run `npm run check` before pushing, and `npm run test:db` before merging anything
that touches persistence. Both are fast enough that not running them is harder to
justify than running them.

### What the suites are for

| Suite | Count | What only it can catch |
| --- | --- | --- |
| API unit | 317 | What the endpoints refuse, and what they refuse to send |
| Web | 435 | What a person sees, and in what order they see it |
| Database | 81 | Whether the *history* survives being written |

The database suite is mostly read-back rather than assertions about return values. A
service that writes the right row and a database that stores a different one pass
every other test in the project; only reading the rows back finds that.

**A test that cannot fail is worse than no test.** When you write one, break the
thing it guards and confirm it goes red. The boundary test in
`apps/web/src/lib/api/workspaceBoundary.test.ts` has a comment saying so, and it was
checked by making the violation deliberately.

### Tests that describe a decision

Where a test pins something a future reader might otherwise "fix" back, the test
name says the decision and the comment says why:

```ts
it('never says a shared any-of family is missing, because they met it', …)
it('refuses reasons that are neither a string nor a list of them', …)
it('answers 503 when the review store is unavailable, rather than guessing', …)
```

Those names are documentation. Keep them written for someone who has not read the
phase that introduced them.

---

## Adding a feature

Roughly, in order:

1. **Schema first**, if the domain needs it. A migration is committed; `migrate
   dev` creates one. Never edit a migration that has been applied anywhere.
2. **The domain module**, in `apps/api/src/data/<domain>/`. One concern per file,
   with the reasoning in the file rather than in a review comment.
3. **A port and an adapter.** A service depends on the interface; only
   `app.ts` knows which implementation is wired.
4. **A response schema** in `apps/api/src/api/v1/schemas/`, `additionalProperties:
   false` on every field, with a TypeScript interface beside it. A field added on the
   service side and not declared here fails the API's own tests rather than quietly
   reaching a browser.
5. **A route** in `apps/api/src/api/v1/routes/`, with its test beside it.
6. **An API client module** in `apps/web/src/lib/api/`, re-exported from
   `lib/api/index.ts`.
7. **A page** in `apps/web/src/pages/`, rendering `<LoadingNote />` and
   `<ErrorNote />` around the request.
8. **A test for each of loading, empty, error and success.** Not one of the four is
   optional.

A sixth rule, learned the hard way: **a response schema that validates is not
necessarily a response schema that serialises.** `fast-json-stringify` compiles
these, and it cannot handle some things AJV accepts — `anyOf: [object, {type:
'null'}]` passes validation and then throws when a response carrying the value is
sent. If a route 500s only when its value is non-null, look there first.

---

## Pull requests

Use the template in [`.github/pull_request_template.md`](.github/pull_request_template.md).
It asks for what changed, why, screenshots, and what was verified — and the last of
those is the one that matters most.

**Screenshots** for anything visual, at 1440px and at 320px. Both, because the two
failures look nothing alike: a desktop screenshot hides a page that needs horizontal
scrolling on a phone.

**Do not claim verification that did not happen.** "Tests pass" is not a useful
sentence on its own; "317 API, 435 web, 81 database, and the full browser flow at four
widths" is. If something was not checked, say so — an unchecked claim in a merged
pull request is worse than an admitted gap, because the next person trusts it.

---

## House rules

These are the ones that have actually bitten, all of them in this repository.

**Never log free text.** A person's own words about their life, and a matcher's note
about why they chose someone, are stored and never logged. Every key the API has ever
emitted is in `docs/rematching.md`; if you add logging, check against that list
before you commit.

**Never invent therapist photographs.** No real therapist has agreed to have their
image used here, and a stock portrait would turn a person into a catalogue entry. The
profile shows a generated monogram and that decision is load-bearing.

**Every vocabulary is a key plus a name.** The key is what the system stores and the
name is what a person reads, so a copywriter can rewrite a sentence without touching a
rule. If you add a term, add both, and add the key to the seed.

**No `any`.** `strict` TypeScript, and `npm run check` fails the build without it.

**Comments explain decisions, not mechanics.** `// increment i` is noise. "A guard here
made the page hang under StrictMode, so the effect runs freely and the server treats
the duplicate as a retry" is the reason the next person does not "fix" it back.

**Never add a dependency to solve something the standard library does.** There is no
state-management library, no UI framework and no animation library here, and each
absence is a decision rather than an oversight.

---

## Documentation

Docs live in `docs/` and each phase has one. They are long on purpose: `rematching.md`
is nearly nine hundred lines because the reasoning *is* the deliverable, and a reader
six months from now needs to know why a weight is capped rather than only that it is.

When a change makes a document wrong, fix the document in the same commit. A stale
doc is worse than a missing one, because it is trusted.

`docs/demo.md` is the path to walk someone through the product. If you change the
journey, update it.
