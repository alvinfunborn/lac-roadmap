import { computeRoadmapStats } from '../../components/RoadmapStats';
import { Roadmap, Place, RouteSegment } from '../../types/roadmap';

function makePlace(name: string, detail: Place['detail'] = {}): Place {
  return { id: name, name, detail };
}
function makeRoute(travelMode: RouteSegment['travelMode'], distance = 0, duration = 0, tolls = 0): RouteSegment {
  return { travelMode, distance, duration, tolls };
}

describe('computeRoadmapStats', () => {
  it('returns zeroes for null roadmap', () => {
    const s = computeRoadmapStats(null);
    expect(s).toEqual({
      days: 0,
      placeCount: 0,
      distanceText: '0 m',
      durationText: '0 min',
      tollsText: '0',
    });
  });

  it('counts places and ignores route segments in placeCount', () => {
    const r: Roadmap = { id: 'r', name: 'r', items: [makePlace('a'), makeRoute('walk'), makePlace('b')] };
    expect(computeRoadmapStats(r).placeCount).toBe(2);
  });

  it('totals distance / duration / tolls across all route segments', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a'),
        makeRoute('drive', 1200, 5, 10),
        makePlace('b'),
        makeRoute('walk', 800, 12, 0),
        makePlace('c'),
      ],
    };
    const s = computeRoadmapStats(r);
    expect(s.distanceText).toBe('2.0 km');
    expect(s.durationText).toBe('17m');
    expect(s.tollsText).toBe('¥10');
  });

  it('formats sub-km distance as meters', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [makePlace('a'), makeRoute('walk', 350), makePlace('b')],
    };
    expect(computeRoadmapStats(r).distanceText).toBe('350 m');
  });

  it('formats >=10 km without decimals', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [makePlace('a'), makeRoute('drive', 12700), makePlace('b')],
    };
    expect(computeRoadmapStats(r).distanceText).toBe('13 km');
  });

  it('formats hours-and-minutes for >= 60 min', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [makePlace('a'), makeRoute('drive', 0, 130), makePlace('b')],
    };
    expect(computeRoadmapStats(r).durationText).toBe('2h 10m');
  });

  it('"days" comes from start_time/end_time range when present', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      detail: { start_time: '2025-11-01', end_time: '2025-11-03' },
      items: [],
    };
    expect(computeRoadmapStats(r).days).toBe(3);
  });

  it('"days" same start/end is 1', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      detail: { start_time: '2025-11-01', end_time: '2025-11-01' },
      items: [],
    };
    expect(computeRoadmapStats(r).days).toBe(1);
  });

  it('"days" falls back to distinct day groups when no date range', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a', { start_time: '2025-11-01 09:00' }),
        makePlace('b', { start_time: '2025-11-01 12:00' }),
        makePlace('c', { start_time: '2025-11-02 09:00' }),
      ],
    };
    expect(computeRoadmapStats(r).days).toBe(2);
  });
});
