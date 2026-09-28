import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

/**
 * The two-column frame every internal page is built on.
 *
 * ## Why the internal tool has a pattern of its own
 *
 * The brief for this surface is "denser than the client experience, but the same design
 * language", and those are separate requirements rather than one. The language is the warm
 * canvas, the hairlines, the serif headings, the spacing scale — all of which are already
 * shared and none of which is redeclared here. What differs is the *rhythm*: a matcher
 * compares things, so a label and its value sit on one line rather than a heading and a
 * block, and the eye can run down a column without losing its place.
 *
 * One named pattern rather than a page-specific class, because the alternative is four
 * nearly-identical `grid` declarations that drift apart the first time one of them is
 * fixed.
 *
 * Collapses to one column below the `md` breakpoint, which is what makes the whole
 * workspace usable at 320px without a single horizontal scroll.
 */
interface WorkspaceColumnsProps {
  /** The label column. Hidden on narrow screens, where it would only repeat the content. */
  readonly label: string;
  readonly children: ReactNode;
  className?: string;
}

export function WorkspaceColumns({ label, children, className }: WorkspaceColumnsProps) {
  return (
    <div className={cx('md:grid md:grid-cols-[10rem_minmax(0,1fr)] md:gap-8', className)}>
      <Eyebrow as="h3" className="md:pt-1">
        {label}
      </Eyebrow>
      <div className="mt-2 md:mt-0">{children}</div>
    </div>
  );
}

/**
 * Small, letterspaced, quiet — the same voice as the client product's `Eyebrow`.
 *
 * Re-declared rather than imported because the internal tool has a heading depth the client
 * pages never reach: a section heading in the margin (`h2`), a row label inside it (`h3`),
 * and a sub-block inside a candidate card (`h5`). A client page has no such nesting, so the
 * shared component does not offer those levels, and widening the shared one to cover cases
 * it never had would be the wrong direction — the internal tool's depth is its own.
 */
function Eyebrow({
  children,
  className,
  as: Tag = 'p',
  id,
}: {
  children: ReactNode;
  className?: string;
  as?: 'p' | 'h2' | 'h3' | 'h4' | 'h5';
  /** Needed when this is the heading a section is labelled by. */
  id?: string;
}) {
  return (
    <Tag id={id} className={cx('text-label text-ink-muted font-medium uppercase', className)}>
      {children}
    </Tag>
  );
}

export { Eyebrow as WorkspaceEyebrow };
