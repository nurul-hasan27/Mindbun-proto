import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_ADJUSTMENTS,
  FEEDBACK_REASON_KEYS,
  NO_FEEDBACK_SIGNALS,
  toFeedbackSignals,
} from './feedbackSignals.js';
import { MATCH_CATEGORIES } from './matchingTypes.js';
import {
  CATEGORY_MAX_SCORE,
  FEEDBACK_BOOST_CEILING,
  MAX_SHOWN_EVIDENCE,
  REQUIREMENT_BONUS,
  maxAvailabilityPerDay,
  maxCategoryScore,
  maximumPreferenceTotal,
} from './weights.js';

/**
 * The feedback-to-signal rules, which are the heart of this phase.
 *
 * The tests here are as much about what the layer refuses to do as what it does. A
 * complaint silently promoted to a requirement is a person being told what they want,
 * and the only defence is a test that fails if it happens.
 */

const ALL_KEYS = FEEDBACK_REASON_KEYS;

describe('what a reason is allowed to do', () => {
  it('turns a complaint about style into a heavier style preference', () => {
    const signals = toFeedbackSignals(['communication-mismatch']);

    expect(signals.increments).toEqual({ COMMUNICATION_STYLE: 40 });
    expect(signals.touchedCategories).toEqual(['COMMUNICATION_STYLE']);
  });

  it('turns a complaint about timing into a heavier availability preference', () => {
    const signals = toFeedbackSignals(['availability-mismatch']);

    expect(signals.increments).toEqual({ AVAILABILITY: 30 });
    expect(signals.touchedCategories).toEqual(['AVAILABILITY']);
  });

  it('turns a complaint about language into a heavier language preference', () => {
    expect(toFeedbackSignals(['language-mismatch']).increments).toEqual({ LANGUAGE: 40 });
  });

  it('turns a complaint about session format into a heavier format preference', () => {
    expect(toFeedbackSignals(['format-mismatch']).increments).toEqual({ SESSION_FORMAT: 40 });
  });

  it('turns "I wanted different experience" into a heavier experience preference', () => {
    expect(toFeedbackSignals(['different-experience']).increments).toEqual({
      CONTEXTUAL_EXPERIENCE: 50,
    });
  });

  it('never turns any complaint into a requirement', () => {
    // The single most important property in the phase. Requirements are derived in
    // `signals.ts` from the intake alone; nothing in this file can reach them, and this
    // test is the thing that would notice if it could.
    const everyReasonAtOnce = toFeedbackSignals(ALL_KEYS);

    for (const category of MATCH_CATEGORIES) {
      const boosted = maxCategoryScore(category, everyReasonAtOnce.increments);

      // A requirement is a flat bonus that eliminates. A preference cannot become one
      // however much it is boosted, and the ceiling is what guarantees that: the most a
      // category can ever reach is twice its base, which is still a proportion scored
      // against what the client actually asked for.
      expect(boosted).toBeLessThan(REQUIREMENT_BONUS);
      expect(boosted).toBeLessThanOrEqual((category === 'AVAILABILITY' ? 0 : 50 * 2) + 1);
    }
  });

  it('caps every category at twice its base, however much feedback arrives', () => {
    const signals = toFeedbackSignals(ALL_KEYS);

    for (const category of MATCH_CATEGORIES) {
      if (category === 'AVAILABILITY') {
        // Availability has no base to double: it is a per-day figure under its own cap.
        expect(maxCategoryScore(category, signals.increments)).toBe(0);
        continue;
      }

      const base = CATEGORY_MAX_SCORE[category];

      expect(maxCategoryScore(category, signals.increments)).toBe(
        Math.min(base + (signals.increments[category] ?? 0), base * FEEDBACK_BOOST_CEILING),
      );
      expect(maxCategoryScore(category, signals.increments)).toBeLessThanOrEqual(
        base * FEEDBACK_BOOST_CEILING,
      );
    }
  });

  it('cannot be pushed past the ceiling by repeating a reason', () => {
    const once = toFeedbackSignals(['communication-mismatch']);
    const manyTimes = toFeedbackSignals(Array.from({ length: 10 }, () => 'communication-mismatch'));

    expect(maxCategoryScore('COMMUNICATION_STYLE', manyTimes.increments)).toBe(
      maxCategoryScore('COMMUNICATION_STYLE', once.increments),
    );
  });

  it('keeps a requirement outranking every preference after any feedback', () => {
    // The invariant that made `REQUIREMENT_BONUS` a computed ceiling rather than a
    // number that happened to work.
    const signals = toFeedbackSignals(ALL_KEYS);

    expect(REQUIREMENT_BONUS).toBeGreaterThan(maximumPreferenceTotal(signals.increments));
    expect(REQUIREMENT_BONUS).toBeGreaterThan(maximumPreferenceTotal());
  });

  it('raises availability per day without raising the day cap', () => {
    const boosted = toFeedbackSignals(['availability-mismatch']);

    expect(maxAvailabilityPerDay(boosted.increments)).toBeGreaterThan(maxAvailabilityPerDay());
    // Three days is already "we could probably arrange something", and it does not
    // move because someone mentioned the timing.
    expect(maxAvailabilityPerDay(boosted.increments)).toBeLessThanOrEqual(50);
  });
});

