import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useApiResource } from '../useApiResource';
import { fetchIntakeVocabulary, submitIntake } from '../api';
import { toApiError, type ApiError } from '../api/errors';
import type { IntakeReceipt } from '../api/types';
import { emptyDraft, toPayload, type IntakeDraft } from './draft';
import { IntakeContext, type IntakeContextValue, type IntakeStatus } from './intakeContext';
import {
  clearIntake,
  detectTimezone,
  loadDraft,
  releaseSubmissionId,
  saveDraft,
  sessionId,
  submissionId,
} from './session';

/**
 * The one place an intake's state lives.
 *
 * Everything the questions need — the draft, the vocabulary, whether it is
 * saving, whether it has been sent — is held here and reached through
 * `useIntake()`. Individual steps then become components that render one answer
 * and nothing else: they cannot lose each other's state, because none of them
 * owns any.
 *
 * This sits above the question routes rather than inside one, and that placement
 * is the whole mechanism: navigating from "conversation" to "context" swaps the
 * rendered question, not the state behind it. No pathname is used as a key, so
 * nothing is remounted and going back loses nothing.
 *
 * Three details worth knowing:
 *
 * - **The draft is written to session storage on every change**, so a refresh
 *   returns someone to where they were with their answers intact.
 * - **The timezone is detected once**, and only if storage has not already
 *   supplied one. It is stored as an IANA name and shown in words.
 * - **A failed send changes nothing but `saveError`.** The draft is untouched,
 *   which is what makes "Try again" safe.
 */
export function IntakeProvider({ children }: { readonly children: ReactNode }) {
  const [draft, setDraft] = useState<IntakeDraft>(
    () => loadDraft() ?? { ...emptyDraft(), timezone: detectTimezone() },
  );
  const [status, setStatus] = useState<IntakeStatus>('answering');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [receipt, setReceipt] = useState<IntakeReceipt | null>(null);

  const vocabulary = useApiResource((signal) => fetchIntakeVocabulary(undefined, { signal }), []);

  const update = useCallback((change: (draft: IntakeDraft) => IntakeDraft) => {
    setDraft((current) => {
      const next = change(current);
      saveDraft(next);

      return next;
    });
  }, []);

  const beginReview = useCallback(() => setStatus('reviewing'), []);

  const startAgain = useCallback(() => {
    clearIntake();
    setDraft({ ...emptyDraft(), timezone: detectTimezone() });
    setStatus('answering');
    setSaving(false);
    setSaveError(null);
    setReceipt(null);
  }, []);

  const send = useCallback(() => {
    setSaving(true);
    setSaveError(null);

    // Read the draft as it is at the moment of sending, and keep both
    // identifiers stable so a retry stores one intake rather than two.
    const payload = toPayload(draft, { sessionId: sessionId(), submissionId: submissionId() });

    submitIntake(payload).then(
      (stored) => {
        // The answers have left the browser. Holding them afterwards would mean
        // keeping someone's own words on the device for no reason.
        clearIntake();
        releaseSubmissionId();
        setReceipt(stored);
        setStatus('sent');
        setSaving(false);
      },
      (reason: unknown) => {
        // The draft is untouched on purpose: the next attempt uses it as it is.
        setSaveError(toApiError(reason));
        setSaving(false);
      },
    );
  }, [draft]);

  const value = useMemo<IntakeContextValue>(
    () => ({
      status,
      draft,
      vocabulary: vocabulary.state.status === 'ready' ? vocabulary.state.data : null,
      vocabularyError: vocabulary.state.status === 'error' ? vocabulary.state.error : null,
      saving,
      saveError,
      receipt,
      update,
      beginReview,
      send,
      startAgain,
    }),
    [
      status,
      draft,
      vocabulary.state,
      saving,
      saveError,
      receipt,
      update,
      beginReview,
      send,
      startAgain,
    ],
  );

  return <IntakeContext.Provider value={value}>{children}</IntakeContext.Provider>;
}
