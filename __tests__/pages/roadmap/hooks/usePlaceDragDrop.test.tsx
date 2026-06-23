import { renderHook, act } from '@testing-library/react';
import { usePlaceDragDrop } from '../../../../pages/roadmap/hooks/usePlaceDragDrop';
import { Roadmap, Place, RouteSegment } from '../../../../types/roadmap';
import { DEFAULT_SETTINGS } from '../../../../types';

// Record every from→to pair the recompute asks for, and return a fixed
// stub so we can assert which segments were recalculated and with which
// (correct) endpoints.
const calcCalls: string[] = [];
jest.mock('../../../../services/RouteCalculationService', () => ({
  __esModule: true,
  RouteCalculationService: class {
    constructor(_g?: string, _a?: string) {}
    async calculateRoute(from: any, to: any, mode: string) {
      calcCalls.push(`${from.name}->${to.name}`);
      return { distance: 999, duration: 99, tolls: 0, travelMode: mode };
    }
  },
}));

function makeRepoMock(reloaded: Roadmap) {
  return {
    updateRoadmapItems: jest.fn(async () => {}),
    loadRoadmap: jest.fn(async () => reloaded),
    savePlaceFile: jest.fn(async () => ({})),
  };
}

function place(name: string, lat: number, lng: number): Place {
  return { id: name, name, detail: { address: { latitude: lat, longitude: lng } } };
}

beforeEach(() => { calcCalls.length = 0; });

describe('usePlaceDragDrop.onDrop — segment recompute', () => {
  it('recomputes only the segments whose endpoints changed, with correct prev→next', async () => {
    // A —sAB→ B —sBC→ C —sCD→ D. Drag B to sit between C and D.
    const A = place('A', 1, 1);
    const B = place('B', 2, 2);
    const C = place('C', 3, 3);
    const D = place('D', 4, 4);
    const sAB: RouteSegment = { travelMode: 'drive', distance: 1, duration: 1, tolls: 0 };
    const sBC: RouteSegment = { travelMode: 'walk', distance: 2, duration: 2, tolls: 0 };
    const sCD: RouteSegment = { travelMode: 'transit', distance: 3, duration: 3, tolls: 0 };
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [A, sAB, B, sBC, C, sCD, D] };

    let captured: Array<Place | RouteSegment> | null = null;
    const repo = makeRepoMock({ ...data, items: [] });
    repo.updateRoadmapItems = jest.fn(async (_p, _n, _d, items: Array<Place | RouteSegment>) => { captured = items; });

    const onDataChanged = jest.fn();
    const { result } = renderHook(() => usePlaceDragDrop({
      data,
      filePath: 'LaC/Roadmap/R.md',
      repository: repo as any,
      settings: { ...DEFAULT_SETTINGS },
      groups: {},
      groupKeys: [],
      lastPlaceIndex: 6,
      tempDayKeys: [],
      setTempDayKeys: jest.fn(),
      visibleItemIndices: [0, 2, 4, 6],
      cardListRef: { current: null } as any,
      onDataChanged,
    }));

    act(() => { result.current.dragIndexRef.current = 2; });
    await act(async () => { await result.current.onDrop(4); });

    // Final order: A sAB C sCD B sBC D
    expect(captured).not.toBeNull();
    expect(captured!.map((it: any) => it.name ?? `seg:${it.travelMode}`))
      .toEqual(['A', 'seg:drive', 'C', 'seg:transit', 'B', 'seg:walk', 'D']);

    // All three segments now bridge new pairs → all recomputed with the
    // correct prev→next endpoints (not the buggy prev→self direction).
    expect(calcCalls.sort()).toEqual(['A->C', 'B->D', 'C->B'].sort());

    // sAB (now A→C) carries the stubbed recomputed value.
    expect(sAB.distance).toBe(999);
    expect(sAB.duration).toBe(99);
  });

  it('drops the dangling outgoing segment when a place is dragged to the end', async () => {
    // A —sAB→ B —sBC→ C. Drag B onto the last card (C): B + its outgoing sBC
    // travel together and land at the end, leaving sBC with no destination.
    // The trailing segment must be stripped, and sAB recomputed as A→C.
    const A = place('A', 1, 1);
    const B = place('B', 2, 2);
    const C = place('C', 3, 3);
    const sAB: RouteSegment = { travelMode: 'drive', distance: 1, duration: 1, tolls: 0 };
    const sBC: RouteSegment = { travelMode: 'walk', distance: 2, duration: 2, tolls: 0 };
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [A, sAB, B, sBC, C] };

    let captured: Array<Place | RouteSegment> | null = null;
    const repo = makeRepoMock({ ...data, items: [] });
    repo.updateRoadmapItems = jest.fn(async (_p, _n, _d, items: Array<Place | RouteSegment>) => { captured = items; });

    const { result } = renderHook(() => usePlaceDragDrop({
      data,
      filePath: 'LaC/Roadmap/R.md',
      repository: repo as any,
      settings: { ...DEFAULT_SETTINGS },
      groups: {},
      groupKeys: [],
      lastPlaceIndex: 4,
      tempDayKeys: [],
      setTempDayKeys: jest.fn(),
      visibleItemIndices: [0, 2, 4],
      cardListRef: { current: null } as any,
      onDataChanged: jest.fn(),
    }));

    act(() => { result.current.dragIndexRef.current = 2; });
    await act(async () => { await result.current.onDrop(4); });

    // No trailing segment — B sits last with no outgoing transit.
    expect(captured!.map((it: any) => it.name ?? `seg:${it.travelMode}`))
      .toEqual(['A', 'seg:drive', 'C', 'B']);
    // The surviving bridge sAB recomputed A→C.
    expect(calcCalls).toEqual(['A->C']);
    expect(sAB.distance).toBe(999);
  });

  it('skips recompute when adjacency is unchanged', async () => {
    // Two-place trip; dragging the first place onto the last just swaps the
    // order but the single segment still bridges the same two places (now
    // reversed) — so it WILL recompute. Use an unrelated extra place to keep
    // one segment's neighbors stable instead.
    const A = place('A', 1, 1);
    const B = place('B', 2, 2);
    const C = place('C', 3, 3);
    const sAB: RouteSegment = { travelMode: 'drive', distance: 1, duration: 1, tolls: 0 };
    const sBC: RouteSegment = { travelMode: 'walk', distance: 2, duration: 2, tolls: 0 };
    // A sAB B sBC C — drag nothing meaningful: move C to the very end (no-op
    // position) should not fire any recompute.
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [A, sAB, B, sBC, C] };
    const repo = makeRepoMock({ ...data, items: [] });
    const { result } = renderHook(() => usePlaceDragDrop({
      data,
      filePath: 'LaC/Roadmap/R.md',
      repository: repo as any,
      settings: { ...DEFAULT_SETTINGS },
      groups: {},
      groupKeys: [],
      lastPlaceIndex: 4,
      tempDayKeys: [],
      setTempDayKeys: jest.fn(),
      visibleItemIndices: [0, 2, 4],
      cardListRef: { current: null } as any,
      onDataChanged: jest.fn(),
    }));

    // from === to (drop C on itself) is an early return — no recompute.
    act(() => { result.current.dragIndexRef.current = 4; });
    await act(async () => { await result.current.onDrop(4); });
    expect(calcCalls).toEqual([]);
  });
});
