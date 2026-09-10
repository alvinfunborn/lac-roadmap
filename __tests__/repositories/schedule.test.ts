import { anchorFromPlace, setRoadmapDate, scheduleGroupKey } from '../../utils/schedule';
import { RoadmapRepository } from '../../repositories/RoadmapRepository';
import { createApp, TFile } from '../__mocks__/obsidian';
import { Place, Roadmap } from '../../types/roadmap';

const p = (id: string, detail: Place['detail'] = {}): Place => ({ id, name: id, detail });
const places = (items: Roadmap['items']) => items.filter((x): x is Place => 'name' in x);

describe('relative days and visit dates', () => {
  it('anchors the whole trip from Day 3, including repeated visits and a transit segment', () => {
    const before: Roadmap = { id: 'T', name: 'T', items: [p('Hotel', { days: 1 }), { travelMode: 'walk' }, p('Hotel', { days: 3 }), p('Museum', { days: 4 })] };
    const edited = before.items.slice(); edited[2] = p('Hotel', { start_time: '2026-10-03 11:20' });
    const after = anchorFromPlace(before, edited, 2);
    expect(places(after).map(x => x.detail.start_time)).toEqual(['2026-10-01', '2026-10-03 11:20', '2026-10-04']);
    expect(after[1]).toEqual({ travelMode: 'walk' });
    expect(places(before.items).map(x => x.detail.days)).toEqual([1, 3, 4]);
  });
  it('dates implicit Day 1 too, while an already dated trip keeps undated places unplanned', () => {
    expect(places(setRoadmapDate([p('A'), p('B', { days: 2 })], '2024-02-28')).map(x => x.detail.start_time)).toEqual(['2024-02-28', '2024-02-29']);
    const r: Roadmap = { id: 'T', name: 'T', detail: { start_time: '2026-10-01' }, items: [p('A'), p('B')] };
    const edited = [p('A', { start_time: '2026-10-02' }), p('B')];
    expect(anchorFromPlace(r, edited, 0)).toEqual(edited);
    expect(scheduleGroupKey(p('B', { days: 2 }), true)).toBe('');
    expect(scheduleGroupKey(p('B'), false)).toBe('第1天');
  });
  it('clears all dates, keeps date gaps as relative days, then assigns all days again', () => {
    const original = [p('Hotel', { start_time: '2026-10-01 12:00', end_time: '2026-10-02 09:00' }), p('Hotel', { start_time: '2026-10-03' }), p('Unplanned')];
    const cleared = places(setRoadmapDate(original));
    expect(cleared.map(x => x.detail.days)).toEqual([1, 3, 4]);
    expect(cleared.every(x => !x.detail.start_time && !x.detail.end_time)).toBe(true);
    expect(places(setRoadmapDate(cleared, '2026-12-30')).map(x => x.detail.start_time)).toEqual(['2026-12-30', '2027-01-01', '2027-01-02']);
  });
  it('shifts already dated visits and end times, leaving unplanned visits alone', () => {
    const shifted = places(setRoadmapDate([p('A', { start_time: '2024-02-28 09:00', end_time: '2024-02-29 10:00' }), p('B')], '2025-01-01'));
    expect(shifted[0].detail).toEqual({ start_time: '2025-01-01 09:00', end_time: '2025-01-02 10:00' });
    expect(shifted[1].detail).toEqual({});
  });
  it('a newly inserted first dated place does not inherit the displaced place day', () => {
    const before: Roadmap = { id: 'T', name: 'T', items: [p('A', { days: 3 })] };
    const after = anchorFromPlace(before, [p('New', { start_time: '2026-10-01' }), ...before.items], 0, -1);
    expect(places(after).map(x => x.detail.start_time)).toEqual(['2026-10-01', '2026-10-03']);
  });
  it('persists different day/date values for repeated references without altering the shared POI', async () => {
    const app = createApp(); const root = 'LaC/Roadmap'; const trip = root + '/T.md';
    const originalPoi = 'name = "Hotel"\n[detail]\ndescription = "shared"\n';
    app.vault.files.set(root + '/Hotel.md', { file: new TFile(root + '/Hotel.md'), content: originalPoi });
    app.vault.files.set(trip, { file: new TFile(trip), content: 'name = "T"\n' });
    const repo = new RoadmapRepository(app as any, root + '/roadmap.md');
    const relative = [p('Hotel', { days: 1 }), { travelMode: 'walk' as const }, p('Hotel', { days: 3 })];
    await repo.updateRoadmapItems(trip, 'T', {}, relative);
    let loaded = (await repo.loadRoadmap(trip))!;
    expect(places(loaded.items).map(x => x.detail.days)).toEqual([1, 3]);
    expect(loaded.items[1]).toEqual({ travelMode: 'walk' });
    await repo.updateRoadmapItems(trip, 'T', {}, setRoadmapDate(loaded.items, '2026-10-01'));
    loaded = (await repo.loadRoadmap(trip))!;
    expect(places(loaded.items).map(x => x.detail.start_time)).toEqual(['2026-10-01', '2026-10-03']);
    expect(loaded.detail?.start_time).toBe('2026-10-01');
    expect(loaded.detail?.end_time).toBe('2026-10-03');
    await repo.updateRoadmapItems(trip, 'T', {}, setRoadmapDate(loaded.items));
    loaded = (await repo.loadRoadmap(trip))!;
    expect(loaded.detail?.start_time).toBeUndefined();
    expect(places(loaded.items).map(x => x.detail.days)).toEqual([1, 3]);
    expect(app.vault.files.get(root + '/Hotel.md')!.content).toBe(originalPoi);
  });
});
