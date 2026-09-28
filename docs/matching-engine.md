# The matching engine

How a stored intake becomes one recommendation, why the reasoning can be read back, and where
the honest limits are.

The short version: **ten named stages, integer arithmetic, structured evidence, and sentences
that are a function of that evidence and nothing else.** A person can read the record and see the
same reasons the page gave them.

---

## 1. What this engine is, and what it is not

It takes what someone told us and a list of therapists with structured attributes, and answers one
question: _of the people here, whose own stated attributes overlap most with what this person
asked for?_

It is a deterministic, inspectable lookup. Specifically:

| It does                                                              | It does not                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Compare seven families of structured attribute                       | Infer anything from a name, a postcode, a biography, or a free text |
| Apply the client's stated requirements, and only those               | Decide what someone's requirements are beyond what was stored       |
| Produce evidence: a named overlap, on both sides                     | Produce a score anyone can see, or a rank, or a percentage          |
| Order candidates reproducibly                                        | Randomise, or read a clock, or call out to anything                 |
| Say why, in the product's words, from the evidence alone             | Generate, infer, or embellish a reason                              |
| Store every candidate it considered, including the ones it set aside | Hide how many it considered, or who they were                       |

**The numbers are a prototype heuristic.** Nothing about the weights in
[`weights.ts`](../apps/api/src/data/matching/weights.ts) has been studied, validated, or tested
against any outcome. A high score is not a better therapist. It says only that one person's
structured attributes overlapped more with another person's questions on one day. That is why the
score is never sent to a browser, never displayed, and never described — and why the evidence,
not the number, is the product.

**The weights are integers.** There is no floating point anywhere in the scoring path, so a score
cannot drift between two runs on different hardware. A number that is supposed to be reproducible
has to be reproducible.

---

## 2. The pipeline

Ten stages, each a separate export, each separately testable. The brief asked for a pipeline rather
than one large function, and the reason is not tidiness: a matching engine is exactly the sort of
thing that later acquires a special case, and a special case in a 400-line function is unfindable
while a special case in a 30-line stage with its own tests is not.

| #   | Stage                     | Where                                  | What it does                                                            |
| --- | ------------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Load the intake           | `MatchRepository.loadMatchableIntake`  | The intake, joined with the preference set **that intake produced**     |
| 2   | Normalise to signals      | `signals.ts`                           | Stored rows → sorted, de-duplicated keys, plus the derived requirements |
| 3   | Retrieve candidates       | `MatchRepository.listCandidates`       | Every therapist, with every structured attribute, in a fixed order      |
| 4   | Apply hard requirements   | `evidence.ts` → `evaluateRequirements` | Eliminate, and record which condition was missed and which keys         |
| 5   | Evaluate soft preferences | `evidence.ts` → `buildEvidence`        | One evidence item per overlap                                           |
| 6   | Compare availability      | `availability.ts`                      | Real overlap across two timezones, in a shared week                     |
| 7   | Produce evidence          | `evidence.ts` → `buildEvidence`        | Score, and a fixed order for the evidence                               |
| 8   | Order deterministically   | `ordering.ts`                          | Four keys, the last one total                                           |
| 9   | Select a recommendation   | `ordering.ts` → `selectRecommendation` | The highest ordered eligible candidate, promoted in place               |
| 10  | Persist                   | `MatchRepository.saveRun`              | Every candidate and its evidence, in one transaction                    |

Stages 4 to 7 happen in a single fold over the candidates, because doing them separately would mean
holding every candidate's evidence in memory at once for no reason. The engine is a fold, and saying
so keeps it honest.

**Every candidate is evaluated.** There is no "top 10 by score" query, because the score is computed
in application code and cannot be pushed into SQL. Evaluating all fifty is what makes the result
independent of any query's `take`, and therefore reproducible.

---

## 3. Requirements and preferences

This is the single most consequential judgement in the engine, so it is stated plainly rather than
inferred from `required: true` flags scattered around the code.

**A requirement eliminates. A preference only weighs.** The whole difference is that.

### What is derived, and why

