import { renderHook } from '@testing-library/react';
import { useRoadmapGroups } from '../../../../pages/roadmap/hooks/useRoadmapGroups';
import { Roadmap, Place, RouteSegment } from '../../../../types/roadmap';

function makePlace(name: string, detail: Place['detail'] = {}): Place {
  return { id: name, name, detail };
}
function makeRoute(travelMode: RouteSegment['travelMode']): RouteSegment {
  return { travelMode, distance: 0, duration: 0, tolls: 0 };
}

describe('useRoadmapGroups', () => {
  it('returns empty groups for null data', () => {
    const { result } = renderHook(() => useRoadmapGroups(null));
    expect(result.current.groups).toEqual({});
    expect(result.current.groupKeys).toEqual([]);
    expect(result.current.lastPlaceIndex).toBe(-1);
  });

  it('groups places by YYYY-MM-DD prefix of start_time', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a', { start_time: '2025-11-01 09:00' }),
        makePlace('b', { start_time: '2025-11-01 14:00' }),
        makePlace('c', { start_time: '2025-11-02 09:00' }),
      ],
    };
    const { result } = renderHook(() => useRoadmapGroups(r));
    expect(Object.keys(result.current.groups).sort()).toEqual(['2025-11-01', '2025-11-02']);
    expect(result.current.groups['2025-11-01'].length).toBe(2);
    expect(result.current.groups['2025-11-02'].length).toBe(1);
  });

  it('a wholly undated roadmap defaults to Day 1', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [makePlace('a'), makePlace('b'), makePlace('c')],
    };
    const { result } = renderHook(() => useRoadmapGroups(r));
    expect(Object.keys(result.current.groups)).toEqual(['第1天']);
    expect(result.current.groups['第1天'].length).toBe(3);
  });

  it('honors detail.days when present and start_time absent', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a', { days: 3 }),
        makePlace('b', { days: 5 }),
      ],
    };
    const { result } = renderHook(() => useRoadmapGroups(r));
    expect(Object.keys(result.current.groups).sort()).toEqual(['第3天', '第5天']);
  });

  it('attaches route segment to its preceding place in the group', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a', { start_time: '2025-11-01' }),
        makeRoute('walk'),
        makePlace('b', { start_time: '2025-11-01' }),
      ],
    };
    const { result } = renderHook(() => useRoadmapGroups(r));
    const group = result.current.groups['2025-11-01'];
    expect(group.length).toBe(3); // a, route, b
    expect('travelMode' in group[1]).toBe(true);
  });

  it('a dated roadmap treats every undated place as unplanned', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('p1', { days: 2 }),
        makePlace('p2', { start_time: '2025-11-02' }),
        makePlace('p3', { start_time: '2025-11-01' }),
      ],
    };
    const { result } = renderHook(() => useRoadmapGroups(r));
    expect(result.current.groupKeys).toEqual(['2025-11-01', '2025-11-02', '']);
  });

  it('lastPlaceIndex points to the highest index of any Place', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a', { start_time: '2025-11-01' }),
        makeRoute('walk'),
        makePlace('b', { start_time: '2025-11-01' }),
        makeRoute('drive'),
      ],
    };
    const { result } = renderHook(() => useRoadmapGroups(r));
    // Last Place is index 2 (route at 3 is trailing)
    expect(result.current.lastPlaceIndex).toBe(2);
  });

  it('lastPlaceIndex is -1 for empty items', () => {
    const r: Roadmap = { id: 'r', name: 'r', items: [] };
    const { result } = renderHook(() => useRoadmapGroups(r));
    expect(result.current.lastPlaceIndex).toBe(-1);
  });
});
