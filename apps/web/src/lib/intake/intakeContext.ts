import { createContext, useContext } from 'react';
import type { ApiError } from '../api/errors';
import type { IntakeReceipt, IntakeVocabulary } from '../api/types';
import type { IntakeDraft } from './draft';

/**
 * The shape the intake is read through.
 *
 * Kept apart from the provider component so that a module exporting a component
 * exports only that component: fast refresh can then do its job, and the context
 * has one obvious home.
 */
export type IntakeStatus = 'answering' | 'reviewing' | 'sent';

export interface IntakeContextValue {
  readonly status: IntakeStatus;
  readonly draft: IntakeDraft;
  readonly vocabulary: IntakeVocabulary | null;
  /** Set when the questions could not be loaded, which is a dead end for the flow. */
  readonly vocabularyError: ApiError | null;
  readonly saving: boolean;
  readonly saveError: ApiError | null;
  readonly receipt: IntakeReceipt | null;
  /** Answers one question. The only way a step changes the draft. */
  readonly update: (change: (draft: IntakeDraft) => IntakeDraft) => void;
  readonly beginReview: () => void;
  readonly send: () => void;
  /** Wipes the draft, the identifiers, and the confirmation. */
  readonly startAgain: () => void;
}

export const IntakeContext = createContext<IntakeContextValue | null>(null);

export function useIntake(): IntakeContextValue {
  const value = useContext(IntakeContext);

  if (value === null) {
    throw new Error('useIntake must be used inside an IntakeProvider.');
  }

  return value;
}
