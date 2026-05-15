import { createApp, TFile } from '../__mocks__/obsidian';
import { RoadmapRepository } from '../../repositories/RoadmapRepository';
import { Place, RouteSegment } from '../../types/roadmap';

/**
 * Coverage extension for RoadmapRepository — focuses on methods not yet
 * exercised by RoadmapRepository.test.ts: updateRoadmapMeta /
 * updatePlaceGeneric / saveSubRoadmapFile / updateRouteSegment /
 * updateRootFile.
 */

const ROOT_PATH = 'LaC/Roadmap/roadmap.md';

function setFile(app: ReturnType<typeof createApp>, path: string, content: string) {
  app.vault.files.set(path, { file: new TFile(path), content });
}

describe('RoadmapRepository.updateRoadmapMeta', () => {
  it('rewrites header but keeps the body items intact', async () => {
    const app = createApp();
    const path = 'LaC/Roadmap/Trip.md';
    setFile(app, path,
      'name = "Trip"\n\n[detail]\ndescription = "old"\n\n[[A]]\n[[B]]\nroute = { travelMode = "walk" }\n');
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    await repo.updateRoadmapMeta(path, 'Trip', { description: 'new' });
    const c = app.vault.files.get(path)!.content;
    expect(c).toContain('description = "new"');
    expect(c).not.toContain('description = "old"');
    expect(c).toContain('[[A]]');
    expect(c).toContain('[[B]]');
    expect(c).toContain('route = ');
  });

  it('creates the file when missing', async () => {
    const app = createApp();
    const path = 'LaC/Roadmap/New.md';
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    await repo.updateRoadmapMeta(path, 'New', { description: 'd' });
    expect(app.vault.files.get(path)!.content).toContain('name = "New"');
  });
});

describe('RoadmapRepository.updatePlaceGeneric', () => {
  it('updates name + description + address while preserving top-level type/renders (recursive sub-roadmap structure)', async () => {
    const app = createApp();
    const path = 'LaC/Roadmap/SubTrip.md';
    setFile(app, path,
      'name = "SubTrip"\ntype = "root"\nrenders = ["roadmap"]\n\n[detail]\ndescription = "old desc"\n\n[[Inner]]\n');
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    await repo.updatePlaceGeneric(path, {
      name: 'SubTrip Renamed',
      description: 'new desc',
      address: { name: 'Tokyo', longitude: 139.69, latitude: 35.69 },
    });
    const c = app.vault.files.get(path)!.content;
    expect(c).toContain('name = "SubTrip Renamed"');
    expect(c).toContain('type = "root"');
    expect(c).toMatch(/renders\s*=\s*\[\s*"roadmap"\s*\]/);
    expect(c).toContain('description = "new desc"');
    expect(c).toContain('Tokyo');
    expect(c).toContain('[[Inner]]');
  });

  it('deletes description when given empty string', async () => {
    const app = createApp();
    const path = 'LaC/Roadmap/P.md';
    setFile(app, path, 'name = "P"\n\n[detail]\ndescription = "x"\n');
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    await repo.updatePlaceGeneric(path, { description: '' });
    const c = app.vault.files.get(path)!.content;
    expect(c).not.toContain('description');
  });

  it('is a no-op when target file missing', async () => {
    const app = createApp();
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    await expect(repo.updatePlaceGeneric('nope.md', { name: 'X' })).resolves.toBeUndefined();
  });
});

describe('RoadmapRepository.saveSubRoadmapFile', () => {
  it('writes type=root + renders=[roadmap] header', async () => {
    const app = createApp();
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    const f = await repo.saveSubRoadmapFile('LaC/Roadmap', 'New Sub', { description: 'd' });
    expect(f.path).toBe('LaC/Roadmap/New Sub.md');
    const c = app.vault.files.get(f.path)!.content;
    expect(c).toContain('type = "root"');
    expect(c).toMatch(/renders\s*=\s*\[\s*"roadmap"\s*\]/);
    expect(c).toContain('name = "New Sub"');
  });

  it('returns existing TFile without overwriting on collision', async () => {
    const app = createApp();
    const path = 'LaC/Roadmap/Existing.md';
    setFile(app, path, 'name = "kept"\n');
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    const f = await repo.saveSubRoadmapFile('LaC/Roadmap', 'Existing', {});
    expect(f.path).toBe(path);
    expect(app.vault.files.get(path)!.content).toBe('name = "kept"\n');
  });
});

describe('RoadmapRepository.savePlaceFile', () => {
  it('creates a new place file with TOML content', async () => {
    const app = createApp();
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    const place: Place = { id: 'P', name: 'P', detail: { description: 'd' } };
    const f = await repo.savePlaceFile('LaC/Roadmap', place);
    expect(f.path).toBe('LaC/Roadmap/P.md');
    const c = app.vault.files.get(f.path)!.content;
    expect(c).toContain('name = "P"');
    expect(c).toContain('description = "d"');
  });

  it('overwrites existing place file', async () => {
    const app = createApp();
    const path = 'LaC/Roadmap/P.md';
    setFile(app, path, 'name = "P"\n\n[detail]\ndescription = "old"\n');
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    await repo.savePlaceFile('LaC/Roadmap', { id: 'P', name: 'P', detail: { description: 'new' } });
    expect(app.vault.files.get(path)!.content).toContain('description = "new"');
  });
});

