import { describe, expect, it } from 'vitest';
import {
  findAvailabilityOverlaps,
  isResolvableTimezone,
  standsAllYear,
  type AvailabilitySide,
  type ReferenceWeek,
  type ZonedWindow,
} from './availability.js';

/**
 * Correctness of the whole engine rests on this module, so the cases below are
 * the ones where a naive hour comparison gives a confident wrong answer.
 *
 * **How to read the expectations.** Almost every case uses zones with a *constant*
 * offset — Kolkata +5:30, Dubai +4, Kathmandu +5:45, Phoenix −7, Nairobi +3,
 * Singapore +8 — so the arithmetic is one subtraction and can be checked by hand
 * from the comment. Where a case is about daylight saving, the comment shows both
 * regimes explicitly. The reference week is the one containing Monday 11 January
 * 2027.
 */

function windows(...entries: readonly (readonly [ZonedWindow['dayOfWeek'], number, number])[]) {
  return entries.map(([dayOfWeek, startMinute, endMinute]) => ({
    dayOfWeek,
    startMinute,
    endMinute,
  }));
}

function side(timezone: string, entries: AvailabilitySide['windows']): AvailabilitySide {
  return { timezone, windows: entries };
}

/**
 * A stand-in for "there was no such overlap", so a failing `find` reports an empty
 * result rather than throwing on a non-null assertion.
 */
const neverAnOverlap = {
  weeks: [] as string[],
  client: { dayOfWeek: 'MONDAY' as const, startMinute: 0, endMinute: 0, timezone: 'UTC' },
  therapist: { dayOfWeek: 'MONDAY' as const, startMinute: 0, endMinute: 0, timezone: 'UTC' },
  startUtcMinute: 0,
  endUtcMinute: 0,
};

/** The week of 22 March 2027, which contains the day London springs forward. */
const WEEK_OF_LONDON_SPRING_FORWARD: ReferenceWeek = {
  name: 'spring-forward-week',
  anchorMs: Date.UTC(2027, 2, 24, 12, 0, 0),
};

/** The week of 25 October 2027, which contains the day London falls back. */
const WEEK_OF_LONDON_FALL_BACK: ReferenceWeek = {
  name: 'fall-back-week',
  anchorMs: Date.UTC(2027, 9, 27, 12, 0, 0),
};

const MON = 'MONDAY' as const;
const TUE = 'TUESDAY' as const;
const WED = 'WEDNESDAY' as const;
const THU = 'THURSDAY' as const;
const SAT = 'SATURDAY' as const;
const SUN = 'SUNDAY' as const;

describe('one timezone', () => {
  it('finds the shared part of two overlapping windows', () => {
    // 18:00–21:00 and 17:00–20:00 share 18:00–20:00.
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', windows([TUE, 18 * 60, 21 * 60])),
      side('Asia/Kolkata', windows([TUE, 17 * 60, 20 * 60])),
    );

    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]?.client).toMatchObject({
      dayOfWeek: TUE,
      startMinute: 18 * 60,
      endMinute: 20 * 60,
    });
  });

  it('reports nothing when the hours are close but do not meet', () => {
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', windows([TUE, 18 * 60, 19 * 60])),
      side('Asia/Kolkata', windows([TUE, 19 * 60, 21 * 60])),
    );

    expect(result.overlaps).toEqual([]);
  });

  it('does not count touching intervals as an overlap', () => {
    // One session ends exactly when the other begins. There is no session in that
    // instant, and reporting one would be a promise nobody can keep.
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', windows([WED, 19 * 60, 21 * 60])),
      side('Asia/Kolkata', windows([WED, 17 * 60, 19 * 60])),
    );

    expect(result.overlaps).toEqual([]);
  });

  it('does not treat a different weekday as an overlap', () => {
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', windows([TUE, 18 * 60, 21 * 60])),
      side('Asia/Kolkata', windows([WED, 18 * 60, 21 * 60])),
    );

    expect(result.overlaps).toEqual([]);
  });
});

