# The AI layer

_Why it exists, what it may do, and the line it does not cross._

---

## The one rule

**An LLM may interpret language and summarise information. It may never decide anything.**

The deterministic matching engine remains the source of truth for candidate
eligibility, requirements, preferences, availability, scoring, ordering,
selection, evidence, rematching and exclusions. Nothing in this phase changed
any of that, and no test in this phase was weakened to accommodate it.

That rule is not a convention the rest of the codebase is trusted to observe. It
is a property of the types in `apps/api/src/ai/aiProvider.ts`. Look at what a
provider is _able_ to return:

- `AiSignal` carries a category, a key, a confidence, a source and a sentence.
  There is no field for a therapist, a match, a score, a rank, or a
  requirement. A provider cannot name a person, because the shape it fills in
  has nowhere to put one.
- `AiCaseSummary` carries prose, about a case identified by _our_ `matchId`.
  Every claim in it is checked against stored evidence before it is returned.

Adding a field that reached the engine would be visible in review, because it
would have to appear in that file.

---

## What exists

Two surfaces, and they are deliberately not the same thing.

|            | Intake companion                                                  | Matcher case summary                                       |
| ---------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| **Who**    | a client, in the intake                                           | a human matcher, in the workspace                          |
| **Where**  | `/intake/companion`                                               | the case page, under `/matching-workspace`                 |
| **Route**  | `POST /api/v1/ai/intake/turn`<br>`POST /api/v1/ai/intake/extract` | `GET /api/v1/matching-workspace/cases/:matchId/ai-summary` |
| **Does**   | interprets what someone said into vocabulary keys                 | describes a case from its stored evidence                  |
| **Writes** | nothing                                                           | nothing                                                    |

Both answers go to the same place: a person decides. The client confirms or
rejects each suggestion; the matcher records a `MatchingDecision` exactly as
they did before this phase.

### The flow

```
Client
  ↓
AI Intake Companion          /intake/companion
  ↓ structured suggestions   POST /ai/intake/extract
  ↓
client confirmation          Keep · Change · Not quite
  ↓
existing IntakeDraft         through the same toggle* the questions use
  ↓
existing review              /intake/review
  ↓
existing submission          POST /intakes
  ↓
existing deterministic matcher
  ↓
recommendation → human matcher
  ↓
AI case summary              GET /matching-workspace/cases/:id/ai-summary
  ↓
existing MatchingDecision    POST /matching-workspace/cases/:id/decision
```

There is no second intake state, no alternate storage of answers, and no route
that bypasses `POST /intakes`. A test in
`apps/web/src/lib/intake/suggestions.test.ts` covers the mapping into the
draft; `apps/web/src/pages/intake/IntakeCompanionPage.test.tsx` covers that the
ordinary submission still works afterwards.

---

## The provider abstraction

`AiProvider` is three methods:

```ts
interface AiProvider {
  readonly name: string;
  readonly available: boolean;
  nextTurn(messages, known): Promise<AiTurn>;
  extractSignals(messages): Promise<readonly AiSignal[]>;
  summariseCase(context): Promise<AiCaseSummary>;
}
```

Three reasons for the interface, in the order they bit:

1. **The product must work without a key.** A prototype that is unusable
   without somebody's account is a prototype nobody can review.
2. **The tests must not call a network.** A deterministic fake is the only way
   to assert on malformed output, on timeouts, and on a provider that returns
   nonsense. No test in this repository constructs the real provider.
3. **Swapping providers should not touch the application.** `buildAiProvider` is
   the only file that reads `AiConfig`.

### `mock` — the default

**Not a stub.** It is the provider that runs with no key, and it has to carry
the whole flow convincingly because most reviewers will never have one.

It reads the vocabulary from the database and matches a person's words against
the names in it. A term added to the seed is searched the moment it exists, with
no change to the code.

Its honest limitation, which the docs carry and this paragraph repeats: it
understands the words someone uses _about_ their preferences, and nothing else.
It does not read "I've been a wreck since my mother died" as grief and loss, and
it will not pretend to. A model does. That difference is the entire reason the
abstraction exists.