describe('RoadmapRepository.updateRouteSegment', () => {
  function seedRoadmapWithTwoPlaces(app: ReturnType<typeof createApp>, body: string[]) {
    setFile(app, 'LaC/Roadmap/A.md', 'name = "A"\n');
    setFile(app, 'LaC/Roadmap/B.md', 'name = "B"\n');
    const path = 'LaC/Roadmap/R.md';
    setFile(app, path, `name = "R"\n\n${body.join('\n')}\n`);
    return path;
  }

  it('inserts a new segment between adjacent places', async () => {
    const app = createApp();
    const path = seedRoadmapWithTwoPlaces(app, ['[[A]]', '[[B]]']);
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    await repo.updateRouteSegment(path, 0, { travelMode: 'walk', distance: 500, duration: 8, tolls: 0 });
    const c = app.vault.files.get(path)!.content;
    expect(c).toMatch(/\[\[A\]\]\s*\nroute = \{ travelMode = "walk"/);
    expect(c).toContain('[[B]]');
  });

  it('replaces an existing segment', async () => {
    const app = createApp();
    const path = seedRoadmapWithTwoPlaces(app,
      ['[[A]]', 'route = { travelMode = "walk", distance = 500, duration = 8, tolls = 0 }', '[[B]]']);
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    await repo.updateRouteSegment(path, 0, { travelMode: 'drive', distance: 1500, duration: 5, tolls: 10 });
    const c = app.vault.files.get(path)!.content;
    expect(c).toContain('travelMode = "drive"');
    expect(c).not.toContain('travelMode = "walk"');
  });

  it('deletes existing segment when null passed', async () => {
    const app = createApp();
    const path = seedRoadmapWithTwoPlaces(app,
      ['[[A]]', 'route = { travelMode = "walk", distance = 500, duration = 8, tolls = 0 }', '[[B]]']);
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    await repo.updateRouteSegment(path, 0, null);
    const c = app.vault.files.get(path)!.content;
    expect(c).not.toContain('route =');
    expect(c).toContain('[[A]]');
    expect(c).toContain('[[B]]');
  });

  it('is a no-op for an out-of-range index', async () => {
    const app = createApp();
    const path = seedRoadmapWithTwoPlaces(app, ['[[A]]', '[[B]]']);
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    const before = app.vault.files.get(path)!.content;
    await repo.updateRouteSegment(path, 99, { travelMode: 'drive', distance: 0, duration: 0, tolls: 0 });
    expect(app.vault.files.get(path)!.content).toBe(before);
  });
});

describe('RoadmapRepository.updateRootFile', () => {
  it('clears existing wikilinks and writes the new ordered list', async () => {
    const app = createApp();
    setFile(app, ROOT_PATH,
      'type = "root"\nrenders = ["roadmapset"]\n\n[[Old A]]\n[[Old B]]\n');
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    await repo.updateRootFile(['New 1', 'New 2', 'New 3']);
    const links = await repo.loadRoadmapSet();
    expect(links).toEqual(['New 1', 'New 2', 'New 3']);
    const c = app.vault.files.get(ROOT_PATH)!.content;
    expect(c).toContain('type = "root"');
    expect(c).not.toContain('Old A');
  });

  it('creates the root file when absent', async () => {
    const app = createApp();
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    await repo.updateRootFile(['Only One']);
    const c = app.vault.files.get(ROOT_PATH)!.content;
    expect(c).toContain('[[Only One]]');
  });
});

describe('RoadmapRepository.loadRoadmap — startPoint / endPoint computation', () => {
  it('startPoint = first geocoded place; endPoint = last geocoded place', async () => {
    const app = createApp();
    const path = 'LaC/Roadmap/R.md';
    // Three places: A (no coords), B (coords), C (coords). Expect start=B, end=C.
    setFile(app, 'LaC/Roadmap/A.md', 'name = "A"\n');
    setFile(app, 'LaC/Roadmap/B.md',
      'name = "B"\n\n[detail.address]\nname = "B"\nlongitude = 100\nlatitude = 30\n');
    setFile(app, 'LaC/Roadmap/C.md',
      'name = "C"\n\n[detail.address]\nname = "C"\nlongitude = 101\nlatitude = 31\n');
    setFile(app, path, 'name = "R"\n\n[[A]]\n[[B]]\n[[C]]\n');
    const repo = new RoadmapRepository(app as any, ROOT_PATH);
    const r = await repo.loadRoadmap(path);
    expect(r).not.toBeNull();
    expect(r!.startPoint?.longitude).toBe(100);
    expect(r!.endPoint?.longitude).toBe(101);
  });
});
