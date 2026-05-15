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
      await result.current.onSavePlace({ name: 'New', description: 'd' });
    });

    expect(repo.savePlaceFile).toHaveBeenCalled();
    expect(repo.updateRoadmapItems).toHaveBeenCalled();
    // alwaysSeparatePlaceSchedule defaults to true -> schedule write happens
    expect(repo.updatePlaceScheduleInRoadmap).toHaveBeenCalledWith(
      'LaC/Roadmap/R.md',
      'New',
      { start_time: null, end_time: null },
    );
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
    act(() => { result.current.editPlace(old); });
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
