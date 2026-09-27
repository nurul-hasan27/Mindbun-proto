import type { ApiError, ApiErrorKind } from '../lib/api/errors';
import { cx } from '../lib/cx';
import { QuietButton } from './QuietButton';

interface ErrorNoteProps {
  readonly error: ApiError;
  /** Omitted when retrying would be pointless. */
  readonly onRetry?: () => void;
  className?: string;
}

interface ErrorCopy {
  readonly title: string;
  readonly body: string;
}

const COPY: Record<ApiErrorKind, ErrorCopy> = {
  network: {
    title: 'We couldn’t reach the service.',
    body: 'It may not be running yet. Starting it and trying again usually sorts it out.',
  },
  timeout: {
    title: 'That took longer than expected.',
    body: 'Nothing has gone wrong on your side. Give it another moment.',
  },
  aborted: {
    title: 'That request was cancelled.',
    body: 'It stopped before it finished.',
  },
  http: {
    title: 'The service answered with an error.',
    body: 'This part of the prototype isn’t behaving yet.',
  },
  parse: {
    title: 'The service sent something unexpected.',
    body: 'The shape of the response wasn’t what this page expected.',
  },
  config: {
    title: 'This prototype isn’t set up to reach the service.',
    body: 'VITE_API_URL is missing, so there is nowhere to send the request.',
  },
};

const DEFAULT_COPY: ErrorCopy = {
  title: 'Something didn’t load as expected.',
  body: 'Nothing was lost. Trying again is usually enough.',
};

/**
 * The error state: what happened in plain words, one way to move forward, and
 * the technical detail tucked away for whoever is developing rather than using.
 */
export function ErrorNote({ error, onRetry, className }: ErrorNoteProps) {
  const copy = COPY[error.kind] ?? DEFAULT_COPY;

  return (
    <div className={cx('max-w-measure', className)} role="alert">
      <p className="text-label text-ink-faint uppercase">Something went quiet</p>
      <p className="font-display text-heading text-ink mt-4 text-balance">{copy.title}</p>
      <p className="text-body text-ink-muted mt-3 text-pretty">{copy.body}</p>

      {onRetry !== undefined && (
        <p className="mt-5">
          <QuietButton onClick={onRetry}>Try again</QuietButton>
        </p>
      )}

      <details className="text-micro text-ink-faint mt-6">
        <summary className="cursor-pointer">Technical detail</summary>
        <p className="mt-2">
          {error.kind}
          {error.status === null ? '' : ` · ${error.status}`} · {error.detail}
        </p>
      </details>
    </div>
  );
}