Two behaviours worth naming because they were deliberate:

- **It checks for rejection in the sentence around a match.** The brief's own
  example — "I'd rather talk things through than be given homework" — would
  otherwise come back as a preference for _Structured_, in front of the person
  who said the opposite. A keyword matcher cannot parse negation, so this errs
  towards a miss. A lost suggestion is correctable on an approval page; a wrong
  one is not.
- **It offers a time as a hint, never as a day.** Someone who said "evenings"
  has not told us a day, and writing one for them would put words in their mouth
  on a page that then says "you told us".

### `openai-compatible` — the real one

Plain `fetch` against `/chat/completions`. No SDK, and therefore no new
dependency, no new supply chain and no new audit finding. The production imports
of the API are still `fastify`, `@fastify/cors`, `@prisma/client` and
`@prisma/adapter-pg`.

`AI_BASE_URL` points it anywhere: OpenAI, a gateway, a self-hosted vLLM, or
Ollama's compatible endpoint. Construction is inert; the only thing that reaches
the network is a call.

---

## Structured output, and what is rejected

The brief's shape, kept, with three decisions recorded against it.

**Unknown keys are dropped and reported.** A key that is not in the vocabulary
does not become a "close match". Someone who said "grief" must not end up with
`self-worth` because it was the nearest string — the whole value of showing
suggestions is that the person can check and correct them, and a guess is
uncorrectable from their side.

**Drops are reported, not swallowed.** Three distinct claims, three fields:

- `signals` — understood, and it lands somewhere.
- `notUnderstood` — said, but with nowhere to go. "I couldn't place _integrative_;
  the intake has no question about approaches."
- `surplus` — understood, and there was no room. A list silently cut to eight
  presents itself as the whole of what was understood, and it is not.

**A key's destination is decided server-side.** `target` travels in the
response, so the interface cannot disagree with the validator about which key
belongs in which question, and adding a category on the server produces a
visibly-wrong control rather than a silently-dropped suggestion.

### Two vocabulary names, one table

The intake vocabulary endpoint calls a family `contextualExperience`; the draft
calls it `contextualExperiences`. That is a real discrepancy, not a typo, and it
lives in one table (`FAMILY_DRAFT_FIELD` in `signalVocabulary.ts`) rather than in
a cast. The day the two diverge further, the mistake ships from exactly one
place.

### The one alias

`approach` and `communicationStyle` both resolve to the draft's
`communicationStyles` field. The intake asks one question — the kind of
conversation that helps — and a person's words about wanting to explore rather
than be given a plan belong there. A key that exists only in
`therapeutic_approaches`, such as `integrative`, is reported in `notUnderstood`
rather than dropped in silence.

---

## The safety boundary

`apps/api/src/ai/safety.ts` runs **before a provider is asked**, and answers
without a model being involved at all. That is the difference between a guard
and a prompt.

- **A request for care, diagnosis or treatment** gets a redirect. "I'm here to
  help you describe what you are looking for. I cannot give therapy, diagnose
  anything, or say what you should take." Then it offers what it can do. The
  conversation continues: a person who asked the wrong question can still say
  what they are looking for.
- **A mention of self-harm** ends the conversation, with a pointer to real
  support. The honest response to "I don't want to be here" is not to keep
  matching somebody to them.

The patterns are phrase-based and narrow. They match the _shape of a request for
care_, not the presence of a difficult topic, because a list that fired on
"therapy" would fire on "I've never done therapy before" and shut down the
conversation this exists to have. Thirteen such sentences are pinned as
_allowed_ in `safety.test.ts`, and the tests assert both directions.

**This is a redirect, not a triage system.** It does not evaluate level, history,
intent or immediacy, and it is not a substitute for a clinician or a crisis
line. It gives a directory rather than a national number, because guessing a
number for a country we do not know would be worse than pointing at
`findahelpline.com`. The product has no safety flow and this does not pretend to
be one.

