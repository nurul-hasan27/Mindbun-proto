import type { IntakeVocabulary } from '../api/types';
import {
  choicesFor,
  isClearingChoice,
  isUnsureChoice,
  keysForChoice,
  questionById,
  type Choice,
  type QuestionId,
} from './questions';
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
  type TimeOfDay,
} from './draft';
import type { DayName } from '../api/types';

/**
 * Answering a question.
 *
 * The draft is a value, so every rule about how a choice changes it lives in one
 * file: which stored list a question reads from, what a choice's label means as
 * a key, and which answers replace a list instead of adding to it. The pages
 * that ask the questions stay presentational because of it.
 */

/** The choices a question offers, in the product's wording. */
export function answerChoices(id: QuestionId, vocabulary: IntakeVocabulary): readonly Choice[] {
  return choicesFor(id, vocabulary);
}

/** The stored list a question reads its answer from. */
export function keysOf(draft: IntakeDraft, id: QuestionId): readonly string[] {
  switch (id) {
    case 'support':
      return draft.areasOfWork;
    case 'conversation':
      return draft.openToGuidance ? [UNSURE] : draft.communicationStyles;
    case 'context':
      return draft.contextualExperiences;
    case 'language':
      return draft.languages;
    case 'sessions':
      return draft.sessionFormats;
    case 'availability':
      return draft.days;
    case 'anything-else':
      return [];
  }
}

/** A sentinel for the "I'm not sure yet" answer, which is not a vocabulary key. */
export const UNSURE = 'not-sure-yet';

/** The "either is fine" answer means two formats at once. */
const EITHER_KEYS: readonly string[] = ['in-person', 'online'];

/**
 * Every key a choice stands for, including the two answers that are not
 * vocabulary terms at all.
 *
 * The sentinels matter: "I'm not sure yet" and "either is fine" are real answers,
 * and a page that reads a choice's state from its keys has to be able to see them
 * or the selected state never appears.
 */
export function keysHeldBy(choice: Choice): readonly string[] {
  if (choice.key !== undefined) {
    return [choice.key];
  }

  if (choice.code !== undefined) {
    return [choice.code];
  }

  if (isUnsureChoice(choice)) {
    return [UNSURE];
  }

  if (choice.label === 'Either is fine') {
    return EITHER_KEYS;
  }

  return [];
}

/**
 * Whether a choice is currently recorded, for both single and multiple answers.
 *
 * A multiple answer is recorded when *any* of its keys is held. A single answer
 * needs *all* of them, so "either is fine" only reads as chosen when both formats
 * are recorded — which is what makes it visibly different from a skipped step.
 */
export function isRecorded(id: QuestionId, choice: Choice, draft: IntakeDraft): boolean {
  const held = keysOf(draft, id);
  const keys = keysHeldBy(choice);

  if (keys.length === 0) {
    return false;
  }

  return questionById(id).kind === 'single'
    ? keys.length === held.length && keys.every((key) => held.includes(key))
    : keys.some((key) => held.includes(key));
}

/**
 * Applies a choice.
 *
 * Two answers replace a list rather than adding to it, and both are deliberate:
 * "Something else" means the areas do not apply, and "Nothing specific comes to
 * mind" means the contexts do. Leaving stale selections behind would put an
 * answer on the review screen that the person had just taken back.
 */
export function answer(id: QuestionId, choice: Choice, draft: IntakeDraft): IntakeDraft {
  switch (id) {
    case 'support':
      return choice.key === undefined && isClearingChoice(choice)
        ? { ...draft, areasOfWork: [] }
        : choice.key === undefined
          ? draft
          : toggleArea(draft, choice.key);

    case 'conversation':
      if (isUnsureChoice(choice)) {
        return setOpenToGuidance(draft, true);
      }

      return choice.key === undefined ? draft : toggleCommunicationStyle(draft, choice.key);

    case 'context':
      return choice.key === undefined && isClearingChoice(choice)
        ? { ...draft, contextualExperiences: [] }
        : choice.key === undefined
          ? draft
          : toggleContext(draft, choice.key);

    case 'language':
      return choice.code === undefined ? draft : toggleLanguage(draft, choice.code);

    case 'sessions':
      return setSessionFormats(draft, keysForChoice(choice));

    default:
      return draft;
  }
}

/** Days and parts of the day, which the availability step toggles directly. */
export function answerDay(draft: IntakeDraft, day: DayName): IntakeDraft {
  return toggleDay(draft, day);
}

export function answerTimeOfDay(draft: IntakeDraft, part: TimeOfDay): IntakeDraft {
  return toggleTimeOfDay(draft, part);
}

/**
 * Whether a question has been answered enough to continue.
 *
 * The required questions are the ones a recommendation could not be explained
 * without: what you want support with, what kind of conversation helps, a
 * language, and a way of meeting. Everything else may be left alone.
 */
export function draftHasAnswer(draft: IntakeDraft, id: QuestionId): boolean {
  if (!questionById(id).required) {
    return true;
  }

  switch (id) {
    case 'support':
      return draft.areasOfWork.length > 0;
    case 'conversation':
      return draft.openToGuidance || draft.communicationStyles.length > 0;
    case 'language':
      return draft.languages.length > 0;
    case 'sessions':
      return draft.sessionFormats.length > 0;
    default:
      return true;
  }
}

export function isDraftEmptyFor(draft: IntakeDraft, id: QuestionId): boolean {
  return keysOf(draft, id).length === 0;
}

// The flow's own order, re-exported so a page can ask "what is next?" and
// "what did we just ask?" from one import.
export {
  nextQuestion,
  previousQuestion,
  questionById,
  questionIndex,
  questionOrder,
} from './questions';
