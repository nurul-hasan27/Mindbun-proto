import type { AvailabilityWindowInput } from '../intake/intakeTypes.js';
import type { ZonedWindow } from './availability.js';
import type { ClientSignals, RequirementRule } from './matchingTypes.js';

/**
 * Stage 2 of the pipeline: reduce what was stored to the keys the engine compares.
 *
 * The intake stores *facts* — a preference set, an availability list, a note. The
 * engine compares *signals*, and turning one into the other is a judgement, so it
 * lives in one small file with its reasoning attached rather than being spread
 * through the comparison code where nobody would look for it.
 *
 * Nothing here reads the database, and nothing here can fail. That is what lets the
 * rest of the engine be tested with a literal.
 */

/** What the repository hands to `toClientSignals`. */
export interface StoredIntake {
  readonly areasOfWork: readonly string[];
  readonly communicationStyles: readonly string[];
  readonly openToGuidance: boolean;
  /** Always empty in this phase; the engine supports it for when the intake asks. */
  readonly approaches: readonly string[];
  readonly contextualExperiences: readonly string[];
  readonly languages: readonly string[];
  readonly sessionFormats: readonly string[];
  /**
   * The client's availability, in their own timezone. Null when they shared none,
   * which is a real answer and not a missing one.
   */
  readonly availability: {
    readonly timezone: string;
    readonly windows: readonly AvailabilityWindowInput[];
  } | null;
  /**
   * Whether the person stored this preference set as a set of requirements.
   *
   * `ClientPreference.kind`, carried through unchanged. It is the difference
   * between "I would like a shared language" and "I need a shared language", and it
   * is the intake phase's to set, not the engine's to invent.
   */
  readonly markedAsRequirements: boolean;
}

/**
 * The requirements a set of preferences implies.
 *
 * This is the single most important judgement in the engine, so it is stated
 * plainly rather than inferred from `required: true` flags scattered around the
 * code:
 *
 * | Signal | When it is a requirement | Why |
 * | --- | --- | --- |
 * | Languages | **any one** of the selected languages | A session in a language neither person speaks cannot happen. It is a disjunction, not a conjunction: someone who selected Hindi and Tamil was not saying they would refuse a session in Tamil. |
 * | Session formats | **any one** of the selected formats | The same shape. "Either is fine" — which the intake stores as *both* formats — therefore excludes nobody, which is the correct answer for the answer the client gave. |
 * | Areas of work | never, unless the set is marked as requirements | No one has ever said "I will only see someone whose profile lists this area". Inventing that rule would set people aside for something they never asked. |
 * | Conversation style | never | Style is how the work feels, not whether it can happen. |
 * | Contextual experience | never | The intake question is explicitly optional and asks what would *help*, not what is mandatory. |
 * | Availability | never | A rough sense of a week is a preference. A therapist being free elsewhere is not a reason to set them aside, and a therapist being free then is not a reason to insist. |
 *
 * When the preference set is marked `REQUIREMENT`, all of it becomes requirements
 * under `ALL_OF` — every listed area, every listed language, every listed format.
 * That is the honest reading of someone who says "these are conditions, not
 * preferences", and it is what the column is for. Phase 4 never sets it; a later
 * phase that lets someone insist on specific things will.
 */
export function deriveRequirements(stored: StoredIntake): readonly RequirementRule[] {
  if (stored.markedAsRequirements) {
    const strict: readonly RequirementRule[] = [
      {
        quantifier: 'ALL_OF',
        ruleKey: 'areas_of_work',
        category: 'AREA_OF_WORK',
        keys: distinct(stored.areasOfWork),
        label: 'the areas of work you named',
      },
      {
        quantifier: 'ALL_OF',
        ruleKey: 'language',
        category: 'LANGUAGE',
        keys: distinct(stored.languages),
        label: 'the languages you named',
      },
      {
        quantifier: 'ALL_OF',
        ruleKey: 'session_format',
        category: 'SESSION_FORMAT',
        keys: distinct(stored.sessionFormats),
        label: 'the way you would like to meet',
      },
    ];

    return strict.filter((rule) => rule.keys.length > 0);
  }

  const permissive: readonly RequirementRule[] = [
    {
      quantifier: 'ANY_OF',
      ruleKey: 'language',
      category: 'LANGUAGE',
      keys: distinct(stored.languages),
      label: 'a language you would be comfortable speaking',
    },
    {
      quantifier: 'ANY_OF',
      ruleKey: 'session_format',
      category: 'SESSION_FORMAT',
      keys: distinct(stored.sessionFormats),
      label: 'the way you would like to meet',
    },
  ];

  return permissive.filter((rule) => rule.keys.length > 0);
}

/** Stage 2: what was stored becomes the signals the engine compares. */
export function toClientSignals(stored: StoredIntake): ClientSignals {
  return {
    areasOfWork: distinct(stored.areasOfWork),
    communicationStyles: distinct(stored.communicationStyles),
    openToGuidance: stored.openToGuidance,
    approaches: distinct(stored.approaches),
    contextualExperiences: distinct(stored.contextualExperiences),
    languages: distinct(stored.languages),
    sessionFormats: distinct(stored.sessionFormats),
    availability: stored.availability,
    requirements: deriveRequirements(stored),
  };
}

/**
 * Sorted and de-duplicated.
 *
 * Sorting is not cosmetic. Two intakes with the same answers in a different order
 * must produce byte-identical payloads, or the same submission would store
 * differently twice and the deduplication by submission id would be a promise the
 * system could not keep.
 */
function distinct(keys: readonly string[]): readonly string[] {
  return [...new Set(keys.filter((key) => key !== ''))].sort();
}

/** The client's availability as the availability module wants it. */
export function clientAvailabilityWindows(signals: ClientSignals): readonly ZonedWindow[] {
  return signals.availability?.windows ?? [];
}