---

## The privacy boundary

### What is never stored

**No conversation, and no `ai_logs` table.** The transcript lives in the
browser's `sessionStorage` beside the intake draft, where someone's own words
already lived before this phase, and is removed when the intake is sent.

There is no table for model output, no audit metadata, no chain-of-thought and
no hidden prompt — because there is nothing to record. The case summary is
recomputed on each request from the same rows the evidence came from, which is
why it cannot go stale relative to the evidence beside it, and why a `GET` is the
honest verb for it.

`conversation.test.ts` asserts that a stored transcript holds _only_ `role` and
`text`: no identifiers, no provider name, no suggestions. A stored suggestion
would be a stored **inference about someone**, which is a different kind of thing
to leave lying around.

### What is never logged

Prompts, responses, intake free text, therapist notes, feedback notes, and
anything about a provider's key.

Verified rather than asserted: `apps/api/src/api/v1/routes/ai.test.ts` builds
the app with a log sink and reads what would have been written, on both the
failure path and the validation-rejection path. Free text appears in no log
line. (Fastify's validation error names the offending _field_ and not its value;
that was checked before the schema was written, not assumed.)

### What the case summariser is shown

`AiCaseContext` has **no field** for the intake note, a feedback note, a
matcher's note, a biography, a client identifier, a score or a rank. A provider
cannot be shown any of them when summarising a case — not "is not sent", has
nowhere to put it. A test asserts the serialised context contains no such field,
and that `readClientsWords` is never called on this path.

So the AI case summary is built from **structured matching data only**. A matcher
who wants the client's words still asks for them separately, and an AI summary
can never be a way around that.

### The key

Read from the environment, server-side, never prefixed `VITE_` and so never in
the bundle. It is captured into a single closure in
`openAiCompatibleProvider.ts` and appears nowhere else: not in a request
context, not in a log line, not in an error message. `AiUnavailableError` carries
a reason code and nothing else.

---

## Grounding: making "traceable to a field" mechanical

A model can name someone who is not in the case, invent an attribute nobody
recorded, reach for a figure, or slip into clinical register. `assertGroundedIn`
refuses all four, and any provider's output — mock or real — goes through it.

**Every capitalised word in the output must be either ordinary English or
something the case actually contains.** "Priya Sharma" and "EMDR" are both
absent from a case that never mentioned them. **No digit appears that the case
does not contain.** **Clinical language, treatment advice, figures, ranks and
verdicts are refused by phrase.**

### What it does not check

Whether a sentence about someone who _is_ in the case is a fair characterisation
of them. Nothing lexical can, and a check that claimed to would be claiming more
than it does. The controls that do that are upstream: the provider is given no
biography, no score and no free text, so there is nothing to mischaracterise.
This check is the backstop for what slips past the prompt, not a substitute.

### It errs towards refusal

A refused summary produces a failed summary, the page says so, and the
deterministic evidence a matcher came for is untouched. A summary that is
quietly _almost_ grounded is the thing that cannot be detected afterwards, so the
check is built to be the annoying one. A caller-curated list of ordinary
reporting vocabulary is the limit of it, and a word nobody thought of is
refused.

---

## Failure behaviour

| Situation                              | What happens                     | What a person sees                                                                       |
| -------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| No key configured                      | `AI_PROVIDER` defaults to `mock` | Nothing. The product works.                                                              |
| `openai-compatible` with no key        | Refuses to **start**             | —                                                                                        |
| Provider times out or is unreachable   | `502`                            | "Something went wrong while interpreting that. Your answers are still here." + Try again |
| Assistant switched off                 | `503`                            | "The conversation assistant is switched off." + the questions                            |
| Malformed or oversized provider output | Rejected by the validator        | Fewer suggestions, and the surplus reported                                              |
| Case summary fails its check           | `502`                            | "Left out rather than shown unchecked. The evidence is unchanged."                       |
| Store unreachable                      | `503`                            | "We could not read the questions just now."                                              |

