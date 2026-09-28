# Domain model

The reasoning behind [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma): what each
entity is for, what it deliberately does not carry, and which fields exist to make a future
recommendation _explainable_.

The organising question for this phase is not "what does a therapist have?" but:

> When the system eventually recommends someone, **what would it need to have known** to explain
> itself honestly?

Everything below is in service of that.

---

## 1. The rules that shaped the model

**1. Matching attributes are structured, never free text.**
A future explanation reads like _"Ananya speaks Hindi and English, works reflectively, and has
direct experience of first-generation professional families."_ Every one of those claims has to be
a fact we hold, not a string we would have to parse. So the lists that matching depends on are
normalised lookup tables, and there is not one JSON column in this schema.

**2. Curated vocabularies are tables; closed mechanics are enums.**
Languages, approaches, areas of work, communication styles, contextual experience, session formats
and feedback reasons are **tables**: they have names and descriptions that a person reads, they grow
with curation, and they are safe to join against. Day of week, preference strength and match
sentiment are **enums**: they are small, closed, mechanical, and carry no wording of their own.

**3. Nothing sensitive is inferred, ever.**
Contextual experience — diaspora, relocation, international students, family expectations — is
data a therapist has _stated about themselves_. It is never derived from a name, a place, a
language, or a sentence someone typed. The schema cannot do this by accident, and
`docs/architecture.md` and the code comments say so where it matters.

**4. "Areas of work" are life situations, not diagnoses.**
`career-transitions`, `grief-and-loss`, `family-dynamics` are things people bring. They are not
symptoms, and the model has nowhere to put a diagnosis.

**5. A therapist's identity is separate from their profile.**
`Therapist` is a stable row; `TherapistProfile` is the presentable, matchable version of it. A
correction, a rewrite, or a rebuilt profile never changes who someone is, and a future
recommendation can point at a person rather than at a snapshot.

**6. Store the smallest thing that is still true.**
A client here is a UUID and two timestamps. That is a deliberate constraint, not an oversight —
see §3.

---

## 2. Entity reference

### `Client`

| Field       | Why it exists                                       |
| ----------- | --------------------------------------------------- |
| `id`        | Stable handle for a person's session of the product |
| `createdAt` | When they arrived                                   |
| `updatedAt` | When anything attached to them last changed         |

**No name. No email. No phone. No address. No demographics.** Not because they are hard, but because
none of them are needed: matching runs on preferences, and the only thing a person says in their own
words lives in `Intake` where it can be reasoned about and deleted. A client row that cannot
identify anyone is also a client row that cannot leak.

### `Therapist`

`id`, `createdAt`, `updatedAt`. Nothing else. It is the stable identity that `TherapistProfile` and
future `Feedback` and `Recommendation` rows point at.

### `TherapistProfile`

One per therapist (`therapistId` is unique).

| Field                  | Why it exists                                             | Supports                 |
| ---------------------- | --------------------------------------------------------- | ------------------------ |
| `displayName`          | How a client should address them                          | reading                  |
| `headline`             | One line of positioning — the thing a person reads first  | reading                  |
| `bio`                  | The person in prose, written by them, not assembled by us | reading                  |
| `location`             | A coarse human place ("Bengaluru, India")                 | reading, coarse matching |
| `timezone`             | **IANA zone**, e.g. `Asia/Kolkata`. Never an offset       | availability overlap     |
| `yearsOfExperience`    | A plain number a reader can place. Not a scoring input    | reading                  |
| `languages`            | m:n `Language`                                            | matching + explanation   |
| `approaches`           | m:n `TherapeuticApproach`                                 | matching + explanation   |
| `areasOfWork`          | m:n `AreaOfWork`                                          | matching + explanation   |
| `communicationStyles`  | m:n `CommunicationStyle`                                  | matching + explanation   |
| `contextualExperience` | m:n `ContextualExperience`                                | matching + explanation   |
| `sessionFormats`       | m:n `SessionFormat`                                       | matching                 |
| `availability`         | 1:n `AvailabilityWindow`                                  | availability matching    |

