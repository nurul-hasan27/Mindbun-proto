# Rematching

What happens when the first recommendation does not feel right.

---

## The question this phase answers

Finding someone to talk to is not shopping. The whole argument of this prototype is that a
star rating, a percentage, and a ranked list turn a person into a product with a
compatibility figure. That argument gets much harder to hold the moment a person says _no, not
them_ — because a ranked list has exactly one answer to that, and it is a different row.

So this phase had to answer one question honestly:

> When someone says "not this one", what actually happens next?

Not "show them someone else". Specifically: **what changes in the search, and what can we
say about it afterwards.**

The answer, which is the whole of this document:

1. The therapist they declined is excluded from the rest of **this journey**.
2. The categories they mentioned count for **more** in the next ordering, up to a ceiling.
3. Nothing else. No model, no memory of the person, nothing that changes what they are shown
   on a different occasion.

That is the entire mechanism. It is not "the system learns", and the product never says so.
The product says **"We took your feedback into account."** — which is true of the above, and
which this document exists to make checkable.

---

## Contents

- [The loop](#the-loop)
- [The feedback model](#the-feedback-model)
- [Feedback → matching signals](#feedback--matching-signals)
- [What feedback must never become](#what-feedback-must-never-become)
- [Exclusions](#exclusions)
- [The matching engine, extended](#the-matching-engine-extended)
- [Match history](#match-history)
- ["What changed this time"](#what-changed-this-time)
- [When nobody is left](#when-nobody-is-left)
- [The API](#the-api)
- [What the browser cannot do](#what-the-browser-cannot-do)
- [The interface](#the-interface)
- [Privacy](#privacy)
- [Tests](#tests)
- [Limitations](#limitations)

---

## The loop

```
/intake
   ↓
/recommendation        ← the first person
   ↓  "I'd like another option"
/feedback              ← structured reasons, optional note
   ↓
/matching              ← the same engine, run again
   ↓
/recommendation        ← someone else, and what is different
   ↓  "I'd like another option"
   ...
```

`/matching` was a placeholder before this phase and is now real. It exists because a rematch
cannot be folded into the recommendation page the way a first match was: someone has just been
turned down and told we would look again, and a page that flashes and returns would feel like
nothing happened. It is where the honest failures live too — the search that found nobody, and
the one that could not be reached.

`/rematch` is still a placeholder. Nothing in this phase needs a third pass, and a step that
exists only to be clicked is worse than a step that does not exist yet.

---

## The feedback model

### What a feedback row means

A row means exactly this:

> **The client reported that this match did not feel like a fit, and said so in these terms.**

Not that the therapist is ineffective. Not that they are a poor communicator, disorganised, or
lacking experience. Those are claims about a person, and this product does not make them.

### What changed, and why it is worth saying

The Phase 2 sketch had a `sentiment` column holding `GOOD | MIXED | POOR`. **It is gone**, and
the reasoning is the single most important thing in this document's data model:

- `POOR` is a verdict on a person, and this product does not issue verdicts on people. Its whole
  argument is that finding someone to talk to is not shopping, and a star rating is shopping.
- `POOR` is also not what the person said. They said _this did not feel right for me_, which is
  a fact about their experience. A table that cannot distinguish the two will eventually be read
  as making it.
- Nothing in the codebase referenced it, and nothing in the database had ever held it.

So `Feedback` now carries no rating, no score, and no sentiment. What is stored is the report
and its terms; the match's status carries what the person then did about it.

```prisma
model Feedback {
  id          String @id @default(uuid()) @db.Uuid
  clientId    String @db.Uuid
  intakeId    String @db.Uuid
  therapistId String @db.Uuid

  /// The match this is about, so the feedback cannot be detached from the decision it
  /// responds to and read as a general opinion of a person.
  matchId String @unique @db.Uuid

  /// Stored, never parsed, never logged, and never a matching input.
  text String?

  createdAt DateTime @default(now())

  client    Client    @relation(...)
  intake    Intake    @relation(...)
  therapist Therapist @relation(...)
  match     Match     @relation(...)
  reasons   FeedbackToReason[]
}
```

Three decisions in there:

**`matchId` is unique.** One decline per recommendation. A double submit is one row, not a
second opinion — which is also the whole of the duplicate-safety for this endpoint, in the same
way `(intakeId, attempt, therapistId)` is for a pass.

**`matchId` is required.** Feedback cannot exist without the decision it responds to. This is
what makes "a complaint about a match" and "an opinion of a person" different things in storage
rather than only in prose.

**`text` is never read.** Same treatment as `Intake.rawText`, for the same reason. It is here
because the product is built on someone being allowed to say more than a checkbox allows.

### Multiple reasons, and why

A single `reasonId` would be a lie. "The timing didn't work and I didn't feel understood" is one
thing a person can mean, and forcing them to pick the half that mattered more would lose the
part that mattered to them. So reasons are a join table:

```prisma
model FeedbackToReason {
  feedbackId String @db.Uuid
  reasonId   String @db.Uuid
  feedback   Feedback       @relation(...)
  reason     FeedbackReason @relation(...)
  @@id([feedbackId, reasonId])
  @@map("feedback_to_reasons")
}
```

It is `feedback_to_reasons` rather than `feedback_reasons` because the vocabulary already owns
that name.

### Reason keys, not labels

`FeedbackReason` is a stable `key`, a `name` and a `description`. **Every consumer reads the
key.** The wording is data and is expected to be rewritten by a copywriter; a copy that changes
must not be able to change a matching rule, and a UI label must not be able to become a
contract.

| Key                      | Shown as                                            | Adjusts                   |
| ------------------------ | --------------------------------------------------- | ------------------------- |
| `communication-mismatch` | The communication style didn't feel right.          | `COMMUNICATION_STYLE`     |
| `different-experience`   | I wanted someone with different experience.         | `CONTEXTUAL_EXPERIENCE`   |
| `not-the-right-approach` | The way they work did not suit me.                  | `THERAPEUTIC_APPROACH`    |
| `felt-uncomfortable`     | I did not feel understood.                          | _nothing — see below_     |
| `availability-mismatch`  | The timing did not work for me.                     | `AVAILABILITY`            |
| `language-mismatch`      | I would prefer someone who speaks another language. | `LANGUAGE`                |
| `format-mismatch`        | I would prefer a different session format.          | `SESSION_FORMAT`          |
| `other`                  | Something else.                                     | _nothing — by definition_ |

Every name is written from the person who answered it. None is a verdict on the therapist.

**One reason from Phase 2 was removed: `location-mismatch`.** This phase does no geographic
matching — a `TherapistProfile.location` is a display string, not a structured attribute the
engine may compare — so offering it would collect something the system could not act on, while
implying it had changed the next search. A reason we cannot act on is worse than no reason,
because it is a promise with nothing behind it. The vocabulary is the seed file's, and the seed
deletes and rebuilds it, so removing a key from the list really removes it.

The eight reasons are read from the database at request time (`GET /api/v1/feedback/reasons`).
A term added to the database has to be offerable without a code change, and a set captured at
start-up would be a snapshot that quietly stops matching what the interface shows.

---

## Feedback → matching signals

`feedbackSignals.ts` is the only place a complaint becomes a matching input. It is a pure
function of the reason keys, and it produces three things:

```ts
interface FeedbackSignals {
  /** The keys, sorted, so the record is stable. */
  reasonKeys: readonly string[];
  /** How much more each category counts, added to its base maximum. */
  increments: Partial<Record<MatchCategory, number>>;
  /** The categories the person spoke about, whether or not it adjusted them. */
  touchedCategories: readonly MatchCategory[];
}
```

### The increments

Added to the base maximum, then capped. Integer-only, like every other number in the engine.

| Reason                   | Category                | Added            | Base | Capped at |
| ------------------------ | ----------------------- | ---------------- | ---- | --------- |
| `communication-mismatch` | `COMMUNICATION_STYLE`   | +40              | 40   | 80        |
| `different-experience`   | `CONTEXTUAL_EXPERIENCE` | +50              | 50   | 100       |
| `not-the-right-approach` | `THERAPEUTIC_APPROACH`  | +30              | 30   | 60        |
| `language-mismatch`      | `LANGUAGE`              | +40              | 30   | 60        |
| `format-mismatch`        | `SESSION_FORMAT`        | +40              | 20   | 40        |
| `availability-mismatch`  | `AVAILABILITY`          | +30 / shared day | 20   | 40        |

`FEEDBACK_BOOST_CEILING = 2`. A category can count for at most twice its base.

### Three properties, and the tests that hold them

**The boost cannot become a requirement.** Two times the base is enough to make a mentioned
preference outrank an unmentioned one — the whole intent — and not enough to make a preference
behave like a gate. A candidate who shares none of the stated style stays `ELIGIBLE` however
much style is boosted. `rematch.test.ts` asserts this directly, on a real candidate, through the
real engine.

**A requirement still gates, even when its category is boosted.** `LANGUAGE` and
`SESSION_FORMAT` are both requirements _and_ boosted by feedback, and those two facts have to be
able to coexist. They do because they are separate mechanisms: the boost changes the ordering,
the requirement keeps eliminating. A therapist who speaks none of the chosen languages is still
`INELIGIBLE` with `NO_SHARED_LANGUAGE` after a language boost.

**The requirement bonus still outranks everything.** `REQUIREMENT_BONUS` moved from 250 to 600,
and that looks like a change to the scoring so it is worth being explicit: it is not one. The
bonus is added uniformly to every _eligible_ candidate, so it cannot change the ordering among
them — it only asserts that a requirement outranks a preference, which is the point. It had to
move because the ceiling did: with every category boosted to twice its base the preference
field can now reach 560, and a bonus of 250 would no longer dominate it. `REQUIREMENT_BONUS >
maximumPreferenceTotal()` is asserted against the _boosted_ maximum, not the base one, so the
invariant is arithmetic rather than a hope.

### Order independence

Two people ticking the same three boxes in different orders must get the same next person. If
they did not, the result would depend on the order a mouse happened to move, and the same person
could be shown two different people on two devices. Every transformation sums into a fixed
category order, and a test asserts that two orderings of the same reasons are
indistinguishable.

Duplicated reasons are counted once. Ticking "the timing didn't work" twice is not twice the
complaint, and letting it be would be a way to buy priority.

### The two reasons that do less than you would expect

`felt-uncomfortable` ("I did not feel understood") and `other` ("Something else") produce **no
weight adjustment at all**, and that is the honest answer rather than a missing one.

- `other` is a box for something we did not think to ask about. There is no attribute to weight,
  by definition.
- `felt-uncomfortable` is about the interaction, not about a stated attribute of a person.
  Boosting _communication style_ because someone did not feel understood would be a specific
  clinical claim this phase cannot support: not feeling understood is not evidence about a
  conversational style, and treating it as one would quietly turn a report about an interaction
  into a claim about a person. Boosting _availability_ because of it would be nonsense.

Both still do something real: they are recorded, they remove the therapist from the rest of the
journey, and the person gets a different person next. What they do not do is claim an adjustment
that is not there. An absent "what changed" section is the honest rendering of that.

### What it does not do

**It does not learn a new preference.** Nobody has told us what they wanted _instead_ — they
have told us what they did not get. So there is nothing to learn. If the client said
"exploratory" at intake, that preference is still there and now counts for more; we do not infer
a style they never named, and no therapist attribute is invented to stand in for one.

The distinction is worth stating plainly, because it is the whole difference between "we heard
you" and "we decided for you":

| Feedback says                          | This becomes                                    |
| -------------------------------------- | ----------------------------------------------- |
| "the communication style wasn't right" | communication style counts for more             |
| **not**                                | ~~only show me someone with a different style~~ |

**It does not treat a report as a fact.** "I did not feel understood" does not mean this
therapist is ineffective, and the layer does not encode that belief. The data model cannot
express it either — see [the feedback model](#the-feedback-model).

---

## Exclusions

### The set

The therapists with `status: 'DECLINED'` **on this intake**, plus the match being replaced. The
engine receives it as a list of ids and knows nothing about journeys.

### Scope: the journey, not the client and not the world

This is the decision most worth stating, because the alternative is a real harm.

A therapist declined here is perfectly recommendable to somebody else, and to the same person on
a different intake later. **Nothing about one search follows a person around the service.** If
declines were stored against the client, a person who declined three therapists on a Tuesday
would find those three gone on a Friday, for reasons they could not see and could not undo — and
with no way to know why. The pool would quietly shrink each time they came back.

Scoping to the intake makes the exclusion visible and finite: it is _this_ journey, and it ends
with the journey.

### Recorded, not dropped

An excluded candidate is still evaluated. It comes back as `INELIGIBLE` with
`DECLINED_PREVIOUSLY` and a score of zero, and it is still written to storage.

A candidate that vanished without a trace would be indistinguishable from one who was never in
the list. "Not this one" is a decision the person made, and a reviewer's record of this journey
should hold it.

The score is zero rather than the score it would have earned, because a score is an ordering aid
and a candidate that is not being ordered must not appear to have competed.

### One more code

`REJECTION_CODES` gains `DECLINED_PREVIOUSLY`. It is different in kind from the other two:
`NO_SHARED_LANGUAGE` and `NO_ACCEPTED_SESSION_FORMAT` are facts about this therapist and this
client, while this one is a decision the client already made. That difference is the reason it is
a separate code rather than a special case of either.

---

## The matching engine, extended

**There is no second engine.** `runMatchEngine` gained two parameters and nothing else:

```ts
runMatchEngine({
  intake,                              // unchanged
  candidates,                          // unchanged
  excludedTherapistIds: [...],         // new
  feedback: FeedbackSignals,           // new
})
```

A first match is this pipeline with an empty exclusion set and `NO_FEEDBACK_SIGNALS`. The same
ten stages run, in the same order, with the same evidence model and the same tie-break. A rematch
is the same function with different inputs — not a code path that could disagree with the first
about what "the best candidate" means.

What changed inside:

- `evidence.ts` takes the increments and asks `maxCategoryScore(category, increments)` instead of
  reading `CATEGORY_MAX_SCORE` directly. The base, the boost and the cap are all in one place
  (`weights.ts`).
- Availability is capped twice: by the number of shared days as before, and by the boost ceiling
  so feedback about timing cannot buy unbounded priority. The day cap does not move — three days
  is already "we could probably arrange something".
- `Match` gains `attempt`, and the unique index moves from `(intakeId, therapistId)` to
  `(intakeId, attempt, therapistId)`.

**What did not change:** the evidence stored, its shape, its strengths, and the requirement
derivation. A boost is a weight. It must not invent evidence, change a strength, or add a
category, and a test asserts that the evidence a candidate produces is byte-identical with and
without feedback — while the score, the only thing feedback is allowed to move, is higher.

---

## Match history

### The shape

```
Match #1  attempt 1  RECOMMENDED → DECLINED   (feedback #1)
Match #2  attempt 2  RECOMMENDED → DECLINED   (feedback #2)
Match #3  attempt 3  RECOMMENDED
```

Every pass writes **all fifty candidates** under its own attempt number. Fifty rows a pass, and a
journey is three passes — 150 rows, which is nothing, and it is what makes the decision
inspectable at every step rather than only the first.

Nothing is overwritten. The previous recommendation keeps its evidence, its score, its status,
and its reasons.

### Why `attempt` and not a separate `Recommendation` entity

There is no `Recommendation` table. A `Recommendation` would hold one row per pass and a pointer
back to the `Match` that already says everything — the therapist, the status, the evidence, the
pass number. It would be a second place for the same fact to be wrong.

The `Match` row _is_ the decision. `status: 'RECOMMENDED'` marks the one the person was shown;
everything else in the pass is the reasoning behind it.

### Four statuses, and the one that is deliberately absent

```
ELIGIBLE     considered, met every requirement, scored
INELIGIBLE   considered and set aside, with a reason
RECOMMENDED  the one the engine chose to show
DECLINED     the client gave feedback and asked to look again
```

`SUPERSEDED` is offered by the brief and **deliberately not modelled.** Nothing reaches it. A
previous match that was offered and turned down is `DECLINED`, not superseded — the person
rejected it, nothing replaced it. A candidate that simply lost an ordering is `ELIGIBLE` and
stays `ELIGIBLE`; losing an ordering is not a status change. A state no code path can reach is a
state nobody can reason about.

The only transition in the whole system is `RECOMMENDED → DECLINED`, it happens exactly once per
match, and it happens when feedback arrives.

### A consequence worth knowing about

`DECLINED` can only follow `RECOMMENDED` — it is the single transition, and `recordFeedback` is
the only thing that writes it, against a match id that was a recommendation. So the two statuses
describe the same row at two points in its life, and reading "who was shown" means matching on
either.

This was a real bug. Looking only for `RECOMMENDED` meant that once a recommendation was
declined, **the pass that produced it reported no recommendation at all** — so the next page lost
the name of the person the client had come away from, and lost the "what changed" section, while
the evidence sat there unread. A reload of `/recommendation` after a rematch showed the right
person with none of the framing that explains why there was a second one. `findRun` now matches
on both, and `feedback.db.test.ts` pins the behaviour.

### `POST /api/v1/matches` answers with the _latest_ pass

Not the first. "Give me a recommendation for this intake" must answer with the one the person is
on, and after a rematch that is the newest pass. Returning the first would show them the person
they just turned down — the opposite of what they asked for.

This is also why the match route is given the feedback store: the framing has to survive a
refresh, and a page that has to work out which shape it got is a page that will eventually
render nothing.

---

## "What changed this time"

The hardest page in the product to write honestly, because the tempting version of it is a lie
factory. A section saying "more exploratory, better availability, closer to what you asked for"
is easy to generate and almost impossible to justify: every one of those claims is a comparison,
and a comparison is a claim about what changed, which has to be checkable.

### Three rules, and failing any one means silence

A change is reported only when **all three** hold.

1. **The person mentioned it.** The category has to be one the feedback spoke about. Silently
   improving something they did not raise would imply we took something into account that we did
   not.
2. **Something is actually different.** The two therapists' attributes for that category are not
   the same set. A category that is identical on both sides is not a change, however much the
   internal ordering moved.
3. **The new one covers the client's stated preference better.** Measured with the same share
   the engine scores with — matched keys over keys the client actually chose — and claimed only
   when the new side's share is **strictly greater**. Both halves matter: a candidate can gain
   one attribute while losing another the client named.

Failing any of them, the category is left out. A short list of true differences beats a full list
of plausible ones, and if nothing changed the section is absent rather than padded.

### The stated preference comes from the intake, not from the evidence

This is the subtle one, and getting it wrong was a real bug.

The comparison needs to know what the client asked for. Reading that off the previous match's
evidence is tempting and wrong: **a preference only appears in the evidence when the therapist
happened to share it.** Someone who asked for an exploratory therapist and was given a direct one
leaves no communication-style evidence at all, so the preference reads as "they wanted nothing"
and the section goes quiet at exactly the moment it has something true to say — which is the
brief's own example, `Direct · Structured` → `Exploratory · Reflective`.

`signals.statedPreferences(intake)` reads it from the intake, where a stated preference lives.
That is the whole reason it is stored.

### What it says

| Situation                                        | Sentence                                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Newly covers a stated preference, share improved | "You told us the way they talked was not right, and this therapist works more in the Exploratory style you were after." |
| Different, nothing stated for that category      | "This is different here: Gentle." — naming only what is new                                                             |
| Different, but further from what was asked       | "This therapist works differently here, though not in a way you asked about."                                           |
| Identical on both sides                          | _(nothing)_                                                                                                             |
| A category nobody mentioned                      | _(nothing)_                                                                                                             |

Two details that are easy to get wrong and are tested:

**The fallback names only what is genuinely new.** The old behaviour listed the new therapist's
whole attribute set, including attributes they shared with the previous one. The reader has
been told something changed, and most of what followed would not have.

**"More in the _Exploratory_ style" never mentions an unasked-for attribute.** If the new
therapist has `exploratory` _and_ `reflective`, and the client asked only for `exploratory`, the
sentence names `exploratory`. Naming `reflective` would put an adjective in their mouth.

### Availability claims less

"They also overlap with your preferred evening sessions" is said only when the new match has
availability evidence and the previous one did not. When both overlap there is no change to
report — the previous page already said so, and repeating it here would be padding dressed as
news.

### What it never contains

No weight, no score, no rank, no percentage, no count of candidates. Every sentence is a fact
about one therapist's stated attributes, or about an overlap the engine found as evidence, and
both are on the page above it. `whatChanged.test.ts` reads every sentence the module can produce
and fails if one contains a digit beside a comparative, or a word like _learned_, _adapted_,
_smarter_ or _insight_.

---

## When nobody is left

A `200` with `{ outcome: "no_candidate", considered }`, not a `404`. The person asked a question
and "there is nobody else" is the answer to it; a `404` would invite the page to say "not found",
which is a claim about a system rather than a statement about the pool.

**The engine runs anyway.** There is no short-circuit. Every candidate is evaluated with the full
exclusion set, all of them come back `INELIGIBLE` with `DECLINED_PREVIOUSLY`, the pass is
written in full, and the outcome falls out of the engine rather than being special-cased. That
is better on every axis: the pass is a record rather than a gap, there is one code path instead
of two that could disagree, and "we looked and there was nobody" is stored as a decision.

The copy:

> **We've looked through the therapists available to us right now, but couldn't find another fit
> based on what you've told us.**
>
> That is an honest answer rather than a failure. Everyone here has either already been shown to
> you, or does not meet what you marked as important.

The real next step — going back to change the answers and searching again — is real work on the
matching side, so the control is present, focusable, and says so. "Revisit what you told us" is
`aria-disabled` with a hint saying it has not been built yet.

**It is reachable, and quickly.** The demo intake makes Hindi and online requirements, so only
therapists offering both can ever be recommended, and only those can be declined. On the seeded
dataset that is about eighteen people — seventeen rematches, then the pool is empty. The browser
journey reached it without touching the database directly.

---

## The API

### `GET /api/v1/feedback/reasons`

The terms on offer, from the database.

```json
{ "reasons": [{ "key": "communication-mismatch", "name": "…", "description": "…" }] }
```

### `POST /api/v1/matches/:matchId/feedback`

```json
{ "reasons": ["communication-mismatch", "availability-mismatch"], "rawText": "optional" }
```

```
201 { "feedbackId": "…", "matchId": "…", "reasons": ["…"], "recordedAt": "…" }
```

| Status | When                                                                            |
| ------ | ------------------------------------------------------------------------------- |
| `201`  | Recorded, or already recorded — a retry returns the first answer                |
| `400`  | No reasons, a reason we do not offer, a note too long, or an unrecognised field |
| `404`  | No such match                                                                   |
| `503`  | The store could not be reached                                                  |

### `POST /api/v1/matches/:matchId/rematch`

**No body at all.** Not even an empty object, and not a `content-type` — a `POST` that declares
JSON and then has nothing to send is malformed by anyone's reading.

```json
{
  "matchId": "…",
  "decidedAt": "…",
  "attempt": 2,
  "previousTherapistName": "Tara Joshi",
  "therapist": { … },
  "whyThisMatch": [ { "key": "…", "sentence": "…", "detail": "…" } ],
  "whatChanged": [ { "category": "…", "sentence": "…", "detail": "…" } ],
  "adjustedFor": ["communication-mismatch", "availability-mismatch"]
}
```

| Status | When                                                                      |
| ------ | ------------------------------------------------------------------------- |
| `200`  | A new recommendation, or `{ "outcome": "no_candidate", "considered": 0 }` |
| `400`  | A malformed id, or any body at all                                        |
| `404`  | No such match                                                             |
| `409`  | No feedback recorded yet, or a later pass already exists                  |
| `503`  | The store could not be reached                                            |

The `409` for an already-looked-past match is not an error the person can do anything about, so
the answer is the way forward: _"We have already looked past this one. The other person is
waiting."_ and the page steps aside to the recommendation.

### One response shape for both

`POST /matches` and `POST /matches/:matchId/rematch` return **the same schema**, declared once in
`schemas/recommendation.ts` and `additionalProperties: false` on every field. A first match is a
rematch with an empty exclusion set and no feedback, and saying that in the type system is what
keeps the two endpoints from drifting.

Every field is present in both: `attempt` is 1, `previousTherapistName` is `null`, `whatChanged`
is `[]`, `adjustedFor` is `[]`. **The absence of a change is a value to be read, not a field to
be inferred.** A page that has to detect which shape it got is a page that will eventually
render nothing.

---

## What the browser cannot do

Both requests carry one thing: a match id. From it the server derives the client, the intake, the
therapist, the exclusion set, the pass number and the weights. There is **no field** through which
a browser could name a client, name a therapist, add to the exclusion list, submit a weight, or
ask for a particular person.

That is the whole of the security model, and it is structural rather than a list of checks that
could be forgotten. Every one of these is refused with a `400` and a sentence, and every one has
a test:

```
{ "reasons": ["other"], "clientId": "…" }              → 400
{ "reasons": ["other"], "therapistId": "…" }           → 400
{ "reasons": ["other"], "excludedTherapistIds": [ … ] } → 400
{ "reasons": ["other"], "weight": 10000 }               → 400
{ "reasons": ["other"], "score": 100 }                  → 400
{ "reasons": ["other"], "engineVersion": "v9" }         → 400
POST …/rematch  { "score": 999 }                         → 400
POST …/rematch  { "reasons": ["other"] }                → 400
```

> We work out who you saw and who to look for next, from the recommendation itself — so there is
> nothing for you to name here.

**"I don't know that match" and "not your match" are the same answer.** One lookup, one fixed
sentence, no ownership branch to differ on — a caller who could tell them apart would have an
enumeration oracle and could confirm an id exists by asking about someone else's. Not being able
to tell is the feature.

**The reason keys are checked twice**: once in the route, so the refusal can be a sentence, and
once in the service, so a key nobody has a rule for never reaches storage even if the first
check is bypassed. A reason the vocabulary does not hold resolves to nothing, so a browser cannot
invent a matching signal by sending a string the database has never heard of.

**No response leaks anything.** No `score`, no `rejectionCode`, no `engineVersion`, no `weight`,
no `increments`, no `ordinal`, no `%`, no candidate list, no exclusion list, no declined
therapist's id, no client or intake id, and nothing the client wrote. `previousTherapistName` is
a name the client already saw and already turned down — it is what makes "someone else" mean
anything — and no identifier travels with it.

---

## The interface

### The copy

The recommendation offers a secondary action, and the words matter:

> **I'd like another option**

Not "reject therapist", not "dislike", not "bad match". A person who has decided this is not for
them has not assessed the person on the other side of it, and a word that says they have is both
untrue and a small cruelty.

The feedback page:

> **Tell us what didn't quite fit.**
>
> Your feedback helps us look for something different next time.

And the rematch recommendation:

> **Based on your feedback**
>
> **We found someone else you might connect with.**
>
> We took your feedback into account, and this is who came out of it.
>
> _Someone other than Tara Joshi._

Not "improved". Not "a better match". Not "a more suitable therapist" — because none of that is
what happened. A set of weights moved, a person was removed from consideration, and the engine
ran again. The sentence names the cause without inflating it, and the section below does the
showing.

### Not a complaint form

The feedback page has one delicate job, and the styling is the substance of it, not decoration.

- **No red, no stars, no thumbs, no rating control of any kind.** Every reason is an independent
  checkbox; there are no radio buttons, because a radio forces a single verdict and the opposite
  of that is the point.
- **No "reject", "dislike", "bad match", or any other judgement of the person.** Asserted on the
  rendered text, so a future copy edit cannot reintroduce it unnoticed.
- **The same calm rule and tint** every other choice in the intake uses. A page that looks like a
  form to be filled in is one people fill in perfunctorily.
- **The note is optional and never required**, and a note _on its own_ is a real answer — which is
  why "pick a reason" is a check that accepts a reason, a note, or both.
- **Nothing is sent until they choose to send it.** The reasons sit in the browser until then.
- **Generous whitespace**, and `max-w-measure` throughout, because a 320px screen with a
  full-width paragraph is four words a line.

### "What changed this time" is a section, not a panel

A small uppercase label in the same letterspaced treatment as every other section, and a list of
sentences in the same serif as everything else. Hairline markers, not bullets and not ticks.

Not a panel, not a card, not a tinted box, not an alert. A section that looked like a
notification would be claiming something louder than it can support — the differences are real,
but they are three sentences about a person, not an alert. And it is **not rendered at all** when
the server sent nothing.

### Accessibility

Verified in a real browser at 320, 390, 834 and 1440, and by keyboard alone.

- Every reason is a real `<input type="checkbox">` inside its label, so arrow keys, form
  submission and assistive technology work without being reimplemented.
- The reasons are in a `<fieldset>` with a `<legend>`, and an inline problem message is wired to
  it with `aria-describedby` — so a screen reader is told _why_ the list was refused.
- Space toggles a reason with no pointer. The selected state is a clay rule, a clay tint **and**
  a mark, never colour alone.
- **Every focusable control has a visible focus ring.** This one was a real fix: the checkbox is
  `sr-only`, so the browser drew its ring on a one-pixel invisible box and the only indicator was
  a one-pixel border colour change. `.focus-within-ring` gives the wrapping label the same 2px
  clay outline the rest of the product uses. A focus treatment written out separately in four
  places is a focus treatment that will be thinner in one of them.
- Targets are 87px tall (reasons) and 55px (submit). Comfortable, not merely legal.
- The waiting state announces politely with `aria-live="polite"`, says what it is doing, and
  claims no intelligence, no learning, and no scan. No countdown, no progress bar, no percentage,
  no numbered stage: the whole search is milliseconds and there is no stage to count.
- A submit in flight is `aria-disabled` and **also guarded in the handler**. `aria-disabled` is a
  description, not a mechanism; the native form submit does not consult it, so two fast clicks
  would send two. The server collapses that to one row, but the page should not be relying on the
  server to save it from asking twice.
- Under `prefers-reduced-motion: reduce` the breathing rule does not run.
- `unavailable` controls are `aria-disabled` with a described hint rather than `disabled`, so
  they stay focusable and stay announced. A control that silently cannot be used is worse than
  one that says why.

### Two bugs the browser found

Worth recording, because neither was visible in a unit test.

**A "has started" ref guard made the page hang.** `MatchingPage` guarded its effect with a ref so
a second search could not run. Under React's Strict Mode the effect is invoked, cleaned up and
invoked again on the _same_ mount — so the guard stopped the second run while the first run's
cleanup had already aborted its request. The page sat on "one moment" having finished zero
searches. Running the effect freely is the correct pattern, and the duplicate it permits in
development is safe at every layer below: the server treats a second request for the same match as
a retry and answers with a pointer to the pass that already exists.

**The match route was never given the feedback store.** So after a rematch, reloading
`/recommendation` showed the right person with a `null` previous name and an empty "what changed".
The framing was in the browser's memory and nowhere else.

---

## Privacy

- **Feedback text is never logged.** Neither is intake text. Verified by scanning every key that
  has ever appeared in a log line: `level`, `time`, `pid`, `hostname`, `msg`, `reqId`,
  `req.method`, `req.url`, `req.host`, `req.remoteAddress`, `req.remotePort`, `res.statusCode`,
  `responseTime`. Zero request bodies, zero headers, zero payloads.
- **Feedback is never read.** `Feedback.text` and `Intake.rawText` are stored, never parsed, never
  a matching input, and never logged.
- **Feedback is not exposed to anyone.** It is reachable only through a match id, and a response
  contains no client id, no therapist id, and nothing the client wrote.
- **No other candidate is exposed.** Not in a response, not in a log line, not in an error.
- **One tab's worth of state.** `wtm.intake.receipt.v1` holds an intake reference and a timestamp;
  `wtm.match.current.v1` holds a match id, a name the person has already been shown, a pass
  number, and the id and name of the match it replaced. "Start over" clears both. A prototype
  with no account should leave nothing behind, and it does.

---

## Tests

```
274 API unit       23 new for the feedback→signal rules, 19 for the engine, 16 for
                   "what changed", 34 for the two endpoints, 21 against a real database
376 web            26 for the feedback page, 25 for the matching step, 16 for the API
                   client, and 11 more on the recommendation page
 65 database       24 new: history, exclusion scope, cascades, and the read-back
```

A few worth naming, because they are the ones that would notice a real regression:

| Test                                                                              | What it protects                                               |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `never turns any complaint into a requirement`                                    | A boost stays a weight, on every category, at once             |
| `still eliminates on a requirement, even after the same category is boosted`      | Language and format are both a gate and a weight, and coexist  |
| `keeps a requirement outranking every preference after any feedback`              | The bonus is above the _boosted_ ceiling, not the base one     |
| `still builds the same evidence, whatever the feedback said`                      | A weight is the only thing that moved                          |
| `does not escalate a boosted preference into a requirement`                       | A candidate with none of the stated style stays `ELIGIBLE`     |
| `does not treat "I did not feel understood" as a style signal`                    | A report about an interaction is not a claim about a person    |
| `does not depend on the order reasons were ticked in`                             | The result cannot depend on a mouse                            |
| `says a more exploratory style when that is moved`                                | The brief's own case, with the preference read from the intake |
| `claims nothing when the new therapist has moved *away* from what they asked for` | "Different" is true, "better" is not                           |
| `never mentions a score, a weight, a rank or a percentage`                        | Every sentence the module can produce, read and checked        |
| `never claims to have learned anything`                                           | The word this product is most careful about                    |
| `still reports who that pass recommended, and its evidence`                       | The `DECLINED`-only read-back bug                              |
| `names who the client came away from, so the framing survives a refresh`          | The unwired feedback store                                     |
| `refuses a client id, a therapist id, an exclusion list, a weight, a score`       | The whole security model, structurally                         |
| `says it is sending, and does not let it be sent twice`                           | `aria-disabled` is not a mechanism                             |
| `still finds someone when the effect is invoked twice, as Strict Mode does`       | The ref-guard hang                                             |

The browser journey confirmed the loop end to end: three rounds, three different people, the
previous therapist never reappearing, the evidence-backed "what changed" sentence, and a reload
that preserved the whole framing.

---

## Limitations

**"Took your feedback into account" is a narrow claim, and deliberately so.** Two mechanisms
cover it: a set difference, and a re-weighting with a ceiling. There is no model, nothing is
stored about the client beyond this journey, and the same intake with the same feedback always
produces the same next person. If the product ever says "learned" or "adapted to you", it will be
wrong, and a test in `whatChanged.test.ts` and on the recommendation page fails if it does.

**The system does not learn what someone wanted instead.** Nobody has told it. It weights what
was already stated and removes what was declined, which is the whole of what it can honestly
do. A person who said "the communication style wasn't right" and meant "reflective" will get
someone who is not direct, and may have to say so again.

**The weights are not clinically validated.** They are a documented prototype heuristic. No
category weight, no boost, and no increment in this document has been tested against any
outcome, and none of them should be described as if it had.

**No reason reaches a therapist's quality.** Nothing here is evidence about anyone's competence,
and nothing in the schema can express it. That is a property of the model, not a convention
about how to phrase things.

**"I did not feel understood" removes a person and stops there.** The honest response to not
feeling understood is to be more careful about whom you see next, not to guess at an attribute
that would eliminate candidates on someone's behalf.

**The free-text note is stored and never used.** It is there because a product about being heard
should not require a checkbox for everything. It is not analysed, summarised, or shown to anyone,
and it will not change a single search.

**`POST /matches` cannot distinguish "this intake has a second pass" from "this intake is
ready".** Both return a recommendation. A caller wanting the journey's history would need a
read-only endpoint, which this phase does not add — the browser holds what it needs in
sessionStorage and the database holds the rest.

**No geographic matching**, so no `location-mismatch` reason — see above. The `location` field is
a display string, and treating it as a filter would be the beginning of something this product
does not want.

**The exclusion scope is the journey, which means a determined person can exhaust the pool.** On
the seeded dataset that takes about eighteen declines for a Hindi-and-online intake. That is a
property of a fifty-person dataset, not a product decision, and a real deployment would be
expected to have a larger pool. It is also why the "nobody left" state exists and says something
honest rather than looping.

**The engine version is `v1` throughout.** Feedback changed the scoring's inputs, and
`engineVersion` records which rules produced a row — so a stored match remains attributable, and
a stale one recognisable. Bumping it is a decision, not an accident, and it has not been made.

**"This feels right" is still not built.** Recording that a match felt right is the obvious next
step, and it is the one piece of this loop with no honest placeholder other than a control that
says so. `/rematch` is still a placeholder for the same reason.
