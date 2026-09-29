/**
 * The product idea as a drawing: what you need, what a therapist offers, and
 * the overlap we are trying to explain. Purely decorative — the same idea is
 * stated in words further down the page.
 */
export function OverlapMark() {
  return (
    <figure className="relative mx-auto w-full max-w-[24rem] py-3">
      <svg viewBox="0 0 320 210" className="text-clay-300 h-auto w-full" aria-hidden="true">
        {/* Two translucent circles multiplied together: the overlap darkens on
            its own, which is exactly the point the drawing is making. */}
        <circle cx="128" cy="100" r="76" className="fill-clay-200/65" />
        <circle cx="192" cy="100" r="76" className="fill-clay-200/65 multiply" />

        <circle cx="128" cy="100" r="76" fill="none" stroke="currentColor" strokeWidth="1.25" />
        <circle cx="192" cy="100" r="76" fill="none" stroke="currentColor" strokeWidth="1.25" />
      </svg>

      {/* Untracked on small screens, where two letterspaced labels would collide. */}
      <span className="text-micro text-ink-faint sm:text-label absolute bottom-0 left-[9%] uppercase sm:left-[10%]">
        what you need
      </span>
      <span className="text-micro text-ink-faint sm:text-label absolute right-[9%] bottom-0 uppercase sm:right-[10%]">
        what they offer
      </span>
      <span className="font-display text-small text-clay-800 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 italic">
        the match
      </span>

      <figcaption className="sr-only">
        Two overlapping circles: what you are looking for, and what a therapist offers. Where they
        overlap is the match.
      </figcaption>
    </figure>
  );
}
