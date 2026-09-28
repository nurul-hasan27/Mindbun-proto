# The intake flow

How seven questions turn a person's words into structured preferences, and why each part is
shaped the way it is.

The short version: **one question at a time, in the words a person would use, stored as the
keys a database can join on.** Everything below follows from that sentence.

---

## 1. The shape of the journey

The intake is step two of a six-step journey, and it is the first part of the product that
holds someone's attention for more than a moment. That shapes every decision here.

| URL                     | Question                                                | Answers   | Required |
| ----------------------- | ------------------------------------------------------- | --------- | -------- |
| `/intake`               | What would you like support with right now?             | multi     | yes      |
| `/intake/conversation`  | What kind of conversation feels most helpful?           | multi     | yes      |
| `/intake/context`       | What matters to you when choosing a therapist?          | multi     | no       |
| `/intake/language`      | What language would you feel most comfortable speaking? | multi     | yes      |
| `/intake/sessions`      | How would you prefer to have your sessions?             | single    | yes      |
| `/intake/availability`  | When would sessions usually work for you?               | multi     | no       |
| `/intake/anything-else` | Is there anything else you'd like us to know?           | free text | no       |
| `/intake/review`        | You told us…                                            | —         | —        |

`/intake` is the first question, not a landing page, so a shared link to `/intake` lands
someone in the flow rather than on a page of links to the flow.

### Why four questions are required

A recommendation could not be _explained_ from an intake missing these, so the flow asks for
them and will not let someone continue past them:

- **Support** — what they want to work on. Nothing else in the system means anything without it.
- **Conversation** — the kind of session that helps. Including the honest answer "I'm not sure yet".
- **Language** — the one thing a mismatch makes a session impossible.
- **Sessions** — online or in person. Required only because "either" is a real answer, and an
  empty answer would be indistinguishable from having skipped the question.

Everything else is optional, and the interface says so _before_ it is asked rather than after
someone has tried to skip it.

---

## 2. Each question, and what it stores

The interface owns the **words**. The database owns the **keys**. That separation is the whole
design: a change to the copy can never invalidate someone's answers, and a key that travels over
the wire is one the database can join on.

The mapping lives in [`apps/web/src/lib/intake/questions.ts`](../apps/web/src/lib/intake/questions.ts).

### Support — `areasOfWork`

| What a person reads | What is stored                                                 |
| ------------------- | -------------------------------------------------------------- |
| Relationships       | `relationships`                                                |
| Work or career      | `career-transitions`                                           |
| Family              | `family-dynamics`                                              |
| Life changes        | `life-transitions`                                             |
| Feeling overwhelmed | `burnout`                                                      |
| Something else      | _(nothing — clears the list, and points at the last question)_ |

The wording is warmer than the key on purpose. "Work or career" is what someone recognises;
`career-transitions` is what a future matcher can join against. The gap is deliberate and
narrow: only where a warmer phrase would have been _obscure_ — `burnout` — does the interface
reach for a plainer word than the one a therapist would recognise.

"Something else" clears the selection rather than adding to it. Someone who chooses it and finds
"Work or career" still ticked has said two different things, and the review screen should not
pretend otherwise. The server accepts an intake with no areas **only** when there is a note, so
the choice is never a dead end.

### Conversation — `communicationStyles`, and `openToGuidance`

| What a person reads                              | What is stored                         |
| ------------------------------------------------ | -------------------------------------- |
| Someone who helps me explore things              | `exploratory`                          |
| Someone who gives me structure                   | `structured`                           |
| Someone who asks thoughtful questions            | `reflective`                           |
| Someone who helps me work toward practical steps | `solution-focused`                     |
| I'm not sure yet                                 | _(no styles; `openToGuidance = true`)_ |

Two details here are load-bearing:

- **"I'm not sure yet" is a real answer, not an empty one.** It sets `openToGuidance`, a column
  on `ClientPreference` added in the Phase 4 migration. A future recommendation should respond to
  it by showing breadth rather than pretending to know, and it cannot be inferred from an empty
  list, which would equally mean "skipped the question".
- **The two are mutually exclusive.** Choosing the styles clears the flag and vice versa,
  because storing both would leave a matcher guessing which was meant. The server rejects the
  contradiction with `Either say which conversations suit you, or that you are not sure yet.`

### Context — `contextualExperiences`

| What a person reads                                | What is stored                 |
| -------------------------------------------------- | ------------------------------ |
| Someone familiar with Indian family dynamics       | `indian-diaspora`              |
| Someone who understands life between cultures      | `cross-cultural-relationships` |
| Someone experienced with relocation                | `relocation`                   |
| Someone who has worked with international students | `international-students`       |
| Someone raised between cultures                    | `third-culture-upbringing`     |
| Nothing specific comes to mind                     | _(nothing — clears the list)_  |

