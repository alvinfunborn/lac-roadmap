import { renderHook, act } from '@testing-library/react';
import { usePlaceMutations } from '../../../../pages/roadmap/hooks/usePlaceMutations';
import { Roadmap, Place, RouteSegment } from '../../../../types/roadmap';
import { DEFAULT_SETTINGS } from '../../../../types';
import { createApp, TFile, Notice } from '../../../__mocks__/obsidian';

// ConfirmModal is constructed with `new` inside deletePlace — its `.open()`
// resolves to boolean. We replace the whole module so each test can wire its
// own confirmation outcome via `__setConfirm(value)`.
jest.mock('../../../../components/modals/ConfirmModal', () => {
  let next = true;
  class ConfirmModalMock {
    constructor(public message: string, public confirmText?: string, public cancelText?: string, public danger?: boolean) {}
    open(): Promise<boolean> { return Promise.resolve(next); }
  }
  return {
    __esModule: true,
    default: ConfirmModalMock,
    __setConfirm(v: boolean) { next = v; },
  };
});

// RouteCalculationService.calculateRoute is async and called from
// autoInsertRoutesAroundNewPlace. Stub it so the test controls the result
// without making any HTTP-like calls.
jest.mock('../../../../services/RouteCalculationService', () => {
  let next: any = null;
  return {
    __esModule: true,
    RouteCalculationService: class {
      constructor(_g?: string, _a?: string) {}
      async calculateRoute(_from: any, _to: any, mode: string) {
        if (!next) return null;
        return { ...next, travelMode: next.travelMode || mode };
      }
    },
    __setRouteResult(v: any) { next = v; },
  };
});

// Helpers to access the per-test setters above.
const confirmMock = require('../../../../components/modals/ConfirmModal');
const routeMock = require('../../../../services/RouteCalculationService');

function makeRepoMock(initialData: Roadmap | null = null) {
  return {
    findRoadmapsReferencingPlace: jest.fn(async () => [] as string[]),
    savePlaceFile: jest.fn(async () => new TFile('LaC/Roadmap/X.md')),
    updateRoadmapItems: jest.fn(async () => {}),
    updatePlaceScheduleInRoadmap: jest.fn(async () => {}),
    loadRoadmap: jest.fn(async () => initialData),
    saveSubRoadmapFile: jest.fn(async () => new TFile('LaC/Roadmap/Sub.md')),
    updatePlaceGeneric: jest.fn(async () => {}),
  };
}

function makeHookParams(overrides: Partial<Parameters<typeof usePlaceMutations>[0]> = {}) {
  const app = createApp();
  const data: Roadmap = {
    id: 'R', name: 'R',
    detail: {},
    items: [],
  };
  const setData = jest.fn();
  const setSubRouteMap = jest.fn();
  return {
    app: app as any,
    repository: makeRepoMock(data) as any,
    settings: { ...DEFAULT_SETTINGS },
    filePath: 'LaC/Roadmap/R.md',
    data,
    setData,
    filteredKeys: [] as string[],
    selectedTabs: new Set<string>(),
    subRouteMap: {} as Record<string, string>,
    setSubRouteMap: setSubRouteMap as any,
    ...overrides,
  };
}

beforeEach(() => {
  Notice.reset();
  routeMock.__setRouteResult(null);
  confirmMock.__setConfirm(true);
});