`location` is deliberately **not** geocoded to coordinates in this phase. The matching this phase
enables is timezone-based, and a coarse place keeps the row smaller and less identifying.

### The shared vocabularies

| Table                  | Key examples                                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Language`             | `en` English, `hi` Hindi, `bn` Bengali, `ta` Tamil, `ml` Malayalam, `es` Spanish, `de` German, `nl` Dutch, `ar` Arabic, `zh` Mandarin, …                                                             |
| `TherapeuticApproach`  | exploratory, structured, solution-focused, reflective, integrative                                                                                                                                   |
| `CommunicationStyle`   | exploratory, structured, warm, direct, reflective, gentle                                                                                                                                            |
| `AreaOfWork`           | career-transitions, relationships, life-transitions, work-stress, family-dynamics, identity-exploration, adjustment-to-relocation, grief-and-loss, burnout, self-worth, parenting, creative-practice |
| `ContextualExperience` | indian-diaspora, cross-cultural-relationships, relocation, international-students, family-expectations, third-culture-upbringing, working-across-cultures                                            |
| `SessionFormat`        | online, in-person                                                                                                                                                                                    |
| `FeedbackReason`       | not-the-right-approach, communication-mismatch, language-mismatch, availability-mismatch, format-mismatch, felt-uncomfortable, location-mismatch, other                                              |

Each carries `key` (stable, used by the seed and by tests), `name` (shown to people) and
`description` (what the word means here). Approaches and styles are described as _ways of working_,
with wording that never implies one is clinically superior — they are matching attributes, full
stop.

Because they are tables rather than enums, a client preference can point at exactly the same row a
therapist profile points at. **That shared row is the join.** The future explanation is, almost
literally, the intersection of two sets of these keys.

### `AvailabilityWindow`

`therapistProfileId`, `dayOfWeek`, `startMinute`, `endMinute`.

Times are **minutes from local midnight in the therapist's own timezone** rather than timestamps,
offsets, or Postgres `time` columns. "Tuesday 18:00–20:00 in Europe/London" is a fact about a wall
clock; storing it as a `timestamptz` would quietly attach an instant to it and invite the exact
class of bug the brief warns about. Minutes keep the arithmetic unambiguous, and converting between
zones is the future overlap calculation's job.

The window does not repeat the timezone: the profile owns it, and duplicating it per row would let
the two disagree. This is the one place where a future feature (a therapist working across two
zones) will want to revisit the model, and the migration path is a new nullable `timezone` column
with a backfill — noted here so it is a known extension point rather than a surprise.

**Validated where?** `startMinute` must be `0 ≤ start < end ≤ 1440`. Prisma does not model CHECK
constraints, and hand-writing one into a migration creates schema drift on the next
`prisma migrate dev`. So the rule is enforced in the seed and in the repository layer, and covered
by tests, rather than in the database.

### `ClientPreference`

A row per set of preferences, so one person can hold several (a session for themselves, a session
with a partner) without the model lying about which selection belongs to what.

Fields: `clientId`, `intakeId`, `kind`, `note`, timestamps, plus m:n selections for `languages`,
`areasOfWork`, `communicationStyles`, `approaches`, `contextualExperience`, `sessionFormats`.

`kind` is `PREFERENCE` or `REQUIREMENT`. It is a single column with an enormous downstream effect:
a preference shapes a ranking, a requirement excludes. "I would rather work reflectively" and "I
cannot work with anyone who doesn't speak my language" are different statements, and collapsing
them into one column would mean guessing later — when guessing is least acceptable.

`intakeId` is the intake whose answers produced this set, nullable because a preference set predates
the column. It is stored rather than inferred from a timestamp for a specific reason: the intake flow
replaces a client's single preference set on every submission, so an older intake's answers would
otherwise be gone, and matching it against the newer set would produce a confident explanation of
something the person is no longer asking about. Two intakes written in the same millisecond have no
meaningful order, so a timestamp cannot decide it. `ON DELETE SET NULL` rather than `CASCADE`:
deleting someone's intake should not silently delete the preferences it produced, because those
preferences are what a recommendation actually reads.

`note` is optional plain language ("I find it hard to begin"). One field, human-authored, never
parsed. A future phase may want more, but nothing here pretends to be a substitute for the
structured selections. The matching engine does not read it.

### `ClientAvailability`

`clientId`, `timezone`, `dayOfWeek`, `startMinute`, `endMinute`. Deliberately the same shape as
`AvailabilityWindow`, because the future overlap calculation has to put the two sides on common
ground before it compares them.

### `Intake`

`clientId`, `rawText`, timestamps.

`rawText` is the most sensitive field in this system: someone's own words about their life. It is
stored because the entire premise of the product is that what someone says matters. It is never
logged, never sent to a third party, and in this phase is not a matching input at all.

An `@@index([clientId, createdAt])` because a client can have more than one, and the most recent is
almost always the relevant one.

### `Match`

One row per candidate the engine evaluated — including the ones it set aside, and why. A
recommendation is a row with `status = RECOMMENDED`, at most one per intake; there is no separate
recommendation entity, because it would hold nothing but a pointer back to the evaluation it is.

Fields: `clientId`, `intakeId`, `therapistId`, `engineVersion`, `score`, `status`, `rejectionCode`,
`createdAt`.

`score` is an internal integer compatibility figure used only to order candidates. It is never sent
to a client, never displayed, and never described as a measure of a person: a high score is not a
better therapist, and the reason the column exists at all is so that a _why_ can be traced back to
an _ordering_. `status` is `ELIGIBLE`, `INELIGIBLE` or `RECOMMENDED`, and `rejectionCode` is non-null
exactly when the status is `INELIGIBLE` — a row with no reason is not a shape the engine can write.

`engineVersion` (`"v1"`) is on every row because matching logic will change, and a result has to be
attributable to the rules that produced it or it can be neither explained nor recognised as stale.

`@@unique([intakeId, therapistId])` is the whole of the duplicate-submission safety: an intake is
evaluated once, and a retry cannot write a second set of rows, because twice is not a shape this
table has.

### `MatchEvidence`

As many rows per `Match` as there are reasons. `category`, `kind` (mirroring `PreferenceKind`),
`clientKey`, `therapistKey`, `explanation`, `weight`, `ordinal`, and the `overlap*` / `therapistOverlap*`
columns for availability.

Self-contained on purpose: reading a row must never require going back to the intake or the profile
to work out what it meant. **No prose is stored** — an explanation is generated from these keys at
read time, so a stored match always reads in the current wording and a stored sentence can never
drift away from the facts that produced it.

The `overlap*` columns are filled for `AVAILABILITY` and null for every other category, so a row's
shape is unambiguous from its columns alone. That invariant is asserted by a test rather than left
for a reader to infer.

### `Feedback`

`clientId`, `therapistId`, `sentiment`, `reasonId?`, `text?`, `createdAt`.

Two deliberate choices:

- **No `updatedAt`.** Feedback is a record of a past moment. If it changes, it is a new row, and
  pretending otherwise would blur the history that a rematch is supposed to learn from.
- **`reason` is structured, `text` is optional.** "The approach didn't fit" is the input a rematch
  can act on. "It didn't feel like them" is something a person may want to add. The first drives
  the product; the second is honoured but not mined.

**There is no `recommendationId` yet.** Feedback points at the therapist directly, which is exactly
right while recommendations do not exist. When the `Recommendation` entity lands it will gain a
`recommendationId` and the backfill is a nullable column — documented as a known follow-up rather
than modelled as a stub table with two columns and no meaning.

---

## 3. What is deliberately absent

| Not modelled                               | Why                                                                                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client name, email, phone, address         | None is needed for matching. Identity data that cannot help someone cannot hurt anyone.                                                                                      |
| Diagnoses, symptoms, clinical codes        | Areas of work are life situations. This prototype is not a clinical system and does not pretend to be.                                                                       |
| Prices, ratings, reviews, testimonials     | The product's whole argument is that matching is not shopping. A score would contradict it.                                                                                  |
| Therapist photos                           | No real people's photographs will be downloaded or stored. The profile shows a generated monogram.                                                                           |
| Credentials, licences, registration nos.   | Real verification is a compliance programme, not a schema. Flagged in `docs/architecture.md` as a Phase-5 prerequisite.                                                      |
| Free-form tags on therapists               | A tag string is a matching attribute nobody can join against.                                                                                                                |
| Scores, weights, ranking shown to a client | A scoreboard is the thing this product exists to argue against. The engine has an internal integer ordering figure; it is stored, never sent. See `docs/matching-engine.md`. |
| A `Recommendation` entity                  | A recommendation is a `Match` with `status = RECOMMENDED`. A third table would hold nothing but a pointer back to the evaluation it is.                                      |

---

## 4. How an explanation is built

Given a `ClientPreference` and a `TherapistProfile`, an explanation is the set of keys they share —
and every one of them is already a row. As of Phase 5 this is what the matching engine does:

| Claim in the explanation               | Where it comes from                                                         |
| -------------------------------------- | --------------------------------------------------------------------------- |
| "You both work reflectively"           | `TherapeuticApproach` rows in both sets                                     |
| "They speak your language"             | `Language` rows in both sets                                                |
| "This is what they work with"          | `AreaOfWork` rows in the profile                                            |
| "You wanted someone direct"            | `CommunicationStyle` rows in both sets                                      |
| "They have lived it too"               | `ContextualExperience` rows, stated by the therapist                        |
| "You both meet online"                 | `SessionFormat` rows in both sets                                           |
| "You are both free on Tuesday evening" | `AvailabilityWindow` ∩ `ClientAvailability`, in timezones                   |
| "This matters to you because…"         | `ClientPreference.note` and `Intake.rawText` — **not** built, and not to be |

The last row is the one the engine does **not** implement. `note` and `rawText` remain unparsed: they
are stored because the premise of the product is that someone's own words matter, and neither is a
matching input. Quoting them back would be a feature for a later phase, and one that would need its
own care about consent.

Every other row became a `MatchEvidence` row in Phase 5. No column had to be invented in the phase
that first had to justify itself, and the table above is the reason the Phase 1 schema looks the way
it does.

---

## 5. Synthetic data, and why it is designed rather than random

The seed builds 50 fictional therapists. The point is not volume; it is that a future matching
feature can be tested against combinations that are actually different from one another.

- **Language and region agree.** A Bengali-speaking therapist in Kolkata, a Tamil-speaking one in
  Chennai, a Polish-speaking one in Berlin. A random generator would produce a Tamil speaker
  offering sessions at 6am UK time, and every test written against it would be meaningless.
- **Timezone and working hours agree.** Availability windows are generated from the therapist's own
  zone — evening slots in India, later slots in Europe, wider spreads across the US — so overlap
  arithmetic has something real to work on.
- **Style and approach cohere.** "Direct" pairs with "structured"; "warm" with "reflective". The
  combinations are plausible pairs a person could recognise in a practice, not noise.
- **Coverage is deliberate.** Every language, approach, style, area and context in the vocabulary
  appears many times over, and the rare combinations (a Malayalam speaker, a therapist with
  third-culture upbringing) are present but not typical.
- **It is deterministic.** A fixed seed and fixed inputs mean the same 50 therapists on every
  machine, every reseed, and in CI.

Every name, bio and profile is invented for this prototype. Nothing is copied from a real
directory, and no therapist data has been scraped. See `prisma/seed.ts`.
