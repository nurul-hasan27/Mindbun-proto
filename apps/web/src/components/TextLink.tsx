import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from '../lib/cx';

interface TextLinkProps {
  to: string;
  children: ReactNode;
  className?: string;
}

/**
 * An in-page link that behaves like text: it darkens and draws its own
 * underline from the left, rather than wearing a button's shape.
 */
export function TextLink({ to, children, className }: TextLinkProps) {
  return (
    <Link
      to={to}
      className={cx(
        'link-quiet text-small text-ink ease-gentle hover:text-clay-700 inline-flex items-center gap-1.5 font-medium transition-colors duration-200',
        className,
      )}
    >
      {children}
    </Link>
  );
}
