import { IntakeProvider } from '../../lib/intake/IntakeProvider';
import { IntakeLayout } from './IntakeLayout';

/**
 * The intake, and the one piece of state that survives navigating between its
 * questions.
 *
 * The provider wraps the whole question subtree rather than sitting inside one
 * step, and that placement is the only thing making this work: navigating from
 * "conversation" to "context" swaps the rendered question, not the state behind
 * it. No pathname is ever used as a key, so nothing is remounted and no answer is
 * lost by going back.
 *
 * A refresh is handled by the other half of the same design — the draft is
 * written to session storage as it changes — so any question can be opened
 * directly, reloaded, or bookmarked and the answers are still there.
 */
export function IntakeEntry() {
  return (
    <IntakeProvider>
      <IntakeLayout />
    </IntakeProvider>
  );
}