| Signal                | A requirement when…                             | Why                                                                                                                                                                                        |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Languages             | **at least one** of the selected languages      | A session in a language neither person speaks cannot happen. A _disjunction_, not a conjunction: someone who selected Hindi and Tamil was not saying they would refuse a session in Tamil. |
| Session formats       | **at least one** of the selected formats        | The same shape. "Either is fine" — which the intake stores as _both_ formats — therefore excludes nobody, which is correct for the answer given.                                           |
| Areas of work         | never, unless the set is marked as requirements | No one has ever said "I will only see someone whose profile lists this area". Inventing that rule would set people aside for something they never asked.                                   |
| Conversation style    | never                                           | Style is how the work feels, not whether it can happen.                                                                                                                                    |
| Contextual experience | never                                           | The intake question is explicitly optional and asks what would _help_, not what is mandatory.                                                                                              |
| Availability          | never                                           | A rough sense of a week is a preference. A therapist being free elsewhere is not a reason to set them aside.                                                                               |

Only two conditions can eliminate a candidate, so there are only two rejection codes
(`NO_SHARED_LANGUAGE`, `NO_ACCEPTED_SESSION_FORMAT`). That is a deliberate constraint rather than a
gap: a prototype should be unable to set someone aside for a reason nobody wrote down, and adding a
third code is the moment someone has to justify the new rule.

### `PreferenceKind` is honoured, not decorative

`ClientPreference.kind` is carried through unchanged and is the difference between "I would like a
shared language" and "I need a shared language". When the set is `REQUIREMENT`, every listed area,
language and format becomes an `ALL_OF` requirement. That is the honest reading of someone who says
"these are conditions, not preferences", and it is what the column is for.

Phase 4 always stores `PREFERENCE`, so the permissive derivation above is what runs today. A later
phase that lets someone insist on specific things will set the column and this path will already
be there and tested.

### Two answers that are easy to get wrong

**"I'm not sure yet" is not an empty answer.** `openToGuidance` suppresses communication-style
evidence entirely rather than leaving the list empty. The client did not say style does not matter;
they said they do not know yet, and scoring a candidate down for it would be answering a question
they declined to answer. It is a real answer and the engine treats it as one.

**A missing preference is not a reason to eliminate.** Absence of a match is not evidence of a bad
fit, so it produces no evidence and no elimination. A record that listed everything that _didn't_
overlap would be a list of accusations.

---

## 4. The weights

Two parts, and only two. Both in [`weights.ts`](../apps/api/src/data/matching/weights.ts).

**Requirements are flat.** A satisfied requirement is worth `REQUIREMENT_BONUS`, and there are at
most two. Flat, because a requirement is not a matter of degree: a session in a shared language
either happens or it does not, and half-credit would be a strange thing to show anyone. The amount
is set above the sum of every category maximum, so the property is arithmetic rather than a hope: a
candidate who meets what the client insisted on always outranks one who merely shares more
interests, however many interests there are. A test asserts the inequality.

**Preferences are a proportion, capped.** For each category the client actually asked about:

```text
floor( MAX_CATEGORY_SCORE × matchedKeys / keysTheClientChose )
```

A _proportion_, so "matches three of the three areas you named" cannot be beaten by "matches six of
the six areas you named" by asking more. Capped, so no single category can dominate. A client who
asked for nothing in a category scores nothing in it — there is nothing to have matched.

| Category                | Max                          | Why this number                                                                        |
| ----------------------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| `AREA_OF_WORK`          | 50                           | "I want help with this" is what people most often mean                                 |
| `CONTEXTUAL_EXPERIENCE` | 50                           | "You have been here too" is the other thing people most often mean                     |
| `COMMUNICATION_STYLE`   | 40                           | Important, but a matter of taste                                                       |
| `THERAPEUTIC_APPROACH`  | 30                           | A description of method rather than of fit. Also: the intake does not ask about it yet |
| `LANGUAGE` (preferred)  | 30                           | Real, and not discounted below session format — a preferred language is specific       |
| `SESSION_FORMAT`        | 20                           | The weakest signal here, because this phase does no geographic matching                |
| `AVAILABILITY`          | 0 + 20/day, capped at 3 days | A rough sense of a week; every extra shared evening is not a closer fit                |

**Years of experience is not used.** It is not a signal about fit, and using it would be the easiest
way to accidentally build a seniority ranking. The schema says so and the engine means it.

---

## 5. Availability, in a common temporal representation

