import type { MatchReason } from '../lib/api/types';

/**
 * "Why we thought you might connect"
 *
 * The most important element in the product, and the one most likely to be
 * over-designed. It is not a panel, not a card with a heading in the corner, and not
 * a block of generated prose pretending to be a person writing. It is a short list
 * of sentences, each of which is one fact the server has, set in the same display
 * serif as everything else and separated by hairlines like every other section.
 *
 * Four things it deliberately is not:
 *
 * - **Not a percentage, a score, or a bar.** There is no meter here. A person who
 *   sees "78% match" is being given a number with no meaning attached to it, and
 *   asked to trust it.
 * - **Not exhaustive.** The server sends the handful of strongest reasons, chosen
 *   by a documented rule; the rest are in the stored record for a reviewer.
 * - **Not a comparison.** Nothing here names anyone else, because naming the other
 *   option is how a page becomes a comparison table with extra steps.
 * - **Not attributed to a machine.** There is no "AI", no "algorithm", and no
 *   "based on 47 data points". The reasons are a handful of things the person said
 *   and a handful of things a therapist said, and the sentences say exactly that.
 */
export function WhyThisMatch({ reasons }: { readonly reasons: readonly MatchReason[] }) {
  if (reasons.length === 0) {
    // Possible only if a stored run had no evidence at all, which the engine cannot
    // currently produce — but a page that says nothing is better than a page that
    // invents a reason.
    return null;
  }

  return (
    <section aria-labelledby="why-this-match">
      <h2 id="why-this-match" className="font-display text-heading text-ink text-balance">
        Why we thought you might connect
      </h2>

      <ul className="mt-7 flex flex-col gap-5">
        {reasons.map((reason) => (
          <li key={reason.key} className="flex gap-4">
            {/*
              A hairline rather than a bullet or a tick. A tick would be a claim
              that this is a checklist item completed, and a bullet would be a list
              of facts. This is a list of reasons, and it reads that way.
            */}
            <span aria-hidden="true" className="bg-clay-400 mt-3 block h-px w-4 shrink-0" />
            <p className="text-body text-ink text-pretty">{reason.sentence}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
