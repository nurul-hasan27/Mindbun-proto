import type { ChangeNote, MatchReason } from '../lib/api/types';

/**
 * "What changed this time."
 *
 * Visually distinct but quiet: a small uppercase label in the same letterspaced
 * treatment every other section uses, and a list of sentences in the same serif as
 * everything else. Not a panel, not a card, not a highlighted box. A section that
 * looked like a notification would be claiming something louder than it can — the
 * differences are real, but they are three sentences about a person, not an alert.
 *
 * It is also *not* rendered when the server sent nothing, because the server sends
 * nothing whenever it cannot prove a difference. A section that appeared with a list of
 * near-identical attributes would be padding, and padding in a "what changed" panel is
 * the one place a reader is most likely to believe it.
 */
export function WhatChanged({ notes }: { readonly notes: readonly ChangeNote[] }) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="what-changed" className="border-line border-t pt-8">
      <h2 id="what-changed" className="text-label text-ink-faint font-medium uppercase">
        What changed this time
      </h2>

      <ul className="mt-7 flex flex-col gap-7">
        {notes.map((note) => (
          <li key={note.category} className="flex gap-4">
            {/* A hairline, like the reasons above: these are statements, not a scorecard. */}
            <span aria-hidden="true" className="bg-clay-400 mt-3 block h-px w-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-label text-ink-faint font-medium uppercase">{note.detail}</p>
              <p className="text-body text-ink mt-2 text-pretty">{note.sentence}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The line above the person, on a rematch.
 *
 * "Based on your feedback", and nothing more. Not "improved", not "a better match", not
 * "we found someone more suitable" — because none of that is what happened. A set of
 * weights moved, a person was removed from consideration, and the engine ran again. The
 * sentence names the cause without inflating it, and the section below does the
 * showing.
 */
export function FeedbackLine() {
  return <p className="text-label text-ink-faint font-medium uppercase">Based on your feedback</p>;
}

/**
 * One line naming who this is different from.
 *
 * Present only on a rematch, and only when the previous person is known. It is not a
 * comparison and not a shortlist: it is the person the client already saw and already
 * turned down, and saying so is what makes "someone else" mean anything rather than
 * implying the page could have shown them a list.
 */
export function PreviousLine({ name }: { readonly name: string }) {
  return <p className="text-small text-ink-faint text-pretty">Someone other than {name}.</p>;
}

/** The reasons, as sentences. The same list the first match shows. */
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
              A hairline rather than a bullet or a tick. A tick would be a claim that
              this is a checklist item completed, and a bullet would be a list of facts.
              This is a list of reasons, and it reads that way.
            */}
            <span aria-hidden="true" className="bg-clay-400 mt-3 block h-px w-4 shrink-0" />
            <p className="text-body text-ink text-pretty">{reason.sentence}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
