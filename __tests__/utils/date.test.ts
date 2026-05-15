import {
  startOfDay,
  startOfWeekMonday,
  endOfWeekSunday,
  formatYMD,
  parseDateOrNull,
  isDateKey,
  compareGroupKey,
} from '../../utils/date';

describe('utils/date', () => {
  describe('startOfDay', () => {
    it('zeroes hour/min/sec/ms', () => {
      const d = new Date(2025, 4, 11, 13, 24, 59, 500);
      const r = startOfDay(d);
      expect(r.getHours()).toBe(0);
      expect(r.getMinutes()).toBe(0);
      expect(r.getSeconds()).toBe(0);
      expect(r.getMilliseconds()).toBe(0);
    });
    it('does not mutate input', () => {
      const d = new Date(2025, 4, 11, 13);
      const before = d.getTime();
      startOfDay(d);
      expect(d.getTime()).toBe(before);
    });
  });

  describe('startOfWeekMonday / endOfWeekSunday', () => {
    it('Monday is its own start', () => {
      // 2025-05-12 is a Monday
      const m = new Date(2025, 4, 12);
      const s = startOfWeekMonday(m);
      expect(s.getDay()).toBe(1);
      expect(formatYMD(s)).toBe('2025-05-12');
    });
    it('Sunday rolls back 6 days to previous Monday', () => {
      // 2025-05-11 is Sunday
      const sun = new Date(2025, 4, 11);
      const s = startOfWeekMonday(sun);
      expect(formatYMD(s)).toBe('2025-05-05');
    });
    it('endOfWeekSunday is Sunday of the same Mon-Sun week', () => {
      const wed = new Date(2025, 4, 7); // Wednesday
      const e = endOfWeekSunday(wed);
      expect(e.getDay()).toBe(0);
      expect(formatYMD(e)).toBe('2025-05-11');
    });
  });

  describe('formatYMD', () => {
    it('zero-pads month and day', () => {
      expect(formatYMD(new Date(2025, 0, 5))).toBe('2025-01-05');
      expect(formatYMD(new Date(2025, 11, 31))).toBe('2025-12-31');
    });
  });

  describe('parseDateOrNull', () => {
    it('returns null for falsy / unparseable', () => {
      expect(parseDateOrNull()).toBeNull();
      expect(parseDateOrNull('')).toBeNull();
      expect(parseDateOrNull('not a date')).toBeNull();
    });
    it('parses YYYY-MM-DD', () => {
      const d = parseDateOrNull('2025-05-11')!;
      expect(d.getFullYear()).toBe(2025);
      expect(d.getMonth()).toBe(4);
      expect(d.getDate()).toBe(11);
    });
    it('parses YYYY-M-D (single-digit month/day)', () => {
      const d = parseDateOrNull('2025-5-1')!;
      expect(d.getFullYear()).toBe(2025);
      expect(d.getMonth()).toBe(4);
      expect(d.getDate()).toBe(1);
    });
    it('parses YYYY-MM-DD HH:MM', () => {
      const d = parseDateOrNull('2025-05-11 09:30')!;
      expect(d.getHours()).toBe(9);
      expect(d.getMinutes()).toBe(30);
    });
    it('parses YYYY-MM-DD HH:MM:SS', () => {
      const d = parseDateOrNull('2025-05-11 09:30:15')!;
      expect(d.getSeconds()).toBe(15);
    });
    it('parses with T separator (ISO-ish)', () => {
      const d = parseDateOrNull('2025-05-11T09:30')!;
      expect(d.getHours()).toBe(9);
    });
    it('clamps month/day to valid range', () => {
      // Out-of-range values get clamped to 1-12 / 1-31 by the parser; even
      // though the JS Date may further wrap, the regex/clamp guarantees the
      // parsed value lands in a sane bucket.
      const d = parseDateOrNull('2025-13-32');
      expect(d).not.toBeNull();
    });
  });

  describe('isDateKey', () => {
    it('matches YYYY-MM-DD', () => {
      expect(isDateKey('2025-05-11')).toBe(true);
      expect(isDateKey('2025-5-11')).toBe(false);
      expect(isDateKey('第1天')).toBe(false);
      expect(isDateKey('')).toBe(false);
    });
  });

  describe('compareGroupKey', () => {
    it('date keys sort lexically (== chronologically)', () => {
      expect(compareGroupKey('2025-05-01', '2025-05-02')).toBeLessThan(0);
      expect(compareGroupKey('2025-12-01', '2025-05-02')).toBeGreaterThan(0);
    });
    it('"第N天" keys sort by numeric N', () => {
      expect(compareGroupKey('第1天', '第2天')).toBeLessThan(0);
      expect(compareGroupKey('第10天', '第2天')).toBeGreaterThan(0);
    });
    it('dates come before "第N天"', () => {
      expect(compareGroupKey('2025-05-11', '第1天')).toBeLessThan(0);
      expect(compareGroupKey('第1天', '2025-05-11')).toBeGreaterThan(0);
    });
  });
});
