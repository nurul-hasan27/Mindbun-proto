# Demonstrating the prototype

Four scenarios, each about five minutes, each making one point. The order below is
the order to run them in: a client journey first, then the internal workflow, so
the reviewer has felt the product before seeing the machinery behind it.

---

## Before you start

```bash
open -a Docker
npm run db:up                 # PostgreSQL
npm run db:seed               # the 50 synthetic therapists, deterministically
npm run db:demo:workspace     # one case waiting in the matching workspace
```

Then two terminals:

```bash
npm run dev --workspace apps/api     # http://127.0.0.1:4000
npm run dev --workspace apps/web     # http://localhost:5173
```

Open **http://localhost:5173** at 1440px, or narrow the window to 390px for the
phone shots.

### Two things worth saying before you start

**Every therapist is fictional.** Invented for this prototype, not a real person, and
not copied from any directory. The footer says so on every page. Say it out loud
once — it is the fastest way to establish that nothing here is a real person's data.

**No API key is needed.** The intake assistant and the matcher's case summary both run on a
deterministic local provider with nothing configured, which is why Scenario A and Scenario C
work on a fresh clone. You do not have to set anything up before starting, and it is worth
saying so — most prototypes with an AI feature cannot be reviewed by someone without an
account.

**There is no authentication.** `/matching-workspace` is open to anyone who can reach
it, on purpose: this prototype has no accounts, and a fake login would be pretending
to a security model that does not exist. Say it when you get to Scenario C, because
it is the first thing a technical reviewer looks for.

### A note on the dev-only footer

In development the footer shows `API ok` and a sample therapist. That is
`DevStatus` and `DevSampleProfile`, and they only render outside a production build.
If you are demonstrating from a production build (`npm run build && npm run preview`),
they are absent — which is itself worth mentioning, because it is how you can show
that the journey costs exactly one request per endpoint.

---

## Scenario A — a client gets a recommendation they can understand

**The point:** the product's promise is that it can explain itself, and the
explanation is generated from stored evidence rather than written beside it.

1. **Landing page.** _A calmer way to find your therapist._

   > "The page says 'Begin gently' rather than 'Get started'. That is the tone the
   > whole product is in — a person arriving here has usually had a hard month, and
   > the first thing we do is not ask them to hurry."

2. **Start page.** Point at the pull quote.

   > "It says you do not need to know what approach you need. 'Structured' and
   > 'exploratory' are words therapy uses about itself, and someone arriving with a
   > hard month has every reason to think they are about to be asked to choose one."

3. **Optional detour: say it in your own words.** From the start page, go to
   **`/intake/companion`** and type something ordinary:

   > "I've been overwhelmed at work lately. I moved to Germany a few years ago and I
   > think part of what I'm struggling with is balancing what my family expects from me
   > with what I actually want. I'd rather talk things through than be given homework."

   Then click **Show me what you understood**. Say the things that matter:

   > "Notice it read 'I'd rather talk things through than be given homework' as
   > _exploratory_ and not as _structured_. A keyword matcher cannot parse negation, so
   > the mock checks for a rejection in the sentence around a match — and it errs
   > towards a miss, because a lost suggestion is correctable on this page and a wrong
   > one is not."

   > "Also notice what it did **not** do. It wrote nothing. Keep, Change and Not quite are
   > all offered, none is pre-selected, and until you press one, nothing has been saved."

   Keep two, change one with **Change** (which takes you to the question that would adjust
   it), reject one with **Not quite**, and continue into the questions. The kept answers are
   already filled in.

   > "The conversation is a single column of prose with a quiet speaker marker. No
   > bubbles, no tails, no avatars — every one of those is a way of saying 'this is a
   > messaging app', and it is not one. Somebody telling a stranger something difficult
   > is not in a conversation with an equal, and a two-column layout asserts that they
   > are whatever the words happen to say."

   > "And the last thing on the page is a link to the questions, with a second one
   > above it. There is no state in which somebody is trapped in the assistant."

4. **The questions.** Click through, picking a couple of answers. **Leave one blank on
   purpose** and say so.

   > "Three of the seven are optional, and leaving one blank is a supported thing to
   > do rather than a failure. The review screen says so."

