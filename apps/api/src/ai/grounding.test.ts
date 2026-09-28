import { describe, expect, it } from 'vitest';
import {
  MAX_OBSERVATIONS,
  MAX_SUMMARY_LENGTH,
  MAX_TRADEOFFS,
  assertGroundedIn,
  normaliseSummary,
} from './grounding.js';
import type { AiCaseContext, AiCaseSummary } from './aiProvider.js';
import { NEED_CATEGORIES } from './caseContext.js';

/**
 * A case, shaped from what the workspace would really hand over.
 *
 * Note what is *absent*: no biography, no score, no rank, no client name, no free text. That
 * absence is what these tests are checking, because a provider cannot invent a fact that was
 * never available to it — the guard catches what slips through the vocabulary, not what was
 * kept out of the room.
 */
const CONTEXT: AiCaseContext = {
  needs: [
    { category: NEED_CATEGORIES.areasOfWork, label: 'Work stress' },
    { category: NEED_CATEGORIES.communicationStyles, label: 'Exploratory' },
    { category: NEED_CATEGORIES.languages, label: 'Hindi' },
  ],
  hasRequirements: true,
  suggestion: {
    name: 'Ananya Rao',
    reasons: [
      'They speak Hindi, one of the languages you chose.',
      'You said you wanted support with Work stress, and they work with it.',
    ],
    notOffered: [
      { category: NEED_CATEGORIES.communicationStyles, names: ['Exploratory'] },
      { category: 'Sessions', names: ['Online'] },
    ],
  },
  alternatives: [
    {
      name: 'Dev Menon',
      reasons: ['They speak Hindi, one of the languages you chose.'],
      notOffered: [{ category: 'Sessions', names: ['Online'] }],
    },
  ],
  priorFeedback: ['Not the right fit'],
};

const ok = (overrides: Partial<AiCaseSummary> = {}): AiCaseSummary => ({
  summary:
    'They are looking for support around Work stress and Exploratory conversations. Ananya Rao does not carry Exploratory.',
  observations: ['They asked for Exploratory, and Ananya Rao does not offer it.'],
  tradeoffs: [],
  ...overrides,
});

describe('a summary that holds up', () => {
  it('is accepted when every claim is in the case', () => {
    const result = assertGroundedIn(ok(), CONTEXT);

    expect(result.ok).toBe(true);
    expect(result.ok && result.summary.observations).toHaveLength(1);
  });

  it('is accepted when it says no more than the evidence', () => {
    const result = assertGroundedIn(
      ok({
        summary: 'They speak Hindi and work with Work stress.',
        observations: ['Ananya Rao carries both.'],
      }),
      CONTEXT,
    );

    expect(result.ok).toBe(true);
  });
});

describe('a summary that invents something', () => {
  const cases: readonly { label: string; summary: AiCaseSummary }[] = [
    {
      label: 'a candidate who is not in the case',
      summary: ok({
        summary: 'Priya Sharma would probably be a better fit for Hindi and Work stress.',
        observations: ['They speak Hindi and work with Work stress.'],
      }),
    },
    {
      label: 'an attribute nobody recorded',
      summary: ok({
        summary: 'Ananya Rao is also trained in EMDR.',
        observations: ['They speak Hindi and work with Work stress.'],
      }),
    },
    {
      label: 'a claim about the client that is not in the data',
      summary: ok({
        summary: 'They are a recently bereaved woman in her thirties.',
        observations: ['They speak Hindi and work with Work stress.'],
      }),
    },
  ];

  for (const { label, summary } of cases) {
    it(`is refused: ${label}`, () => {
      const result = assertGroundedIn(summary, CONTEXT);

      expect(result.ok).toBe(false);
      expect(!result.ok && result.reason).toMatch(/absent from the case/);
    });
  }

  it('names the invented words in its reason, so a swapped provider can be debugged', () => {
    const result = assertGroundedIn(
      ok({ summary: 'EMDR and Priya Sharma are relevant here.' }),
      CONTEXT,
    );

    // As the model wrote them, so a developer swapping providers sees what it invented
    // rather than a lowercased approximation of it.
    expect(!result.ok && result.reason).toContain('Priya');
    expect(!result.ok && result.reason).toContain('EMDR');
  });
});

