import type { DayName } from '../dayOfWeek.js';

/**
 * Real availability overlap between two people in two timezones.
 *
 * This is the only part of the engine where a shortcut would be a lie, so it is
 * worth naming the shortcut: compare the client's "Tuesday 19:00–21:00" against the
 * therapist's "Tuesday 18:00–20:00" and check whether the clock times overlap.
 * That is wrong for every pair of people in different zones, and wrong in a way
 * that looks right — which is the dangerous kind of wrong.
 *
 * ## What is actually compared
 *
 * A recurring weekly window is a statement about a wall clock, so it has no single
 * meaning until it is pinned to an instant. This module does that, intersects the
 * results, and reports the shared time back in each person's own frame.
 *
 * **1. One absolute week, shared by both sides.** A week boundary is fixed in UTC
 * — the Monday 00:00 of a reference week. Both people's windows are located
 * inside that same week, so "Tuesday" is one Tuesday for everyone. This is the
 * step a naive implementation misses: anchoring each side to *its own* local
 * Monday puts the two weeks up to a day apart and invents overlaps that are
 * twenty-four hours out.
 *
 * **2. Local minutes, measured from a single epoch.** `localMinutesIntoWeek` is a
 * pure function of (zone, instant): the zone's own clock reading, expressed as
 * minutes past a fixed Monday. Because the epoch is one absolute instant, the
 * function is comparable across zones, and the small correction between a zone's
 * reading of the week boundary and the UTC boundary is exactly what the DST-aware
 * offset arithmetic accounts for.
 *
 * **3. Wall clock to instant, using the offset that applies there.** Each window's
 * minute-of-day is solved by fixed-point iteration against the function above, so
 * a window at 19:00 in Kolkata is placed at 13:30 UTC in winter and 13:30 UTC in
 * summer — Kolkata does not observe daylight saving, and neither does the answer
 * change. In Europe/London the same 19:00 is 19:00 UTC in winter and 18:00 UTC in
 * summer, and the solver reflects that because it reads the offset at each step.
 *
 * A local time a DST jump skipped does not exist. Rather than snapping it to a
 * neighbour, the window is reported as absent for that week: "you are free at
 * 02:30" is not something anyone can act on in the week the clock does that.
 *
 * **4. Intersect as intervals, not as clock times.** Two windows that merely touch
 * — one ends exactly when the other begins — do not overlap. There is no session
 * in that instant, and reporting one would be a promise nobody could keep.
 *
 * **5. Compare both seasons.** A wall-clock window maps to different instants in
 * January than in July, so the whole comparison runs twice — once for a January
 * week, once for a July week — and the results are merged. A slot that holds in
 * only one is recorded as such rather than being presented as a standing
 * arrangement, because "we can do Tuesdays" and "we can do Tuesdays between March
 * and October" are different claims.
 *
 * **6. Report in both frames.** The surviving instant is read back on each
 * person's clock, so the sentence a client reads can name a time they recognise
 * *and* a time the therapist would recognise, and the two provably refer to the
 * same moment.
 *
 * Nothing here is an estimate, a nearest-hour approximation, or a guess about
 * which side is "really" free.
 */

