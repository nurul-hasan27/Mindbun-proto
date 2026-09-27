import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

interface UnderlineMarkProps {
  children: ReactNode;
  className?: string;
}

/**
 * A hand-drawn clay stroke beneath a single word. Used once, on the promise the
 * product actually makes.
 */
export function UnderlineMark({ children, className }: UnderlineMarkProps) {
  return (
    <span className={cx('relative inline-block whitespace-nowrap', className)}>
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 200 10"
        preserveAspectRatio="none"
        className="text-clay-400 absolute inset-x-0 -bottom-[0.05em] h-[0.16em] w-full"
      >
        <path
          d="M2 6C36 3.4 62 6.2 100 5 138 3.8 164 6.2 198 5.2L198 7.4C164 8.4 138 6 100 7.2 62 8.4 36 5.6 2 8.2Z"
          fill="currentColor"
          opacity="0.85"
        />
      </svg>
    </span>
  );
}