[`availability.ts`](../apps/api/src/data/matching/availability.ts) is the only part of the engine
where a shortcut would be a lie, so it is worth naming the shortcut: compare the client's "Tuesday
19:00–21:00" against the therapist's "Tuesday 18:00–20:00" and check whether the clock times
overlap. That is wrong for every pair of people in different zones, and wrong in a way that looks
right — which is the dangerous kind of wrong.

A recurring weekly window is a statement about a **wall clock**, so it has no single meaning until
it is pinned to an instant. This module pins both sides, intersects, and reports the result back in
each person's own frame.

**1. One absolute week, shared by both sides.** The week boundary is fixed in UTC. Both people's
windows are located inside that same week, so "Tuesday" is one Tuesday for everyone. This is the
step a naive implementation misses: anchoring each side to _its own_ local Monday puts the two weeks
up to a day apart and invents overlaps that are twenty-four hours out.

**2. Local minutes from a single epoch.** `localMinutesIntoWeek` is a pure function of (zone,
instant): the zone's own clock reading, expressed as minutes past a fixed Monday. Because the epoch
is one absolute instant, the function is comparable across zones.

**3. Wall clock to instant, using the offset that applies _there_.** Solved by fixed-point iteration
against the function above, because the offset that governs a local time is the offset at that local
time — which is precisely what a DST transition makes circular. Each pass corrects by the exact
minute discrepancy, so real zones settle in two.

**4. A local time a DST jump skipped does not exist.** Rather than snapping it to a neighbour, the
window is reported absent for that week: "you are free at 02:30" is not something anyone can act on
in the week the clock does that.

**5. Intersect as intervals, not as clock times.** Two windows that merely _touch_ — one ends
exactly when the other begins — do not overlap. There is no session in that instant, and reporting
one would be a promise nobody could keep.

**6. Compare both seasons.** A wall-clock window maps to different instants in January than in July,
so the whole comparison runs twice and the results are merged. This is the case a single reference
week gets wrong: a client who is free Wednesday evening in Kolkata and a therapist who is free
Wednesday afternoon in London overlap for one hour in January and for ninety minutes in July, and
those are two different real arrangements.

**7. Report in both frames.** The surviving instant is read back on each person's clock, so the
sentence can name a time the client recognises _and_ a time the therapist would recognise, and the
two provably refer to the same moment. The tests assert exactly that, by converting each side's
reading to UTC minutes-of-day and requiring them to be equal.

### What the reference week is, and why it is a constant

Not `Date.now()`. A match computed today and the same match computed next year have to be the same
match, and an engine that reads the clock cannot promise that — a zone that changed its rules would
silently change past results. The year is a constant (`2027`), deliberately in the future so the
reference sits comfortably ahead of the data without depending on today.

The reference weeks are **overridable**, and that exists for one reason: the default weeks sit in
January and July, so neither contains the Sunday on which a zone actually changes its clocks.
Pointing the comparison at the week of a transition is the only way to prove that a skipped local
hour is treated as absent rather than quietly moved — which is the behaviour most likely to rot
unnoticed.

### A zone nobody can read is a gap, not an answer

`findAvailabilityOverlaps` returns `zonesUnresolvable` separately from an empty list of overlaps,
because "we compared and found nothing" is information and "we could not compare" is a gap. A
timezone the runtime cannot resolve is **never** a reason to set a candidate aside. The intake
accepts an IANA name by pattern, which checks the shape of the string rather than looking it up, so
an unresolvable name is a real possibility and has to be handled as one.

---

## 6. Evidence

An evidence row is **self-contained on purpose**: reading it must never require going back to the
intake or the profile to work out what it meant. That is what lets a stored match answer "why did
you recommend this?" years later, and what makes the explanation testable — the sentence is a
function of these rows and nothing else.

```text
category          LANGUAGE | SESSION_FORMAT | AVAILABILITY | AREA_OF_WORK | …
kind              REQUIREMENT | PREFERENCE        (mirrors PreferenceKind)
clientKey         the vocabulary key the client named, e.g. "hi"
therapistKey      the vocabulary key the therapist offers, e.g. "hi"
explanation       which sentence this licenses — the whole vocabulary of reasons
weight            in tenths. Internal only; never leaves the engine.
overlap*          availability only: the shared slot in both people's local frames
ordinal           position in the engine's fixed order, so a read is ordered too
```