Optional, and the explanation on screen says so. The first option is a deliberate reading of
"familiar with Indian family dynamics" as experience of the Indian diaspora rather than as
`family-expectations`: it is the framing a person is more likely to recognise as themselves.

Nothing here is inferred. Every row is a term the therapist stated about their own experience
(see [`domain-model.md`](./domain-model.md)), and this question only ever produces a key that
already exists.

### Language — `languages`

Read from the API at runtime rather than hardcoded, so a keyword the client sends is one the
database has heard of. The names are the database's own: there is no warmer phrasing for
"Malayalam", and inventing one would only obscure it.

Twenty-four languages is a list, not a menu, so the step has:

- a **shortlist** of eight — English, Hindi, Bengali, Tamil, Malayalam, Urdu, Punjabi, Gujarati
- a **"Show all 24 languages"** control, which announces how many are behind it
- a **search field**, always visible rather than hidden, matching on name or ISO code

The shortlist is a preference, not a filter: the full list is always one press away.

### Sessions — `sessionFormats`

| What a person reads | What is stored            |
| ------------------- | ------------------------- |
| Online              | `['online']`              |
| In person           | `['in-person']`           |
| Either is fine      | `['in-person', 'online']` |

"Either is fine" means **both**, not neither. An empty list would be indistinguishable from
skipping the question, and a future matcher deserves to know both were acceptable.

**What this prototype does not do:** match on geography. There are no coordinates, no
therapist locations beyond a coarse place, and no distance calculation. "In person" is recorded
as a preference and is currently used for nothing. The Phase 3 domain model deliberately does not
geocode, and this step does not pretend otherwise.

### Availability — `availability`

Three groups rather than one: **timezone** (detected, never shown raw), **days**, and **parts of
the day**.

| What a person reads              | What is stored                                             |
| -------------------------------- | ---------------------------------------------------------- |
| Your local time                  | `Asia/Kolkata` — the IANA name, stored and never displayed |
| Tuesdays                         | `dayOfWeek: 'TUESDAY'`                                     |
| Mornings / Afternoons / Evenings | `08:00–12:00` / `12:00–17:00` / `17:00–21:00`              |

The timezone is the one place this step has to explain a technical thing, so it is the one place
it says anything about one. The copy is _"Times are understood in your own local time — GMT+05:30,
India Standard Time."_ The identifier is the truth we store; the words are what a person can act
on.

Asking for days and parts separately rather than a 7 × 3 matrix is deliberate: a rough sense of
one's week would otherwise become twenty-one separate decisions, and most people do not have that
precision. A half-answered week is nudged once and then allowed through, because making someone
think harder about their week than they can is exactly wrong for this form. The overlap arithmetic
itself — the actual matching problem — is Phase 5's work.

### Anything else — `Intake.rawText`

Optional, and said so twice: once in the explanation, once by never blocking. The interface makes
three promises and the code keeps all three:

- **never analysed** — nothing reads it; the Phase 4 payload sends it and stops
- **never sent to a third party** — it goes to `POST /api/v1/intakes` and nowhere else
- **never logged** — Prisma is configured to log `warn` and `error` events, never query
  arguments; the server's error bodies never echo request content

If the browser cannot detect a timezone, the step says so rather than storing a guess.

---

## 3. State

One object, in one place. See
[`apps/web/src/lib/intake/draft.ts`](../apps/web/src/lib/intake/draft.ts) and
[`IntakeProvider.tsx`](../apps/web/src/lib/intake/IntakeProvider.tsx).

```ts
interface IntakeDraft {
  areasOfWork: readonly string[]; // AreaOfWork keys
  communicationStyles: readonly string[]; // CommunicationStyle keys
  openToGuidance: boolean; // "I'm not sure yet"
  contextualExperiences: readonly string[];
  languages: readonly string[]; // Language codes
  sessionFormats: readonly string[];
  timezone: string | null; // IANA
  days: readonly DayName[];
  timeOfDay: readonly TimeOfDay[]; // 'morning' | 'afternoon' | 'evening'
  rawText: string;
}
```

Three properties, and all three are load-bearing:

- **It is a value, not a bag of setters.** Every edit returns a new object, so "has this
  changed?" is a comparison rather than a subscription, and a restored draft is structurally
  identical to the one that was saved.
- **It stores keys, never labels.** Copy can change; answers cannot be invalidated by it.
- **It is separate from every component.** The provider sits above the question routes, so a
  question is a component that renders one answer and owns nothing. That is what makes going
  backwards safe.

### Why the provider is above the routes

`IntakeEntry` wraps the whole `/intake` subtree, not each question. Navigating from
"conversation" to "context" swaps the rendered question, **not** the state behind it. No pathname
is used as a React key anywhere, so nothing is remounted on navigation and the `<main>` element
survives — the same property Phase 2 established for the shell.