describe('usePlaceMutations.addPlaceFromList', () => {
  it('opens editor with empty initial when "unplanned" tab is selected', () => {
    const params = makeHookParams({ selectedTabs: new Set(['unplanned']) });
    const { result } = renderHook(() => usePlaceMutations(params));
    act(() => { result.current.addPlaceFromList(); });
    expect(result.current.editorVisible).toBe(true);
    expect(result.current.editInitial).toBeUndefined();
  });

  it('opens editor with empty initial when no date keys are filtered', () => {
    const params = makeHookParams({ filteredKeys: ['第3天'] });
    const { result } = renderHook(() => usePlaceMutations(params));
    act(() => { result.current.addPlaceFromList(); });
    expect(result.current.editorVisible).toBe(true);
    expect(result.current.editInitial).toBeUndefined();
  });

  it('prefills start_time with the latest visible date key', () => {
    const params = makeHookParams({ filteredKeys: ['2025-11-01', '2025-11-03', '2025-11-02'] });
    const { result } = renderHook(() => usePlaceMutations(params));
    act(() => { result.current.addPlaceFromList(); });
    expect(result.current.editInitial?.start_time).toBe('2025-11-03');
  });

  it('falls back to the trip planned date when no date key is visible', () => {
    // A planned (sub-)roadmap with no dated places should default new places
    // to its own planned date rather than the wishlist.
    const data: Roadmap = { id: 'R', name: 'R', detail: { start_time: '2025-12-24' }, items: [] };
    const params = makeHookParams({ data, filteredKeys: ['第3天'] });
    const { result } = renderHook(() => usePlaceMutations(params));
    act(() => { result.current.addPlaceFromList(); });
    expect(result.current.editInitial?.start_time).toBe('2025-12-24');
  });
});

describe('usePlaceMutations.editPlace', () => {
  it('seeds the editor with the place fields', () => {
    const params = makeHookParams();
    const { result } = renderHook(() => usePlaceMutations(params));
    const p: Place = {
      id: 'X', name: 'X',
      detail: { start_time: '2025-11-01 09:00', description: 'd' },
    };
    act(() => { result.current.editPlace(p); });
    expect(result.current.editorVisible).toBe(true);
    expect(result.current.editInitial?.name).toBe('X');
    expect(result.current.editInitial?.start_time).toBe('2025-11-01 09:00');
  });
});