The `overlap*` columns are filled for `AVAILABILITY` and null for everything else, so a row's shape
is unambiguous from its columns alone. That invariant is asserted by a test rather than left to a
reader to infer.

**No prose is stored.** An explanation is generated from the keys at read time, so a stored match
always reads in the _current_ wording and a stored sentence can never drift away from the facts that
produced it. Changing the wording of an explanation is a code change that improves every match ever
recorded.

---

## 7. From evidence to a sentence

[`explanations.ts`](../apps/api/src/data/matching/explanations.ts) is total over the explanation
vocabulary: every possible reason has a case, so a new reason is a type error until someone has
decided what it is.

| Key                     | Sentence                                                                   |
| ----------------------- | -------------------------------------------------------------------------- |
| `REQUIRED_LANGUAGE`     | "They speak Hindi, one of the languages you chose."                        |
| `PREFERRED_LANGUAGE`    | "They also speak Tamil."                                                   |
| `AREA_OF_WORK`          | "You said you wanted support with work and career, and they work with it." |
| `COMMUNICATION_STYLE`   | "You wanted someone who helps you explore things."                         |
| `THERAPEUTIC_APPROACH`  | "Their way of working is Integrative."                                     |
| `CONTEXTUAL_EXPERIENCE` | "They have direct experience with the Indian diaspora."                    |
| `SESSION_FORMAT`        | "They see clients online."                                                 |
| `AVAILABILITY_OVERLAP`  | "You are both free on Tuesday 18:00–20:00 your time."                      |

**The hand-written phrases beat the database's own name.** The vocabulary holds an internal taxonomy
— "Career transitions", "Burnout" — which is right for a column heading and wrong for a sentence. An
explanation uses the words the product uses: "work and career", "feeling overwhelmed". The phrases
are scoped by category, because `exploratory` is both a conversation style and a therapeutic approach
and the two need opposite treatment — as a style it becomes "someone who helps you explore things",
while as an approach it must stay the plain word, because a sentence claiming someone _is_ that, as
a method of therapy, is a clinical claim nothing here supports.

A key with no phrase falls back to the database's name, so a term added to the vocabulary next month
produces a readable if plainer sentence rather than a blank.

**What a sentence must not do**, and there is no code here that does any of it:

- **No ranking.** No sentence in that file compares two therapists, because a comparison requires
  naming the other one, and naming the other one is the marketplace this product argues against.
- **No clinical claim.** Nothing says a therapist will help, that an approach works, or that
  anything is better than anything else.
- **No inference.** "Their experience includes the Indian diaspora" is only ever written for a
  therapist who _stated_ that context about themselves.

---

## 8. Which reasons are shown

A candidate can match on seven attributes. Showing all seven is not an explanation — it is a data
dump that hands the ranking back to the person, which is the one thing this product exists not to
do. So the engine records everything and the product shows a few.

Three deterministic rules, in order:

1. **Requirements before preferences.** A condition the client insisted on is the reason to believe
   the rest, and the only thing here that is not a matter of taste.
2. **Then `EXPLANATION_PRIORITY`**, which follows `CATEGORY_MAX_SCORE` down the tiers: requirements,
   then preferences strongest first, then availability, then session format. Availability sits late
   on purpose — a recommendation whose reasons are mostly about evenings is a recommendation about
   scheduling.
3. **Then at most two per category.** Without this, availability alone could fill a five-item list
   with five slightly different Tuesdays.

The final tie-break is the evidence key, so two items that tie on all three never swap places
between runs. A ceiling of five, because a list of every overlapping attribute is a data dump.

Two subtleties worth reading twice:

- **Session format is the lowest-scoring category and still shows early.** The intake always treats
  a chosen format as a requirement, so any session-format reason is a _requirement_ and is sorted
  into tier 1 by strength. That is right: someone who said "online only" wants the practical thing
  settled before they hear about areas of work. Strength answers "was this insisted on";
  `EXPLANATION_PRIORITY` answers "how interesting is it"; and a requirement is interesting whatever
  it is.
- **Availability often does not appear at all.** When someone really does share everything that was
  asked for, the five slots fill with preferences and the page never has to talk about evenings.

---

## 9. Ordering, and the tie-break that matters

