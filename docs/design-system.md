# Design system

Everything in this document is implemented in one place:
[`apps/web/src/styles/index.css`](../apps/web/src/styles/index.css). Components reference tokens,
never raw values, so the whole product can be retuned from that single file.

---

## 1. Philosophy

The product sits between two failure modes. On one side is the clinical software that greets
people with forms, scores, and dashboards. On the other is the marketplace that turns therapy into
browsing a catalogue of strangers. This system is built to avoid both.

Five principles, in priority order:

1. **Calm before clever.** Nothing moves, glows, or pulses to prove that it works. Restraint is
   what makes an interface feel safe.
2. **Editorial, not promotional.** The visual language comes from print: a serif with a voice,
   generous measure, hairline rules, real whitespace, and a hierarchy that can be read at a glance.
3. **Warm, never cute.** Warm neutrals carry almost all of the interface. Clay is used with intent,
   for a single accent per view. Nothing is saturated, neon, or gradient-lit.
4. **Space is a feature.** Whitespace does the separating that boxes, borders, and shadows would
   otherwise do. Where a surface is genuinely needed, one quiet panel is used — not a grid of them.
5. **The person is not a customer.** Copy is written as one human to another. No urgency, no
   conversion language, no "AI-powered", no fake numbers.

### What is deliberately absent

Glassmorphism · neon or saturated colour · purple/blue "AI" gradients · floating blobs ·
generic stock or AI illustrations · emoji as UI · icon clutter · glowing buttons · drop shadows
that look like plastic · dashboard layouts on the client · bouncing, parallax, or scroll-jacking
animation · pricing, testimonials, FAQ, or statistics sections.

## 2. Colour

| Token            | Value      | Role                                                         |
| ---------------- | ---------- | ------------------------------------------------------------ |
| `canvas`         | `#F8F3EC`  | Page background: warm off-white                              |
| `canvas-sunk`    | `#F2EBE1`  | Recessed bands (reserved)                                    |
| `surface`        | `#FFFDF9`  | Panels, and the text colour on clay actions                  |
| `surface-quiet`  | `#FBF6EF`  | Secondary surface (reserved)                                 |
| `ink`            | `#2F2925`  | Primary text: earthy brown, never pure black                 |
| `ink-muted`      | `#6C6259`  | Secondary text                                               |
| `ink-faint`      | `#857A70`  | Decorative and large text **only** (3.6:1 — never body copy) |
| `line`           | `#E7DDD3`  | Hairlines                                                    |
| `line-strong`    | `#D9CBBC`  | Borders on quiet buttons                                     |
| `clay-50 … 900`  | warm ramp  | The single accent family                                     |
| `sage-100 … 700` | muted ramp | Positive / reassuring states (reserved for Phase 2)          |

Clay ramp: `50 #FBF3ED` · `100 #F4E4D8` · `200 #E8D5C5` · `300 #D9B69C` · `400 #C98F68` ·
`500 #B86F4A` · `600 #A85E37` · `700 #9E5832` · `800 #7E4227` · `900 #5F3019`

Unused tokens are kept as a complete, documented scale for later phases. Tailwind v4 tree-shakes
theme variables, so a token that nothing references costs nothing in the built CSS.

### Contrast (WCAG 2.1)

| Pair                                     | Ratio  | Verdict         |
| ---------------------------------------- | ------ | --------------- |
| `ink` on `canvas`                        | 12.6:1 | AAA             |
| `ink-muted` on `canvas`                  | 5.5:1  | AA (body text)  |
| `surface` on `clay-700` (primary button) | 5.3:1  | AA              |
| `clay-700` on `canvas` (link hover)      | 5.3:1  | AA              |
| `ink-faint` on `canvas`                  | 3.6:1  | Decorative only |
| `sage-700` on `sage-100` (reserved)      | 5.1:1  | AA              |

Focus rings use `clay-700` at 2px with a 3px offset, which clears 3:1 against both `canvas` and
`surface`.

### Colour rules

- Text is `ink` or `ink-muted`. `ink-faint` is for labels at large sizes and hairlines.
- `clay-700` is the only interactive fill. `clay-200/300` are for drawing, never for text.
- `sage-*` exists for future positive states and is currently unused on purpose.
- There is one theme. A dark mode was deliberately skipped: a half-considered dark theme would
  dilute the warmth the product depends on.

## 3. Typography

Two families, both self-hosted (no third-party requests, no layout shift):

- **Fraunces** (display) — a warm, slightly soft old-style serif. Headings, the wordmark, and
  pull quotes. Set at weight 400 with optical sizing on; headings are never bold.
- **Inter** (body/UI) — neutral, highly legible at small sizes. All running text, labels, and
  controls.