describe('two timezones with fixed offsets', () => {
  it('finds an overlap a clock-face comparison would have missed', () => {
    // Client 19:00–21:00 Kolkata (+5:30) is 13:30–15:30 UTC.
    // Therapist 16:00–18:00 Dubai (+4) is 12:00–14:00 UTC.
    // Shared: 13:30–14:00 UTC — the client's 19:00, the therapist's 17:30.
    //
    // The clock faces say 19:00 and 16:00, which look like different evenings.
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', windows([WED, 19 * 60, 21 * 60])),
      side('Asia/Dubai', windows([WED, 16 * 60, 18 * 60])),
    );

    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]?.client).toMatchObject({
      dayOfWeek: WED,
      startMinute: 19 * 60,
      endMinute: 19 * 60 + 30,
    });
    expect(result.overlaps[0]?.therapist).toMatchObject({
      dayOfWeek: WED,
      startMinute: 17 * 60 + 30,
      endMinute: 18 * 60,
    });
  });

  it('finds no overlap when the clock faces are identical and the world is not', () => {
    // 19:00–20:00 in both places, and nine and a half hours apart in reality.
    // The single most persuasive demonstration that clock times are not times.
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', windows([WED, 19 * 60, 20 * 60])),
      side('America/Phoenix', windows([WED, 19 * 60, 20 * 60])),
    );

    expect(result.overlaps).toEqual([]);
  });

  it('handles a quarter-hour offset, which is not a rounding error', () => {
    // Kathmandu is +5:45. Client 19:00–20:00 is 13:15–14:15 UTC.
    // Dubai 17:15–18:15 is 13:15–14:15 UTC. The same hour, exactly.
    const result = findAvailabilityOverlaps(
      side('Asia/Kathmandu', windows([WED, 19 * 60, 20 * 60])),
      side('Asia/Dubai', windows([WED, 17 * 60 + 15, 18 * 60 + 15])),
    );

    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]?.client).toMatchObject({ startMinute: 19 * 60, endMinute: 20 * 60 });
    expect(result.overlaps[0]?.therapist).toMatchObject({
      startMinute: 17 * 60 + 15,
      endMinute: 18 * 60 + 15,
    });
  });

  it('handles a half-hour offset', () => {
    // Client 19:00–20:00 Kathmandu (+5:45) is 13:15–14:15 UTC.
    // Therapist 17:00–18:00 Dubai (+4) is 13:00–14:00 UTC.
    // Shared: 13:15–14:00 UTC — 45 minutes.
    const result = findAvailabilityOverlaps(
      side('Asia/Kathmandu', windows([WED, 19 * 60, 20 * 60])),
      side('Asia/Dubai', windows([WED, 17 * 60, 18 * 60])),
    );

    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]?.client).toMatchObject({
      startMinute: 19 * 60,
      endMinute: 19 * 60 + 45,
    });
    expect(
      (result.overlaps[0]?.endUtcMinute ?? 0) - (result.overlaps[0]?.startUtcMinute ?? 0),
    ).toBe(45);
  });

  it('does not treat touching intervals in two zones as an overlap', () => {
    // Client 19:00–19:30 Kolkata is 13:30–14:00 UTC.
    // Therapist 21:00–21:30 Singapore (+8) is 13:00–13:30 UTC. They meet at 13:30.
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', windows([TUE, 19 * 60, 19 * 60 + 30])),
      side('Asia/Singapore', windows([TUE, 21 * 60, 21 * 60 + 30])),
    );

    expect(result.overlaps).toEqual([]);
  });

  it('finds a shared hour even when the two clocks call it different days', () => {
    // Client Wednesday 07:00–08:00 Kolkata is Wednesday 01:30–02:30 UTC.
    // Therapist Tuesday 18:00–19:00 Phoenix (−7) is Tuesday 01:00–02:00 UTC.
    // Shared: 01:30–02:00 UTC — half an hour on Wednesday, and on the therapist's
    // own clock it is still Tuesday evening.
    //
    // Both windows name a different weekday, and the hour is real. An engine that
    // compared weekday-and-clock-time pairs would never find this, and one that
    // echoed the weekday it was given would name the wrong day.
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', windows([WED, 7 * 60, 8 * 60])),
      side('America/Phoenix', windows([TUE, 18 * 60, 19 * 60])),
    );

    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]?.client).toMatchObject({
      dayOfWeek: WED,
      startMinute: 7 * 60,
      endMinute: 7 * 60 + 30,
    });
    expect(result.overlaps[0]?.therapist).toMatchObject({
      dayOfWeek: TUE,
      startMinute: 18 * 60 + 30,
      endMinute: 19 * 60,
    });
  });

  it('reports the shared minute as one absolute instant', () => {
    // An independent check of the absolute arithmetic, not just of the reading.
    // Client Wednesday 19:00 Kolkata is 13:30 UTC, and 2027-01-13 is the
    // Wednesday of the reference week.
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', windows([WED, 19 * 60, 20 * 60])),
      side('Asia/Dubai', windows([WED, 17 * 60 + 30, 18 * 60 + 30])),
    );

    expect(result.overlaps[0]?.startUtcMinute).toBe(
      Math.floor(Date.UTC(2027, 0, 13, 13, 30) / 60_000),
    );
  });
});

