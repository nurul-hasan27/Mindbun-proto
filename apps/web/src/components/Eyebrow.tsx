import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

interface EyebrowProps {
  children: ReactNode;
  className?: string;
  as?: 'p' | 'h2';
}

/** Small, letterspaced, quiet. Used to introduce a section without announcing it. */
export function Eyebrow({ children, className, as: Tag = 'p' }: EyebrowProps) {
  return (
    <Tag className={cx('text-label text-ink-muted font-medium uppercase', className)}>
      {children}
    </Tag>
  );
}
