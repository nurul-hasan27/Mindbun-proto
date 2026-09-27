import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api/errors';
import { ErrorNote } from './ErrorNote';
import { LoadingNote } from './LoadingNote';

describe('LoadingNote', () => {
  it('says what is happening, in plain words', () => {
    render(<LoadingNote />);

    expect(screen.getByText('Taking a moment…')).toBeInTheDocument();
  });

  it('accepts wording for a specific wait', () => {
    render(<LoadingNote>Checking the API…</LoadingNote>);

    expect(screen.getByText('Checking the API…')).toBeInTheDocument();
  });

  it('keeps the animated hairline out of the accessibility tree', () => {
    const { container } = render(<LoadingNote />);

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});

describe('ErrorNote', () => {
  it('never shows the raw technical message as the headline', () => {
    render(
      <ErrorNote error={new ApiError({ kind: 'network', detail: 'ERR_CONNECTION_REFUSED' })} />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('We couldn’t reach the service.')).toBeInTheDocument();
    expect(screen.queryByText('ERR_CONNECTION_REFUSED')).not.toBeInTheDocument();
  });

  it('keeps the technical detail available but tucked away', () => {
    render(
      <ErrorNote
        error={new ApiError({ kind: 'http', status: 503, detail: 'Service Unavailable' })}
      />,
    );

    const details = screen.getByRole('group');
    expect(details).toBeInTheDocument();
    expect(screen.getByText(/http · 503/)).toBeInTheDocument();
  });

  it('offers a recovery action when one is possible', () => {
    const onRetry = vi.fn();
    render(
      <ErrorNote
        error={new ApiError({ kind: 'timeout', detail: 'no response' })}
        onRetry={onRetry}
      />,
    );

    const button = screen.getByRole('button', { name: 'Try again' });
    button.click();

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the recovery action when there is nothing to retry', () => {
    render(<ErrorNote error={new ApiError({ kind: 'config', detail: 'no base url' })} />);

    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
