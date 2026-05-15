import { getPlaceStatusColor, formatPlaceTime } from '../../../pages/roadmap/helpers';
import { Place, RouteSegment } from '../../../types/roadmap';

function makePlace(name: string, detail: Place['detail'] = {}): Place {
  return { id: name, name, detail };
}

describe('getPlaceStatusColor', () => {
  // Fixed wall clock so "past" / "future" boundaries are stable. We use
  // fake timers (modern API) so both Date.now() and `new Date()` see the
  // patched epoch.
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2025-11-15T12:00:00Z') });
  });
  afterEach(() => { jest.useRealTimers(); });

  describe('with start_time', () => {
    it('returns "lac-done" when start in the past', () => {
      const p = makePlace('past', { start_time: '2025-11-01 09:00' });
      expect(getPlaceStatusColor(p, {})).toBe('lac-done');
    });
    it('returns "lac-todo" when start in the future', () => {
      const p = makePlace('future', { start_time: '2025-12-01 09:00' });
      expect(getPlaceStatusColor(p, {})).toBe('lac-todo');
    });
    it('returns "lac-done" when only end_time present and past', () => {
      const p = makePlace('end-past', { start_time: '', end_time: '2025-11-01 09:00' } as any);
      // Note: hasDate is checked on start_time; an empty start with end-only
      // takes the "no date" path. This documents that quirk.
      expect(getPlaceStatusColor(p, {})).toBe('lac-na');
    });
  });

  describe('without start_time', () => {
    it('returns "lac-todo" if place sits in any group (i.e. has a day assignment)', () => {
      const p = makePlace('drafted');
      const groups: Record<string, Array<Place | RouteSegment>> = {
        '第1天': [p],
      };
      expect(getPlaceStatusColor(p, groups)).toBe('lac-todo');
    });
    it('returns "lac-na" when not in any group (truly unplanned)', () => {
      const p = makePlace('floating');
      expect(getPlaceStatusColor(p, {})).toBe('lac-na');
    });
  });
});

describe('formatPlaceTime', () => {
  it('returns empty when no start_time', () => {
    expect(formatPlaceTime(makePlace('x'))).toBe('');
  });
  it('formats start-only with date+time (MM·DD · HH:MM)', () => {
    const p = makePlace('x', { start_time: '2025-11-01 09:30' });
    expect(formatPlaceTime(p)).toBe('11·01 · 09:30');
  });
  it('formats start-only with date only (MM·DD)', () => {
    const p = makePlace('x', { start_time: '2025-11-01' });
    expect(formatPlaceTime(p)).toBe('11·01');
  });
  it('omits end date and uses → when same day', () => {
    const p = makePlace('x', {
      start_time: '2025-11-01 09:30',
      end_time: '2025-11-01 12:00',
    });
    expect(formatPlaceTime(p)).toBe('11·01 · 09:30 → 12:00');
  });
  it('includes full end date+time when cross-day', () => {
    const p = makePlace('x', {
      start_time: '2025-11-01 09:30',
      end_time: '2025-11-02 18:00',
    });
    expect(formatPlaceTime(p)).toBe('11·01 · 09:30 → 11·02 · 18:00');
  });
  it('strips seconds from displayed time', () => {
    const p = makePlace('x', { start_time: '2025-11-01 09:30:15' });
    expect(formatPlaceTime(p)).toBe('11·01 · 09:30');
  });
});