Four keys, in order, and the last one is total:

| Key                    | Direction | Why                                                         |
| ---------------------- | --------- | ----------------------------------------------------------- |
| score                  | desc      | The compatibility figure. An ordering aid, nothing more     |
| requirements satisfied | desc      | Meeting what was _insisted on_ beats sharing more interests |
| evidence items         | desc      | Then the broader overlap                                    |
| therapist id           | asc       | The tie-break that makes the order total                    |

On that last key: an id is arbitrary, and that is the point. Every key above it is meaningful and two
candidates can still tie on all of them, and something has to decide. An arbitrary-but-_fixed_ rule
is better than an arbitrary-and-varying one, because a stable order means the same intake always
produces the same recommendation — which is what a person asking "why this one?" is entitled to.

No randomness is used anywhere, and no clock is read. The tests assert that a second run, and a run
with the candidates in reverse order, produce byte-identical results.

---

## 10. What is stored, and what is not shown

**A `Match` is a candidate evaluation, not the recommendation.** Every therapist the engine
considered gets a row, including the ones it eliminated and why. A recommendation is a row with
`RECOMMENDED`; there is no separate table, because it would hold nothing but a pointer back.

Storing all fifty rows is what makes the engine inspectable afterwards, and it costs rows rather
than complexity. A run that stored one row would answer "who did you consider?" with nothing.

```text
matches            one row per candidate: status, rejectionCode, score, engineVersion
match_evidence     as many rows as there are reasons, each self-contained
```

**An intake is evaluated exactly once.** `@@unique([intakeId, therapistId])` is the whole of the
duplicate-submission safety: a retry cannot write twice, because twice is not a shape this table has.
The engine is deterministic, so re-running on the same answers could not produce a different result,
and recording a second set of rows would imply it might. The service therefore returns a stored
decision rather than running again, and the database test fires three concurrent requests at one
intake and requires one answer.

`engineVersion` is on every row because matching logic _will_ change, and a result has to be
attributable to the rules that produced it or it can be neither explained nor recognised as stale.

**Never sent to a client:** the score, the rank, the engine version, the rejection codes, the number
considered, any other candidate, the internal weights, the intake id, the client id, and anything the
client wrote. The response schemas declare `additionalProperties: false`, so a field added on that
side fails the API's own tests rather than quietly reaching a browser. A product arguing against
being a marketplace should make that structurally true rather than a matter of remembering.

The therapist's `id` _is_ sent, for one stated reason: the profile page needs it to link, and
`GET /therapists/:id` is already public. It is a link, not a ranking.

### The internal representation

`CandidateTrace` carries the name, eligibility, rejection code, internal score, the evidence keys and
the requirement outcomes for **every** candidate, including the eliminated ones. It is deliberately a
separate type from `CandidateEvaluation`, which is what leaves the engine. A reviewer tool, a test
and a `console.log` all want that detail; none of it is appropriate in an HTTP response, and keeping
the two apart is what stops "just add the score to the response" from ever being a small change.

It is built and returned today. Nothing renders it yet, and nothing should until a reviewer screen
exists to hold it.

---

## 11. The API

```http
POST /api/v1/matches
{ "intakeId": "…" }

200 → { matchId, decidedAt, therapist: { … }, whyThisMatch: [ { key, sentence, detail } ] }
200 → { outcome: "no_candidate", considered: 50 }
400 → that is not a reference we have
404 → we do not have an intake with that reference
503 → we could not reach where matches are recorded
```

**The body is `{ intakeId }` and nothing else.** There is no way to ask "does this therapist match
me?", because that would put the decision in the place it must not be. A caller who wants to know
whether a given therapist would have been recommended can read the stored run, which records every
candidate including the ones set aside — for a human reviewer, not for a browser.

An unknown field is refused with a sentence rather than ignored, because Fastify's validator
_strips_ additional properties rather than rejecting them, and quietly discarding a `therapistId`
while answering for someone else would be the worst possible failure mode for this endpoint. The
app sets `removeAdditional: false` so every declared schema means what it says.

**Nothing qualifying is a `200`, not a `404`.** Nobody asked for a resource that is missing; they
asked a question, and the answer is "not yet, and here is why". A `404` would invite a page to say
"no therapist found" instead of explaining the conditions.

