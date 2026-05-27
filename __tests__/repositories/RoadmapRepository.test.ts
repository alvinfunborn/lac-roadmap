import { createApp } from '../__mocks__/obsidian';
import { RoadmapRepository } from '../../repositories/RoadmapRepository';
import { Place, RouteSegment } from '../../types/roadmap';

/**
 * Integration tests for RoadmapRepository — exercises TOML parse/stringify,
 * wikilink scanning, route-segment round-tripping, and time-override
 * insertion through the mocked Obsidian vault. We don't isolate the
 * private helpers (parseToml/stringifyToml/extractTomlHeader) directly;
 * we round-trip through public methods which is the contract that matters.
 */

const ROOT_PATH = 'LaC/Roadmap/roadmap.md';

function seedRoot(app: ReturnType<typeof createApp>, links: string[] = []) {
  const content = [
    'type = "root"',
    'renders = ["roadmapset"]',
    '',
    ...links.map(l => `[[${l}]]`),
    '',
  ].join('\n');
  app.vault.files.set(ROOT_PATH, { file: new (require('../__mocks__/obsidian').TFile)(ROOT_PATH), content });
}

function seedPlace(app: ReturnType<typeof createApp>, name: string, detail: Place['detail'] = {}) {
  const path = `LaC/Roadmap/${name}.md`;
  const detailLines: string[] = [];
  if (detail.start_time) detailLines.push(`start_time = "${detail.start_time}"`);
  if (detail.end_time) detailLines.push(`end_time = "${detail.end_time}"`);
  if (detail.description) detailLines.push(`description = "${detail.description}"`);
  if (detail.address) {
    detailLines.push(`[detail.address]`);
    Object.entries(detail.address).forEach(([k, v]) => {
      if (typeof v === 'number') detailLines.push(`${k} = ${v}`);
      else if (v !== undefined) detailLines.push(`${k} = "${v}"`);
    });
  }
  const header = [`name = "${name}"`];
  if (detailLines.length > 0 && !detail.address) {
    header.push('', '[detail]', ...detailLines);
  } else if (detailLines.length > 0) {
    header.push('', '[detail]', ...detailLines.filter(l => !l.startsWith('[detail.address]')));
    // Re-add nested table at the end
    if (detail.address) {
      header.push('', '[detail.address]');
      Object.entries(detail.address).forEach(([k, v]) => {
        if (typeof v === 'number') header.push(`${k} = ${v}`);
        else if (v !== undefined) header.push(`${k} = "${v}"`);
      });
    }
  }
  const content = header.join('\n') + '\n';
  app.vault.files.set(path, { file: new (require('../__mocks__/obsidian').TFile)(path), content });
}

function seedRoadmap(app: ReturnType<typeof createApp>, name: string, body: string[]) {
  const path = `LaC/Roadmap/${name}.md`;
  const content = `name = "${name}"\n\n` + body.join('\n') + '\n';
  app.vault.files.set(path, { file: new (require('../__mocks__/obsidian').TFile)(path), content });
  return path;
}

