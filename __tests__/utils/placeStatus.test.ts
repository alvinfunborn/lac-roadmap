import { getPlaceStatus } from '../../utils/placeStatus';
import { Place } from '../../types/roadmap';

function p(detail: Place['detail']): Place {
  return { id: 'x', name: 'x', detail };
}

describe('getPlaceStatus', () => {
  // Pin "now" so past/future branches are deterministic. The util reads
  // `new Date()` once per call, so jest fake timers are sufficient.
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-15T12:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('wish when no detail / no start_time', () => {
    expect(getPlaceStatus({ id: 'x', name: 'x', detail: {} })).toBe('wish');
    expect(getPlaceStatus({ id: 'x', name: 'x' } as Place)).toBe('wish');
  });

  it('wish when start_time is HH:mm only (no date prefix)', () => {
    expect(getPlaceStatus(p({ start_time: '09:00' }))).toBe('wish');
  });

  it('plan when start_time is in the future', () => {
    expect(getPlaceStatus(p({ start_time: '2030-01-01' }))).toBe('plan');
  });

  it('done when start_time is in the past', () => {
    expect(getPlaceStatus(p({ start_time: '2020-01-01' }))).toBe('done');
  });

  it('done when start in future but end is in the past', () => {
    // Edge case: malformed schedule but end already elapsed -> still done by spec
    expect(getPlaceStatus(p({ start_time: '2030-01-01', end_time: '2020-01-01' }))).toBe('done');
  });

  it('plan when both start and end are in the future', () => {
    expect(getPlaceStatus(p({ start_time: '2030-01-01', end_time: '2030-01-02' }))).toBe('plan');
  });

  it('done when start_time === now', () => {
    expect(getPlaceStatus(p({ start_time: '2026-05-15 12:00:00' }))).toBe('done');
  });
});
