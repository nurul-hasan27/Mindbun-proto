import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Eyebrow } from './Eyebrow';

interface ProfileSectionProps {
  /** Small letterspaced label, e.g. "Works with". */
  readonly label: string;
  readonly children: ReactNode;
  className?: string;
}

/**
 * One labelled block of a therapist profile, divided by a hairline.
 *
 * The structure a printed profile would have, and deliberately not a grid of
 * cards: an area of work is a line of text, not a component.
 */
export function ProfileSection({ label, children, className }: ProfileSectionProps) {
  return (
    <section className={cx('border-line border-t pt-8', className)}>
      {/* A heading, not a caption: someone using a screen reader should be able to
          move between the parts of a profile the way a sighted reader scans. */}
      <Eyebrow as="h2">{label}</Eyebrow>
      <div className="mt-5">{children}</div>
    </section>
  );
}
