import { cx } from '../../lib/cx';

/**
 * The case list, as a set of stacked rows rather than a table.
 *
 * ## Why not a table
 *
 * A table is the obvious structure for a queue, and at 1440px it is the better one. But the
 * same component has to work at 320px, and a table at 320px is a horizontal scroll — which
 * the brief rules out and which, more to the point, is a miserable way to read a list of
 * names. Rows that stack do both jobs: at narrow widths each field becomes its own line,
 * and at wide widths a grid puts them in columns.
 *
 * A `<ul>` of links, so a screen reader announces a list of five rather than five
 * unlabelled regions — and each row's own heading gives it a name inside that list, which
 * is what makes the queue navigable by heading rather than only by reading it.
 */
export interface CaseRowData {
  readonly matchId: string;
  readonly attempt: number;
  readonly primaryNeeds: readonly string[];
  readonly systemSuggestedName: string;
  readonly hasHistory: boolean;
}

interface CaseRowProps {
  readonly entry: CaseRowData;
  readonly to: string;
  /** Rendered inside the row, after the summary. The link is supplied by the parent. */
  readonly children?: React.ReactNode;
}

export function CaseRow({ entry, to, children }: CaseRowProps) {
  return (
    <li className="border-line border-b last:border-b-0">
      <a
        href={to}
        className={cx(
          'focus-within-ring ease-gentle block py-6 transition-colors duration-200',
          'hover:bg-surface-quiet sm:-mx-4 sm:px-4',
        )}
      >
        {/*
          One heading per row, so a screen reader can list the queue: "Needs review, case
          1, Hindi Relationships Exploratory". The visible h1 above the list is the page's,
          and a `p` in a repeated structure would leave the list un-navigable by heading.
        */}
        <h3 className="text-subheading font-display">{needsLine(entry.primaryNeeds)}</h3>

        <div className="text-small text-ink-muted mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span>System suggested {entry.systemSuggestedName}</span>
          <span aria-hidden="true" className="text-line-strong">
            ·
          </span>
          <span>Needs review</span>
          {entry.attempt > 1 && (
            <>
              <span aria-hidden="true" className="text-line-strong">
                ·
              </span>
              <span>after {entry.attempt} searches</span>
            </>
          )}
        </div>

        {children}
      </a>
    </li>
  );
}

/**
 * The needs line, joined with a middot.
 *
 * Empty when the client answered nothing the engine could use, which the server can
 * produce and the page must not paper over with a dash — a blank line is honest and a
 * placeholder is a claim.
 */
function needsLine(needs: readonly string[]): string {
  return needs.join(' · ');
}