describe('register the product refuses', () => {
  const cases: readonly { label: string; pattern: RegExp; summary: AiCaseSummary }[] = [
    {
      label: 'a diagnosis',
      pattern: /clinical language/,
      summary: ok({
        summary: 'They appear to be showing symptoms of generalised anxiety disorder.',
        observations: ['They speak Hindi and work with Work stress.'],
      }),
    },
    {
      label: 'treatment advice',
      pattern: /treatment advice/,
      summary: ok({
        summary: 'A CBT treatment plan would suit them.',
        observations: ['They speak Hindi and work with Work stress.'],
      }),
    },
    {
      label: 'a score',
      pattern: /a figure or rank/,
      summary: ok({
        summary: 'Ananya Rao scores 92% against this intake.',
        observations: ['They speak Hindi and work with Work stress.'],
      }),
    },
    {
      label: 'a rank',
      pattern: /a figure or rank/,
      summary: ok({
        summary: 'Ananya Rao is ranked first among the eligible candidates.',
        observations: ['They speak Hindi and work with Work stress.'],
      }),
    },
    {
      label: 'a verdict',
      pattern: /a verdict/,
      summary: ok({
        summary: 'Ananya Rao is the best match for this client.',
        observations: ['They speak Hindi and work with Work stress.'],
      }),
    },
    {
      label: 'a guarantee',
      pattern: /a verdict/,
      summary: ok({
        summary: 'Ananya Rao is guaranteed to suit them.',
        observations: ['They speak Hindi and work with Work stress.'],
      }),
    },
  ];

  for (const { label, pattern, summary } of cases) {
    it(`is refused: ${label}`, () => {
      const result = assertGroundedIn(summary, CONTEXT);

      expect(result.ok).toBe(false);
      expect(!result.ok && result.reason).toMatch(pattern);
    });
  }
});

describe('before the grounding check, the summary is normalised', () => {
  it('caps a summary that runs on', () => {
    const long = normaliseSummary({
      summary: 'Hindi. '.repeat(500),
      observations: [],
      tradeoffs: [],
    });

    expect(long.summary).toHaveLength(MAX_SUMMARY_LENGTH);
  });

  it('caps the number of observations and tradeoffs', () => {
    const many = normaliseSummary({
      summary: 'They speak Hindi.',
      observations: Array.from({ length: 20 }, (_u, index) => `Hindi observation ${index}`),
      tradeoffs: Array.from({ length: 20 }, (_u, index) => `Hindi tradeoff ${index}`),
    });

    expect(many.observations).toHaveLength(MAX_OBSERVATIONS);
    expect(many.tradeoffs).toHaveLength(MAX_TRADEOFFS);
  });

  it('truncates a single very long line rather than losing the observation', () => {
    const normalised = normaliseSummary({
      summary: 'They speak Hindi.',
      observations: [`Hindi ${'x'.repeat(900)}`],
      tradeoffs: [],
    });

    expect(normalised.observations).toHaveLength(1);
    expect(normalised.observations[0]?.length).toBeLessThanOrEqual(220);
  });

  it('removes a repeat, because the same observation twice is not two observations', () => {
    const normalised = normaliseSummary({
      summary: 'They speak Hindi.',
      observations: ['They speak Hindi.', 'they speak hindi.'],
      tradeoffs: [],
    });

    expect(normalised.observations).toHaveLength(1);
  });

  it('collapses whitespace, so a model’s line breaks do not survive into the page', () => {
    const normalised = normaliseSummary({
      summary: 'They speak\n\n  Hindi.',
      observations: [],
      tradeoffs: [],
    });

    expect(normalised.summary).toBe('They speak Hindi.');
  });
});

describe('a summary that says nothing', () => {
  it('is refused for an empty summary', () => {
    expect(assertGroundedIn(ok({ summary: '   ' }), CONTEXT).ok).toBe(false);
  });

  it('is refused when every observation was a blank line', () => {
    const result = assertGroundedIn(ok({ observations: ['', '   '] }), CONTEXT);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/observations/);
  });
});

describe('the direction of the grounding check', () => {
  it('allows ordinary connective wording that the context does not contain', () => {
    // A summary that only uses words from the input cannot say "but", "because" or "while",
    // and would be refused for a grammatical reason rather than a factual one. These are the
    // words a summariser needs, and none of them can assert anything about anyone.
    const result = assertGroundedIn(
      ok({
        summary:
          'While they speak Hindi, they do not carry Exploratory, because that is what was asked for.',
        observations: ['Because they asked for Exploratory, it is worth looking at Dev Menon.'],
      }),
      CONTEXT,
    );

    expect(result.ok).toBe(true);
  });

  it('matches an ordinary verb ending against its noun', () => {
    const result = assertGroundedIn(
      ok({
        summary: 'They carry Work stress and speak Hindi, and Ananya Rao matches both of those.',
        observations: ['Because Dev Menon covers Exploratory, he is worth comparing.'],
      }),
      CONTEXT,
    );

    expect(result.ok).toBe(true);
  });

  it('refuses a word that merely rhymes with one in the case', () => {
    const result = assertGroundedIn(
      ok({ summary: 'They are displaying chronic fatigue and burnout.' }),
      CONTEXT,
    );

    expect(result.ok).toBe(false);
  });

  it('refuses a claim about an alternative candidate that is not there', () => {
    const result = assertGroundedIn(
      ok({
        summary: 'Ananya Rao does not carry Exploratory.',
        observations: ['Dev Menon is also not available on Sundays.'],
      }),
      CONTEXT,
    );

    // "Sundays" is nowhere in the case. A model that knew a therapist's availability from
    // training data rather than from the store would be refused, which is the point.
    expect(result.ok).toBe(false);
  });
});
