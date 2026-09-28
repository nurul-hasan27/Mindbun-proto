import { useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowGlyph } from '../../components/ArrowGlyph';
import { Button } from '../../components/Button';
import { ChoiceOption } from '../../components/ChoiceOption';
import { Container } from '../../components/Container';
import { IntakeProgress } from '../../components/IntakeProgress';
import { TextLink } from '../../components/TextLink';
import { ToggleAll } from '../../components/ToggleAll';
import { useIntake } from '../../lib/intake/intakeContext';
import {
  answer,
  answerChoices,
  draftHasAnswer,
  nextQuestion,
  previousQuestion,
  questionById,
  questionIndex,
  questionOrder,
} from '../../lib/intake/answering';
import { LANGUAGE_SHORTLIST_SIZE, type Choice } from '../../lib/intake/questions';
import { usePageMeta } from '../../lib/usePageMeta';
import { intakePath } from '../../routes/paths';

/**
 * The language question, and the only step with a search field.
 *
 * Twenty-four languages is a list, not a menu. Someone looking for Malayalam
 * should not have to read past Swedish to find it, and someone who has not
 * thought about it should see eight familiar options rather than a wall.
 *
 * So: a shortlist, a way to show the rest, and a box to type into. The shortlist
 * is a preference rather than a filter — the full list is always one press away,
 * and the search box is always visible rather than hidden behind a control.
 */
export function LanguageQuestion() {
  const { vocabulary, draft, update } = useIntake();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const question = questionById('language');
  const ahead = nextQuestion('language');
  const earlier = previousQuestion('language');

  usePageMeta({ title: question.title });

  // From `choicesFor`, not straight off the vocabulary: the *order* is the point
  // here, and it lives in one place. Reading `vocabulary.languages` directly gave
  // the shortlist in whatever order the service returned — alphabetical, so the
  // eight on screen ran Afrikaans to Gujarati and English was the fifth thing you
  // had to scroll to find.
  const choices = useMemo<readonly Choice[]>(
    () => (vocabulary === null ? [] : answerChoices('language', vocabulary)),
    [vocabulary],
  );

  const trimmed = query.trim().toLowerCase();

  const matches = useMemo(
    () =>
      trimmed === ''
        ? choices
        : choices.filter(
            (choice) =>
              choice.label.toLowerCase().includes(trimmed) ||
              (choice.code ?? '').toLowerCase().startsWith(trimmed),
          ),
    [choices, trimmed],
  );

  const searching = trimmed !== '';
  const visible = searching || showAll ? matches : matches.slice(0, LANGUAGE_SHORTLIST_SIZE);
  const hidden = matches.length - visible.length;

  function proceed(): void {
    if (!draftHasAnswer(draft, 'language')) {
      setError('Choose at least one language you would be comfortable speaking.');

      return;
    }

    setError(null);

    if (ahead !== null) {
      void navigate(intakePath(ahead));
    }
  }

  return (
    <Container className="pt-10 pb-6 sm:pt-14">
      <div className="max-w-2xl">
        <IntakeProgress
          current={questionIndex('language') + 1}
          total={questionOrder.length + 1}
          question={question.title}
        />

        <h1 className="font-display text-title mt-10 text-balance">{question.title}</h1>

        <p className="text-lead text-ink-muted max-w-measure mt-4 text-pretty">
          {question.explanation}
        </p>

        <div className="mt-10">
          <label htmlFor="language-filter" className="text-small text-ink-muted block">
            Type to narrow the list
          </label>
          <input
            id="language-filter"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setError(null);
            }}
            autoComplete="off"
            aria-describedby="language-filter-count"
            className="border-line-strong bg-surface text-ink placeholder:text-ink-faint focus:border-clay-400 rounded-control text-body ease-gentle mt-2 w-full border px-4 py-3 transition-colors duration-200 focus:outline-none"
            placeholder="Bengali, Tamil, Malayalam…"
          />
          <p
            id="language-filter-count"
            className="text-micro text-ink-faint mt-2"
            aria-live="polite"
          >
            {matches.length === 0
              ? 'No language matches that.'
              : `${matches.length} of ${choices.length} languages`}
          </p>
        </div>

        {error !== null && (
          <p
            id={errorId}
            role="alert"
            className="border-clay-300 text-ink bg-clay-50 text-body mt-6 border-l-2 py-3 pl-4"
          >
            {error}
          </p>
        )}

        <div
          role="group"
          aria-label={question.title}
          aria-describedby={error === null ? undefined : errorId}
          className="mt-4 flex flex-col"
        >
          {visible.map((choice) => (
            <ChoiceOption
              key={choice.code ?? choice.label}
              choice={choice}
              name="language"
              type="checkbox"
              checked={draft.languages.includes(choice.code ?? '')}
              onChange={() => {
                update((current) => answer('language', choice, current));
              }}
            />
          ))}
        </div>

        <div className="mt-6">
          {searching || showAll ? (
            hidden > 0 || showAll ? (
              <ToggleAll
                onClick={() => {
                  setShowAll(false);
                }}
                expanded
                label={showAll ? 'Show fewer' : `Show the other ${hidden}`}
                hiddenCount={0}
              />
            ) : null
          ) : (
            <ToggleAll
              onClick={() => {
                setShowAll(true);
              }}
              expanded={false}
              label={`Show all ${choices.length} languages`}
              hiddenCount={hidden}
            />
          )}
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Button onClick={proceed}>
            Continue
            <ArrowGlyph />
          </Button>
          {earlier !== null && (
            <TextLink to={intakePath(earlier)} className="order-last">
              Back
            </TextLink>
          )}
        </div>

        <p className="text-small text-ink-faint mt-10 max-w-md text-pretty">
          Your answers stay in this browser tab until you choose to send them.
        </p>
      </div>
    </Container>
  );
}
