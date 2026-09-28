# Human-in-the-loop matching

The internal workspace where a person reviews what the matching engine produced, and decides.

---

## The question this phase answers

Phases 5 and 6 built a deterministic engine and a client who can decline a recommendation. Both
of those end with a question the product never asked out loud:

> When the engine gets it wrong — and it will, sometimes — who notices, and what do they do about
> it?

The answer in this phase is a person. A matcher opens a case, reads what the client asked for,
sees what the engine suggested and the evidence for it, looks at the alternatives, and chooses. The
choice is recorded with a reason, and the client is shown whoever was chosen.

That is the whole workflow. This document is about what it costs, what it refuses, and how the
audit trail is kept honest.

### The principle, stated once

> **The system assists the matcher. The matcher decides.**

Three things follow, and each is a decision the code has to make rather than a sentiment it can
merely print:

- **The engine is never presented as an authority.** It is a _suggestion_, labelled as one, with
  its case for itself shown as evidence rather than a number. A reviewer who cannot see why cannot
  disagree, and a reviewer who cannot disagree is not reviewing.
- **Disagreeing is a first-class outcome.** Keeping the system suggestion and choosing somebody
  else are two buttons in the same voice. Neither is marked correct, and the reasons a matcher can
  give are about their own reading of two profiles.
- **The engine's work is never rewritten.** A decision is a _new record beside_ the engine's.
  There is no code path in this phase that updates a `Match` row, and the repository the decision
  is written through has no method that could.

---

## Contents

