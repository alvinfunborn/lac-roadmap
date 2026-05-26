import { Plugin, TFile, Notice, ItemView, WorkspaceLeaf } from 'obsidian';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { RoadmapSettings, DEFAULT_SETTINGS } from './types';
import { setLocale, t } from './i18n';
import { RoadmapRepository } from './repositories/RoadmapRepository';
import { RoadmapSettingTab } from './components/settings/RoadmapSettingTab';
import RoadmapSetPage from './pages/roadmapset/index';
import RoadmapPage from './pages/roadmap/index';

const VIEW_TYPE = 'lac-roadmap-view';

class RoadmapView extends ItemView {
  private filePath: string = '';
  private rootEl: HTMLElement | null = null;
  private reactRoot: Root | null = null;
  private repository: RoadmapRepository | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: RoadmapPlugin) {
    super(leaf);
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'LaC.Roadmap'; }

  async onOpen() {
    this.containerEl.empty();
    // 使用通用容器，具体页面在各自组件中定义根类名（roadmap 或 roadmapset）
    this.rootEl = this.containerEl.createDiv({ cls: 'lac-roadmap-container' });
    if (this.rootEl) {
      this.reactRoot = createRoot(this.rootEl);
      if (!this.filePath) {
        // 初次打开尚未设置 filePath：渲染占位，等待 setState 推进
        this.reactRoot.render(React.createElement('div', null, 'LaC.Roadmap'));
        return;
      }
      this.repository = new RoadmapRepository(this.plugin.app, this.filePath);
      const repo = this.repository;
      const isEntry = await repo.isValidEntry();
      if (isEntry) {
        this.reactRoot.render(React.createElement(RoadmapSetPage, { app: this.plugin.app, repository: repo, settings: this.plugin.settings, leaf: this.leaf }));
      } else {
        this.reactRoot.render(React.createElement(RoadmapPage, { app: this.plugin.app, repository: repo, filePath: this.filePath, settings: this.plugin.settings, leaf: this.leaf }));
      }
    }
  }

  async onClose() {
    if (this.reactRoot) {
      this.reactRoot.unmount();
      this.reactRoot = null;
    }
    this.rootEl = null;
  }

  getState(): any { return { filePath: this.filePath }; }
  async setState(state: any) {
    if (state) {
      if (typeof state.filePath === 'string') this.filePath = state.filePath;
      if (this.filePath) {
        this.repository = new RoadmapRepository(this.plugin.app, this.filePath);
        if (this.reactRoot && this.rootEl) {
          const repo = this.repository;
          const isEntry = await repo.isValidEntry();
          // `leaf: this.leaf` MUST be passed on every render — including the
          // setState path. Without it, in-place view switches (roadmap → set
          // via leaf.history.back(), set → roadmap via setViewState) hand the
          // newly mounted page a `leaf` prop of undefined, so its next
          // navigation falls through to `getLeaf(false)` which can land on
          // any other active leaf — producing the "card click opens a new
          // tab" symptom and the back-pop-only-current-tab loop.
          if (isEntry) {
            this.reactRoot.render(React.createElement(RoadmapSetPage, { app: this.plugin.app, repository: repo, settings: this.plugin.settings, leaf: this.leaf }));
          } else {
            this.reactRoot.render(React.createElement(RoadmapPage, { app: this.plugin.app, repository: repo, filePath: this.filePath, settings: this.plugin.settings, leaf: this.leaf }));
          }
        }
      }
    }
  }
}

export default class RoadmapPlugin extends Plugin {
  settings!: RoadmapSettings;

  async onload() {
    await this.loadSettings();
    setLocale(this.settings.locale || 'auto');

    this.registerView(VIEW_TYPE, (leaf) => new RoadmapView(leaf, this));

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && file.extension === 'md') {
          menu.addItem((item) => {
            item
              .setTitle(t('menu.openWith'))
              .setIcon('signpost')
              .onClick(async () => {
                await this.openWithFile(file.path);
              });
          });
        }
      })
    );

    this.addCommand({
      id: 'open-lac-roadmap',
      name: t('command.open'),
      callback: async () => {
        const entryPath = this.settings.entryFile || 'LaC/Roadmap/roadmap.md';
        const ensureFolderExists = async (folderPath: string) => {
          const folder = this.app.vault.getAbstractFileByPath(folderPath);
          if (!folder) await this.app.vault.createFolder(folderPath);
        };

        const entryFile = this.app.vault.getAbstractFileByPath(entryPath);
        if (!entryFile) {
          const parts = entryPath.split('/');
          const folderPath = parts.slice(0, -1).join('/') || '';
          if (folderPath) await ensureFolderExists(folderPath);

          const sampleEntry = `type = "root"\nrenders = ["roadmapset"]\n\n[[${t('main.sampleRoadmap')}]]\n`;
          await this.app.vault.create(entryPath, sampleEntry);

          const roadmapsFolder = folderPath || 'LaC/Roadmap';
          const makePlaceToml = (name: string, start: string, end: string, addr: string, desc: string) => {
            const lines: string[] = [];
            lines.push(`name = "${name}"`);
            lines.push('');
            lines.push('[detail]');
            lines.push(`start_time = "${start}"`);
            lines.push(`end_time = "${end}"`);
            lines.push(`description = "${desc}"`);
            lines.push(`address = { name = "${addr}" }`);
            lines.push('');
            return lines.join('\n');
          };

          const places = [
            { name: t('main.samplePlace1'), start: '2025-10-04 11:00:00', end: '2025-10-04 14:00:00', addr: t('main.samplePlace1'), desc: '购物' },
            { name: t('main.samplePlace2'), start: '2025-10-08 15:00:00', end: '2025-10-08 17:00:00', addr: t('main.samplePlace2'), desc: '二次元' }
          ];
          for (const p of places) {
            const pPath = `${roadmapsFolder}/${p.name}.md`;
            await this.app.vault.create(pPath, makePlaceToml(p.name, p.start, p.end, p.addr, p.desc));
          }

          const roadmapPath = `${roadmapsFolder}/${t('main.sampleRoadmap')}.md`;
          const roadmapContent = `name = "${t('main.sampleRoadmap')}"\n\n[detail]\ndescription = "日本三古都文化之旅"\nstart_time = "2025-10-04"\nend_time = "2025-10-09"\naddress = { name = "日本" }\n\n[[${t('main.samplePlace1')}]]\n[[${t('main.samplePlace2')}]]\n`;
          await this.app.vault.create(roadmapPath, roadmapContent);
        }

        await this.openWithFile(entryPath);
      }
    });

    this.addSettingTab(new RoadmapSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    setLocale(this.settings.locale || 'auto');
  }

  async updateSettings(newSettings: Partial<RoadmapSettings>) {
    Object.assign(this.settings, newSettings);
    await this.saveSettings();
  }

  private async openWithFile(filePath: string) {
    try {
      let file = this.app.vault.getAbstractFileByPath(filePath);
      if (!file || !(file instanceof TFile)) {
        new Notice(t('notice.entryFileNotExist'), 5000);
        return;
      }
      const repository = new RoadmapRepository(this.app, filePath);
      const isValid = await repository.isValidEntry();
      if (!isValid) {
        new Notice(t('notice.invalidEntry'), 5000);
        return;
      }
      const leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, state: { filePath: (file as TFile).path }, active: true });
      this.app.workspace.revealLeaf(leaf);
    } catch (e) {
      console.error('Failed to open file:', e);
      new Notice(t('notice.openFailed'), 5000);
    }
  }
}


