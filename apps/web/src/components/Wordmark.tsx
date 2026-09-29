import { Link } from 'react-router';
import { paths } from '../routes/paths';
import { cx } from '../lib/cx';

interface WordmarkProps {
  className?: string;
}

/** A four-point mark: small, warm, and the same shape as the favicon. */
function SparkMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx('text-clay-500 h-3.5 w-3.5', className)}
      aria-hidden="true"
    >
      <path
        d="M12 2.2c.66 5.3 4.14 8.78 9.44 9.44-5.3.66-8.78 4.14-9.44 9.44-.66-5.3-4.14-8.78-9.44-9.44C7.86 11 11.34 7.5 12 2.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Wordmark({ className }: WordmarkProps) {
  return (
    <Link
      to={paths.home}
      className={cx(
        'group text-ink ease-gentle hover:text-clay-800 inline-flex items-center gap-2.5 transition-colors duration-200',
        className,
      )}
    >
      <SparkMark className="ease-gentle group-hover:text-clay-600 transition-colors duration-200" />
      <span className="font-display text-brand whitespace-nowrap">Why This Match</span>
    </Link>
  );
}
