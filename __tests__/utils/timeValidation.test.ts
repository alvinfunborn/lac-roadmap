import {
  validateTimeFormat,
  validateTimeRange,
  extractDateFromTime,
  extractTimeFromDateTime,
} from '../../utils/timeValidation';

describe('validateTimeFormat', () => {
  it.each([
    ['', true],
    ['   ', true],
    ['2025-11-01', true],
    ['2025-11-01 09:00', true],
    ['2025-11-01 09:00:00', true],
    ['09:00', true],
    ['09:00:00', true],
    [' 2025-11-01 ', true], // trim
  ])('treats %p as valid (%p)', (input, expected) => {
    expect(validateTimeFormat(input as string)).toBe(expected);
  });

  it.each([
    '2025/11/01',
    '25-11-01',
    '2025-1-1',
    '9:00',
    '2025-11-01T09:00',
    'not a date',
    '09',
  ])('rejects malformed %p', (input) => {
    expect(validateTimeFormat(input)).toBe(false);
  });
});

describe('validateTimeRange', () => {
  it('valid when either side empty', () => {
    expect(validateTimeRange('', '2025-11-01').valid).toBe(true);
    expect(validateTimeRange('2025-11-01', '').valid).toBe(true);
    expect(validateTimeRange('', '').valid).toBe(true);
  });

  it('rejects when start lacks date but end has date', () => {
    const r = validateTimeRange('09:00', '2025-11-01 12:00');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('结束时间');
  });

  it('valid when neither has date (pure time strings)', () => {
    expect(validateTimeRange('09:00', '12:00').valid).toBe(true);
  });

  it('rejects when end <= start with full datetimes', () => {
    expect(validateTimeRange('2025-11-01 12:00', '2025-11-01 09:00').valid).toBe(false);
    expect(validateTimeRange('2025-11-01 09:00', '2025-11-01 09:00').valid).toBe(false);
  });

  it('valid when end > start with full datetimes', () => {
    expect(validateTimeRange('2025-11-01 09:00', '2025-11-01 12:00').valid).toBe(true);
    expect(validateTimeRange('2025-11-01', '2025-11-02').valid).toBe(true);
  });

  // The implementation guards against NaN dates — but `new Date('2025-13-99')`
  // returns NaN only for some inputs; cover the explicit guard branch by
  // forcing a value that the format regex still accepts but Date() rejects.
  it('rejects format-passing but Date-NaN strings', () => {
    const r = validateTimeRange('9999-99-99', '9999-99-99');
    expect(r.valid).toBe(false);
  });
});

describe('extractDateFromTime', () => {
  it('returns null on empty', () => {
    expect(extractDateFromTime('')).toBeNull();
    expect(extractDateFromTime(undefined as unknown as string)).toBeNull();
  });

  it('extracts yyyy-MM-dd prefix', () => {
    expect(extractDateFromTime('2025-11-01 09:00')).toBe('2025-11-01');
    expect(extractDateFromTime('2025-11-01')).toBe('2025-11-01');
    expect(extractDateFromTime('2025-11-01 09:00:00')).toBe('2025-11-01');
  });

  it('returns null when no date prefix', () => {
    expect(extractDateFromTime('09:00')).toBeNull();
    expect(extractDateFromTime('09:00:00')).toBeNull();
  });
});

describe('extractTimeFromDateTime', () => {
  it('returns null on empty', () => {
    expect(extractTimeFromDateTime('')).toBeNull();
  });

  it('extracts HH:mm or HH:mm:ss suffix', () => {
    expect(extractTimeFromDateTime('2025-11-01 09:00')).toBe('09:00');
    expect(extractTimeFromDateTime('2025-11-01 09:00:00')).toBe('09:00:00');
    expect(extractTimeFromDateTime('09:00')).toBe('09:00');
  });

  it('returns null when only a date', () => {
    expect(extractTimeFromDateTime('2025-11-01')).toBeNull();
  });
});