Each question still has its own URL. A refresh returns someone to the question they were on, and
a shared link lands on a question rather than on a blank shell. The URL says _where_; the draft
says _what they answered_.

---

## 4. Persistence

**sessionStorage, deliberately.** A refresh should not destroy what someone typed, and a draft
should not outlive the tab it was typed in.

| Concern          | Choice                                                                    |
| ---------------- | ------------------------------------------------------------------------- |
| Refresh mid-flow | Restored. The provider reads the draft on mount.                          |
| New tab          | Empty. A second tab is a second conversation.                             |
| Closing the tab  | Gone. `sessionStorage` dies with the tab.                                 |
| Shared machine   | Nothing left behind. `localStorage` was rejected for exactly this reason. |
| After sending    | Cleared immediately — the answers have left the browser.                  |
| "Start over"     | Draft and both identifiers removed.                                       |

The raw text is in sessionStorage, which is the one part of this that would need thinking about
in a real product: a refresh has to preserve it, and a shared machine has to lose it. Session
storage is the only browser store that does both. A test asserts `localStorage.length === 0`
after answering questions, so the choice cannot be quietly changed.

Stored under three keys: `wtm.intake.draft.v1`, `wtm.intake.session.v1` (one per visit) and
`wtm.intake.submission.v1` (one per draft, so a retry cannot duplicate it).

Storage can refuse — a private window, a full quota, a browser policy — and nothing here may
break because of it. Every access is guarded, and a stored shape that no longer fits the model is
discarded rather than trusted.

### Browser refresh, specifically

Three refresh cases, and all three are handled by the same two mechanisms:

| Case                       | What happens                      | Why                                               |
| -------------------------- | --------------------------------- | ------------------------------------------------- |
| Refresh on a question      | Same question, same answers       | The URL is the question; the draft is the answers |
| Refresh on the review      | Same summary, still editable      | Same                                              |
| Back button after Continue | Previous question, answers intact | The provider was never unmounted                  |

A refresh is not a special case that gets its own code. It is the same render with a smaller
amount of memory, and the draft is in the one store that survives it.

---

## 5. The API

Two endpoints. See
[`apps/api/src/api/v1/routes/intake.ts`](../apps/api/src/api/v1/routes/intake.ts).

### `GET /api/v1/intake/vocabulary`

Everything the questions may ask about, read from the database: areas of work, conversation
styles, contexts, languages and session formats. Fetched once when the flow starts.

This is why the interface can be confident about its own copy: a phrase whose key the database
does not have is never offered, because submitting it would be a 400.

If the vocabulary cannot be loaded, the flow stops and says so — it does not fall back to a
hardcoded list, which would be a list the server has never agreed to. The message says that
nothing already answered has been lost, because a reload brings the questions back.

### `POST /api/v1/intakes`

```jsonc
{
  "sessionId": "5abaa41a-3e7b-4402-8da3-41170816f41d", // one per visit
  "submissionId": "b167d04f-49ca-443e-87b9-c8074d65ea25", // one per draft
  "areasOfWork": ["relationships"],
  "communicationStyles": ["exploratory"],
  "contextualExperiences": [],
  "languages": ["en"],
  "sessionFormats": ["online"],
  "availability": {
    "timezone": "Asia/Kolkata",
    "windows": [{ "dayOfWeek": "TUESDAY", "startMinute": 1020, "endMinute": 1260 }],
  },
  "openToGuidance": false,
  "rawText": "",
}
```

```jsonc
{ "intakeId": "…", "receivedAt": "2026-09-28T06:41:15.245Z" }
```

`availability` is `null` when no availability was given, rather than an empty object with an
empty list inside it — the difference between "no preference" and "a preference that happens to
be empty" is worth one `null`.

**Validation** is hand-written rather than a JSON Schema body, because the answer to "no" has to
be a sentence. A person fixing a 400 is being told what to change; `body/languages/0 must be
equal to one of the allowed values` tells them nothing. The first problem is reported, and it
names the field without echoing the value — everything in a request came from a browser, and
reflecting it into a response body is a habit worth not having.

Rejected with a 400: a body that is not an object, an identifier that is not a UUID, an unknown
vocabulary key, no language, no session format, nothing at all said, "not sure yet" together with
named styles, a timezone that is not IANA, a window that ends before it starts or runs past
midnight, a day that does not exist, more than 28 windows, and a note over 4,000 characters.

### The two identifiers, and why there are two

`sessionId` is **one per visit**, so a second intake from the same person joins the same
anonymous `Client` row rather than creating another. It is a UUID the browser mints; the server
upserts on it. A client row still holds no personal data, so this identifies nobody — and a real
service would replace it with a proper session or account.