**The user never loses their intake.** Every failure path leaves the draft
exactly as it was, and the questions are always reachable — tested for a
_network_ failure, a _503_, and an assistant that has ended the conversation.

Nothing is stored server-side, so there is nothing to clean up on failure. The
client aborts a superseded turn, so a slow reply for an older message cannot
overwrite the one that was actually asked for.

---

## Performance

- **One request per sent message.** Nothing on render, nothing on a keystroke,
  no effect that fires on mount except the greeting — which is rendered locally.
  This is why React's strict-mode double-invocation cannot produce two turns.
- **The case summary is on demand.** A model call per case review is a bill
  nobody agreed to, spent on a summary most will not read.
- **A hard timeout**, bounded by `AI_TIMEOUT_MS` and validated at start-up.
  Anything outside 1–60 seconds fails the boot rather than becoming a hang.
- **Transcript caps on both sides**: 40 messages stored, 20,000 characters
  accepted, 4,000 per message.

---

## Accessibility

- One `h1` per route; the suggestions are an `h2`.
- New assistant replies are announced with `role="log"`, `aria-live="polite"`,
  `aria-relevant="additions"` — and the region holds **only the turn that
  arrived**. A region containing the whole transcript re-announces the whole
  conversation on every turn.
- Enter sends, Shift+Enter breaks a line, described through the field's own
  `aria-describedby`. The action is a word and an arrow rather than a filled
  button, but it is still a real `<button>`, still focusable, and still
  `aria-disabled` when the page is empty.
- The writing area carries `.focus-within-ring`, the product's existing
  treatment for a control whose own box is invisible. Rolling a bespoke
  `focus-within:border-*` instead gave only a shade of a line's difference —
  not something a keyboard user can rely on finding.
- The journey indicator names a stage and never a fraction, on screen or in
  assistive text, in both of its arrangements. A fraction is a position in a
  queue, and this is not a queue.
- Suggestions use real `<button>`s with `aria-pressed`, so a kept state is
  audible and is not communicated by underline alone.
- Rejections stay on the page, dimmed, with an Undo. A refusal you cannot take
  back teaches people not to use the button.
- Errors use `role="alert"`, and a refused case summary is announced rather than
  left as a silently absent panel.
- Reduced motion removes the three arrival animations; verified in a real
  browser by walking every element and counting anything still animating.
- The `role="log"` region announces each turn as _Question_ or _Your words_ —
  the two roles the page actually has. There is no third, because there is no
  third.

---

## Documentation index

| Document                        | Covers                                           |
| ------------------------------- | ------------------------------------------------ |
| `docs/architecture.md`          | Where the AI layer sits in the system            |
| `docs/frontend-architecture.md` | The companion page and the workspace panel       |
| `docs/design-system.md`         | Why the conversation is set as a page, not a log |
| `docs/human-matching.md`        | Why the summary lives in the workspace namespace |
| `docs/demo.md`                  | Walking through both surfaces                    |
| **this file**                   | What AI may do, and what it may not              |

---

## Future improvements

In rough order of value:

1. **Replace the mock.** The abstraction exists so this is a configuration
   change, and the mock's real limitation — it does not understand metaphor or
   grief — is exactly what a model fixes.
2. **Better negation.** A model would not need a lookback window.
3. **Pine the family labels.** `FAMILY_DRAFT_FIELD` is the one translation
   table; a shared generated type would remove it.
4. **Stream the reply.** Not yet: a streamed conversation is harder to make
   screen-reader-safe, and the copy that matters is the suggestions, not the
   intermediate tokens.
5. **An explicit safety flow.** The redirect exists because doing nothing is
   worse. A real flow with real escalation is a different project, and building
   one by inference from messages would be worse than the redirect.
6. **Evaluate the grounding check.** `assertGroundedIn` is untested against real
   model output at volume, which is the only way to know whether it is too
   strict or too lenient. It is currently a backstop with a low false-positive
   cost, and that should be measured rather than assumed.