describe('daylight saving', () => {
  it('reports one slot per season when the shared time moves across the year', () => {
    // Client Wednesday 19:00–21:00 Kolkata is 13:30–15:30 UTC all year.
    // Therapist Wednesday 14:00–16:00 London is 14:00–16:00 UTC in January
    // (GMT) and 13:00–15:00 UTC in July (BST).
    //
    // January: shared 14:00–15:30 UTC = the client 19:30–21:00, the therapist
    //          14:00–15:30. The client's own end is the binding one.
    // July:    shared 13:30–15:00 UTC = the client 19:00–20:30, the therapist
    //          14:30–16:00. The therapist's own end is the binding one.
    //
    // Two genuinely different slots at different clock times, which is what
    // "your evenings and their afternoons overlap" actually means in practice.
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', windows([WED, 19 * 60, 21 * 60])),
      side('Europe/London', windows([WED, 14 * 60, 16 * 60])),
    );

    expect(result.overlaps).toHaveLength(2);

    const january = result.overlaps.find((overlap) => overlap.weeks.includes('winter'));
    const july = result.overlaps.find((overlap) => overlap.weeks.includes('summer'));

    expect(january?.client).toMatchObject({ startMinute: 19 * 60 + 30, endMinute: 21 * 60 });
    expect(january?.therapist).toMatchObject({ startMinute: 14 * 60, endMinute: 15 * 60 + 30 });
    expect(january?.weeks).toEqual(['winter']);

    expect(july?.client).toMatchObject({ startMinute: 19 * 60, endMinute: 20 * 60 + 30 });
    expect(july?.therapist).toMatchObject({ startMinute: 14 * 60 + 30, endMinute: 16 * 60 });
    expect(july?.weeks).toEqual(['summer']);

    // Neither holds all year, so the product must not say they always overlap.
    expect(standsAllYear(january ?? neverAnOverlap)).toBe(false);
    expect(standsAllYear(july ?? neverAnOverlap)).toBe(false);
  });

  it('merges a slot that is the same in both seasons into one row', () => {
    // Client Friday 09:00–23:00 Kolkata is 03:30–17:30 UTC all year.
    // Therapist Friday 14:00–15:00 Dubai is 10:00–11:00 UTC all year, inside it.
    // The client's slot does not move, so this is one standing arrangement.
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', windows(['FRIDAY', 9 * 60, 23 * 60])),
      side('Asia/Dubai', windows(['FRIDAY', 14 * 60, 15 * 60])),
    );

    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]?.weeks).toEqual(['winter', 'summer']);
    expect(standsAllYear(result.overlaps[0] ?? neverAnOverlap)).toBe(true);
    expect(result.overlaps[0]?.client).toMatchObject({
      startMinute: 15 * 60 + 30,
      endMinute: 16 * 60 + 30,
    });
  });

  it('skips a local time a spring-forward jump removed rather than inventing it', () => {
    // On the last Sunday of March the British clock goes 01:00 → 02:00, so 01:30
    // simply does not happen that day. A therapist who says they are free Sunday
    // 01:30–01:40 is describing a moment that never arrives.
    //
    // Comparing the ordinary January and July weeks cannot catch this — neither
    // contains a transition — which is exactly why the reference week is
    // overridable.
    const result = findAvailabilityOverlaps(
      side('Europe/London', windows([SUN, 90, 100])),
      side('Europe/London', windows([SUN, 90, 100])),
      { referenceWeeks: [WEEK_OF_LONDON_SPRING_FORWARD] },
    );

    expect(result.overlaps).toEqual([]);

    // The same window in an ordinary week is perfectly real, so the answer is
    // about the week and not about the window.
    const ordinary = findAvailabilityOverlaps(
      side('Europe/London', windows([SUN, 90, 100])),
      side('Europe/London', windows([SUN, 90, 100])),
    );

    expect(ordinary.overlaps).toHaveLength(1);
  });

  it('reports a repeated local hour once, not twice', () => {
    // On the last Sunday of October the clock goes 02:00 → 01:00, so 01:30 happens
    // twice that day. Both are real bookable moments, but they are the same
    // wall-clock slot, and listing it twice would inflate the evidence.
    const result = findAvailabilityOverlaps(
      side('Europe/London', windows([SUN, 90, 100])),
      side('Europe/London', windows([SUN, 90, 100])),
      { referenceWeeks: [WEEK_OF_LONDON_FALL_BACK] },
    );

    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]?.weeks).toEqual(['fall-back-week']);
  });

  it('compares opposite hemispheres, where the seasons run the other way', () => {
    // Sydney is +11 in January and +10 in July; London is +0 and +1. The two zones
    // move towards each other and then apart again, which a single reference week
    // would get wrong in one direction or the other.
    //
    // January: London 10:00–11:00 is 10:00–11:00 UTC; Sydney 21:00–22:00 is
    // 10:00–11:00 UTC. The same hour, exactly.
    // July:    London 10:00–11:00 is 09:00–10:00 UTC; Sydney 21:00–22:00 is
    // 11:00–12:00 UTC. An hour apart, so nothing shared.
    const result = findAvailabilityOverlaps(
      side('Europe/London', windows([THU, 10 * 60, 11 * 60])),
      side('Australia/Sydney', windows([THU, 21 * 60, 22 * 60])),
    );

    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]?.weeks).toEqual(['winter']);
    expect(result.overlaps[0]?.client).toMatchObject({ startMinute: 10 * 60, endMinute: 11 * 60 });
    expect(result.overlaps[0]?.therapist).toMatchObject({
      startMinute: 21 * 60,
      endMinute: 22 * 60,
    });
  });

  it('does not let a zone we cannot read look like a zone with no overlap', () => {
    const result = findAvailabilityOverlaps(
      side('Europe/London', windows([WED, 19 * 60, 21 * 60])),
      side('Not/AZone', windows([WED, 19 * 60, 21 * 60])),
    );

    expect(result.overlaps).toEqual([]);
    expect(result.zonesUnresolvable).toBe(true);
  });
});

