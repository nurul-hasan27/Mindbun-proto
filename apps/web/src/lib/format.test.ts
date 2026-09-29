import { describe, expect, it } from 'vitest';
import {
  describeTimezone,
  formatDay,
  formatMinutes,
  formatWindow,
  initialsOf,
  joinNames,
} from './format';

describe('formatMinutes', () => {
  it('renders minutes from local midnight as a wall clock', () => {
    expect(formatMinutes(0)).toBe('00:00');
    expect(formatMinutes(600)).toBe('10:00');
    expect(formatMinutes(1080)).toBe('18:00');
    expect(formatMinutes(1260)).toBe('21:00');
  });

  it('stays inside the day even if given nonsense', () => {
    expect(formatMinutes(-60)).toBe('23:00');
    expect(formatMinutes(1500)).toBe('01:00');
  });
});

describe('formatWindow', () => {
  it('reads as a weekly slot', () => {
    expect(formatWindow({ dayOfWeek: 'TUESDAY', startMinute: 1080, endMinute: 1200 })).toBe(
      'Tuesdays 18:00–20:00',
    );
  });

  it('names every day', () => {
    expect(formatDay('SATURDAY')).toBe('Saturdays');
    expect(formatDay('SUNDAY')).toBe('Sundays');
  });
});

describe('describeTimezone', () => {
  it('names a real IANA zone', () => {
    expect(describeTimezone('Asia/Kolkata')).toBe('India Standard Time');
  });

  it('falls back to the zone identifier rather than throwing', () => {
    expect(describeTimezone('Not/AZone')).toBe('Not/AZone');
  });
});

describe('initialsOf', () => {
  it('takes the first letter of the first and last name', () => {
    expect(initialsOf('Ananya Mehra')).toBe('AM');
    expect(initialsOf('Priya Venkataraman')).toBe('PV');
  });

  it('copes with a single name and with padding', () => {
    expect(initialsOf('  Madsen ')).toBe('M');
  });
});

describe('joinNames', () => {
  it('joins with a middot so lists read as a sentence', () => {
    expect(joinNames(['English', 'Hindi'])).toBe('English · Hindi');
  });
});
