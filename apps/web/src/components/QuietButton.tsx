import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../lib/cx';

type QuietButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * A real `<button>` wearing the visual language of a quiet text link.
 *
 * Navigation uses `TextLink`; actions on the page use this. Keeping them
 * distinct is an accessibility decision first and a styling one second.
 */
export function QuietButton({ className, type = 'button', ...rest }: QuietButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'link-quiet text-small text-ink ease-gentle hover:text-clay-700 inline-flex cursor-pointer items-center gap-1.5 font-medium transition-colors duration-200',
        className,
      )}
      {...rest}
    />
  );
}