describe('midnight', () => {
  it('treats a window ending at midnight as ending that day', () => {
    // 22:00–24:00 and 23:00–23:59 share 23:00–23:59.
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', windows([SAT, 22 * 60, 1440])),
      side('Asia/Kolkata', windows([SAT, 23 * 60, 23 * 60 + 59])),
    );

    // 22:00–24:00 IST is 16:30–18:30 UTC; 23:00–23:59 IST is 17:30–18:29 UTC. The
    // whole of the second window fits inside the first, so a full hour is shared.
    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]?.client).toMatchObject({
      dayOfWeek: SAT,
      startMinute: 23 * 60,
      endMinute: 23 * 60 + 59,
    });
  });

  it('carries a window that runs past midnight into the following morning', () => {
    // Saturday 22:00–02:00 is Saturday 16:30 UTC to Sunday 20:30 UTC.
    // Sunday 01:00–03:00 is Sunday 19:30–21:30 UTC. Shared Sunday 19:30–20:30 UTC.
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', windows([SAT, 22 * 60, 2 * 60])),
      side('Asia/Kolkata', windows([SUN, 1 * 60, 3 * 60])),
    );

    expect(result.overlaps).toHaveLength(1);
    // The shared minute is Sunday 01:30 IST. The client is reported on the day the
    // *overlap* starts, not the day their window did — the window began on
    // Saturday but the shared part is in the small hours.
    expect(result.overlaps[0]?.client).toMatchObject({
      dayOfWeek: SUN,
      startMinute: 1 * 60,
      endMinute: 2 * 60,
    });
    expect(result.overlaps[0]?.therapist).toMatchObject({
      dayOfWeek: SUN,
      startMinute: 1 * 60,
      endMinute: 2 * 60,
    });
  });

  it('still finds the same-day part of a window that wraps', () => {
    // Friday 22:00–02:00 against Friday 20:00–23:00 share 22:00–23:00 on Friday
    // itself, even though one of them is really about Saturday morning.
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', windows(['FRIDAY', 22 * 60, 2 * 60])),
      side('Asia/Kolkata', windows(['FRIDAY', 20 * 60, 23 * 60])),
    );

    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]?.client).toMatchObject({
      startMinute: 22 * 60,
      endMinute: 23 * 60,
    });
  });
});