5. **Review.** _You told us…_

   > "Each answer has an Edit link. This is the moment where someone should feel
   > confident rather than like they have submitted a form — which is why the heading
   > is 'You told us' and not 'Summary'."

6. **Finding a fit.**

   > "This step used to be skipped on a first pass, which meant the journey indicator
   > promised a step that never happened. It is honest about what it is doing and it
   > does not pretend to take longer than it does — the search is milliseconds, and a
   > spinner longer than that would be theatre."

7. **The recommendation.** This is the important screen. Scroll to _Why we thought you
   might connect_.

   > "Every line is generated from a key that was stored when the match ran. Change the
   > wording in the vocabulary tomorrow and this page reads in tomorrow's words. There
   > is no score, no rank, no percentage and no other candidates — the response
   > schema declares `additionalProperties: false`, so adding one fails the API's own
   > tests rather than reaching a browser."

8. **The actions.** Point at the two controls.
   > "'This feels right' is present and deliberately inert — recording that a match
   > felt right is genuinely not built, and a control that silently does nothing is
   > worse than one that says why. 'I'd like another option' is the live path. Note
   > the wording: nobody has assessed the person on the other side of it."

**Optional: the profile link.** Click _Read more about…_ to show the full editorial
profile — monogram, biography, availability in their own timezone, and no photo
because no real therapist has agreed to have one used.

---

## Scenario B — saying it was not right, and getting someone different

**The point:** the feedback is taken into account in a way that can be described
exactly, and the client is never told anything false about it.

1. From the recommendation, choose **I'd like another option**.

2. **Feedback.** _Tell us what didn't quite fit._

   > "Read the five reasons. Every one describes the interaction, not the person:
   > 'the timing did not work for me', 'the communication style didn't feel right'.
   > There is no star rating, no thumbs, and no sentiment scale — a person who has
   > decided this is not for them has not assessed the therapist."

3. Tick **The communication style didn't feel right**, and write a sentence in the
   optional note.

   > "The note is optional and it is never logged. It is stored because the product is
   > built on someone being allowed to say more than a checkbox allows."

4. **Look for someone else.** You land on a different person.

   > "The same deterministic engine, run again over the same intake, with two
   > differences: everyone already declined on this journey is left out, and the
   > categories the person mentioned count for more — up to a ceiling. That is the
   > entire mechanism."

5. **What changed this time.** Read it aloud.

   > "Notice what it does _not_ say. It will only report a change when the person
   > mentioned it, the attributes really do differ, and the new person covers their
   > stated preference strictly better. Here it says the style changed 'though not in
   > a way you asked about' — which is true, and is the honest answer rather than a
   > manufactured one."

6. **The honesty check.** If you have time, refresh the page.
   > "The framing survives a refresh, because the server owns it. And if you decline
   > enough people, you reach a page that says we could not find another fit — an
   > honest answer, not an error, with the real next step named and marked as not
   > built."

---

## Scenario C — the system suggests, and a person agrees

**The point:** the engine is a suggestion, and a person is accountable for it.

1. Go to **http://localhost:5173/matching-workspace**. Say the word "internal" and
   the absence of authentication out loud.

   > "No login, no session, no token, and no fake login either. Anyone who can reach
   > this path can read every case. The paths are one greppable family, so putting it
   > behind a guard is one mount when there is something to guard with."

2. **The queue.**

   > "A list of rows, not cards. Each row says who was suggested, which search it is,
   > and whether the client has already said what did not fit — and nothing else. An
   > earlier version put 'Needs review' on every row, which taught a matcher nothing
   > because it was the same on all of them."

3. **Open a case.** Read the sections in order: client needs, the system suggestion,
   the alternatives, the decision, the history.

   > "The order is the order the questions get asked. Needs first, because every
   > judgement below is a judgement about fit, and fit means nothing without the
   > request."

4. **The system suggestion.** Scroll to _Why this could work_.

   > "Same sentences the client will read, word for word — a reviewer reasoning from
   > different wording is reasoning from a different understanding. And under it, the
   > line the engine's evidence cannot produce: what this person does _not_ offer.
   > The engine's evidence is positive-only, which is right for a client and wrong for
   > a reviewer."

5. **The alternatives.** Four of them.

   > "The backend evaluates all fifty. Showing fifty would be a dump of the engine's
   > shortlist, and a matcher scrolling a list of fifty reads none of it. These four
   > are in the engine's own order — the score decided that order and then
   > disappeared; it is never on the page."

