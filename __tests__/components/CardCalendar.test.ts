import { buildDailyCounts } from '../../components/CardCalendar';
import { Roadmap, Place } from '../../types/roadmap';

function makePlace(name: string, detail: Place['detail'] = {}): Place {
  return { id: name, name, detail };
}

describe('buildDailyCounts', () => {
  it('returns empty map for roadmap with no places', () => {
    const r: Roadmap = { id: 'r', name: 'r', items: [] };
    expect(buildDailyCounts(r)).toEqual({});
  });

  it('counts one per place per day (start_time)', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a', { start_time: '2025-11-01 09:00' }),
        makePlace('b', { start_time: '2025-11-01 14:00' }),
        makePlace('c', { start_time: '2025-11-02 09:00' }),
      ],
    };
    expect(buildDailyCounts(r)).toEqual({
      '2025-11-01': 2,
      '2025-11-02': 1,
    });
  });

  it('falls back to end_time when no start_time', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [makePlace('x', { end_time: '2025-11-01 18:00' })],
    };
    expect(buildDailyCounts(r)).toEqual({ '2025-11-01': 1 });
  });

  it('skips places with no parseable date', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [makePlace('no-date'), makePlace('bad', { start_time: 'garbage' })],
    };
    expect(buildDailyCounts(r)).toEqual({});
  });

  it('places with date-only start_time count toward that day', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [makePlace('x', { start_time: '2025-11-01' })],
    };
    expect(buildDailyCounts(r)).toEqual({ '2025-11-01': 1 });
  });
});
