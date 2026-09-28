import type { AiSuggestion, SuggestionTarget } from '../api/ai';
import {
  setOpenToGuidance,
  setSessionFormats,
  toggleArea,
  toggleCommunicationStyle,
  toggleContext,
  toggleDay,
  toggleLanguage,
  toggleTimeOfDay,
  type IntakeDraft,
} from './draft';

/**
 * Turning kept suggestions into the draft.
 *
 * ## There is one intake state, and this is not a second one
 *
 * Everything here goes through the same `toggle*` functions the intake questions use. No
 * suggestion is stored anywhere of its own, no intermediate form exists, and the review page
 * reads one object. If the assistant had a parallel draft, the review page would have had to
 * merge two, and the two would eventually disagree about what someone said.
 *
 * ## Each target maps to exactly one operation
 *
 * The server decides the destination and sends it in `target`, so this file is a
 * `switch` and not a lookup table that could disagree with the server about which key goes
 * where. An unknown `kind` is refused rather than guessed at — a suggestion silently dropped
 * on the way to the draft is a suggestion the person kept and did not get.
 */

/** Why something could not be applied. Rendered, so the wording is part of the product. */
export type ApplyFailure =
  | { readonly kind: 'unknown-target'; readonly key: string }
  | { readonly kind: 'no-target'; readonly key: string };

export type ApplyResult =
  | { readonly ok: true; readonly draft: IntakeDraft }
  | { readonly ok: false; readonly key: string; readonly failure: ApplyFailure };

/**
 * Apply one suggestion.
 *
 * Availability is the interesting one. It does not write days or times into the draft at
 * all: someone who said "evenings" has not told us a day, and writing one for them would put
 * words in their mouth on a page that then says "you told us". So the hint is returned for
 * the availability *question* to offer, and the draft is untouched until it is confirmed
 * there like any other answer.
 */
export function applySuggestion(draft: IntakeDraft, suggestion: AiSuggestion): ApplyResult {
  const target: SuggestionTarget | undefined = suggestion.target;

  if (target === undefined) {
    return { ok: false, key: suggestion.key, failure: { kind: 'no-target', key: suggestion.key } };
  }

  switch (target.kind) {
    case 'draft': {
      switch (target.field) {
        case 'areasOfWork':
          return ok(toggleArea(draft, suggestion.key));
        case 'communicationStyles':
          // Not `toggleCommunicationStyle` blindly: that clears the guidance flag, and a
          // suggestion must not silently change an answer the person gave deliberately.
          return ok(
            toggleCommunicationStyle(
              draft.openToGuidance
                ? { ...draft, openToGuidance: false }
                : draft,
              suggestion.key,
            ),
          );
        case 'contextualExperiences':
          return ok(toggleContext(draft, suggestion.key));
        case 'languages':
          return ok(toggleLanguage(draft, suggestion.key));
        case 'sessionFormats':
          // Session format is a single set rather than a list of choices, so this adds
          // rather than toggles. A person who named two formats in one sentence meant both.
          return ok(
            setSessionFormats(draft, [...new Set([...draft.sessionFormats, suggestion.key])]),
          );
        default:
          return { ok: false, key: suggestion.key, failure: { kind: 'unknown-target', key: suggestion.key } };
      }
    }

    case 'guidance':
      return ok(setOpenToGuidance(draft, true));

    case 'availabilityHint':
      // Deliberately the draft unchanged. See the note above.
      return ok(draft);

    case 'note-only':
      return ok(draft);

    default:
      return { ok: false, key: suggestion.key, failure: { kind: 'unknown-target', key: suggestion.key } };
  }
}

function ok(draft: IntakeDraft): ApplyResult {
  return { ok: true, draft };
}

/**
 * Apply several kept suggestions, in order.
 *
 * Sequential rather than a `reduce` over a `Set`, because the order matters: `guidance` and
 * `communicationStyle` write the same part of the draft and the draft's own rules decide
 * which wins. Folding in the order the person kept them keeps that decision visible and
 * testable rather than emergent.
 *
 * Returns the failures as well as the draft, so the interface can say which ones did not
 * land. It is better to say one suggestion could not be applied than to have the count
 * quietly differ from what the person pressed.
 */
export function applySuggestions(
  draft: IntakeDraft,
  suggestions: readonly AiSuggestion[],
): { readonly draft: IntakeDraft; readonly failures: readonly ApplyFailure[] } {
  let current = draft;
  const failures: ApplyFailure[] = [];

  for (const suggestion of suggestions) {
    const result = applySuggestion(current, suggestion);

    if (result.ok) {
      current = result.draft;
    } else {
      failures.push(result.failure);
    }
  }

  return { draft: current, failures };
}

/**
 * An availability hint, as the availability question would offer it.
 *
 * A function rather than a value because the hint is only meaningful against the draft it is
 * being offered to: a person who has already said Monday evenings should be shown Tuesday
 * evenings as the thing that is *new*, not the whole hint again.
 */
export function availabilityHintDelta(
  draft: IntakeDraft,
  target: Extract<SuggestionTarget, { kind: 'availabilityHint' }>,
): { readonly part: 'morning' | 'afternoon' | 'evening' | null; readonly days: readonly string[] } | null {
  const newDays = target.days.filter((day) => !draft.days.includes(day));
  const partIsNew = target.part !== null && !draft.timeOfDay.includes(target.part);

  if (newDays.length === 0 && !partIsNew) {
    return null;
  }

  return { part: partIsNew ? target.part : null, days: newDays };
}

/**
 * Whether a suggestion is already in the draft.
 *
 * Used to show "already saved" rather than a second Keep button, because pressing Keep on
 * something already in the draft would *remove* it — the `toggle*` functions are toggles,
 * which is right for a form and wrong for an approval.
 */
export function isAlreadyApplied(draft: IntakeDraft, suggestion: AiSuggestion): boolean {
  const target: SuggestionTarget | undefined = suggestion.target;

  if (target === undefined) {
    return false;
  }

  switch (target.kind) {
    case 'draft':
      switch (target.field) {
        case 'areasOfWork':
          return draft.areasOfWork.includes(suggestion.key);
        case 'communicationStyles':
          return draft.communicationStyles.includes(suggestion.key);
        case 'contextualExperiences':
          return draft.contextualExperiences.includes(suggestion.key);
        case 'languages':
          return draft.languages.includes(suggestion.key);
        case 'sessionFormats':
          return draft.sessionFormats.includes(suggestion.key);
        default:
          return false;
      }

    case 'guidance':
      return draft.openToGuidance;

    case 'availabilityHint':
      // "Already there" is about the *new* part, matching the hint above.
      return availabilityHintDelta(draft, target) === null;

    case 'note-only':
      return true;

    default:
      return false;
  }
}

/** Apply a hint to the draft, as though the person had answered the question themselves. */
export function applyAvailabilityHint(
  draft: IntakeDraft,
  target: Extract<SuggestionTarget, { kind: 'availabilityHint' }>,
): IntakeDraft {
  let next = draft;

  for (const day of target.days) {
    next = toggleDay(next, day);
  }

  if (target.part !== null) {
    next = toggleTimeOfDay(next, target.part);
  }

  return next;
}