- [The workflow](#the-workflow)
- [The three facts that must never be confused](#the-three-facts-that-must-never-be-confused)
- [The data model](#the-data-model)
- [Why `selectedMatchId` and not `selectedTherapistId`](#why-selectedmatchid-and-not-selectedtherapistid)
- [The one limit on a matcher's authority](#the-one-limit-on-a-matchers-authority)
- [Decision reasons](#decision-reasons)
- [What a matcher sees](#what-a-matcher-sees)
- [Alternatives, and why only four](#alternatives-and-why-only-four)
- [What a candidate does not carry](#what-a-candidate-does-not-carry)
- [The audit trail](#the-audit-trail)
- [Feedback, and the whole journey](#feedback-and-the-whole-journey)
- [The client's own words](#the-clients-own-words)
- [The API](#the-api)
- [What the browser cannot do](#what-the-browser-cannot-do)
- [Privacy](#privacy)
- [Authentication: deliberately not implemented](#authentication-deliberately-not-implemented)
- [The interface](#the-interface)
- [The demo scenario](#the-demo-scenario)
- [Tests](#tests)
- [Limitations](#limitations)

---

## The workflow

```
Client intake
     ↓
Matching engine
     ↓
Candidate set            ← 50 therapists, every one evaluated and stored
     ↓
Human matcher reviews
     ↓
  ┌──────────────────────────────┐
  │ Use this recommendation      │  →  decisionType: SYSTEM_ACCEPTED
  │ Choose another therapist     │  →  decisionType: HUMAN_SELECTED_ALTERNATIVE
  └──────────────────────────────┘        + a reason, and optionally a note
     ↓
Record the decision         ← a new row. The engine's row is untouched.
     ↓
Final recommendation        ← derived, not stored
     ↓
Client                     ← "We found someone who may be a good fit."
```

The last box is the only one the client ever sees, and the arrow into it is a derivation rather
than a write. That is the design decision this phase turns on, so it is worth stating before
anything else.

---

## The three facts that must never be confused

This is the distinction the brief insists on, and it is the reason the data model looks the way
it does:

|                           | What it is                                 | Where it lives                                                           |
| ------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| **System match**          | what the deterministic engine produced     | a `Match` row with `status: RECOMMENDED`, written once and never touched |
| **Human decision**        | what a matcher ultimately selected         | a `MatchingDecision` row, beside the engine's                            |
| **Client recommendation** | who is actually put in front of the client | **not stored** — derived from the first two                              |

```text
SYSTEM   therapist A      (a Match row, forever, with its own score and evidence)
HUMAN    therapist B      (a MatchingDecision row, pointing at B's candidate row)
CLIENT   therapist B      (derived; nothing in the database says so)
```

**Why the third one is not a column.** A stored "who we showed the client" would be a third fact
free to disagree with the other two, and the disagreement would be invisible: every page would
still render, each from its own copy of the wrong answer. Deriving it means there is nothing to
reconcile. `apps/api/src/data/matching/presented.ts` holds the derivation, in one function, with
the reasoning for why three call sites sharing it is a design problem rather than an
inconvenience.

---

## The data model

Four new tables and one enum. `apps/api/prisma/schema.prisma` carries the reasoning on the models
themselves; this is the summary.

```
MatchingDecision            one per case, immutable
  matchId          → the pass's RECOMMENDED match. The case. Unique.
  selectedMatchId  → the candidate chosen. Equals matchId when the suggestion was kept. Unique.
  decisionType     → SYSTEM_ACCEPTED | HUMAN_SELECTED_ALTERNATIVE
  note             → the matcher's own words. Optional. Never logged, never client-facing.
  createdAt

MatchingDecisionReason      a vocabulary: key, name, description
MatchingDecisionToReason    m:n, because several reasons can be true at once
```

Four decisions inside that shape are worth defending.

**A case is a pass, not an intake.** `matchId` points at the pass's recommended match. A client
who has been through two rematches has two cases, not one, and each is decided once. If the client
declines again and a third pass appears, that is a _new_ case — so a decision can never be
"revised", only followed.

**No `decidedBy` column, on purpose.** This prototype has no accounts. Any name in that column
would be invented, which is faking authentication rather than modelling it. What the record
honestly holds is that a human decision was made, and when. The moment real authentication
exists, the column is a migration; until then it would be a lie in a column whose whole purpose
is to say who is accountable.

**The decision type is derived, never sent.** There is no `decisionType` field in the request
body. The server works it out from which candidate was named, so a request cannot file an
acceptance as an override or an override as an acceptance. The distinction is a fact about the
data rather than a claim a caller makes.

**`createdAt` is the only clock.** No timestamp is read at request time, so the same request
always produces the same record.

---

## Why `selectedMatchId` and not `selectedTherapistId`

The brief's conceptual model suggests `selectedTherapistId`. The schema uses a foreign key to a
candidate _row_ instead, and three things fall out of the database rather than out of application
code:

1. **The person chosen was one the engine actually evaluated for this pass.** Not a stranger, and
   not a therapist from a different pass. This is an invariant, not a check.
2. **"Accepted the system suggestion" is literally `matchId == selectedMatchId`.** There is no
   second code path for the agreement case that could drift from the override case.
3. **The evidence the client is shown can be read from the selected row.** Without this the
   recommendation page would pair one person's name with another person's reasons.

It is unique, and that is a real invariant rather than tidiness: a candidate row belongs to
exactly one pass, so it can be the selection for at most one case. A later pass gets its own row
for the same person — a rematch re-evaluates every candidate — so uniqueness costs nothing.

---

## The one limit on a matcher's authority

**A matcher may not choose someone the engine set aside.**

A candidate is `INELIGIBLE` because they did not meet something the client marked as a must-have:
no shared language, or no session format they accept. A human overrule would put a client in front
of a therapist who does not speak their language while the recommendation page said they did — on a
page whose entire promise is that every sentence is backed by stored evidence.

So the rule is enforced in the service, not in the interface, and it answers with its own sentence
(`422`) so a matcher can tell a rule from a mistake:

> This therapist did not meet something the client marked as important, so they cannot be put in
> front of them.

It is worth being clear that this is a limit, not a demotion. A matcher chooses freely among
everyone the engine considered viable, and "viable" is a statement about the client's stated
conditions rather than about anyone's worth.

There is a second, softer rule: **choosing somebody different requires saying why.** Accepting the
engine's suggestion needs no justification, because nothing was overridden. Overriding something
without a reason leaves the audit trail recording a disagreement with no explanation of it, which
is the one thing the trail exists to preserve.

---

## Decision reasons

Six reasons, seeded as a vocabulary like every other term list in the project: a stable `key` that
the system stores, beside the `name` and `description` a matcher reads. A copywriter can rewrite a
sentence without touching a rule.

| key                              | offered as                               |
| -------------------------------- | ---------------------------------------- |
| `better-fit-stated-preferences`  | Better fit for what the client asked for |
| `stronger-contextual-experience` | Stronger contextual experience           |
| `better-communication-style`     | Better communication style               |
| `better-availability`            | Better availability                      |
| `better-language-fit`            | Better language fit                      |
| `other`                          | Something else                           |

**What a reason is.** "Why the matcher selected this candidate." A matcher who records _stronger
contextual experience_ is reporting a judgement they made while reading two profiles. It is not a
measurement of either person, and nothing downstream treats it as one.

**What a reason is not.** Not a clinical finding, not a verdict on the therapist, and not a claim
about the client. Every description names both parties explicitly — an earlier wording said "more
of the experience this person said matters to them", which does not say whether _this person_ is
the client or the therapist, and a sentence a matcher has to disambiguate is worse than a plainer
one.

**Kept short.** A long list of near-identical reasons is a list nobody reads carefully, and a
matcher choosing between eight overlapping options has made the decision for them.

**Offered alphabetically by key**, matching every other vocabulary here. An order that looked
deliberate but was not would be worse than one that plainly is not.

A key the vocabulary does not hold resolves to nothing rather than failing the decision. A matcher
working from a stale page whose term has since been dropped should still be able to record a
choice; what they cannot do is persist a justification nobody sanctioned. Tested both ways.

---

## What a matcher sees

The case page answers the seven questions the brief lists, in the order they get asked:

1. **What does this client need?** — the stored answers, organised by family, before anything
   else, because every judgement below is a judgement about fit.
2. **Why did the system choose this therapist?** — labelled _System suggestion_, with the evidence
   as sentences.
3. **What other candidates exist?** — a small set, each with their evidence and their gaps.
4. **Why might another candidate fit better?** — the gaps, and the full profile for each.
5. **What happened in previous matching attempts?** — the journey, with the client's reasons.
6. **What did the client say about previous matches?** — the reason keys, and the words behind an
   opt-in.
7. **What did the matcher ultimately decide?** — the decision and its record.

**No score, no rank, no percentage, no weight.** The engine's internal figure decides an order and
then disappears. A reviewer's case for disagreeing is _evidence_; a number is not evidence, it is an
oracle they would learn to defer to — which is the failure this whole surface exists to prevent.
`score` is used to sort the alternatives internally and is never selected into a response; a test
reads the serialised body rather than the TypeScript type to prove it.

**No clinical anything.** No diagnosis, no severity, no risk, no personality, no condition. There
is nowhere to store such a thing and nothing that would consume it.

**The evidence is the client's own sentences.** "You said you wanted support with relationships."
A reviewer reasoning from different wording than the client is reasoning from a different
understanding of the match. That does mean the second person is the _client_ on a page about
somebody else, so the voice is declared once, on the first card: _In the client's words — these are
the reasons they will be given, word for word._ Rewriting them for an internal reader would mean a
second set of templates free to drift from the first, which is a worse problem than an ambiguous
pronoun.

---

## Alternatives, and why only four

`ALTERNATIVE_LIMIT = 4`, in `workspaceService.ts`.

The engine evaluated every therapist in the pool. Showing fifty would be a dump of its shortlist,
and a matcher scrolling a list of fifty is reading none of it. Four is enough to see that a real
choice exists, which is the whole reason for a person being in the loop.

**The order is the engine's own**, recovered from storage as `score` descending then therapist id
ascending — precisely the order the engine produced, so the workspace shows the engine's shortlist
rather than a ranking the interface invented. The score decides the sequence and is never
returned.

Ineligible candidates appear too, marked and unselectable, so a reviewer can see _why_ the engine
passed over someone rather than wondering whether it considered them.

---

## What a candidate does not carry

The engine's evidence is positive-only: it records what a candidate shares with the client and says
nothing about what they lack. That is right for a page shown to a client — a list of things someone
does not offer is a list of reasons to talk yourself out of them, and it belongs nowhere near a
person choosing care.

A reviewer is doing the opposite job. "Why might this other person be a better fit" needs both
halves, and without the second a reviewer is comparing lists of overlaps while holding the client's
stated preferences in their head — which is exactly the arithmetic the engine was built to do for
them.

So the case page shows, per candidate, the terms the client named that this candidate does not
have. It is a plain set difference over stored keys: not a score, not a penalty, not an inference.

**The rule that makes it correct rather than merely plausible.** Families are not all the same
shape, and treating them the same produces confident nonsense:

- **All-of families** — areas of work, conversation style, contextual experience, approach. The
  client named specific things; naming the missing ones is exactly right. _Including the case where
  they have none of them, which for a one-item family is the most important line on the page: a
  client who asked for an exploratory conversation, and a therapist who does not work that way._
- **Any-of families** — language and session format. The client said _any one of these_ would do,
  and the engine's requirement is satisfied if they share even one. A candidate who speaks one of
  three named languages is **not** missing the other two: they met the condition, and listing their
  absences would tell a reviewer they had failed something they passed. The only true statement for
  these families is a single one — none of the languages you named — and it appears only when the
  candidate shares none.

That case is rare in practice, because such a candidate is `INELIGIBLE` and a matcher cannot
choose them anyway. It is implemented regardless: a workspace that only behaves correctly while its
input happens to be filtered correctly is not correct, it is lucky.

---

## The audit trail

The requirement, stated as a test:

> System suggested therapist A. Human selected therapist B. After the decision: system
> recommendation == A, human selected == B, final client recommendation == B, **and nothing
> overwrote A.**

`apps/api/src/data/matching/workspace.db.test.ts` asserts exactly this, and then goes further —
it re-reads the rows from the database rather than asking the code that just wrote them, and checks
that the engine's row still has its own `therapistId`, `score`, `status`, `engineVersion` and
evidence rows; that the selected candidate's row is still `ELIGIBLE` with the engine's own score,
so B was never promoted into A's place; and that every sentence on the client's page traces to an
evidence row belonging to the person being shown.

**A decision is immutable and one per case.** A repeated `POST` returns the first decision rather
than writing a second one — the same rule as a declined match. There is no "revise a decision"
path: a decision is a record of a past moment, and changing it would rewrite the trail it exists to
keep. If a decision turns out to be wrong, the honest correction is a new case, which is what a
client asking to look again produces.

**A decision cannot change the score.** Nothing in this phase writes to a `Match`. The adapter
(`prismaWorkspaceRepository.ts`) has no `update`, no `delete` and no `create` on that model, which
is a property of the file's shape rather than a convention in a comment.

---

## Feedback, and the whole journey

Phase 6's feedback integrates without any new mechanism, because the journey is already a chain of
passes and the workspace reads the whole chain.

For an intake that has been through rematching, the case page shows:

```text
First search
  The system suggested Ananya Mehra.
  The client said it didn't fit: The way they talked.
  ↓
Second search · this case
  The system suggested Tara Joshi.
  The matcher chose Aditi Raghunathan.
  Reason: stronger contextual experience.
```

So a matcher reading a third pass can see who the client has already declined and why, rather than
selecting somebody the client has just turned down and finding out from the client.

**One subtlety worth naming, because it is easy to get wrong.** After a human review, the therapist
the client was _shown_ is not necessarily the one the engine suggested. Three places need to
resolve that, and all three use `presentedTherapistId`:

- the client-facing recommendation, which must show the human-selected therapist;
- the feedback record, which must attribute a complaint to the person who was shown;
- the exclusion set for a rematch, which must exclude the therapist the client declined.

If each worked it out for itself they would agree today and diverge the first time a decision was
made on a pass that also had feedback — and the symptom would be a client being told they had just
declined someone they were never shown. Tested end to end in `workspace.db.test.ts`: decide pass
one for a different person, decline, and assert the rematch does not return them.

---

## The client's own words

Behind an explicit opt-in, and the mechanism matters more than the policy.

**A separate endpoint, not a query string.** `GET .../cases/:matchId/clients-words` rather than
`?clientsWords=true` on the case. Reaching for someone's free text is then a _second request_, and
a second request is visible in a network log, in a browser's network panel, and in a log. An opt-in
that is only documented is an opt-in nobody can audit.

**The case payload is provably free of it.** A test asserts the case response does not contain the
text, and that `readClientsWords` is never called on the default path. The browser run asserts the
same against the wire.

**Only the exact word `reveal` opens it.** `true`, `1`, `yes` and the empty string all leave the
text out. A flag that switches itself on for any non-empty value is a flag that will eventually be
on by accident.

**"None" and "withheld" are the same absence.** A matcher is never asked to tell the difference
between there being nothing and there being something they did not ask for.

**Never logged.** The intake's raw text and the feedback notes are in the same position as every
other free-text field in this project: stored, never parsed, never logged.

---

## The API

Four endpoints, all under `/api/v1/matching-workspace`, all with `additionalProperties: false` and
explicitly declared fields.

|                                     |                                                               |
| ----------------------------------- | ------------------------------------------------------------- |
| `GET /cases`                        | the queue: every current recommendation no human has reviewed |
| `GET /cases/:matchId`               | one case in full                                              |
| `GET /cases/:matchId/clients-words` | the client's free text, opt-in                                |
| `POST /cases/:matchId/decision`     | record a decision                                             |

**The queue is not a stored flag.** A pass stands for review while its recommendation is
`RECOMMENDED`, and asking for another option turns that into `DECLINED`. So `RECOMMENDED` selects
exactly the current pass of each intake — an earlier pass cannot still be `RECOMMENDED` if a later
one exists, because the only route to a later one runs through feedback, and feedback is what
declines it. There is no "needs review" column to fall out of step with the state machine.

**The decision body is `{ selectedMatchId, reasons, note? }` and nothing else.** The fields are
declared without types and validated by hand, which is the only approach that gets this body right:
Fastify's AJV coerces by default, so with a type declared `[7]` arrives as `["7"]` and `5` as
`["5"]` — and a caller could then persist a justification the vocabulary has never heard of,
stringified, as though a matcher had chosen it. Declaring no type means there is nothing to coerce
and every malformed shape is refused with a sentence written for the person reading it.

**Refusals, each with its own answer** because a matcher who cannot tell _which_ rule stopped them
cannot fix it:

|       |                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------- |
| `400` | A decision is a choice between the candidates on this page. There is nothing else for you to name here.       |
| `404` | We do not have a case with that reference.                                                                    |
| `422` | That therapist is not one of the candidates for this case.                                                    |
| `422` | This therapist did not meet something the client marked as important, so they cannot be put in front of them. |
| `422` | Say why this one fits better, so the decision can be read later.                                              |
| `503` | We could not reach where matches are recorded right now.                                                      |

**A store failure is a `503`, never a fallback.** If the decision store cannot be read, nobody can
say whether a matcher reviewed this case — and falling back to the engine's recommendation would be
the worst available answer, because it could put in front of a client the exact person a matcher
decided against. A `503` says _we do not know yet_, which is true.

**One nullable-object trap, recorded because it cost an afternoon.** `anyOf: [someObject, {type:
'null'}]` validates correctly and then throws inside `fast-json-stringify` at serialisation time —
so a route whose first response happened to include the nullable value returned `500` while every
response before it returned `200`. A nullable object is a union of _types_ with the properties
spread in. Two tests now cover it, because "the first response happened not to include it" is
exactly how that bug survived.

---

## What the browser cannot do

The security model of this phase is structural, which is the only kind worth having.

**No endpoint accepts a client id, an intake id or a therapist id.** Every read is reached from a
case's match id, and the one write names a candidate from the set that case already offered. A
caller cannot steer a review of a person they did not choose, because there is nowhere to name one.

**The server validates against the same set the page showed.** `selectableMatchIds` is both what
the alternatives list offers and what `decide` accepts, so the contract a client was shown and the
contract the server enforces cannot drift apart.

**The field a caller would most expect to be honoured is refused, not dropped.** A `therapistId`,
a `clientId`, an `intakeId` or a `decisionType` in the body gets a `400` naming the problem.
Silently stripping it would be the worst available outcome, because the caller would believe it
worked.

**An unknown reason key resolves to nothing** rather than being persisted.

**The client-facing response does not change shape.** `POST /matches` gained no field, and a test
asserts the serialised key set is identical before and after a decision. The client is shown
whoever a matcher chose, and learns nothing about it.

---

## Privacy

**The boundary is the schema, not a convention.** The client API has its own schemas, and none of
them has a field a decision, a matcher note or an alternative candidate could travel in. There is
nothing to redact later, and no future field can leak by accident without someone also adding it to
a client-facing schema — which is a reviewable act.

**And what the boundary is not, stated plainly because it is easy to overclaim.** This is one
single-page application, so the workspace's code ships in the same bundle as the client's, and the
endpoints are unauthenticated. Someone who types `/matching-workspace`, or reads the bundle, can
reach every case. What holds is narrower and still worth having: no page in the client journey
imports the workspace client, no client route links to it, and no client route leads out of it — so
a person going through the intake is never shown a decision, a note or another candidate. A test
asserts the first of those. The second is a routing decision, and routing is not a boundary.

What a client is shown, in every case:

> We found someone who may be a good fit.

Not: that a system was involved, that anything was reviewed, that anyone disagreed, what the engine
ranked first, or what anybody wrote.

**A client is identified by a UUID with no name attached**, anywhere in this system. A case is
identified by its match.

**Nothing free text is logged.** Verified against every key the API has ever emitted —
`level, time, pid, hostname, msg, reqId, req.method, req.url, req.host, req.remoteAddress,
req.remotePort, res.statusCode, responseTime` — with zero bodies, headers, payloads or query values.

**A matcher note is not clinical truth and is not treated as anything.** It is a person's stated
reason for their own choice, stored, never parsed, never aggregated, and unreachable from any
client-facing endpoint.

---

## Authentication: deliberately not implemented

**Authentication and authorization are intentionally not implemented in this prototype.** There is
no login screen, no session, no token, and no "signed in as" anywhere in this codebase. A fake
login would be faking authentication rather than modelling it, and would be worse than its absence
because it would look like the boundary was there.

What there is instead is a shape that makes the eventual work small and the intent unmistakable:

- The paths are one family under `/matching-workspace`, so they are greppable as a group and can be
  mounted behind a guard in one place.
- Every endpoint is reached from a case's match id, so there is no identifier to authorise _with_
  until accounts exist — and when they do, the natural key is already there.
- The route descriptions in the OpenAPI document say, in the place an integrator would read it,
  that authentication is not implemented.
- `MatchingDecision` has no `decidedBy` column, so no decision is attributed to a person who does
  not exist.

The limitation this creates is real and should be stated plainly: **on a deployed instance, anyone
who can reach `/matching-workspace` can read every case and record decisions.** In a prototype on a
developer's machine that is the intent. It is not a security posture, and it should not be mistaken
for one.

---

## The interface

`/matching-workspace` and `/matching-workspace/:matchId`. Internal, at the edge of the route tree,
outside the journey — so the client journey's position indicator cannot appear on it, and no
client-facing route links into it.

**Not a dashboard.** No sidebar, no KPI row, no charts, no badges, no analytics, no dense table, no
"AI copilot". The queue is a list of rows; the case is a page of sections. The only figure on the
queue is how many cases are waiting, and it is a sentence rather than a headline number — "2 cases
are waiting" is fine, a large number above a list is a dashboard, and a dashboard is a different
product with different intentions towards the person reading it.

**The same design language, a different rhythm.** Warm canvas, hairlines, serif headings, the same
spacing scale, the same focus treatment, the same reduced-motion behaviour — all shared, none
redeclared. What differs is density: a matcher compares things, so a label and its value sit on one
line rather than a heading and a block.

**Stacked rows, not a table.** A table is the right structure for a queue at 1440px and the wrong
one at 320px, where it is a horizontal scroll. Rows that stack do both: fields become lines when
narrow, and a grid puts them in columns when wide. Verified with no horizontal overflow at 320, 390,
834 and 1440.

**One left edge below the headings.** Each section is a margin label and a content column. A section
with no margin label — "What this client needs" — still starts its content in the second column, so
the page has a single content edge rather than a step in and out of alignment.

**Calm decision language.** "Use this recommendation" and "Choose another therapist". Not
"approve", not "reject", not "accept AI", not "override AI" — a vocabulary that frames disagreement
as a mistake to be explained is the opposite of what this phase is for. A test asserts those words
are absent from the decision section.

**Reused, not reinvented.** The monogram, the attribute lists and the availability formatting are
the components the client profile page uses. A second visual representation of a therapist would
imply the internal tool knows something the client page does not, and would guarantee the two drift
apart.

Accessibility, verified in a real browser: one `h1` per route and no skipped heading level (the
candidate card's name is an `h3` under a section `h2` for exactly this reason), a skip link as the
first tab stop, a visible focus ring on every focusable including the visually hidden checkboxes,
real `fieldset`/`legend`/`label` for the reason picker, `role="alert"` on a refusal, and
`prefers-reduced-motion` collapsing every transition to 0ms.

---

## The demo scenario

`npm run db:demo:workspace` creates one client, runs the real engine, and leaves the result as a
case waiting for review.

It goes through the HTTP routes in-process rather than writing rows, so the case in the queue is
exactly the case a browser would have produced and cannot drift from the product.

The scenario is the strongest signals the demo can produce: **Hindi and English, an exploratory
conversation, the Indian diaspora, relationships and career transitions, weekday evenings.**

**And here is the honest finding, which is the best argument this phase has.** The engine suggests
**Tara Joshi — Direct · Structured · Warm** — for a client who explicitly asked for an exploratory
conversation. Aditi Raghunathan (Exploratory, the Indian diaspora, both areas) is in the shortlist
and is _tied on score_.

That is not a bug to be fixed by hand. The engine weighs a stated preference; it does not gate on
one, because a preference is not a requirement and the Phase 4 rule says so. The consequence is
exactly the case a human matcher exists for: the reviewer reads `Not what they offered — Style:
Exploratory` under the system's own suggestion, sees an alternative who does match what the client
asked for, and chooses. **The seed and the engine were both left untouched.** A demo that flattered
the engine would be worth less than this one.

The base seed is still therapists and vocabularies only — no invented clients unless somebody asks
for them.

---

## Tests

|          |                                                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API unit | `apps/api/src/api/v1/routes/workspace.test.ts` — 42 tests: the queue, the case, refusals, the decision body, and the serialisation traps                        |
| Database | `apps/api/src/data/matching/workspace.db.test.ts` — 16 tests: the audit trail read back from storage, exclusion scope, cascades, rematch after a human decision |
| Frontend | `apps/web/src/pages/MatchingWorkspacePage.test.tsx` — 36 tests, and `apps/web/src/lib/api/workspace.test.ts` — 10                                               |

The API tests are mostly about what the endpoint _refuses_, because the security model is
structural: the interesting question is not "does it check the client id" but "could a caller steer
this at all".

The database tests are mostly read-back, because a service that wrote the right row and a database
that stored a different one would pass every other test in the project.

The frontend tests are mostly about how the work _feels_ — that agreeing and disagreeing are
equally weighted, that reasons are asked for only when something is being overridden, and that
several _absences_ hold: no score, no percentage, no candidate the server did not offer, no client's
own words in the payload.

### Browser verification

A real headless Chrome over CDP, driving the whole flow: create an intake, reach a
recommendation, open the queue, read the case, choose an alternative with a reason and a note,
submit, and confirm the client-facing recommendation changed while the engine's answer did not.
Alongside it: keyboard-only reachability with every focus ring checked, heading structure, four
widths with no horizontal overflow, reduced motion, and the wire read from inside the page.

---

## Limitations

**No authentication.** Stated at length above, and it is the largest one. On a deployed instance
the workspace is open to anyone who can reach it.

**No decision history per decision.** One decision per case, immutable. There is no revision, and
that is a choice rather than an omission — but it does mean a matcher who realises they chose wrong
has no way to say so except by letting the client decline.

**No `decidedBy`.** Discussed above. Deliberate, and a migration when accounts exist.

**Alternatives are capped at four.** A case with fifty near-identical viable candidates will not
show the matcher the full shortlist, and the engine's own order decides which four. A reviewer who
wants the sixth candidate has no way to reach them.

**The case detail loads every candidate row of the pass** — fifty therapists with their evidence —
and then shows four. That is simpler than a second paginated endpoint, and it is not free. It is
fine at prototype scale and would need revisiting with real data.

**The evidence sentences are the client's, in the second person.** Declared once per case, but it is
a compromise: a second set of templates for internal readers would drift from the first.

**A case is decided, and that is final.** There is no "release this case back to the queue". If a
matcher is interrupted the case simply stays in `NEEDS_REVIEW`, which is the correct behaviour, but
there is no assignment and no claim.

**No notification.** A matcher finds out there is work by opening the queue, and the client finds
out there is a new recommendation by asking. Both are prototype-shaped.

**The decision store being unavailable makes recommendations unavailable.** A deliberate trade:
answering a recommendation without knowing whether a human reviewed it could put in front of a
client the person a matcher decided against.

**This phase stops here.** No therapist dashboard, no therapist login, no client authentication, no
payments, no booking, no calendar, no messaging, no video, no notifications, no analytics.
