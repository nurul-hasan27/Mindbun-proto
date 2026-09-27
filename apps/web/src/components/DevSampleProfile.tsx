import { Link } from 'react-router';
import { getTherapists } from '../lib/api';
import { useApiResource } from '../lib/useApiResource';
import { therapistPath } from '../routes/paths';

/**
 * A development-only link to a real profile, so the therapist route can be
 * reached without knowing a UUID.
 *
 * The client journey has no step that leads here yet — in the finished product a
 * recommendation would, and until then this is how a developer finds the page.
 * It is never rendered in a production build.
 */
export function DevSampleProfile() {
  const { state } = useApiResource(
    (signal) => getTherapists({ take: 1 }, undefined, { signal }),
    [],
  );

  if (state.status !== 'ready') {
    return null;
  }

  const therapist = state.data.items[0];
  if (therapist === undefined) {
    return null;
  }

  return (
    <p className="text-micro text-ink-faint">
      Dev only · sample profile{' '}
      <Link className="link-quiet hover:text-clay-700" to={therapistPath(therapist.id)}>
        {therapist.displayName}
      </Link>
    </p>
  );
}
