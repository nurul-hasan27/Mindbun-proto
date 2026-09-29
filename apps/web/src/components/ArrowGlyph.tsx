import { cx } from '../lib/cx';

interface ArrowGlyphProps {
  className?: string;
}

/**
 * A typographic arrow, not an icon. It leans forward by a pixel when its
 * control is hovered, which is the only flourish an action gets.
 */
export function ArrowGlyph({ className }: ArrowGlyphProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'ease-gentle transition-transform duration-200 group-hover:translate-x-0.5',
        className,
      )}
    >
      →
    </span>
  );
}