describe('usePlaceMutations.deletePlace', () => {
  it('removes the place + its trailing route segment, then reloads data', async () => {
    const p: Place = { id: 'X', name: 'X', detail: {} };
    const route: RouteSegment = { travelMode: 'walk', distance: 100, duration: 5, tolls: 0 };
    const other: Place = { id: 'Y', name: 'Y', detail: {} };
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [p, route, other] };
    const reloaded: Roadmap = { ...data, items: [other] };
    const repo = makeRepoMock(reloaded);
    const params = makeHookParams({ data, repository: repo as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    await act(async () => { await result.current.deletePlace(p); });

    expect(repo.updateRoadmapItems).toHaveBeenCalledTimes(1);
    const itemsArg = repo.updateRoadmapItems.mock.calls[0][3];
    expect(itemsArg).toEqual([other]);
    expect(repo.loadRoadmap).toHaveBeenCalledWith('LaC/Roadmap/R.md');
    expect(params.setData).toHaveBeenCalledWith(reloaded);
  });

  it('recomputes the bridging segment when a middle place is deleted', async () => {
    // A —segAB→ B —segBC→ C. Deleting B must drop segBC (B's outgoing) and
    // recompute segAB so it now represents A→C, not the stale A→B distance.
    const a: Place = { id: 'A', name: 'A', detail: { address: { latitude: 1, longitude: 1 } } };
    const segAB: RouteSegment = { travelMode: 'drive', distance: 100, duration: 5, tolls: 0 };
    const b: Place = { id: 'B', name: 'B', detail: { address: { latitude: 2, longitude: 2 } } };
    const segBC: RouteSegment = { travelMode: 'walk', distance: 200, duration: 9, tolls: 0 };
    const c: Place = { id: 'C', name: 'C', detail: { address: { latitude: 3, longitude: 3 } } };
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [a, segAB, b, segBC, c] };
    const repo = makeRepoMock(data);
    const params = makeHookParams({ data, repository: repo as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    // Stub the A→C recompute result (travelMode preserved from segAB = drive).
    routeMock.__setRouteResult({ distance: 555, duration: 33, tolls: 0 });

    await act(async () => { await result.current.deletePlace(b, 2); });

    const items = repo.updateRoadmapItems.mock.calls[0][3] as Array<Place | RouteSegment>;
    expect(items.map((it: any) => it.name ?? `seg:${it.travelMode}`))
      .toEqual(['A', 'seg:drive', 'C']);
    const bridge = items[1] as RouteSegment;
    expect(bridge.travelMode).toBe('drive');
    expect(bridge.distance).toBe(555);
    expect(bridge.duration).toBe(33);
  });

  it('drops the leading segment (no dangling) when the last place is deleted', async () => {
    // A —segAB→ B. Deleting B (last) must drop segAB too, leaving just [A].
    const a: Place = { id: 'A', name: 'A', detail: { address: { latitude: 1, longitude: 1 } } };
    const segAB: RouteSegment = { travelMode: 'drive', distance: 100, duration: 5, tolls: 0 };
    const b: Place = { id: 'B', name: 'B', detail: { address: { latitude: 2, longitude: 2 } } };
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [a, segAB, b] };
    const repo = makeRepoMock(data);
    const params = makeHookParams({ data, repository: repo as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    await act(async () => { await result.current.deletePlace(b, 2); });

    const items = repo.updateRoadmapItems.mock.calls[0][3] as Array<Place | RouteSegment>;
    expect(items.map((it: any) => it.name ?? `seg:${it.travelMode}`)).toEqual(['A']);
  });

  it('is a no-op when the user cancels the confirm modal', async () => {
    confirmMock.__setConfirm(false);
    const p: Place = { id: 'X', name: 'X', detail: {} };
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [p] };
    const repo = makeRepoMock(data);
    const params = makeHookParams({ data, repository: repo as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    await act(async () => { await result.current.deletePlace(p); });
    expect(repo.updateRoadmapItems).not.toHaveBeenCalled();
  });
});

describe('usePlaceMutations.onSavePlace (create branch)', () => {
  it('saves a new place + reloads when not in edit mode', async () => {
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [] };
    const repo = makeRepoMock({ ...data, items: [{ id: 'New', name: 'New', detail: {} } as Place] });
    const params = makeHookParams({ data, repository: repo as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    await act(async () => {
      await result.current.onSavePlace({ name: 'New', start_time: '2025-11-01 09:00', description: 'd' });
    });

    expect(repo.savePlaceFile).toHaveBeenCalled();
    // Schedule lives inline on the place block — see updateRoadmapItems.
    // Old code path used a separate updatePlaceScheduleInRoadmap call which
    // could not disambiguate duplicate [[name]] entries; UI path no longer
    // uses it.
    const items = repo.updateRoadmapItems.mock.calls[0][3] as Place[];
    expect(items[0].name).toBe('New');
    expect(items[0].detail.start_time).toBe('2025-11-01 09:00');
    expect(repo.updatePlaceScheduleInRoadmap).not.toHaveBeenCalled();
    expect(params.setData).toHaveBeenCalled();
  });

  it('inserts the new place sorted by start_time among existing placed entries', async () => {
    const a: Place = { id: 'A', name: 'A', detail: { start_time: '2025-11-01 09:00' } };
    const c: Place = { id: 'C', name: 'C', detail: { start_time: '2025-11-01 15:00' } };
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [a, c] };
    const repo = makeRepoMock(data);
    const params = makeHookParams({ data, repository: repo as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    await act(async () => {
      await result.current.onSavePlace({ name: 'B', start_time: '2025-11-01 12:00' });
    });

    const items = repo.updateRoadmapItems.mock.calls[0][3] as Place[];
    expect(items.map(p => p.name)).toEqual(['A', 'B', 'C']);
  });
});

describe('usePlaceMutations.onSavePlace (edit branch)', () => {
  it('replaces the original place in-place when name unchanged', async () => {
    const old: Place = { id: 'X', name: 'X', detail: { description: 'old' } };
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [old] };
    const repo = makeRepoMock(data);
    const app = createApp();
    // Seed metadataCache so getFirstLinkpathDest finds the place file
    app.vault.files.set('LaC/Roadmap/X.md', { file: new TFile('LaC/Roadmap/X.md'), content: 'name = "X"\n' });
    const params = makeHookParams({ data, repository: repo as any, app: app as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    // Enter edit mode by seeding editInitial first
    act(() => { result.current.editPlace(old, 0); });
    await act(async () => {
      await result.current.onSavePlace({ name: 'X', description: 'new' });
    });

    expect(repo.updatePlaceGeneric).toHaveBeenCalledWith(
      'LaC/Roadmap/X.md',
      expect.objectContaining({ name: 'X', description: 'new' }),
    );
    // updateRoadmapItems should be called with old position preserved
    const items = repo.updateRoadmapItems.mock.calls[0][3] as Place[];
    expect(items[0].name).toBe('X');
    expect(items[0].detail.description).toBe('new');
  });

  it('targets the exact occurrence (by itemIndex) when the same place appears twice', async () => {
    // Reproduces the 天山北 / 赛里木湖 bug: edit the second occurrence
    // (initially wishlist) and assign it a date. Must NOT touch the first
    // occurrence's existing date.
    const first: Place = { id: 'Sai', name: 'Sai', detail: { start_time: '2026-06-10' } };
    const second: Place = { id: 'Sai', name: 'Sai', detail: {} };
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [first, second] };
    const repo = makeRepoMock(data);
    const app = createApp();
    app.vault.files.set('LaC/Roadmap/Sai.md', { file: new TFile('LaC/Roadmap/Sai.md'), content: 'name = "Sai"\n' });
    const params = makeHookParams({ data, repository: repo as any, app: app as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    // Edit the SECOND occurrence (index 1)
    act(() => { result.current.editPlace(second, 1); });
    await act(async () => {
      await result.current.onSavePlace({ name: 'Sai', start_time: '2026-06-11' });
    });

    const items = repo.updateRoadmapItems.mock.calls[0][3] as Place[];
    expect(items.length).toBe(2);
    // First occurrence keeps its original date untouched
    expect(items[0].detail.start_time).toBe('2026-06-10');
    // Second occurrence — the one being edited — gets the new date
    expect(items[1].detail.start_time).toBe('2026-06-11');
    expect(repo.updatePlaceScheduleInRoadmap).not.toHaveBeenCalled();
  });
});

describe('usePlaceMutations.deletePlace by index', () => {
  it('deletes only the matching occurrence when itemIndex is provided', async () => {
    const first: Place = { id: 'Sai', name: 'Sai', detail: { start_time: '2026-06-10' } };
    const second: Place = { id: 'Sai', name: 'Sai', detail: {} };
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [first, second] };
    const repo = makeRepoMock(data);
    const params = makeHookParams({ data, repository: repo as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    await act(async () => { await result.current.deletePlace(second, 1); });
    const itemsArg = repo.updateRoadmapItems.mock.calls[0][3] as Place[];
    expect(itemsArg.length).toBe(1);
    expect(itemsArg[0].detail.start_time).toBe('2026-06-10');
  });
});

describe('usePlaceMutations.onSavePlace (auto-insert routes)', () => {
  it('inserts a route segment after the new place when prev place has coords and calculation succeeds', async () => {
    const prev: Place = {
      id: 'P', name: 'P',
      detail: { address: { name: 'P', longitude: 116.39, latitude: 39.91 } },
    };
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [prev] };
    const repo = makeRepoMock(data);
    routeMock.__setRouteResult({ distance: 1234, duration: 8, travelMode: 'drive', tolls: 5 });
    const params = makeHookParams({ data, repository: repo as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    await act(async () => {
      await result.current.onSavePlace({
        name: 'N',
        description: '',
        address: { name: 'N', longitude: 116.40, latitude: 39.92 },
      });
    });

    const items = repo.updateRoadmapItems.mock.calls[0][3] as Array<Place | RouteSegment>;
    // Expected order: [P, route, N]
    expect(items.length).toBe(3);
    expect((items[0] as Place).name).toBe('P');
    expect('travelMode' in items[1]).toBe(true);
    expect((items[1] as RouteSegment).travelMode).toBe('drive');
    expect((items[2] as Place).name).toBe('N');
  });
});

describe('usePlaceMutations.onCreateSubRoadmap', () => {
  it('writes a sub-roadmap file, appends [[name]] to the parent, and updates subRouteMap', async () => {
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [] };
    const repo = makeRepoMock({ ...data, items: [{ id: 'Sub', name: 'Sub', detail: {} } as Place] });
    const params = makeHookParams({ data, repository: repo as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    await act(async () => {
      await result.current.onCreateSubRoadmap({ name: 'Sub', detail: { description: 'd' } });
    });

    expect(repo.saveSubRoadmapFile).toHaveBeenCalledWith('LaC/Roadmap', 'Sub', expect.objectContaining({ description: 'd' }));
    const items = repo.updateRoadmapItems.mock.calls[0][3] as Place[];
    expect(items[items.length - 1].name).toBe('Sub');
    expect(params.setSubRouteMap).toHaveBeenCalled();
    expect(Notice.recent.some(m => m.includes('Sub'))).toBe(true);
  });

  it('inherits the parent map_provider when the payload has none', async () => {
    const data: Roadmap = { id: 'R', name: 'R', detail: { map_provider: 'gaode' }, items: [] };
    const repo = makeRepoMock({ ...data, items: [{ id: 'Sub', name: 'Sub', detail: {} } as Place] });
    const params = makeHookParams({ data, repository: repo as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    await act(async () => {
      await result.current.onCreateSubRoadmap({ name: 'Sub', detail: { description: 'd' } });
    });

    expect(repo.saveSubRoadmapFile).toHaveBeenCalledWith(
      'LaC/Roadmap', 'Sub', expect.objectContaining({ description: 'd', map_provider: 'gaode' }),
    );
  });

  it('keeps an explicitly chosen map_provider over the parent default', async () => {
    const data: Roadmap = { id: 'R', name: 'R', detail: { map_provider: 'gaode' }, items: [] };
    const repo = makeRepoMock({ ...data, items: [{ id: 'Sub', name: 'Sub', detail: {} } as Place] });
    const params = makeHookParams({ data, repository: repo as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    await act(async () => {
      await result.current.onCreateSubRoadmap({ name: 'Sub', detail: { map_provider: 'google' } });
    });

    expect(repo.saveSubRoadmapFile).toHaveBeenCalledWith(
      'LaC/Roadmap', 'Sub', expect.objectContaining({ map_provider: 'google' }),
    );
  });

  it('rejects an empty name with a Notice and does not write', async () => {
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [] };
    const repo = makeRepoMock();
    const params = makeHookParams({ data, repository: repo as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    await act(async () => {
      await result.current.onCreateSubRoadmap({ name: '   ', detail: {} });
    });
    expect(repo.saveSubRoadmapFile).not.toHaveBeenCalled();
    expect(Notice.recent.some(m => m.includes('不能为空'))).toBe(true);
  });

  it('rejects duplicate name with a Notice', async () => {
    const existing: Place = { id: 'Dup', name: 'Dup', detail: {} };
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [existing] };
    const repo = makeRepoMock(data);
    const params = makeHookParams({ data, repository: repo as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    await act(async () => {
      await result.current.onCreateSubRoadmap({ name: 'Dup', detail: {} });
    });
    expect(repo.saveSubRoadmapFile).not.toHaveBeenCalled();
    expect(Notice.recent.some(m => m.includes('已有同名'))).toBe(true);
  });
});

describe('usePlaceMutations — parent route sync on sub-roadmap endpoint change', () => {
  const addr = (name: string, lng: number, lat: number) => ({ name, longitude: lng, latitude: lat });

  it('recomputes the referencing parent\'s in/out segments when the sub endpoint changes', async () => {
    routeMock.__setRouteResult({ distance: 999, duration: 9, tolls: 0, travelMode: 'drive' });
    // Sub before: one place; after save: a second place is appended → endPoint moves.
    const subOld: Roadmap = {
      id: 'Sub', name: 'Sub', detail: {},
      items: [{ id: 'p1', name: 'p1', detail: { address: addr('p1', 1, 1) } }],
      startPoint: addr('p1', 1, 1), endPoint: addr('p1', 1, 1),
    };
    const subNew: Roadmap = {
      ...subOld,
      items: [...subOld.items, { id: 'p2', name: 'p2', detail: { address: addr('p2', 2, 2) } }],
      endPoint: addr('p2', 2, 2),
    };
    const parent: Roadmap = {
      id: 'Parent', name: 'Parent', detail: {},
      items: [
        { id: 'A', name: 'A', detail: { address: addr('A', 0, 0) } },
        { travelMode: 'drive', distance: 1, duration: 1, tolls: 0 } as RouteSegment,
        { id: 'Sub', name: 'Sub', detail: {} },
        { travelMode: 'drive', distance: 1, duration: 1, tolls: 0 } as RouteSegment,
        { id: 'B', name: 'B', detail: { address: addr('B', 3, 3) } },
      ],
    };
    const updateRoadmapItems = jest.fn(async () => {});
    const repo = {
      findRoadmapsReferencingPlace: jest.fn(async () => ['LaC/Roadmap/Parent.md']),
      savePlaceFile: jest.fn(async () => new TFile('LaC/Roadmap/p2.md')),
      updateRoadmapItems,
      updatePlaceScheduleInRoadmap: jest.fn(async () => {}),
      isSubRoadmapEntry: jest.fn(async () => true),
      loadRoadmap: jest.fn(async (p: string) => (p === 'LaC/Roadmap/Parent.md' ? parent : subNew)),
      saveSubRoadmapFile: jest.fn(),
      updatePlaceGeneric: jest.fn(async () => {}),
    };
    const params = makeHookParams({ data: subOld, repository: repo as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    await act(async () => {
      await result.current.onSavePlace({ name: 'p2', address: addr('p2', 2, 2) as any });
    });

    const parentCall = updateRoadmapItems.mock.calls.find(c => c[0] === 'LaC/Roadmap/Parent.md');
    expect(parentCall).toBeDefined();
    const items = parentCall![3] as Array<RouteSegment>;
    // incoming (idx 1) and outgoing (idx 3) segments recomputed to the stubbed value
    expect(items[1].distance).toBe(999);
    expect(items[3].distance).toBe(999);
  });

  it('does not touch parents when the endpoints are unchanged', async () => {
    routeMock.__setRouteResult({ distance: 999, duration: 9, tolls: 0, travelMode: 'drive' });
    const sub: Roadmap = {
      id: 'Sub', name: 'Sub', detail: {},
      items: [{ id: 'p1', name: 'p1', detail: { address: addr('p1', 1, 1) } }],
      startPoint: addr('p1', 1, 1), endPoint: addr('p1', 1, 1),
    };
    const findRoadmapsReferencingPlace = jest.fn(async () => ['LaC/Roadmap/Parent.md']);
    const repo = {
      findRoadmapsReferencingPlace,
      savePlaceFile: jest.fn(async () => new TFile('LaC/Roadmap/p1.md')),
      updateRoadmapItems: jest.fn(async () => {}),
      updatePlaceScheduleInRoadmap: jest.fn(async () => {}),
      isSubRoadmapEntry: jest.fn(async () => true),
      // reload returns the same endpoints → no change → no parent scan
      loadRoadmap: jest.fn(async () => sub),
      saveSubRoadmapFile: jest.fn(),
      updatePlaceGeneric: jest.fn(async () => {}),
    };
    const params = makeHookParams({ data: sub, repository: repo as any });
    const { result } = renderHook(() => usePlaceMutations(params));

    await act(async () => {
      await result.current.onSavePlace({ name: 'p1', address: addr('p1', 1, 1) as any });
    });

    expect(findRoadmapsReferencingPlace).not.toHaveBeenCalled();
  });
});


describe('first place date anchors relative days', () => {
  it('writes dates to every occurrence when editing Day 3 and keeps ordinary Day-N edits', async () => {
    const a: Place = { id: 'A', name: 'A', detail: { days: 1 } };
    const b: Place = { id: 'B', name: 'B', detail: { days: 3 } };
    const data: Roadmap = { id: 'R', name: 'R', detail: {}, items: [a, b] };
    const repo = makeRepoMock(data);
    const { result } = renderHook(() => usePlaceMutations(makeHookParams({ data, repository: repo as any })));
    act(() => result.current.editPlace(b, 1));
    await act(async () => { await result.current.onSavePlace({ name: 'B', description: 'note' }); });
    expect(repo.updateRoadmapItems.mock.calls[0][3][1].detail.days).toBe(3);
    act(() => result.current.editPlace(b, 1));
    await act(async () => { await result.current.onSavePlace({ name: 'B', start_time: '2026-10-03' }); });
    expect(repo.updateRoadmapItems.mock.calls[1][3].map((p: Place) => p.detail.start_time)).toEqual(['2026-10-01', '2026-10-03']);
  });
});