export interface ZonedWindow {
  readonly dayOfWeek: DayName;
  /** Minutes from local midnight in the window's own zone. */
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface AvailabilitySide {
  readonly timezone: string;
  readonly windows: readonly ZonedWindow[];
}

/** One shared slot, expressed in both people's own frames. */
export interface AvailabilityOverlap {
  /**
   * The reference weeks this shared slot was found in, named.
   *
   * Recorded rather than assumed, because the difference between a standing
   * arrangement and a seasonal one is the difference between a promise and a
   * possibility, and the record should not blur them. Ordinarily `['winter',
   * 'summer']` for a slot that holds all year, or just one of the two for a slot
   * that exists in only one.
   */
  readonly weeks: readonly string[];
  readonly client: LocalSlot;
  readonly therapist: LocalSlot;
  /** The absolute interval, in UTC epoch minutes. Internal, never shown. */
  readonly startUtcMinute: number;
  readonly endUtcMinute: number;
}

export interface LocalSlot {
  readonly dayOfWeek: DayName;
  /** Minutes from local midnight. May exceed 1440 when the window runs past midnight. */
  readonly startMinute: number;
  readonly endMinute: number;
  readonly timezone: string;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * Monday 1 January 1996, UTC.
 *
 * A fixed Monday, used as the origin for "minutes into the week". It is a real
 * instant rather than a relabelling of one, which is what makes the reading
 * comparable between zones.
 */
const EPOCH_MS = Date.UTC(1996, 0, 1, 0, 0, 0);
// Kept explicit so the units are named where they are used.
const EPOCH_MINUTE = 0;

/** Monday-first, so a reference week runs Monday 00:00 to the following Monday. */
const DAY_ORDER: readonly DayName[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

/**
 * The reference year.
 *
 * Not `Date.now()`. A match computed today and the same match computed next year
 * have to be the same match, and an engine that reads the clock cannot promise
 * that — a zone that changed its rules would silently change past results. The
 * year is a constant, and choosing a future one is deliberate: it keeps the
 * reference comfortably ahead of the data without depending on today.
 */
const REFERENCE_YEAR = 2027;

/** The names the two ordinary reference weeks are recorded under. */
export const WINTER = 'winter';
export const SUMMER = 'summer';

/** A week to compare, and the name its findings are recorded under. */
export interface ReferenceWeek {
  readonly name: string;
  /** Any instant inside the week; the Monday 00:00 UTC boundary is used. */
  readonly anchorMs: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat | null>();

/**
 * A formatter for a zone, or `null` when the name is not one this runtime knows.
 *
 * The intake accepts an IANA name by pattern, which checks the *shape* of the
 * string rather than looking it up in the timezone database, so a name that
 * passes the check can still be unresolvable. That failure is a normal return
 * value here and never an exception: a zone nobody can read must not be able to
 * eliminate a candidate.
 */
function formatterFor(timezone: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(timezone);

  if (cached !== undefined) {
    return cached;
  }

  let formatter: Intl.DateTimeFormat | null;

  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    formatter = null;
  }

  formatterCache.set(timezone, formatter);

  return formatter;
}

export function isResolvableTimezone(timezone: string): boolean {
  return formatterFor(timezone) !== null;
}

/**
 * The zone's offset from UTC in minutes, at an instant.
 *
 * Derived by asking the zone what its own clock reads and comparing, rather than
 * by parsing a `GMT+05:30` label: the label is a localised string whose format
 * varies between runtimes, and the comparison is the definition rather than a
 * rendering of it.
 */
function offsetMinutesAt(timezone: string, atMs: number): number | null {
  const formatter = formatterFor(timezone);

  if (formatter === null) {
    return null;
  }

  const parts = formatter.formatToParts(new Date(atMs));
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value;

    if (value === undefined) {
      throw new Error(`Intl did not report "${type}" for ${timezone}.`);
    }

    return Number(value);
  };

  // Whole seconds only: an offset is a whole number of minutes, and comparing
  // anything finer would invite a rounding artefact into the result.
  const asUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  );