describe('nothing to compare', () => {
  it('reports no overlap when the client shared no times', () => {
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', []),
      side('Europe/London', windows([TUE, 9 * 60, 10 * 60])),
    );

    expect(result.overlaps).toEqual([]);
    expect(result.zonesUnresolvable).toBe(false);
  });

  it('reports no overlap when the therapist shared no times', () => {
    const result = findAvailabilityOverlaps(
      side('Asia/Kolkata', windows([TUE, 9 * 60, 10 * 60])),
      side('Europe/London', []),
    );

    expect(result.overlaps).toEqual([]);
    expect(result.zonesUnresolvable).toBe(false);
  });

  it('knows which zone names it can resolve', () => {
    expect(isResolvableTimezone('Asia/Kolkata')).toBe(true);
    expect(isResolvableTimezone('Europe/London')).toBe(true);
    expect(isResolvableTimezone('UTC')).toBe(true);
    expect(isResolvableTimezone('Not/AZone')).toBe(false);
    expect(isResolvableTimezone('')).toBe(false);
  });
});

describe('determinism', () => {
  // Client: Mon and Tue 19:00–21:00, Wed 08:00–10:00, all Kolkata.
  // Therapist: Mon and Tue 17:30–19:30, Wed 06:30–08:30, all Dubai.
  // Each pair is exactly the same absolute hour, so all three overlap fully.
  const client = side(
    'Asia/Kolkata',
    windows([MON, 19 * 60, 21 * 60], [TUE, 19 * 60, 21 * 60], [WED, 8 * 60, 10 * 60]),
  );
  const therapist = side(
    'Asia/Dubai',
    windows(
      [MON, 17 * 60 + 30, 19 * 60 + 30],
      [TUE, 17 * 60 + 30, 19 * 60 + 30],
      [WED, 6 * 60 + 30, 8 * 60 + 30],
    ),
  );

  it('returns the same overlaps in the same order every time', () => {
    expect(findAvailabilityOverlaps(client, therapist)).toEqual(
      findAvailabilityOverlaps(client, therapist),
    );
  });

  it('orders overlaps by weekday and then by time, never by discovery', () => {
    const result = findAvailabilityOverlaps(client, therapist);

    expect(
      result.overlaps.map((overlap) => [overlap.client.dayOfWeek, overlap.client.startMinute]),
    ).toEqual([
      [MON, 19 * 60],
      [TUE, 19 * 60],
      [WED, 8 * 60],
    ]);
  });

  it('does not depend on the order the windows arrive in', () => {
    const reversed = {
      client: side('Asia/Kolkata', [...client.windows].reverse()),
      therapist: side('Asia/Dubai', [...therapist.windows].reverse()),
    };

    expect(findAvailabilityOverlaps(reversed.client, reversed.therapist)).toEqual(
      findAvailabilityOverlaps(client, therapist),
    );
  });

  it('does not depend on the order the two people are given in', () => {
    // The client is named because their times are what gets explained, so swapping
    // the arguments changes the *reading*, not the count of shared minutes. This
    // asserts the count is symmetric, which is what a reader would expect.
    const forward = findAvailabilityOverlaps(client, therapist);
    const backward = findAvailabilityOverlaps(therapist, client);

    const totalMinutes = (result: typeof forward): number =>
      result.overlaps.reduce(
        (sum, overlap) => sum + (overlap.endUtcMinute - overlap.startUtcMinute),
        0,
      );

    expect(totalMinutes(backward)).toBe(totalMinutes(forward));
  });
});
