import { renderHook, act } from '@testing-library/react';
import { useTabs } from '../../../../pages/roadmap/hooks/useTabs';
import { useRoadmapGroups } from '../../../../pages/roadmap/hooks/useRoadmapGroups';
import { Roadmap, Place, RouteSegment } from '../../../../types/roadmap';

function makePlace(name: string, detail: Place['detail'] = {}): Place {
  return { id: name, name, detail };
}
function makeRoute(travelMode: RouteSegment['travelMode']): RouteSegment {
  return { travelMode, distance: 0, duration: 0, tolls: 0 };
}

/** Composite hook to mirror what the page does: groups → tabs. */
function useTabsForRoadmap(
  data: Roadmap | null,
  tempDayKeys: string[] = [],
  subEndpoints?: Record<string, { start?: any; end?: any }>,
) {
  const { groups, groupKeys, lastPlaceIndex } = useRoadmapGroups(data);
  const tabs = useTabs({ data, groups, groupKeys, tempDayKeys, subEndpoints });
  return { groups, groupKeys, lastPlaceIndex, tabs };
}

describe('useTabs', () => {
  it('initial state: no tabs selected; no override', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a', { start_time: '2025-11-01' }),
        makePlace('b', { start_time: '2025-11-02' }),
      ],
    };
    const { result } = renderHook(() => useTabsForRoadmap(r));
    expect(result.current.tabs.selectedTabs.size).toBe(0);
  });

  it('tabDefs emits one tab per day key + one "unplanned" tab at the end', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a', { start_time: '2025-11-01' }),
        makePlace('b', { start_time: '2025-11-02' }),
      ],
    };
    const { result } = renderHook(() => useTabsForRoadmap(r));
    const defs = result.current.tabs.tabDefs;
    expect(defs.length).toBe(3);
    expect(defs.map(d => d.id)).toEqual(['day-1', 'day-2', 'unplanned']);
    expect(defs[2].id).toBe('unplanned');
  });

  it('tabDefs labels date keys as the key itself, "第N天" gets reformatted to "第i天" by tab index', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a', { start_time: '2025-11-01' }),
        makePlace('b', { days: 2 }),
      ],
    };
    const { result } = renderHook(() => useTabsForRoadmap(r));
    const defs = result.current.tabs.tabDefs;
    expect(defs[0].label).toBe('2025-11-01');
    // "第2天" key gets renumbered to "第2天" since it's the 2nd tab.
    expect(defs[1].label).toBe('第2天');
  });

  it('onToggleTab adds and removes selection', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [makePlace('a', { start_time: '2025-11-01' })],
    };
    const { result } = renderHook(() => useTabsForRoadmap(r));
    act(() => { result.current.tabs.onToggleTab('day-1'); });
    expect(result.current.tabs.selectedTabs.has('day-1')).toBe(true);
    act(() => { result.current.tabs.onToggleTab('day-1'); });
    expect(result.current.tabs.selectedTabs.has('day-1')).toBe(false);
  });

  it('filteredKeys: empty selection → all keys; partial selection → only those', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a', { start_time: '2025-11-01' }),
        makePlace('b', { start_time: '2025-11-02' }),
      ],
    };
    const { result } = renderHook(() => useTabsForRoadmap(r));
    expect(result.current.tabs.filteredKeys).toEqual(['2025-11-01', '2025-11-02']);
    act(() => { result.current.tabs.onToggleTab('day-1'); });
    expect(result.current.tabs.filteredKeys).toEqual(['2025-11-01']);
  });

  it('filteredKeys: all-selected acts identically to none-selected', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a', { start_time: '2025-11-01' }),
        makePlace('b', { start_time: '2025-11-02' }),
      ],
    };
    const { result } = renderHook(() => useTabsForRoadmap(r));
    act(() => {
      result.current.tabs.onToggleTab('day-1');
      result.current.tabs.onToggleTab('day-2');
    });
    expect(result.current.tabs.filteredKeys).toEqual(['2025-11-01', '2025-11-02']);
  });

  it('selecting "unplanned" selects only the wishlist bucket (empty key); explicit 第N天 keeps its own tab', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a', { start_time: '2025-11-01' }),
        makePlace('b'), // wishlist: no start_time, no days
      ],
    };
    const { result } = renderHook(() => useTabsForRoadmap(r));
    act(() => { result.current.tabs.onToggleTab('unplanned'); });
    expect(result.current.tabs.filteredKeys).toEqual(['']);
  });

  it('visibleItemIndices: returns items only from filtered day groups', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a', { start_time: '2025-11-01 09:00' }),
        makePlace('b', { start_time: '2025-11-02 09:00' }),
        makePlace('c', { start_time: '2025-11-01 14:00' }),
      ],
    };
    const { result } = renderHook(() => useTabsForRoadmap(r));
    act(() => { result.current.tabs.onToggleTab('day-1'); });
    // day-1 = 2025-11-01 → items 0 and 2
    expect(result.current.tabs.visibleItemIndices).toEqual([0, 2]);
  });

  it('mapLocations: in-group route segments propagate as travelModeToNext on the preceding place', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a', { start_time: '2025-11-01', address: { name: 'A', longitude: 1, latitude: 2 } }),
        makeRoute('walk'),
        makePlace('b', { start_time: '2025-11-01', address: { name: 'B', longitude: 3, latitude: 4 } }),
      ],
    };
    const { result } = renderHook(() => useTabsForRoadmap(r));
    const locs = result.current.tabs.mapLocations;
    expect(locs.length).toBe(2);
    expect(locs[0].travelModeToNext).toBe('walk');
    expect(locs[1].travelModeToNext).toBeUndefined();
  });

  it('seeds a date tab from the planned date when no place is dated yet', () => {
    // A sub-roadmap planned for a date but with only undated (or no) places
    // should still surface a date tab so adding a place defaults to that day
    // instead of dropping into the wishlist.
    const r: Roadmap = {
      id: 'r', name: 'r',
      detail: { start_time: '2025-12-24' },
      items: [makePlace('a')], // undated → wishlist
    };
    const { result } = renderHook(() => useTabsForRoadmap(r));
    expect(result.current.tabs.allKeysForTabs).toContain('2025-12-24');
    const dayDef = result.current.tabs.tabDefs.find(d => d.key === '2025-12-24');
    expect(dayDef).toBeDefined();
  });

  it('does not seed a planned date tab once a real dated place exists', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      detail: { start_time: '2025-12-24' },
      items: [makePlace('a', { start_time: '2025-11-01' })],
    };
    const { result } = renderHook(() => useTabsForRoadmap(r));
    expect(result.current.tabs.allKeysForTabs).not.toContain('2025-12-24');
    expect(result.current.tabs.allKeysForTabs).toContain('2025-11-01');
  });

  it('remembers tab selection per roadmap across navigation (same hook instance)', () => {
    // RoadmapView reuses the React instance across parent→sub navigation. A
    // stale parent selection must not carry into the sub (it would hide the
    // sub's places), but the parent's filter must be restored on return so the
    // user doesn't have to re-filter every time.
    const parent: Roadmap = {
      id: 'parent', name: 'parent',
      items: [makePlace('a', { start_time: '2025-11-01' })],
    };
    const sub: Roadmap = {
      id: 'sub', name: 'sub',
      items: [makePlace('b')],
    };
    const { result, rerender } = renderHook(({ data }) => useTabsForRoadmap(data), {
      initialProps: { data: parent as Roadmap },
    });
    act(() => { result.current.tabs.onToggleTab('day-1'); });
    expect(result.current.tabs.selectedTabs.has('day-1')).toBe(true);
    // → sub: starts fresh (no carry-over)
    rerender({ data: sub });
    expect(result.current.tabs.selectedTabs.size).toBe(0);
    // ← back to parent: filter restored
    rerender({ data: parent });
    expect(result.current.tabs.selectedTabs.has('day-1')).toBe(true);
  });

  it('mapLocations: a sub-roadmap contributes start + end markers sharing the card number', () => {
    // A sub-roadmap entry has no coords of its own; its position comes from
    // subEndpoints. The map should plot BOTH endpoints with the SAME label as
    // the card, so map numbers line up with the list (no off-by-one drift).
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('A', { start_time: '2025-11-01', address: { name: 'A', longitude: 1, latitude: 1 } }),
        makePlace('Sub', { start_time: '2025-11-01' }), // sub-roadmap: no own coords
        makePlace('B', { start_time: '2025-11-01', address: { name: 'B', longitude: 5, latitude: 5 } }),
      ],
    };
    const subEndpoints = { Sub: { start: { name: 's', longitude: 2, latitude: 2 }, end: { name: 'e', longitude: 3, latitude: 3 } } };
    const { result } = renderHook(() => useTabsForRoadmap(r, [], subEndpoints));
    const locs = result.current.tabs.mapLocations;
    // A(1), Sub-start(2), Sub-end(2), B(3)
    expect(locs.map(l => l.label)).toEqual([1, 2, 2, 3]);
    expect(locs.map(l => [l.lng, l.lat])).toEqual([[1, 1], [2, 2], [3, 3], [5, 5]]);
  });

  it('mapLocations: a coordless place still occupies its number (map skips it, numbering stays aligned)', () => {
    // Card numbers count every place; the map only draws geocoded ones. A
    // coordless place must still consume its number so later markers line up
    // with the list (e.g. markers show 1,2,4 — never 1,2,3 — when #3 has no
    // coords).
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('A', { start_time: '2025-11-01', address: { name: 'A', longitude: 1, latitude: 1 } }),
        makePlace('B', { start_time: '2025-11-01' }), // dated, NO coords
        makePlace('C', { start_time: '2025-11-01', address: { name: 'C', longitude: 3, latitude: 3 } }),
      ],
    };
    const { result } = renderHook(() => useTabsForRoadmap(r));
    const locs = result.current.tabs.mapLocations;
    expect(locs.map(l => l.label)).toEqual([1, 3]); // B(2) reserved but not drawn
    expect(locs.map(l => l.title)).toEqual(['A', 'C']);
  });

  it('tempDayKeys merge into allKeysForTabs', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [makePlace('a', { start_time: '2025-11-01' })],
    };
    const { result } = renderHook(() => useTabsForRoadmap(r, ['第3天']));
    expect(result.current.tabs.allKeysForTabs).toContain('第3天');
    const tempDef = result.current.tabs.tabDefs.find(t => t.isTemp);
    expect(tempDef).toBeDefined();
    expect(tempDef!.key).toBe('第3天');
  });
});
