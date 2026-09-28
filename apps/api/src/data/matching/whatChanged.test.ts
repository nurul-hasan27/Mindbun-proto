import { describe, expect, it } from 'vitest';
import { describeChange } from './whatChanged.js';
import { toFeedbackSignals } from './feedbackSignals.js';
import type { ChangeNote, ComparisonSide } from './feedbackTypes.js';
import type { MatchCategory, MatchEvidenceInput } from './matchingTypes.js';

/**
 * "What changed this time", tested as a claim machine.
 *
 * Every case here is a sentence a person could not verify for themselves, so each one
 * is pinned to the fact that licenses it. The failures that matter are the ones where a
 * plausible-sounding sentence is produced with nothing behind it — which is why there
 * are as many tests for saying *nothing* as for saying something.
 */

const VOCABULARY = {
  names: new Map([
    ['exploratory', 'Exploratory'],
    ['reflective', 'Reflective'],
    ['direct', 'Direct'],
    ['structured', 'Structured'],
    ['warm', 'Warm'],
    ['warm-structured', 'Warm, structured'],
    ['hi', 'Hindi'],
    ['ta', 'Tamil'],
    ['indian-diaspora', 'the Indian diaspora'],
  ]),
};

/**
 * What the client asked for at intake.
 *
 * A parameter rather than something read off a comparison side, because a preference is
 * a fact about the client and not about either therapist. It is also the fix for a real
 * bug: reading it from a match's evidence only works when that match happened to share
 * the preference, and the case worth describing is precisely when it did not.
 */
const STATED = (overrides: Partial<Record<MatchCategory, readonly string[]>> = {}) =>
  ({
    AREA_OF_WORK: [],
    COMMUNICATION_STYLE: [],
    THERAPEUTIC_APPROACH: [],
    CONTEXTUAL_EXPERIENCE: [],
    LANGUAGE: [],
    SESSION_FORMAT: [],
    AVAILABILITY: [],
    ...overrides,
  }) as Readonly<Record<MatchCategory, readonly string[]>>;

function evidence(items: readonly Partial<MatchEvidenceInput>[]): readonly MatchEvidenceInput[] {
  return items.map((item) => ({
    category: 'COMMUNICATION_STYLE',
    strength: 'PREFERENCE',
    clientKey: 'exploratory',
    therapistKey: 'exploratory',
    explanation: 'COMMUNICATION_STYLE',
    weight: 40,
    ...item,
  }));
}

function side(overrides: Partial<ComparisonSide> = {}): ComparisonSide {
  return {
    matchId: 'm',
    therapistId: 't',
    displayName: 'A therapist',
    evidence: [],
    attributes: {
      areasOfWork: [],
      communicationStyles: [],
      approaches: [],
      contextualExperience: [],
      languages: [],
      sessionFormats: [],
    },
    ...overrides,
  };
}

const THEY_ASKED_FOR_EXPLORATORY = STATED({ COMMUNICATION_STYLE: ['exploratory'] });

