import { describe, expect, it } from 'vitest';
import {
  formatLongIndiaDate,
  getIndiaDateKey,
  getNextIndiaMidnightAt,
  getNextRateReminderAt,
  isAtOrAfterRateReminderTime,
} from './indiaTime';

describe('India time helpers', () => {
  it('formats and keys dates using Asia/Kolkata rather than UTC', () => {
    const instant = new Date('2026-08-07T20:00:00.000Z');

    expect(getIndiaDateKey(instant)).toBe('2026-08-08');
    expect(formatLongIndiaDate(instant)).toBe('Saturday, 8 August 2026');
  });

  it('uses 8 AM IST as the reminder boundary', () => {
    expect(isAtOrAfterRateReminderTime(new Date('2026-08-08T02:29:59.000Z'))).toBe(false);
    expect(isAtOrAfterRateReminderTime(new Date('2026-08-08T02:30:00.000Z'))).toBe(true);
    expect(getNextRateReminderAt(new Date('2026-08-08T01:00:00.000Z')).toISOString())
      .toBe('2026-08-08T02:30:00.000Z');
    expect(getNextRateReminderAt(new Date('2026-08-08T03:00:00.000Z')).toISOString())
      .toBe('2026-08-09T02:30:00.000Z');
  });

  it('finds the next IST midnight', () => {
    expect(getNextIndiaMidnightAt(new Date('2026-08-08T03:00:00.000Z')).toISOString())
      .toBe('2026-08-08T18:30:00.000Z');
  });
});