describe('RoadmapRepository', () => {
  describe('isValidEntry', () => {
    it('true when type=root and renders contains "roadmapset"', async () => {
      const app = createApp();
      seedRoot(app);
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      expect(await repo.isValidEntry()).toBe(true);
    });
    it('false when root file missing', async () => {
      const app = createApp();
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      expect(await repo.isValidEntry()).toBe(false);
    });
    it('false when type != root', async () => {
      const app = createApp();
      app.vault.files.set(ROOT_PATH, { file: new (require('../__mocks__/obsidian').TFile)(ROOT_PATH), content: 'type = "leaf"\nrenders = ["roadmapset"]\n' });
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      expect(await repo.isValidEntry()).toBe(false);
    });
    it('false when renders lacks roadmapset', async () => {
      const app = createApp();
      app.vault.files.set(ROOT_PATH, { file: new (require('../__mocks__/obsidian').TFile)(ROOT_PATH), content: 'type = "root"\nrenders = ["other"]\n' });
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      expect(await repo.isValidEntry()).toBe(false);
    });
    it('accepts renders as scalar string', async () => {
      const app = createApp();
      app.vault.files.set(ROOT_PATH, { file: new (require('../__mocks__/obsidian').TFile)(ROOT_PATH), content: 'type = "root"\nrenders = "roadmapset"\n' });
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      expect(await repo.isValidEntry()).toBe(true);
    });
  });

  describe('isSubRoadmapEntry', () => {
    it('true when type=root + renders contains "roadmap"', async () => {
      const app = createApp();
      const subPath = 'LaC/Roadmap/sub.md';
      app.vault.files.set(subPath, { file: new (require('../__mocks__/obsidian').TFile)(subPath), content: 'type = "root"\nrenders = ["roadmap"]\n' });
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      expect(await repo.isSubRoadmapEntry(subPath)).toBe(true);
    });
    it('false for ordinary place files', async () => {
      const app = createApp();
      const placePath = 'LaC/Roadmap/place.md';
      app.vault.files.set(placePath, { file: new (require('../__mocks__/obsidian').TFile)(placePath), content: 'name = "place"\n' });
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      expect(await repo.isSubRoadmapEntry(placePath)).toBe(false);
    });
  });

  describe('loadRoadmapSet', () => {
    it('returns empty when root missing', async () => {
      const app = createApp();
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      expect(await repo.loadRoadmapSet()).toEqual([]);
    });
    it('parses [[wikilink]] entries in order', async () => {
      const app = createApp();
      seedRoot(app, ['Trip A', 'Trip B', 'Trip C']);
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      expect(await repo.loadRoadmapSet()).toEqual(['Trip A', 'Trip B', 'Trip C']);
    });
    it('strips alias pipes ("[[name|alias]]" → "name")', async () => {
      const app = createApp();
      app.vault.files.set(ROOT_PATH, { file: new (require('../__mocks__/obsidian').TFile)(ROOT_PATH), content: '[[Trip A|去日本]]\n[[Trip B]]\n' });
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      expect(await repo.loadRoadmapSet()).toEqual(['Trip A', 'Trip B']);
    });
  });

  describe('loadRoadmap (TOML header + body items)', () => {
    it('reads name + detail and resolves places via metadataCache', async () => {
      const app = createApp();
      // start_time 不再放进 place 文件 —— per-trip 字段只通过 trip 文件 [[wikilink]]
      // 后的覆盖行提供。这里改成 description 单字段；时间字段的测试由 inline
      // override 的下一条 case 覆盖。
      seedPlace(app, '京都站', { description: '抵达' });
      const path = seedRoadmap(app, '京都两日', [
        '[[京都站]]',
        'start_time = "2025-11-01 09:00"',
      ]);
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      const r = await repo.loadRoadmap(path);
      expect(r).not.toBeNull();
      expect(r!.name).toBe('京都两日');
      expect(r!.items.length).toBe(1);
      const p = r!.items[0] as Place;
      expect(p.name).toBe('京都站');
      expect(p.detail.start_time).toBe('2025-11-01 09:00');
    });

    it('strips stale start_time/end_time from place file (per-trip fields only)', async () => {
      const app = createApp();
      // 旧数据可能在 place 文件残留 start_time —— load 阶段必须丢弃，否则
      // trip 上的 clear 操作会被 place 文件复活的旧值悄悄抵消。
      seedPlace(app, 'X', { start_time: '2025-01-01', end_time: '2025-01-02', description: 'd' });
      const path = seedRoadmap(app, 'R', ['[[X]]']);
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      const r = await repo.loadRoadmap(path);
      const p = r!.items[0] as Place;
      expect(p.detail.start_time).toBeUndefined();
      expect(p.detail.end_time).toBeUndefined();
      expect(p.detail.description).toBe('d');
    });

    it('applies inline start_time override on the line below [[Place]]', async () => {
      const app = createApp();
      seedPlace(app, 'X');
      const path = seedRoadmap(app, 'R', [
        '[[X]]',
        'start_time = "2025-11-01 10:00"',
        'end_time = "2025-11-01 12:00"',
      ]);
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      const r = await repo.loadRoadmap(path);
      const p = r!.items[0] as Place;
      expect(p.detail.start_time).toBe('2025-11-01 10:00');
      expect(p.detail.end_time).toBe('2025-11-01 12:00');
    });

    it('parses inline route = { ... } as next item', async () => {
      const app = createApp();
      seedPlace(app, 'A');
      seedPlace(app, 'B');
      const path = seedRoadmap(app, 'R', [
        '[[A]]',
        'route = { travelMode = "drive", distance = 1200, duration = 5, tolls = 10 }',
        '[[B]]',
      ]);
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      const r = await repo.loadRoadmap(path);
      expect(r!.items.length).toBe(3);
      const seg = r!.items[1] as RouteSegment;
      expect(seg.travelMode).toBe('drive');
      expect(seg.distance).toBe(1200);
      expect(seg.duration).toBe(5);
      expect(seg.tolls).toBe(10);
    });

    it('returns null when file missing', async () => {
      const app = createApp();
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      expect(await repo.loadRoadmap('does-not-exist.md')).toBeNull();
    });
  });

  describe('createRoadmapFile + addRoadmapToSet round-trip', () => {
    it('creates a roadmap file with TOML header and registers in root', async () => {
      const app = createApp();
      seedRoot(app);
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      const path = await repo.createRoadmapFile('LaC/Roadmap', 'New Trip', { description: 'd' });
      expect(path).toBe('LaC/Roadmap/New Trip.md');
      await repo.addRoadmapToSet('New Trip');
      const links = await repo.loadRoadmapSet();
      expect(links).toContain('New Trip');
      const content = app.vault.files.get(path)!.content;
      expect(content).toContain('name = "New Trip"');
      expect(content.toLowerCase()).toContain('description');
    });

    it('addRoadmapToSet is idempotent', async () => {
      const app = createApp();
      seedRoot(app, ['Existing']);
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      await repo.addRoadmapToSet('Existing');
      const links = await repo.loadRoadmapSet();
      expect(links.filter(l => l === 'Existing').length).toBe(1);
    });
  });

  describe('updateRoadmapItems round-trip', () => {
    it('writes [[Place]] + route lines and re-reads them faithfully', async () => {
      const app = createApp();
      seedPlace(app, 'A');
      seedPlace(app, 'B');
      const path = seedRoadmap(app, 'R', []);
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      const items: Array<Place | RouteSegment> = [
        { id: 'A', name: 'A', detail: {} },
        { travelMode: 'walk', distance: 800, duration: 12, tolls: 0 },
        { id: 'B', name: 'B', detail: {} },
      ];
      await repo.updateRoadmapItems(path, 'R', {}, items);
      const r = await repo.loadRoadmap(path);
      expect(r!.items.length).toBe(3);
      const seg = r!.items[1] as RouteSegment;
      expect(seg.travelMode).toBe('walk');
      expect(seg.distance).toBe(800);
    });
  });

  describe('updatePlaceScheduleInRoadmap', () => {
    it('inserts start_time / end_time override lines under [[Place]]', async () => {
      const app = createApp();
      seedPlace(app, 'X');
      const path = seedRoadmap(app, 'R', ['[[X]]']);
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      await repo.updatePlaceScheduleInRoadmap(path, 'X', {
        start_time: '2025-11-01 09:00',
        end_time: '2025-11-01 12:00',
      });
      const content = app.vault.files.get(path)!.content;
      expect(content).toMatch(/\[\[X\]\][\s\S]*start_time = "2025-11-01 09:00"/);
      expect(content).toMatch(/end_time = "2025-11-01 12:00"/);
    });

    it('replaces existing override line in place', async () => {
      const app = createApp();
      seedPlace(app, 'X');
      const path = seedRoadmap(app, 'R', [
        '[[X]]',
        'start_time = "2025-11-01 09:00"',
      ]);
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      await repo.updatePlaceScheduleInRoadmap(path, 'X', { start_time: '2025-11-01 10:00' });
      const content = app.vault.files.get(path)!.content;
      expect(content).toContain('start_time = "2025-11-01 10:00"');
      expect((content.match(/start_time = /g) || []).length).toBe(1);
    });

    it('deletes override line when value is null', async () => {
      const app = createApp();
      seedPlace(app, 'X');
      const path = seedRoadmap(app, 'R', [
        '[[X]]',
        'start_time = "2025-11-01 09:00"',
        'end_time = "2025-11-01 12:00"',
      ]);
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      await repo.updatePlaceScheduleInRoadmap(path, 'X', { start_time: null });
      const content = app.vault.files.get(path)!.content;
      expect(content).not.toContain('start_time = ');
      expect(content).toContain('end_time = ');
    });

    it('is a no-op when target place not in roadmap', async () => {
      const app = createApp();
      seedPlace(app, 'X');
      const path = seedRoadmap(app, 'R', ['[[X]]']);
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      const before = app.vault.files.get(path)!.content;
      await repo.updatePlaceScheduleInRoadmap(path, 'NotHere', { start_time: '2025-11-01 09:00' });
      expect(app.vault.files.get(path)!.content).toBe(before);
    });
  });

  describe('findRoadmapsReferencingPlace', () => {
    it('finds roadmaps that link the place; excludes the place file itself and root', async () => {
      const app = createApp();
      seedRoot(app);
      seedPlace(app, 'X');
      seedRoadmap(app, 'R1', ['[[X]]']);
      seedRoadmap(app, 'R2', ['[[Y]]']);
      seedRoadmap(app, 'R3', ['[[X|alias]]']);
      const repo = new RoadmapRepository(app as any, ROOT_PATH);
      const refs = await repo.findRoadmapsReferencingPlace('X');
      expect(refs.sort()).toEqual(['LaC/Roadmap/R1.md', 'LaC/Roadmap/R3.md'].sort());
    });
  });
});