`submissionId` is **one per draft** and is `UNIQUE` on `intakes`. That is what makes "Try again"
safe: a retry after a failed response, a double click, or two tabs returns the intake that was
already stored rather than writing a second copy of the same answers. The race is handled too —
if two attempts arrive together and one loses the unique index, the winner's row is read back and
returned, so a retry cannot fail because it was second.

This is the mechanism behind the brief's "no duplicate accidental submissions", and it is
verified end to end: one failed attempt against a stopped API wrote nothing, and the retry after
restarting it wrote exactly one row.

---

## 6. What is stored

| Answer                  | Row                                                                               |
| ----------------------- | --------------------------------------------------------------------------------- |
| The whole submission    | `intakes` — one row, `rawText`, `submissionId`                                    |
| Every structured choice | `client_preferences` — one authoritative set per client, replaced on resubmission |
| Days and times          | `client_availability` — one row per window, in the client's own zone              |
| "I'm not sure yet"      | `client_preferences.openToGuidance`                                               |
| The visit               | `clients.sessionId`                                                               |

One intake answers one preference set, so a resubmission **replaces** it rather than
accumulating competing ones. Availability is replaced the same way. The whole thing runs in a
transaction, with the preference join rows written immediately after — a single logical write
split across two statements, which is a note for whoever hardens this next.

Therapists are not touched by any of it. Nothing here reads or writes `therapists`, and the
confirmation says plainly that the search is not built yet.

---

## 7. Privacy

- **All data is synthetic.** The 50 therapists are invented. No real profile was copied, scraped
  or photographed.
- **A client carries no identity.** `clients` holds a UUID, a `sessionId` and two timestamps. No
  name, contact details, or demographics.
- **The note is never logged.** Prisma logs `warn` and `error` _events_, never query arguments.
  The intake payload appears in no log line, no error body and no URL. A test asserts that a
  failure response contains neither the note's text nor a connection string.
- **The note is not analysed.** Nothing in Phase 4 reads it. It is stored and left alone.
- **Nothing sensitive is inferred.** Every structured answer is a term the client chose from a
  list, or a key the database already had. The intake cannot produce an attribute nobody offered.
- **The draft is held as briefly as possible** — in sessionStorage, removed on send, removed on
  "Start over".

---

## 8. Accessibility

Verified in a real browser, not assumed.

- **Real controls.** Every choice is a native `<input type="checkbox">` or `type="radio">` inside
  a `<label>`, so arrow keys, Space, form semantics and assistive technology all work without
  being reimplemented. No custom widget, no `role` to keep in step.
- **Selected state is never colour alone.** A chosen row carries a clay rule, a clay tint, a
  filled mark and heavier type. `data-checked` lets a test assert the _visible_ state rather than
  trusting that a colour class is doing the work.
- **One group per question.** `role="group"` with the question as its accessible name, so choices
  are announced as a set rather than as six unrelated controls.
- **Errors are announced and focus is moved.** Refusing to continue shows a `role="alert"` and
  moves focus to the answers, so a keyboard user is already where the fix has to happen.
- **One `h1` per page, no skipped levels**, on every one of the eight screens.
- **The progress indicator is decorative** and says so; the text alternative carries the real
  information — _"Getting to know what matters. Step 4 of 8: What language would you feel most
  comfortable speaking?"_
- **The flow has a visible end** — eight hairlines, filled to where you are.
- **`prefers-reduced-motion`** removes every animation, checked with `getAnimations()`.
- **No horizontal overflow** at 320, 390, 834 or 1440 on any of the eight screens.

---

## 9. What this phase deliberately does not do

- **No matching, scoring, ranking or explanation.** The confirmation says the search is not built
  yet, and the primary action is "Continue" rather than anything that promises a result.
- **No AI of any kind.** No provider, no embeddings, no local model. The intake is deterministic:
  keys in, rows out.
- **No geographic matching.** "In person" is stored and unused.
- **No timezone overlap arithmetic.** Days and parts are recorded; comparing two people's weeks is
  Phase 5's problem.
- **No account, no authentication, no history.** There is nothing to log in to and nothing to come
  back to, and the interface says so on the confirmation screen.
- **No prerequisite questions before this one.** `/start` is the doorway, not a step.

---

## 10. Where the next phase attaches

| Phase 5 needs                       | Already here                                                           |
| ----------------------------------- | ---------------------------------------------------------------------- |
| Structured preferences to match on  | `ClientPreference`, one authoritative set per client                   |
| An honest "I don't know yet" answer | `openToGuidance`                                                       |
| Timezones on both sides             | `ClientAvailability.timezone` vs `AvailabilityWindow` on the therapist |
| Vocabulary to filter by             | `GET /api/v1/intake/vocabulary`                                        |
| A reason to explain a match         | `Intake.rawText`, stored unanalysed                                    |
| A rematch to learn from             | Nothing yet — that is `Feedback`, still unused                         |