**The explanations are built from rows read back out of storage**, not from the objects the engine
returned. That is what proves the record and the page agree: a mapping mistake between the two would
otherwise produce a page the stored record contradicts, and nobody would find out until a person
asked why.

### How an intake is matched against its own answers

Phase 4 keeps exactly one preference set per client and replaces it on every submission, so an older
intake's answers used to be gone. Matching it against the newer set would produce a confident
explanation of something the person is no longer asking about, and two intakes written in the same
millisecond have no meaningful order at all — so a timestamp cannot fix it.

`ClientPreference.intakeId` stores the link. A match reads the preference set _that intake
produced_, so an older intake is explained by its own answers, and the database test asserts that a
Tamil answer given in a _later_ submission does not appear in an earlier intake's explanation.

The column is nullable and the repository falls back to the client's most recent set for rows that
predate it, which is what it would have used before the link existed.

---

## 12. The seeded demo scenario

A client who wants **Hindi, exploratory conversation, the Indian diaspora, and weekday evenings**,
answered through the real flow in a real browser. The engine returns a recommendation whose reasons
are exactly the overlaps the seeded therapist's own attributes contain:

> They speak Hindi, one of the languages you chose.
> They see clients online.
> You said you wanted support with work and career, and they work with it.
> You said you wanted support with relationships, and they work with it.
> They have direct experience with the Indian diaspora.

Verified against the wire, not just the rendered page: the response body contains no `score`, no
`rejectionCode`, no `engineVersion`, no percentage, no second therapist, no intake or client
identifier, and nothing the client wrote. The API's own log output for the whole flow contains
request ids, methods, urls and status codes — and no query text and no intake payload, because Prisma
is configured to log `warn`/`error` events only, never query arguments.

Three candidates in the seed satisfy Hindi + exploratory + Indian diaspora. The one the engine chose
has direct/structured/warm rather than exploratory, and the page does not pretend otherwise: the
profile section says "Direct · Structured · Warm" in plain sight, and the reasons are only the ones
that genuinely held.

---

## 13. Limitations

Stated plainly, because a prototype that hides its limits is not demonstrating the thing it claims.

- **The weights are a guess.** Not clinically validated, not evidence-based, not tested against any
  outcome. They are a defensible ordering, and they are documented so they can be argued with.
- **Requirements are inferred, not asked for.** The intake asks what someone _prefers_; the engine
  derives two requirements from the questions it requires. A future phase that lets someone insist
  on specific things sets `ClientPreference.kind` and the `ALL_OF` path is already there.
- **No geographic matching.** "In person" is recorded, scored lowest, and unused: this phase does not
  consider where anyone lives. That is the single largest gap between this and a real service, and
  the reason session format scores as low as it does.
- **No clinical matching at all.** Nothing here considers diagnosis, condition, severity, or
  presenting difficulty, and no therapeutic approach is described as better than another. Contextual
  experience is a therapist's _stated_ experience, never an inference from a name or a place.
- **Availability is a weekly pattern, not a calendar.** A recurring window cannot know about
  holidays, sickness, or a therapist who is away in March.
- **Two reference weeks.** A zone with an unusual DST rule, or a rule that changed recently, might
  have an offset on some day that neither January nor July exercises.
- **One recommendation, and no way to ask for another.** Rematching is the next phase. The control is
  present, focusable, and says it is not built yet.
- **Fifty candidates.** The engine is a fold, so it scales, but the seed is small and nothing about
  the _presentation_ has been tested against a genuinely long list — because a list of fifty would
  not be shown anyway.

## 14. Where this goes next

| Question a reviewer will ask                            | Answered today by                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| Why this person, and not another?                       | The stored run: every candidate, its score, its evidence, its eliminations |
| What does "highly compatible" mean?                     | Nothing on the page. The number exists and is never sent                   |
| Who else did you consider, and why were they set aside? | `Match.status` and `Match.rejectionCode`, one row per candidate            |
| Which algorithm produced this?                          | `Match.engineVersion` on every row                                         |
| Can this decision be reproduced?                        | Yes — the engine is pure and a second run is byte-identical                |
| Can a client ask for someone else?                      | No. Not built, and the control says so                                     |
| Can someone be told they are a poor fit?                | No. The engine can decline to recommend, and nothing else                  |
