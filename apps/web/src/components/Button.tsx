import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LinkProps } from 'react-router';
import { Link } from 'react-router';
import { cx } from '../lib/cx';

type Variant = 'primary' | 'quiet';

/**
 * One visual language for actions, two correct elements:
 * `Button` for actions on the page, `ButtonLink` for navigation.
 */
const variantClasses: Record<Variant, string> = {
  primary:
    'bg-clay-700 text-surface shadow-whisper hover:bg-clay-800 hover:shadow-soft hover:-translate-y-px active:translate-y-0 active:shadow-whisper',
  quiet: 'border border-line-strong bg-transparent text-ink hover:border-clay-300 hover:bg-clay-50',
};

const baseClasses =
  'group inline-flex items-center justify-center gap-2 rounded-control px-7 py-3.5 text-body font-medium transition-[background-color,border-color,box-shadow,transform] duration-200 ease-gentle';

/**
 * An unavailable action drops the variant's own styling entirely rather than
 * trying to override it, so its inactive state can never depend on the order in
 * which two background utilities happen to be emitted.
 */
const unavailableClasses =
  'cursor-not-allowed border border-line-strong bg-transparent text-ink-faint shadow-none';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Content placed after the label, e.g. an arrow that nudges on hover. */
  trailing?: ReactNode;
  /**
   * Marks the control as present but not yet available. It stays focusable so
   * screen reader users still discover it, and announces why it is inactive.
   */
  unavailable?: boolean;
  unavailableHint?: string;
}

export function Button({
  variant = 'primary',
  trailing,
  unavailable = false,
  unavailableHint,
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      aria-disabled={unavailable || undefined}
      aria-describedby={unavailable ? unavailableHint : undefined}
      onClick={unavailable ? undefined : onClick}
      className={cx(
        baseClasses,
        unavailable ? unavailableClasses : variantClasses[variant],
        className,
      )}
      {...rest}
    >
      {children}
      {trailing}
    </button>
  );
}

export interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  trailing?: ReactNode;
}

export function ButtonLink({
  variant = 'primary',
  trailing,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={cx(baseClasses, variantClasses[variant], className)} {...rest}>
      {children}
      {trailing}
    </Link>
  );
}