describe('the reasons that do less than you would expect', () => {
  it('does not treat "I did not feel understood" as a style signal', () => {
    // Not feeling understood is not evidence about a conversational style, and reading
    // it as one would quietly turn a report about an interaction into a clinical claim
    // about a person. It removes the therapist and stops there.
    const signals = toFeedbackSignals(['felt-uncomfortable']);

    expect(signals.increments).toEqual({});
    expect(signals.touchedCategories).toEqual([]);
    expect(signals.reasonKeys).toEqual(['felt-uncomfortable']);
  });

  it('does not treat "something else" as a signal of any kind', () => {
    const signals = toFeedbackSignals(['other']);

    expect(signals.increments).toEqual({});
    expect(signals.touchedCategories).toEqual([]);
  });

  it('still records them, so the reason is not lost', () => {
    expect(toFeedbackSignals(['felt-uncomfortable', 'other']).reasonKeys).toEqual([
      'felt-uncomfortable',
      'other',
    ]);
  });
});

describe('determinism', () => {
  it('does not depend on the order reasons were ticked in', () => {
    // If it did, the result would depend on the order a mouse happened to move, and the
    // same person could be shown two different people on two devices.
    const forwards = toFeedbackSignals([
      'communication-mismatch',
      'language-mismatch',
      'availability-mismatch',
    ]);
    const backwards = toFeedbackSignals([
      'availability-mismatch',
      'language-mismatch',
      'communication-mismatch',
    ]);

    expect(backwards).toEqual(forwards);
    expect(backwards.touchedCategories).toEqual(forwards.touchedCategories);
  });

  it('counts a repeated reason once, so priority cannot be bought', () => {
    const once = toFeedbackSignals(['communication-mismatch']);
    const thrice = toFeedbackSignals([
      'communication-mismatch',
      'communication-mismatch',
      'communication-mismatch',
    ]);

    expect(thrice).toEqual(once);
  });

  it('reports no adjustments at all for a first match', () => {
    expect(NO_FEEDBACK_SIGNALS).toEqual({ reasonKeys: [], increments: {}, touchedCategories: [] });
    expect(toFeedbackSignals([])).toEqual(NO_FEEDBACK_SIGNALS);
  });

  it('is a pure function of its input', () => {
    const keys = ['communication-mismatch', 'language-mismatch'];

    expect(toFeedbackSignals(keys)).toEqual(toFeedbackSignals(keys));
  });
});

describe('the reason vocabulary', () => {
  it('adjusts only categories the engine can actually compare', () => {
    // A reason that adjusted nothing the engine reads would be a promise with nothing
    // behind it. Every non-empty adjustment must name a real category.
    for (const [key, adjustment] of Object.entries(FEEDBACK_ADJUSTMENTS)) {
      for (const category of Object.keys(adjustment)) {
        expect(MATCH_CATEGORIES, key).toContain(category);
      }
    }
  });

  it('declares every key it knows, and knows only keys it declares', () => {
    expect([...ALL_KEYS].sort()).toEqual(
      [
        'availability-mismatch',
        'communication-mismatch',
        'different-experience',
        'felt-uncomfortable',
        'format-mismatch',
        'language-mismatch',
        'not-the-right-approach',
        'other',
      ].sort(),
    );
  });

  it('boosts a category that is also a requirement, without turning it into one', () => {
    // Language and session format are requirements *and* are boosted by feedback, and
    // those two facts have to be able to coexist. The brief asks for exactly this —
    // "language preference becomes increased language compatibility importance" — and it
    // is safe precisely because a boost changes a weight rather than adding a gate.
    //
    // The gate is tested where it lives, in `rematch.test.ts`: a candidate who speaks
    // none of the chosen languages is still eliminated after a language boost, because
    // the requirement and the weight are separate mechanisms.
    expect(FEEDBACK_ADJUSTMENTS['language-mismatch']?.LANGUAGE).toBeGreaterThan(0);
    expect(FEEDBACK_ADJUSTMENTS['format-mismatch']?.SESSION_FORMAT).toBeGreaterThan(0);
  });
});

describe('what the layer is not', () => {
  it('does not invent a therapist attribute to stand in for an unstated preference', () => {
    // "The communication style wasn't right" does not say which style was wanted, and
    // this layer must not guess. It re-weights what was already stated; the exclusion
    // set removes the therapist; nothing else happens.
    const signals = toFeedbackSignals(['communication-mismatch']);

    expect(Object.keys(signals)).toEqual(['reasonKeys', 'increments', 'touchedCategories']);
    expect(Object.values(signals.increments).every((value) => typeof value === 'number')).toBe(
      true,
    );
  });

  it('keeps the number of things a client can say bounded', () => {
    // A person's feedback is not a place to accumulate a profile. There are eight
    // reasons and a free-text note, and a "what changed" section that shows at most
    // five reasons — the same ceiling as the explanation list, on purpose.
    expect(ALL_KEYS.length).toBe(8);
    expect(MAX_SHOWN_EVIDENCE).toBe(5);
  });

  it('leaves the boost ceiling where the engine can see it', () => {
    expect(FEEDBACK_BOOST_CEILING).toBe(2);
  });
});