  return Math.round((asUtc - Math.floor(atMs / 1000) * 1000) / MINUTE_MS);
}

/**
 * Minutes past the epoch Monday, as the zone's own clock counts them.
 *
 * A single function with a single origin, so two zones can be compared directly:
 * the difference between their readings at the same instant *is* their offset.
 */
function localMinutesIntoWeek(timezone: string, atMs: number): number | null {
  const offset = offsetMinutesAt(timezone, atMs);

  if (offset === null) {
    return null;
  }

  return EPOCH_MINUTE + Math.round((atMs - EPOCH_MS) / MINUTE_MS) + offset;
}

/**
 * The instant whose local clock reads `target` minutes past the epoch Monday.
 *
 * Solved by fixed-point iteration rather than in one step, because the offset
 * that governs a local time is the offset at that local time — which is precisely
 * what a DST transition makes circular. Each pass corrects by the exact minute
 * discrepancy, so real zones settle in two; the loop is bounded, and a target the
 * iteration walks past without ever matching is a local time that does not exist.
 */
function localMinuteToUtcMs(timezone: string, target: number): number | null {
  const opening = localMinutesIntoWeek(timezone, EPOCH_MS);
  let candidate = EPOCH_MS + (target - (opening ?? 0)) * MINUTE_MS;

  for (let pass = 0; pass < 6; pass += 1) {
    const local = localMinutesIntoWeek(timezone, candidate);

    if (local === null) {
      return null;
    }

    if (local === target) {
      return candidate;
    }

    candidate += (target - local) * MINUTE_MS;
  }

  return null;
}

/** The UTC Monday 00:00 of the week containing an instant. */
function utcWeekStartMs(anchorMs: number): number {
  const midnight = Math.floor(anchorMs / DAY_MS) * DAY_MS;
  // `getUTCDay` is 0 for Sunday, so this is how many days back to the Monday.
  const daysSinceMonday = (new Date(anchorMs).getUTCDay() + 6) % 7;

  return midnight - daysSinceMonday * DAY_MS;
}

/** Days since the epoch Monday, for a local reading. */
function localDayIndex(localMinutes: number): number {
  return Math.floor(localMinutes / 1440);
}

/** 0 = Monday … 6 = Sunday, because the epoch is a Monday. */
function weekdayFromLocalDayIndex(dayIndex: number): number {
  return ((dayIndex % 7) + 7) % 7;
}

/**
 * The absolute local reading at which this zone's clock reached Monday 00:00 of
 * the reference week.
 *
 * The week boundary is one shared UTC instant, so it does *not* land on anyone's
 * local midnight — in Kolkata it reads Monday 05:30, in New York it reads the
 * *previous* Sunday 19:00. There are then two candidate local Mondays, a week
 * either side, and picking the wrong one puts a whole week between the two
 * people's Tuesdays.
 *
 * The nearer one is always the right one. A zone's local Monday within half a day
 * of a UTC Monday is the Monday of the same calendar week, and choosing the nearer
 * candidate guarantees that — which is what makes "Tuesday" mean one Tuesday for
 * both people, and the whole comparison rest on.
 */
function localMondayMinutes(timezone: string, weekStartMs: number): number | null {
  const atBoundary = localMinutesIntoWeek(timezone, weekStartMs);

  if (atBoundary === null) {
    return null;
  }

  const dayIndex = localDayIndex(atBoundary);
  const before = (dayIndex - weekdayFromLocalDayIndex(dayIndex)) * 1440;
  const after = before + 7 * 1440;

  return Math.abs(before - atBoundary) <= Math.abs(after - atBoundary) ? before : after;
}

interface AbsoluteWindow {
  readonly startMs: number;
  readonly endMs: number;
}

/** One weekly window as an absolute interval inside the shared reference week. */
function toAbsoluteWindow(
  timezone: string,
  weekStartMs: number,
  window: ZonedWindow,
): AbsoluteWindow | null {
  const dayIndex = DAY_ORDER.indexOf(window.dayOfWeek);

  if (dayIndex < 0 || window.startMinute < 0 || window.endMinute > 1440) {
    return null;
  }

  const monday = localMondayMinutes(timezone, weekStartMs);

  if (monday === null) {
    return null;
  }

  const startMs = localMinuteToUtcMs(timezone, monday + dayIndex * 1440 + window.startMinute);

  // A window whose end time is earlier than its start runs past midnight, so its
  // end belongs to the following day. A window ending exactly at 1440 does not
  // need this: 1440 minutes into a day already *is* the next midnight.
  const endDayOffset = window.endMinute < window.startMinute ? 1440 : 0;
  const endMs = localMinuteToUtcMs(
    timezone,
    monday + dayIndex * 1440 + window.endMinute + endDayOffset,
  );

  if (startMs === null || endMs === null || endMs <= startMs) {
    return null;
  }

  return { startMs, endMs };
}

function absoluteWindows(side: AvailabilitySide, weekStartMs: number): AbsoluteWindow[] {
  return side.windows
    .map((window) => toAbsoluteWindow(side.timezone, weekStartMs, window))
    .filter((window): window is AbsoluteWindow => window !== null);
}

/** The half-open intersection of two intervals, or null when they only touch. */
function intersect(
  first: { startMs: number; endMs: number },
  second: { startMs: number; endMs: number },
): { startMs: number; endMs: number } | null {
  const startMs = Math.max(first.startMs, second.startMs);
  const endMs = Math.min(first.endMs, second.endMs);

  return endMs > startMs ? { startMs, endMs } : null;
}

interface SlotReading {
  readonly dayOfWeek: DayName;
  readonly startMinute: number;
  readonly endMinute: number;
}

/** The same absolute interval, read on one person's clock. */
function readSlot(timezone: string, startMs: number, endMs: number): SlotReading | null {
  const start = localMinutesIntoWeek(timezone, startMs);

  if (start === null) {
    return null;
  }

  const dayIndex = localDayIndex(start);
  const dayOfWeek = DAY_ORDER[weekdayFromLocalDayIndex(dayIndex)];

  if (dayOfWeek === undefined) {
    return null;
  }

  const startMinute = start - dayIndex * 1440;

  return {
    dayOfWeek,
    startMinute,
    // Measured from the start day's midnight, so an interval that runs past local
    // midnight keeps a truthful length — reading past 1440 — rather than wrapping
    // around or being thrown away.
    endMinute: startMinute + Math.round((endMs - startMs) / MINUTE_MS),
  };
}

export interface OverlapOptions {
  /**
   * The weeks to compare, replacing the two ordinary ones.
   *
   * Exists for one reason. The default weeks sit in January and July, so neither
   * contains the Sunday on which a zone actually changes its clocks. Pointing this
   * at the week of a transition is the only way to prove that a skipped local hour
   * is treated as absent rather than quietly moved to a neighbour — which is the
   * behaviour most likely to rot unnoticed.
   */
  readonly referenceWeeks?: readonly ReferenceWeek[];
}

export interface OverlapResult {
  readonly overlaps: readonly AvailabilityOverlap[];
  /**
   * True when a timezone could not be resolved, so no comparison could be made.
   *
   * Callers must read this as "no information", never as "no overlap": a zone
   * nobody could read is not a reason to set a candidate aside.
   */
  readonly zonesUnresolvable: boolean;
}

/** The two ordinary reference weeks: a January and a July, far enough apart. */
export function ordinaryReferenceWeeks(): readonly ReferenceWeek[] {
  return [
    { name: WINTER, anchorMs: Date.UTC(REFERENCE_YEAR, 0, 15, 12, 0, 0) },
    { name: SUMMER, anchorMs: Date.UTC(REFERENCE_YEAR, 6, 15, 12, 0, 0) },
  ];
}

/**
 * Every real shared slot between two availabilities.
 *
 * An empty `overlaps` with `zonesUnresolvable: false` means the comparison ran and
 * found nothing. An empty `overlaps` with `zonesUnresolvable: true` means the
 * comparison could not run at all. The first is information and the second is a
 * gap, and the engine treats them differently on purpose.
 */
export function findAvailabilityOverlaps(
  client: AvailabilitySide,
  therapist: AvailabilitySide,
  options: OverlapOptions = {},
): OverlapResult {
  if (client.windows.length === 0 || therapist.windows.length === 0) {
    return { overlaps: [], zonesUnresolvable: false };
  }

  if (!isResolvableTimezone(client.timezone) || !isResolvableTimezone(therapist.timezone)) {
    return { overlaps: [], zonesUnresolvable: true };
  }

  const referenceWeeks = options.referenceWeeks ?? ordinaryReferenceWeeks();

  if (referenceWeeks.length === 0) {
    return { overlaps: [], zonesUnresolvable: false };
  }

  // Keyed on the client's own local reading, because that is the wall clock a
  // client would recognise. Two weeks landing on the same slot are one slot that
  // happens to stand all year, not two separate reasons.
  const found = new Map<string, { weeks: string[]; overlap: AvailabilityOverlap }>();

  for (const reference of referenceWeeks) {
    const weekStartMs = utcWeekStartMs(reference.anchorMs);
    const clientWindows = absoluteWindows(client, weekStartMs);
    const therapistWindows = absoluteWindows(therapist, weekStartMs);

    for (const mine of clientWindows) {
      for (const theirs of therapistWindows) {
        const shared = intersect(mine, theirs);

        if (shared === null) {
          continue;
        }

        const clientSlot = readSlot(client.timezone, shared.startMs, shared.endMs);
        const therapistSlot = readSlot(therapist.timezone, shared.startMs, shared.endMs);

        if (clientSlot === null || therapistSlot === null) {
          continue;
        }

        const key = [clientSlot.dayOfWeek, clientSlot.startMinute, clientSlot.endMinute].join(':');
        const existing = found.get(key);

        if (existing === undefined) {
          found.set(key, {
            weeks: [reference.name],
            overlap: {
              weeks: [reference.name],
              client: { ...clientSlot, timezone: client.timezone },
              therapist: { ...therapistSlot, timezone: therapist.timezone },
              startUtcMinute: Math.round(shared.startMs / MINUTE_MS),
              endUtcMinute: Math.round(shared.endMs / MINUTE_MS),
            },
          });
        } else if (!existing.weeks.includes(reference.name)) {
          // Seen in a second week, so the slot stands in both. The recorded
          // reading is the first one: the two are the same wall-clock slot, and
          // reporting a second copy of it would double-count one arrangement.
          existing.weeks.push(reference.name);
          found.set(key, {
            weeks: existing.weeks,
            overlap: { ...existing.overlap, weeks: [...existing.weeks] },
          });
        }
      }
    }
  }

  // A total order with no ties, so two runs of the engine can never disagree about
  // which overlap came first.
  const overlaps = [...found.values()].map((entry) => entry.overlap);

  overlaps.sort(
    (first, second) =>
      DAY_ORDER.indexOf(first.client.dayOfWeek) - DAY_ORDER.indexOf(second.client.dayOfWeek) ||
      first.client.startMinute - second.client.startMinute ||
      first.client.endMinute - second.client.endMinute,
  );

  return { overlaps, zonesUnresolvable: false };
}

/**
 * `true` when the shared slot was found in every week compared, which for the two
 * ordinary reference weeks means it stands all year rather than in one season.
 */
export function standsAllYear(overlap: AvailabilityOverlap): boolean {
  return overlap.weeks.includes(WINTER) && overlap.weeks.includes(SUMMER);
}