| Token             | Size                         | Line height | Tracking | Used for                       |
| ----------------- | ---------------------------- | ----------- | -------- | ------------------------------ |
| `text-display`    | `clamp(2.5rem, …, 4rem)`     | 1.06        | −0.022em | Landing headline only          |
| `text-title`      | `clamp(1.875rem, …, 2.5rem)` | 1.16        | −0.018em | Page headlines                 |
| `text-heading`    | 1.5rem                       | 1.28        | −0.012em | Section and list-item headings |
| `text-subheading` | 1.1875rem                    | 1.45        | —        | Pull quotes                    |
| `text-lead`       | 1.125rem                     | 1.65        | —        | Introductory paragraphs        |
| `text-body`       | 1rem                         | 1.70        | —        | Body copy                      |
| `text-small`      | 0.875rem                     | 1.6         | —        | Supporting copy, footer        |
| `text-micro`      | 0.75rem                      | 1.5         | —        | Small captions                 |
| `text-label`      | 0.75rem                      | 1.4         | 0.14em   | Uppercase eyebrows             |
| `text-brand`      | 1.0625rem                    | 1.2         | −0.01em  | Wordmark                       |

Rules:

- Headings use `text-balance`; body copy uses `text-pretty`. Never `text-justify`.
- Line length is capped by `max-w-measure` (62ch). The hero is allowed wider.
- Bold is used sparingly: only `font-medium` on controls, labels, and the wordmark.
- Headings stay expressive rather than large; the display size is the only 64px moment in the
  product, and it appears once.

## 4. Space, radii, shadows

- **Spacing**: Tailwind's 4px-rooted scale, plus two rhythm tokens so page structure is consistent
  across routes — `spacing-page` (horizontal gutter, `clamp(1.25rem, …, 2.75rem)`) and
  `spacing-section` (vertical rhythm between sections, `clamp(4rem, …, 7.5rem)`).
- **Layout**: one container, `max-w-6xl` (72rem) with the page gutter. Reading columns narrow to
  `max-w-2xl` (32rem) for single-column moments.
- **Radii**: `rounded-control` (10px) for buttons and inputs, `rounded-panel` (14px) for the one
  surface that needs it. No pills, no fully rounded cards.
- **Shadows**: `shadow-whisper` and `shadow-soft` — both warm-tinted (`rgb(47 41 37 / …)`) and
  low contrast, so elevation reads as paper rather than plastic. No shadow is used for decoration,
  only to lift an action or a surface off the page.

## 5. Texture and surface

- A single fixed **paper grain** layer (`.grain-layer`, SVG turbulence, 22% multiply) sits above
  the page and ignores pointer events. It removes the flat, plasticky feel of pure CSS.
- Two very soft warm radial lights are painted on `body`, anchored to the top of the document
  (never `background-attachment: fixed`, which is unreliable on mobile Safari).
- `.wash-quiet` adds a single soft light behind focused, single-column moments such as `/start`.

## 6. Components

Only what the product actually needs. Each is small, single-purpose, and token-driven.

| Component                   | Notes                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `Container`                 | The one page container; `as` lets a section be semantic                             |
| `Eyebrow`                   | Small letterspaced label; `as="h2"` when it introduces a section                    |
| `Button`                    | A real `<button>`; `unavailable` marks a control that exists but is not yet ready   |
| `ButtonLink`                | The same visual language, rendered as a real `<a>` via React Router                 |
| `TextLink`                  | Navigation that behaves like text, with an underline that draws in from the left    |
| `ArrowGlyph`                | A typographic arrow that leans 2px on hover — the only flourish an action gets      |
| `Wordmark`                  | Name plus a four-point mark; the same shape as the favicon                          |
| `UnderlineMark`             | One hand-drawn clay stroke, used once, under the promise the product makes          |
| `OverlapMark`               | The product idea as a diagram: two circles, the shared area in between              |
| `QuietButton`               | A real `<button>` in the same voice, for actions like "Try again"                   |
| `JourneyIndicator`          | Six hairlines showing where you are. Decorative, never a link                       |
| `JourneyPlaceholder`        | The shared shape of a step that does not exist yet, so five cannot drift apart      |
| `Monogram`                  | A person's initials in a hairline ring. The product stores no photographs           |
| `ChoiceOption`              | One answer: a native checkbox or radio wearing the row it sits in                   |
| `ToggleAll`                 | A plain button that shows or hides a list, saying how much is behind it             |
| `IntakeProgress`            | A part of the flow named in small capitals, and the hairlines showing where you are |
| `ProfileSection`            | One labelled, hairline-divided block of a profile, with a real heading              |
| `ProfileSection`            | One labelled, hairline-divided block of a profile, with a real heading              |
| `LoadingNote`               | One quiet line and a hairline that breathes. The loading state for the product.     |
| `ErrorNote`                 | A plain-language title, one way forward, and the technical detail tucked away       |
| `DevStatus`                 | Development-only proof that the client can reach the API. Never in a build.         |
| `SiteHeader` / `SiteFooter` | A name, your position, and a footnote. Not chrome — a frame.                        |

Three decisions worth stating:

- **`Button`, `ButtonLink` and `QuietButton` are separate components.** Choosing the right element
  for the job (action vs. navigation) is an accessibility decision, not a styling one.
- **An unavailable action is `aria-disabled`, not `disabled`.** It stays focusable, so keyboard
  and screen-reader users still discover that the step exists, and `aria-describedby` points at the
  sentence that explains why it is not ready yet.
- **The journey indicator is a position, not a progress bar.** It is not interactive, makes no
  claim about how far along anyone is, and carries the same information as text for anyone who
  cannot see the marks.

### Placeholders and empty states

A step that does not exist yet says what the step will be **for**, never that it is "coming soon".
The one honest sentence about the prototype's state is identical everywhere, so it never becomes a
novelty or a running gag:

> This step is not built yet. Nothing here is stored, and nothing is sent anywhere.

### Error copy

Error states never lead with a technical message. Each failure kind maps to a plain sentence and
one useful action; the status code and internal detail live in a collapsed disclosure, and in the
console. The product does not show `ERR_CONNECTION_REFUSED`, stack traces, or raw JSON to a visitor.

### A question is the page

The intake is the one place where a form could have taken over, and the whole design is a
refusal of that. The rules:

- **One question per screen**, as the `h1`, at display size. Everything else is sized to stay out
  of its way.
- **The label above it names the _part of the flow_** — "Getting to know what matters" — not the
  question. Repeating the question in small capitals directly above itself is noise wearing the
  same words twice.
- **Choices are rows of text**, not cards in a grid. A hairline between them, a small square or
  circle, and nothing else.
- **A selected row is marked four ways** — a clay rule, a clay tint, a filled mark, and heavier
  type — so the state survives being printed in black and white, and so a test can assert it
  without inspecting a colour.
- **No step counter in the body.** The hairlines show the shape of what is left; the count is in
  the text alternative, where it is useful and nowhere else.
- **The action is "Continue"** everywhere, and on the last question it becomes "Review what you
  told us". Nothing on this screen promises a match, because there is not one to promise.

### People are not entries

A therapist profile is a person, and it has to work without the visual shorthand of a directory. So:
no stock portrait — a monogram of their initials in a hairline ring, because no real therapist has
agreed to have their image used here. No score, no rank, no reviews, no star rating, no "best match"
badge. No chips or pills carrying attributes: an area of work is a line of text, and a label above a
list is a heading rather than a caption. The only action on the page is a way back.

Those absences are enforced by a test, so the page cannot quietly become a marketplace later.

## 7. Motion

Motion exists to explain a change of page, never to entertain.

| Interaction     | Treatment                                                               |
| --------------- | ----------------------------------------------------------------------- |
| Route change    | 420ms fade + 8px rise, `cubic-bezier(0.22, 0.61, 0.36, 1)`, played once |
| Waiting         | A 1px hairline breathing between 35% and 100% opacity over 2.4s         |
| Primary action  | 200ms colour + shadow, and a 1px lift on hover                          |
| Quiet link      | 300ms underline draw from the left, 200ms colour                        |
| Arrow           | 2px nudge on hover, 200ms                                               |
| Everything else | No transition                                                           |

Rules:

- One entrance, and only on route change. It is played with the Web Animations API on the existing
  element, never by remounting a page, so navigation cannot destroy state.
- No bounce, no overshoot, no parallax, no scroll-triggered reveals, no skeleton shimmer.
- Durations stay in the 160–420ms band; anything slower feels like waiting, which is the wrong
  feeling for this product.
- `prefers-reduced-motion: reduce` collapses every animation and transition to ~0ms, declared last
  and unlayered so it wins over all utilities — and the route entrance is skipped in JavaScript as
  well, so nothing is even scheduled.

## 8. Accessibility

- Semantic HTML first: `header`, `main`, `footer`, real headings in order, real lists, real
  `figure`/`figcaption`, real `blockquote`. One `h1` per route.
- A skip link is the first tab stop and becomes visible on focus.
- Focus is always visible: `:focus-visible` outline in `clay-700`, 2px, 3px offset. Never removed.
- Every link and button has an accessible name; decorative SVG is `aria-hidden`; the overlap
  diagram carries a text description in a visually hidden caption.
- Colour is never the only signal — the overlap diagram, the unavailable button, and the journey
  hairlines each carry shape or text as well.
- The journey indicator is decorative and duplicated as text ("Step 3 of 6: Finding a fit"), so it
  is never the only way to know where you are.
- Error states announce themselves with `role="alert"`, lead with plain words, and keep the
  technical detail behind a disclosure.
- Text meets AA at every size in the scale (see the contrast table).
- Touch targets are at least 44px tall on mobile; the hero action is ~52px.
- Layouts are designed at 320, 390, 834 and 1440px. Small screens get a different composition
  (single column, tighter label tracking, narrower journey marks), not a shrunken desktop.
- Respects `prefers-reduced-motion`. Dark mode is not offered; `color-scheme` is declared `light`
  so form controls and scrollbars match the canvas.