describe('the case the brief describes, in full', () => {
  it('says a more exploratory style when that is what moved', () => {
    // Previous: Direct · Structured. Feedback: the communication style did not feel
    // right. New: Exploratory · Reflective. The client asked for exploratory at intake.
    //
    // Note that the previous match carries *no* communication-style evidence at all: the
    // therapist they got had none of what they asked for. That is the whole reason the
    // stated preference has to come from the intake — read from this match's evidence it
    // would look as though the client had asked for nothing, and this section would go
    // quiet at exactly the moment it has something true to say.
    const before = side({
      therapistId: 'old',
      displayName: 'Tara',
      attributes: { ...side().attributes, communicationStyles: ['direct', 'structured'] },
      evidence: evidence([
        {
          category: 'LANGUAGE',
          clientKey: 'hi',
          therapistKey: 'hi',
          explanation: 'REQUIRED_LANGUAGE',
        },
      ]),
    });
    const after = side({
      therapistId: 'new',
      displayName: 'Aditi',
      attributes: { ...side().attributes, communicationStyles: ['exploratory', 'reflective'] },
      evidence: evidence([
        {
          category: 'LANGUAGE',
          clientKey: 'hi',
          therapistKey: 'hi',
          explanation: 'REQUIRED_LANGUAGE',
        },
      ]),
    });

    const notes = describeChange(
      before,
      after,
      toFeedbackSignals(['communication-mismatch']),
      VOCABULARY,
      THEY_ASKED_FOR_EXPLORATORY,
    );

    expect(notes).toHaveLength(1);
    expect(notes[0]?.category).toBe('COMMUNICATION_STYLE');
    expect(notes[0]?.sentence).toContain('more in the Exploratory style you were after');
    // And nothing it did not check: Reflective was never asked for, so it is not the
    // reason to claim.
    expect(notes[0]?.sentence).not.toContain('Reflective');
  });

  it('claims nothing when the new style is one the client never asked for', () => {
    // The mirror image, and the easier mistake. The styles are quite different — and
    // neither is what they asked for, so "more exploratory" would be a lie and the
    // section falls back to the smaller truth.
    const before = side({
      attributes: { ...side().attributes, communicationStyles: ['direct', 'structured'] },
    });
    const after = side({
      attributes: { ...side().attributes, communicationStyles: ['warm', 'direct'] },
    });

    const notes = describeChange(
      before,
      after,
      toFeedbackSignals(['communication-mismatch']),
      VOCABULARY,
      THEY_ASKED_FOR_EXPLORATORY,
    );

    expect(notes[0]?.sentence).not.toContain('more in the');
    // "Warm" is genuinely new; "Direct" is not, and must not be listed as if it were.
    expect(notes[0]?.sentence).toContain('Warm');
    expect(notes[0]?.sentence).not.toContain('Direct');
  });

  it('claims nothing when the new therapist has moved *away* from what they asked for', () => {
    // Direct · Exploratory becoming Direct · Structured: a real change, and strictly
    // worse on the one thing they told us they wanted. The share test is what catches
    // this, and it has to: "it is different" is true, and "it is better" is not.
    const before = side({
      attributes: { ...side().attributes, communicationStyles: ['direct', 'exploratory'] },
    });
    const after = side({
      attributes: { ...side().attributes, communicationStyles: ['direct', 'structured'] },
    });

    const notes = describeChange(
      before,
      after,
      toFeedbackSignals(['communication-mismatch']),
      VOCABULARY,
      THEY_ASKED_FOR_EXPLORATORY,
    );

    expect(notes[0]?.sentence).not.toContain('more in the');
    expect(notes[0]?.sentence).toContain('Structured');
  });

  it('says nothing about style when the client asked for nothing in particular', () => {
    // "I am not sure yet about the kind of conversation I want" suppresses style evidence
    // in the engine, and suppresses the improvement claim here for the same reason:
    // nobody asked, so nothing can be closer to the answer.
    const before = side({
      attributes: { ...side().attributes, communicationStyles: ['direct', 'structured'] },
    });
    const after = side({
      attributes: { ...side().attributes, communicationStyles: ['exploratory', 'reflective'] },
    });

    const notes = describeChange(
      before,
      after,
      toFeedbackSignals(['communication-mismatch']),
      VOCABULARY,
      STATED(),
    );

    expect(notes[0]?.sentence).not.toContain('more in the');
    expect(notes[0]?.sentence).toContain('Exploratory');
    expect(notes[0]?.sentence).toContain('Reflective');
  });
});

describe('a change the person asked about, and which is real', () => {
  it('names only the attributes that are genuinely new', () => {
    // The new therapist has gained one style the old one also lacked, and kept the two
    // they shared. Listing all three would be padding: the reader has been told
    // something changed, and most of what follows would not have.
    const before = side({
      attributes: { ...side().attributes, communicationStyles: ['direct', 'warm'] },
    });
    const after = side({
      attributes: {
        ...side().attributes,
        communicationStyles: ['direct', 'warm', 'exploratory'],
      },
    });

    const notes = describeChange(
      before,
      after,
      toFeedbackSignals(['communication-mismatch']),
      VOCABULARY,
      THEY_ASKED_FOR_EXPLORATORY,
    );

    expect(notes[0]?.sentence).toContain('more in the Exploratory style');
    expect(notes[0]?.sentence).not.toContain('Direct');
    expect(notes[0]?.sentence).not.toContain('Warm');
  });

  it('names only the stated preference, not the unasked-for attributes beside it', () => {
    // Exploratory is what they said. Reflective is new too, and true — but naming it
    // would put an adjective in their mouth: they never asked to be understood in a
    // reflective way, and the claim is about what they asked for.
    const before = side({
      attributes: { ...side().attributes, communicationStyles: ['direct'] },
    });
    const after = side({
      attributes: {
        ...side().attributes,
        communicationStyles: ['exploratory', 'reflective'],
      },
    });

    const notes = describeChange(
      before,
      after,
      toFeedbackSignals(['communication-mismatch']),
      VOCABULARY,
      THEY_ASKED_FOR_EXPLORATORY,
    );

    expect(notes[0]?.sentence).toContain('Exploratory');
    expect(notes[0]?.sentence).not.toContain('Reflective');
  });
});

