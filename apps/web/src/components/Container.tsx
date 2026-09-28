import type { ElementType, ReactNode } from 'react';
import { cx } from '../lib/cx';

interface ContainerProps {
  /** Render as a semantic element (`section`, `div`, …) when the context needs it. */
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

/** Horizontal page rhythm: one max width, one gutter, used by every route. */
export function Container({ as: Tag = 'div', className, children }: ContainerProps) {
  return <Tag className={cx('px-page mx-auto w-full max-w-6xl', className)}>{children}</Tag>;
}
