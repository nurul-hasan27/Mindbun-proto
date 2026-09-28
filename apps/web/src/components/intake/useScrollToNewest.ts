import { useEffect, useRef } from 'react';

/**
 * Scrolls to the end of a conversation when a turn arrives.
 *
 * ## Why a hook and not part of the component
 *
 * It is behaviour rather than markup, and keeping it in its own module means
 * `ConversationLog` exports only a component — which is what lets fast refresh do its job
 * when someone is working on the transcript. The codebase already splits
 * `IntakeProvider` from `intakeContext` for the same reason.
 *
 * ## Why scroll at all
 *
 * A conversation is read from where it ends, and a long answer on a phone puts its last
 * line below the fold. The alternative — not scrolling — means the person has to scroll
 * themselves to discover whether the assistant answered, which is exactly the uncertainty a
 * waiting state creates.
 *
 * ## Why it is guarded
 *
 * `scrollIntoView` does not exist in every environment this runs in — jsdom has no layout
 * and does not implement it — and a missing method must not take the page down. Scrolling is
 * an enhancement; the transcript is fully readable without it.
 *
 * `behavior: 'smooth'` is honoured through CSS rather than checked in JavaScript:
 * `index.css` sets `scroll-behavior: auto` under `prefers-reduced-motion`, so this needs no
 * second mechanism and cannot disagree with the stylesheet.
 */
export function useScrollToNewest(dependency: number): React.RefObject<HTMLDivElement | null> {
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = end.current;

    if (typeof node?.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'end' });
    }
  }, [dependency]);

  return end;
}
