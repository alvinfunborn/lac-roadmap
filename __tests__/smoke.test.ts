import RoadmapPlugin from '../main';
import { createApp, TFile } from './__mocks__/obsidian';
import { RoadmapRepository } from '../repositories/RoadmapRepository';
import { DEFAULT_SETTINGS } from '../types';

/**
 * Plugin-level boot smoke test. Stands in for "does the thing start at all":
 *   1. RoadmapPlugin can be instantiated with a mock App
 *   2. onload() runs without throwing
 *   3. Settings default to DEFAULT_SETTINGS when no data has been saved
 *   4. The view + command + setting tab + file-menu hook all register
 *   5. Triggering the open command from a virgin vault writes the sample
 *      entry + place + roadmap files and the resulting entry validates
 *      under RoadmapRepository.isValidEntry().
 *
 * This deliberately exercises the production code path — main.ts, the
 * repository, default i18n strings, sample TOML generation — rather than
 * a parallel re-implementation. If any of those break in a way that would
 * make the plugin fail to start in Obsidian, this test should fail.
 */

describe('smoke: plugin boots, registers, and writes a usable sample vault', () => {
  it('onload runs and registers view + command + setting tab + file-menu handler', async () => {
    const app = createApp();
    const plugin = new RoadmapPlugin(app as any, { id: 'lac-roadmap', name: 'LaC.Roadmap' });
    await plugin.onload();

    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    expect(Object.keys(plugin._views)).toContain('lac-roadmap-view');
    expect(plugin._commands['open-lac-roadmap']).toBeDefined();
    expect(plugin._settingTabs.length).toBe(1);
    expect(plugin._events.length).toBeGreaterThan(0);
  });

  it('triggering open command in a virgin vault creates sample entry + places + roadmap, and the entry validates', async () => {
    const app = createApp();
    const plugin = new RoadmapPlugin(app as any, { id: 'lac-roadmap', name: 'LaC.Roadmap' });
    await plugin.onload();

    await plugin._commands['open-lac-roadmap'].callback!();

    const entryPath = plugin.settings.entryFile;
    expect(entryPath).toBe('LaC/Roadmap/roadmap.md');

    const entry = app.vault.getAbstractFileByPath(entryPath);
    expect(entry).toBeInstanceOf(TFile);

    // The sample vault should contain at least entry + 2 places + 1 roadmap = 4 files.
    expect(app.vault.files.size).toBeGreaterThanOrEqual(4);

    const repo = new RoadmapRepository(app as any, entryPath);
    expect(await repo.isValidEntry()).toBe(true);
    const trips = await repo.loadRoadmapSet();
    expect(trips.length).toBeGreaterThan(0);

    // openWithFile should have called workspace.getLeaf('tab') and revealLeaf.
    expect((app.workspace.getLeaf as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    expect((app.workspace.revealLeaf as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    const leaf = app.workspace._lastLeaf;
    expect(leaf).toBeTruthy();
    expect(leaf!.getViewState().type).toBe('lac-roadmap-view');
    expect(leaf!.getViewState().state.filePath).toBe(entryPath);
  });

  it('saveSettings round-trips through loadData/saveData', async () => {
    const app = createApp();
    const plugin = new RoadmapPlugin(app as any, { id: 'lac-roadmap', name: 'LaC.Roadmap' });
    await plugin.onload();

    await plugin.updateSettings({ googleMapsApiKey: 'gkey-123', mapApiProvider: 'google' });
    expect(plugin.settings.googleMapsApiKey).toBe('gkey-123');
    expect(plugin.settings.mapApiProvider).toBe('google');

    // Bring up a fresh plugin instance on the same app — loadSettings should
    // pull what we just saved (we use the in-memory _data field on Plugin).
    const plugin2 = new RoadmapPlugin(app as any, { id: 'lac-roadmap', name: 'LaC.Roadmap' });
    // Copy persisted blob over — emulates Obsidian's per-plugin data file.
    plugin2._data = plugin._data;
    await plugin2.loadSettings();
    expect(plugin2.settings.googleMapsApiKey).toBe('gkey-123');
    expect(plugin2.settings.mapApiProvider).toBe('google');
  });
});
