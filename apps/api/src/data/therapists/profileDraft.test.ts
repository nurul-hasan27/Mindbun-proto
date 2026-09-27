import { describe, expect, it } from 'vitest';
import {
  InvalidProfileDraftError,
  assertValidProfileDraft,
  validateProfileDraft,
  type ProfileDraft,
} from './profileDraft.js';

const VALID: ProfileDraft = {
  displayName: 'Ananya Mehra',
  headline: 'Warm, curious, reflective',
  bio: 'Therapy can be a place to slow down, and I try to make that possible from the first minute.',
  location: 'Bengaluru, India',
  timezone: 'Asia/Kolkata',
  yearsOfExperience: 9,
  availability: [
    { dayOfWeek: 'TUESDAY', startMinute: 1080, endMinute: 1200 },
    { dayOfWeek: 'SATURDAY', startMinute: 600, endMinute: 720 },
  ],
};

describe('validateProfileDraft', () => {
  it('accepts a complete profile', () => {
    expect(validateProfileDraft(VALID)).toEqual([]);
  });

  it('rejects a biography that says nothing', () => {
    const problems = validateProfileDraft({ ...VALID, bio: '  ' });

    expect(problems).toContainEqual(expect.stringContaining('bio must be at least'));
  });

  it('rejects a headline too short to be one', () => {
    expect(validateProfileDraft({ ...VALID, headline: 'Hi' })).toContainEqual(
      expect.stringContaining('headline must be at least'),
    );
  });

  it('requires an IANA timezone rather than an offset', () => {
    const problems = validateProfileDraft({ ...VALID, timezone: 'GMT+5:30' });

    expect(problems).toContainEqual(expect.stringContaining('is not an IANA zone name'));
  });

  it('accepts a zone with a numeric offset segment', () => {
    expect(validateProfileDraft({ ...VALID, timezone: 'Etc/GMT+5' })).not.toContainEqual(
      expect.stringContaining('timezone'),
    );
  });

  it('rejects implausible experience', () => {
    expect(validateProfileDraft({ ...VALID, yearsOfExperience: 900 })).toContainEqual(
      expect.stringContaining('yearsOfExperience'),
    );
    expect(validateProfileDraft({ ...VALID, yearsOfExperience: 4.5 })).toContainEqual(
      expect.stringContaining('yearsOfExperience'),
    );
  });

  it('rejects a window that ends before it starts', () => {
    const problems = validateProfileDraft({
      ...VALID,
      availability: [{ dayOfWeek: 'MONDAY', startMinute: 1200, endMinute: 1080 }],
    });

    expect(problems).toContainEqual(expect.stringContaining('must end after it starts'));
  });

  it('rejects a window that runs past midnight', () => {
    const problems = validateProfileDraft({
      ...VALID,
      availability: [{ dayOfWeek: 'MONDAY', startMinute: 1380, endMinute: 1500 }],
    });

    expect(problems).toContainEqual(expect.stringContaining('within a single day'));
  });

  it('rejects an unknown day', () => {
    const problems = validateProfileDraft({
      ...VALID,
      availability: [{ dayOfWeek: 'CATURDAY', startMinute: 600, endMinute: 700 }],
    });

    expect(problems).toContainEqual(expect.stringContaining('unknown day of week'));
  });

  it('rejects two windows starting on the same day', () => {
    const problems = validateProfileDraft({
      ...VALID,
      availability: [
        { dayOfWeek: 'TUESDAY', startMinute: 1080, endMinute: 1200 },
        { dayOfWeek: 'TUESDAY', startMinute: 1200, endMinute: 1320 },
      ],
    });

    expect(problems).toContainEqual(expect.stringContaining('same day'));
  });

  it('allows a profile with no stated availability yet', () => {
    expect(validateProfileDraft({ ...VALID, availability: [] })).toEqual([]);
  });
});

describe('assertValidProfileDraft', () => {
  it('is quiet when the profile is fine', () => {
    expect(() => {
      assertValidProfileDraft(VALID);
    }).not.toThrow();
  });

  it('throws with every problem listed, not just the first', () => {
    try {
      assertValidProfileDraft({ ...VALID, bio: '', location: '', timezone: 'nope' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidProfileDraftError);
      expect((error as InvalidProfileDraftError).problems).toHaveLength(3);
    }
  });
});