describe('a change in a category nobody mentioned', () => {
  it('says nothing at all', () => {
    // The two therapists could not be more different in approach, and the section is
    // still empty — because the person talked about style. Silently improving something
    // they did not raise would imply we took something into account that we did not.
    const before = side({ attributes: { ...side().attributes, approaches: ['integrative'] } });
    const after = side({ attributes: { ...side().attributes, approaches: ['solution-focused'] } });

    const notes = describeChange(
      before,
      after,
      toFeedbackSignals(['communication-mismatch']),
      VOCABULARY,
      STATED(),
    );

    expect(notes).toEqual([]);
  });
});

describe('a category the person mentioned, where nothing changed', () => {
  it('says nothing, because identical attributes are not a change', () => {
    // The internal ordering may well have moved. The attributes on the page did not, and
    // the page is about the attributes.
    const styles = ['direct', 'structured'];
    const before = side({ attributes: { ...side().attributes, communicationStyles: styles } });
    const after = side({ attributes: { ...side().attributes, communicationStyles: styles } });

    expect(
      describeChange(
        before,
        after,
        toFeedbackSignals(['communication-mismatch']),
        VOCABULARY,
        STATED(),
      ),
    ).toEqual([]);
  });

  it('treats a different order of the same styles as no change', () => {
    const before = side({
      attributes: { ...side().attributes, communicationStyles: ['direct', 'structured'] },
    });
    const after = side({
      attributes: { ...side().attributes, communicationStyles: ['structured', 'direct'] },
    });

    expect(
      describeChange(
        before,
        after,
        toFeedbackSignals(['communication-mismatch']),
        VOCABULARY,
        STATED(),
      ),
    ).toEqual([]);
  });
});

describe('the weaker claim, when nothing was stated for the category', () => {
  it('says the styles differ, without claiming they are what was wanted', () => {
    // The person complained about style without saying what they wanted, so there is no
    // stated preference to have improved. The only true thing available is that the two
    // therapists differ — which is worth saying, because they asked.
    const before = side({ attributes: { ...side().attributes, communicationStyles: ['direct'] } });
    const after = side({
      attributes: { ...side().attributes, communicationStyles: ['reflective'] },
    });

    const notes = describeChange(
      before,
      after,
      toFeedbackSignals(['communication-mismatch']),
      VOCABULARY,
      STATED(),
    );

    expect(notes).toHaveLength(1);
    expect(notes[0]?.sentence).toContain('different here');
    expect(notes[0]?.sentence).toContain('Reflective');
    expect(notes[0]?.sentence).not.toContain('more in the');
  });
});

describe('availability', () => {
  const clientTimes = evidence([
    {
      category: 'AVAILABILITY',
      clientKey: 'TUESDAY 1080-1260',
      therapistKey: 'TUESDAY 1020-1200',
      explanation: 'AVAILABILITY_OVERLAP',
      overlap: {
        dayOfWeek: 'TUESDAY',
        startMinute: 1080,
        endMinute: 1200,
        therapistDayOfWeek: 'TUESDAY',
        therapistStartMinute: 1020,
        therapistEndMinute: 1200,
        weeks: ['winter', 'summer'],
      },
    },
  ]);

  it('reports a newly shared time, because that is a real change', () => {
    const before = side({ evidence: [] });
    const after = side({ evidence: clientTimes });

    const notes = describeChange(
      before,
      after,
      toFeedbackSignals(['availability-mismatch']),
      VOCABULARY,
      STATED(),
    );

    expect(notes).toHaveLength(1);
    expect(notes[0]?.category).toBe('AVAILABILITY');
    expect(notes[0]?.sentence).toContain('no workable time');
    expect(notes[0]?.sentence).toContain('Tuesday');
    expect(notes[0]?.sentence).toContain('18:00');
  });

  it('says nothing when both already overlapped, because that is not news', () => {
    // The previous page already said they overlapped. Repeating it here would be
    // padding dressed as a change.
    const before = side({ evidence: clientTimes });
    const after = side({ evidence: clientTimes });

    expect(
      describeChange(
        before,
        after,
        toFeedbackSignals(['availability-mismatch']),
        VOCABULARY,
        STATED(),
      ),
    ).toEqual([]);
  });
});