6. **The decision.** Choose **Use this recommendation**.

   > "Two paths, in the same voice. Neither is marked correct. Choosing somebody else
   > asks why, because a decision with no stated reason leaves the audit trail
   > recording a disagreement it cannot explain."

7. **The record.**
   > "'You agreed with Tara Joshi.' A decision is a record of a past moment, so there is
   > no way to change it here. The client is shown a therapist and a reason or two,
   > and is not told a system was involved."

---

## Scenario D — the system suggests, and a person disagrees

**The point:** this is the scenario the whole phase exists for. The engine is
sometimes wrong, the record stays honest, and the client is unaffected.

1. In the workspace, open **another** undecided case. The one from `db:demo:workspace`
   is a good one — see the note below.

2. **Read the system suggestion's gaps.**

   > "Here the engine has suggested somebody whose conversation style is not what the
   > client asked for. That is not a bug: a stated preference is a weight, not a gate,
   > so somebody can come out level on score with a person who does match it. It is
   > precisely the case a human matcher exists for."

3. **Look at the alternatives.** Find the one whose style does match.

   > "A legitimate candidate with genuinely different strengths — not a worse version
   > of the same thing, and never a strawman."

4. **Choose another therapist.** Tick **Better communication style**, and add a note.

   > "The note is stored with the decision, shown to nobody but the reviewer, and never
   > sent to the client."

5. **Record it.**

   > "'The system had suggested X. That recommendation has not been changed — it is
   > still on the record, with its own evidence — but the client will be shown Y.'"

6. **The journey.**

   > "System, human, client recommendation — three separate facts. The first is a row
   > in the database that nothing has touched, the second is a row beside it, and the
   > third is derived from those two rather than stored, so it cannot disagree with
   > them."

7. **Verify the client is unaffected.** Go to `/recommendation` in the same tab.

   **This is the step to actually perform.** Read the person's name aloud. Then say:

   > "The client is shown the therapist the matcher chose, with that person's reasons.
   > They are not told a system was involved, that anything was reviewed, that anyone
   > disagreed, what the engine ranked first, or what the matcher wrote. The
   > client-facing response did not gain a single field — a test asserts the serialised
   > key set is identical before and after a decision."

8. **Verify the trail survived.** Back to the workspace, reopen the case.
   > "One decision per case, immutable, with the reason beside it. A repeated request
   > returns the first decision rather than writing a second one."

### Why the demo case is a good one

`npm run db:demo:workspace` builds an intake with the strongest signals the demo can
produce — Hindi and English, an exploratory conversation, the Indian diaspora,
relationships and career transitions, weekday evenings — and runs the real engine
over it. It prints what the engine suggested and who else it considered.

For the scenario above it prints something worth pausing on: the engine suggests a
therapist whose style is **Direct · Structured · Warm**, for a client who explicitly
asked for an **exploratory** conversation, while an alternative who matches the
stated style sits level on score.

**The seed and the engine were both left alone rather than tuned to make the demo
look better.** A demo that flattered the engine would be worth less than this one,
because the honest version is the argument.

---

## If you need a different scenario

A fresh intake per person, and the intake is stored in `sessionStorage` under the
tab, so a new tab or a cleared session is a new person. For a workspace case,
`npm run db:demo:workspace` is idempotent — it removes the previous demo client and
creates a new one.

---

## Things that are deliberately not built

Worth knowing in advance, because each is a control on a page and a reviewer will ask:

| Control                      | Why                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| "This feels right"           | Recording that a match felt right is not built. Present, focusable, and honest about it.                                 |
| "Revisit what you told us"   | Loosening a requirement and searching again is real work on the matching side. Present, focusable, honest.               |
| `/rematch` as a journey step | A second pass comes from the feedback loop. A step that exists only to be clicked is worse than one that does not exist. |
| Therapist sign-in            | No accounts, by design.                                                                                                  |
| Booking, messaging, payments | Out of scope.                                                                                                            |

And one thing that is a real limitation rather than a placeholder: **there is no
authentication on the workspace.** It is a prototype boundary, documented in
[`human-matching.md`](human-matching.md), not a security posture.
