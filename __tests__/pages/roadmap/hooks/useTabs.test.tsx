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
function useTabsForRoadmap(data: Roadmap | null, tempDayKeys: string[] = []) {
  const { groups, groupKeys, lastPlaceIndex } = useRoadmapGroups(data);
  const tabs = useTabs({ data, groups, groupKeys, tempDayKeys });
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

  it('reorderTab moves a key in allKeysForTabs (session-only override)', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('a', { start_time: '2025-11-01' }),
        makePlace('b', { start_time: '2025-11-02' }),
        makePlace('c', { start_time: '2025-11-03' }),
      ],
    };
    const { result } = renderHook(() => useTabsForRoadmap(r));
    expect(result.current.tabs.allKeysForTabs).toEqual(['2025-11-01', '2025-11-02', '2025-11-03']);
    act(() => { result.current.tabs.reorderTab('2025-11-03', '2025-11-01'); });
    // Moved 2025-11-03 to the position of 2025-11-01 → expect it first.
    expect(result.current.tabs.allKeysForTabs[0]).toBe('2025-11-03');
  });

  it('reorderTab is a no-op when from === to', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [makePlace('a', { start_time: '2025-11-01' })],
    };
    const { result } = renderHook(() => useTabsForRoadmap(r));
    const before = result.current.tabs.allKeysForTabs.slice();
    act(() => { result.current.tabs.reorderTab('2025-11-01', '2025-11-01'); });
    expect(result.current.tabs.allKeysForTabs).toEqual(before);
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