describe('the shape of the section', () => {
  const before = side({
    attributes: {
      ...side().attributes,
      communicationStyles: ['direct'],
      approaches: ['integrative'],
      contextualExperience: ['relocation'],
      languages: ['en', 'fr'],
      sessionFormats: ['in-person'],
    },
  });
  const after = side({
    attributes: {
      ...side().attributes,
      communicationStyles: ['reflective'],
      approaches: ['solution-focused'],
      contextualExperience: ['indian-diaspora'],
      languages: ['ta'],
      sessionFormats: ['online'],
    },
  });

  it('shows at most three, however many categories changed', () => {
    const notes = describeChange(
      before,
      after,
      toFeedbackSignals([
        'communication-mismatch',
        'not-the-right-approach',
        'different-experience',
        'language-mismatch',
        'format-mismatch',
      ]),
      VOCABULARY,
      STATED(),
    );

    expect(notes).toHaveLength(3);
  });

  it('is in a fixed order, whatever order the reasons were given', () => {
    const reasons = ['communication-mismatch', 'language-mismatch', 'format-mismatch'];

    const forwards = describeChange(
      before,
      after,
      toFeedbackSignals(reasons),
      VOCABULARY,
      STATED(),
    );
    const backwards = describeChange(
      before,
      after,
      toFeedbackSignals([...reasons].reverse()),
      VOCABULARY,
      STATED(),
    );

    expect(backwards).toEqual(forwards);
    // Style first, then language, then sessions — the brief's order, fixed.
    expect(forwards.map((note) => note.category)).toEqual([
      'COMMUNICATION_STYLE',
      'LANGUAGE',
      'SESSION_FORMAT',
    ]);
  });

  it('is empty for a first match, because there is nothing to compare against', () => {
    expect(describeChange(before, after, toFeedbackSignals([]), VOCABULARY, STATED())).toEqual([]);
  });

  it('gives every note a category, a sentence and a short label', () => {
    const notes = describeChange(
      before,
      after,
      toFeedbackSignals(['communication-mismatch', 'language-mismatch']),
      VOCABULARY,
      STATED(),
    );

    for (const note of notes) {
      expect(note.category.length).toBeGreaterThan(0);
      expect(note.sentence.endsWith('.')).toBe(true);
      expect(note.detail.length).toBeGreaterThan(0);
      expect(note.detail.length).toBeLessThan(40);
    }
  });
});

describe('what a note is never allowed to contain', () => {
  const before = side({ attributes: { ...side().attributes, communicationStyles: ['direct'] } });
  const after = side({ attributes: { ...side().attributes, communicationStyles: ['reflective'] } });

  it('never mentions a score, a weight, a rank or a percentage', () => {
    const notes = describeChange(
      before,
      after,
      toFeedbackSignals(['communication-mismatch']),
      VOCABULARY,
      STATED(),
    );

    const text = notes.map((note: ChangeNote) => `${note.sentence} ${note.detail}`).join(' ');

    expect(text).not.toMatch(/\d+\s*%/);
    expect(text.toLowerCase()).not.toMatch(
      /\b(score|scored|rank|ranking|weight|points?|best match|top therapist|percent)\b/,
    );
  });

  it('never compares a number to a number', () => {
    // "More" and "better" are only safe with a following noun, so a sentence about
    // counts is the thing to guard. There are none.
    const notes = describeChange(
      before,
      after,
      toFeedbackSignals(['communication-mismatch', 'availability-mismatch']),
      VOCABULARY,
      STATED(),
    );

    for (const note of notes) {
      expect(note.sentence).not.toMatch(
        /\b(\d+|one|two|three|twice|double)\b.*\b(more|higher|better|greater)\b/i,
      );
    }
  });

  it('never claims to have learned anything', () => {
    // The product may say "we took your feedback into account". It may not say it
    // learned, adapted, or got better at matching, because none of that happened.
    const notes = describeChange(
      before,
      after,
      toFeedbackSignals(['communication-mismatch']),
      VOCABULARY,
      STATED(),
    );

    for (const note of notes) {
      expect(note.sentence.toLowerCase()).not.toMatch(
        /\b(learn|learned|learning|adapted|improv|smart|understood you|profile|insight)\w*\b/,
      );
    }
  });

  it('never names the therapist who was looked past, only what changed', () => {
    const named = side({
      displayName: 'Tara Joshi',
      attributes: { ...side().attributes, communicationStyles: ['direct'] },
    });

    const notes = describeChange(
      named,
      after,
      toFeedbackSignals(['communication-mismatch']),
      VOCABULARY,
      STATED(),
    );

    for (const note of notes) {
      expect(note.sentence).not.toContain('Tara');
    }
  });
});
