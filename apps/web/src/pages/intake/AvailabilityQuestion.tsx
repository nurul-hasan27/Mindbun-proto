import { useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowGlyph } from '../../components/ArrowGlyph';
import { Button } from '../../components/Button';
import { ChoiceOption } from '../../components/ChoiceOption';
import { Container } from '../../components/Container';
import { IntakeProgress } from '../../components/IntakeProgress';
import { TextLink } from '../../components/TextLink';
import { useIntake } from '../../lib/intake/intakeContext';
import {
  answerDay,
  answerTimeOfDay,
  nextQuestion,
  previousQuestion,
  questionById,
  questionIndex,
  questionOrder,
} from '../../lib/intake/answering';
import {
  DAY_LABELS,
  TIME_OF_DAY_LABELS,
  WEEKDAYS,
  WEEKEND_DAYS,
  type TimeOfDay,
} from '../../lib/intake/draft';
import { describeTimezone } from '../../lib/intake/session';
import { usePageMeta } from '../../lib/usePageMeta';
import { intakePath } from '../../routes/paths';
import type { DayName } from '../../lib/api/types';

/**
 * When sessions would work.
 *
 * The only question that has to explain a technical thing — a timezone — so it
 * is the only one that says anything about one. The rule: **never show a person
 * an IANA identifier.** They get "GMT+5:30, India Standard Time"; we store
 * `Asia/Kolkata`.
 *
 * Days and parts of the day are two small groups of toggles rather than one
 * question per combination. A matrix of 7 × 3 would turn a rough sense of a week
 * into twenty-one decisions, and most people do not have that precision. What is
 * recorded is a set of parts, and the exact hours are a question for the matching
 * phase, not for this one.
 */
export function AvailabilityQuestion() {
  const { draft, update } = useIntake();
  const navigate = useNavigate();
  const groupRef = useRef<HTMLFieldSetElement>(null);
  const dayErrorId = useId();
  const partErrorId = useId();
  const [showDayError, setShowDayError] = useState(false);
  const [showPartError, setShowPartError] = useState(false);

  const question = questionById('availability');
  const ahead = nextQuestion('availability');

  usePageMeta({ title: question.title });

  function proceed(): void {
    // Both parts are optional. A half-answered week is nudged once — "we can work
    // this out later" — and then let through, because making someone think harder
    // about their week than they can is exactly the wrong thing for this form.
    const missingDays = draft.days.length === 0;
    const missingParts = draft.timeOfDay.length === 0;

    setShowDayError(missingDays);
    setShowPartError(missingParts);

    void navigate(intakePath(ahead ?? 'anything-else'));
  }

  const timezoneNote =
    draft.timezone === null
      ? 'We could not detect your timezone, so nothing is being recorded against a clock.'
      : `Times are understood in your own local time — ${describeTimezone(draft.timezone)}.`;

  return (
    <Container className="pt-10 pb-6 sm:pt-14">
      <div className="max-w-2xl">
        <IntakeProgress
          current={questionIndex('availability') + 1}
          total={questionOrder.length + 1}
          question={question.title}
        />

        <h1 className="font-display text-title mt-10 text-balance">{question.title}</h1>

        <p className="text-lead text-ink-muted max-w-measure mt-4 text-pretty">
          {question.explanation}
        </p>

        <p className="text-small text-ink-faint mt-6 text-pretty">{timezoneNote}</p>

        <fieldset
          ref={groupRef}
          tabIndex={-1}
          className="mt-10 focus:outline-none"
          aria-describedby={showDayError ? dayErrorId : undefined}
        >
          <legend className="text-label text-ink-muted font-medium uppercase">
            Which days usually work?
          </legend>

          {showDayError && (
            <p id={dayErrorId} role="alert" className="text-body text-clay-800 mt-4 text-pretty">
              Choose the days you are usually free, or leave this and continue — it is optional.
            </p>
          )}

          <div className="border-line mt-5 border-t">
            {DAY_GROUPS.map((group) => (
              <div key={group.label} className="border-line border-b py-1">
                <p className="text-small text-ink-faint pt-3" id={`${group.id}-label`}>
                  {group.label}
                </p>
                <div role="group" aria-labelledby={`${group.id}-label`} className="flex flex-col">
                  {group.days.map((day) => (
                    <ChoiceOption
                      key={day}
                      name="availability-day"
                      type="checkbox"
                      choice={{ label: DAY_LABELS[day] }}
                      checked={draft.days.includes(day)}
                      onChange={() => {
                        update((current) => answerDay(current, day));
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset
          tabIndex={-1}
          className="mt-12 focus:outline-none"
          aria-describedby={showPartError ? partErrorId : undefined}
        >
          <legend className="text-label text-ink-muted font-medium uppercase">
            And roughly when?
          </legend>

          {showPartError && (
            <p id={partErrorId} role="alert" className="text-body text-clay-800 mt-4 text-pretty">
              Choose at least one part of the day, or leave this and continue.
            </p>
          )}

          <div role="group" aria-label="Part of the day" className="border-line mt-5 border-t">
            {TIME_PARTS.map((part) => (
              <ChoiceOption
                key={part}
                name="availability-part"
                type="checkbox"
                choice={{ label: TIME_OF_DAY_LABELS[part] }}
                checked={draft.timeOfDay.includes(part)}
                onChange={() => {
                  update((current) => answerTimeOfDay(current, part));
                }}
              />
            ))}
          </div>
        </fieldset>

        <p className="text-small text-ink-muted mt-6 text-pretty">
          We record a rough window — mornings run from 8am to midday, evenings from 5pm to 9pm.
          Exact times are something a later phase works out, once it is comparing your week with
          someone else&rsquo;s.
        </p>

        <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Button onClick={proceed}>
            Continue
            <ArrowGlyph />
          </Button>
          <TextLink
            to={intakePath(previousQuestion('availability') ?? 'sessions')}
            className="order-last"
          >
            Back
          </TextLink>
        </div>
      </div>
    </Container>
  );
}

const TIME_PARTS: readonly TimeOfDay[] = ['morning', 'afternoon', 'evening'];

const DAY_GROUPS: readonly {
  readonly id: string;
  readonly label: string;
  readonly days: readonly DayName[];
}[] = [
  { id: 'weekday', label: 'Weekdays', days: WEEKDAYS },
  { id: 'weekend', label: 'Weekend', days: WEEKEND_DAYS },
];
