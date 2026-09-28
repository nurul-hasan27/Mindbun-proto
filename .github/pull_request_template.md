## What changed

<!-- One or two sentences. What a reader would look at and understand the shape of. -->

## Why

<!--
The decision, and what it rules out. Not a restatement of the diff — the diff
already says what changed. Say why this way and not another, and name the
alternative you rejected.
-->

## Screenshots

<!--
Required for anything visual. 1440px and 320px, both, because the two failures
look nothing alike: a desktop screenshot hides a page that needs horizontal
scrolling on a phone.

Drop the images in the branch under docs/screenshots/ and reference them here.
If the change is not visual, say so rather than leaving this empty.
-->

| 1440px | 320px |
| --- | --- |
|  |  |

## Tests

<!-- Tick what you actually ran, and give the counts. -->

- [ ] `npm run check` — API unit: ___ · Web: ___
- [ ] `npm run test:db` — database: ___
- [ ] `npm run build` — both workspaces

<!--
Anything you did not run, say so. An unchecked claim in a merged pull request is
worse than an admitted gap, because the next person trusts it.
-->

Not run:

## Browser verification

<!--
What a person did, in a real browser. "Tests pass" is not verification.

The journey, the widths, keyboard-only, reduced motion, and what the network
panel showed. Name the flows and the widths.
-->

- [ ] Full journey, driven rather than read
- [ ] 320px · 390px · 834px · 1440px, no horizontal overflow
- [ ] Keyboard-only, with a visible focus ring on every stop
- [ ] `prefers-reduced-motion` collapses to zero
- [ ] Network panel: no unexpected duplicate requests, no errors on a happy path
- [ ] Console: no errors

Flows walked:

Widths checked:

## Accessibility

- [ ] One `h1` per route, no skipped heading level
- [ ] Selected and error states are not signalled by colour alone
- [ ] Errors announced (`role="alert"`), focus moved where it should be
- [ ] Touch targets usable at 320px
- [ ] Nothing removed that a keyboard or screen-reader user relied on

Verified with:

## Privacy considerations

<!--
Answer these. "No change" is a valid answer, but only once you have checked.

- [ ] No free text is logged — a person's own words, or a matcher's note
- [ ] No score, rank, percentage or weight reaches a client-facing response
- [ ] No identifier a browser could steer a request with
- [ ] No new field added to a client-facing schema that internal data could use
- [ ] Nothing sensitive committed: no `.env`, no credentials, no real personal data
- [ ] The three decisions stay separate — engine, human, client-facing
-->

## Checklist

- [ ] `npm run check`
- [ ] Database tests
- [ ] Production build
- [ ] Browser verification
- [ ] Responsive verification
- [ ] Accessibility verification
- [ ] No sensitive data added
- [ ] Documentation updated in the same commit, if this made any of it wrong
- [ ] History not rewritten, nothing force-pushed
