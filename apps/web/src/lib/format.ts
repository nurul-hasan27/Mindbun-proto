import type { DayName } from './api/types';

/**
 * Formatting for a therapist's own calendar.
 *
 * Availability arrives as minutes from local midnight in the therapist's
 * timezone, which is a wall-clock fact. It is therefore formatted directly
 * rather than converted: showing "18:00" and naming the zone is honest, and
 * converting to the reader's zone would imply a precision the matching
 * calculation does not have yet.
 */

/** 1080 → "18:00". */
export function formatMinutes(minutes: number): string {
  const safe = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

const DAY_NAMES: Record<DayName, string> = {
  MONDAY: 'Mondays',
  TUESDAY: 'Tuesdays',
  WEDNESDAY: 'Wednesdays',
  THURSDAY: 'Thursdays',
  FRIDAY: 'Fridays',
  SATURDAY: 'Saturdays',
  SUNDAY: 'Sundays',
};

export function formatDay(day: DayName): string {
  return DAY_NAMES[day];
}

/** "Asia/Kolkata" → "India Standard Time", falling back to the zone name. */
export function describeTimezone(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      timeZoneName: 'long',
    }).formatToParts(new Date());
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? zone;
  } catch {
    // An unknown zone should never break a page; the raw identifier is enough.
    return zone;
  }
}

/** "Tuesdays 18:00–20:00" */
export function formatWindow(window: {
  readonly dayOfWeek: DayName;
  readonly startMinute: number;
  readonly endMinute: number;
}): string {
  return `${formatDay(window.dayOfWeek)} ${formatMinutes(window.startMinute)}–${formatMinutes(window.endMinute)}`;
}

/** The first letters of a name, for the monogram. "Ananya Mehra" → "AM". */
export function initialsOf(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

/** Joins names for display: ["English", "Hindi"] → "English · Hindi". */
export function joinNames(names: readonly string[], separator = ' · '): string {
  return names.join(separator);
}
