import { App, PluginSettingTab, Setting } from 'obsidian';
import RoadmapPlugin from '../../main';
import { RoadmapSettings } from '../../types';

type MapApiProvider = RoadmapSettings['mapApiProvider'];

export class RoadmapSettingTab extends PluginSettingTab {
  plugin: RoadmapPlugin;
  constructor(app: App, plugin: RoadmapPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Entry File')
      .setDesc('Root file for roadmap set')
      .addText((text) => {
        text.setPlaceholder('LaC/Roadmap/roadmap.md')
          .setValue(this.plugin.settings.entryFile)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ entryFile: value });
          });
      });

    new Setting(containerEl)
      .setName('Enable Context Menu')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enableContextMenu)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ enableContextMenu: value });
          });
      });

    new Setting(containerEl)
      .setName('Always Separate Place Schedule')
      .setDesc('编辑地点时，将 start_time/end_time 写入路线文件（覆盖行），而非地点 .md 本身。便于跨路线复用地点。')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.alwaysSeparatePlaceSchedule !== false)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ alwaysSeparatePlaceSchedule: value });
          });
      });

    new Setting(containerEl)
      .setName('Map Provider')
      .addDropdown((dd) => {
        dd.addOption('none', 'None');
        dd.addOption('google', 'Google Map');
        dd.addOption('gaode', '高德地图');
        dd.setValue(this.plugin.settings.mapApiProvider)
          .onChange(async (value) => {
            const next = (['none', 'google', 'gaode'].includes(value) ? value : 'none') as MapApiProvider;
            await this.plugin.updateSettings({ mapApiProvider: next });
            this.display();
          });
      });

    if (this.plugin.settings.mapApiProvider === 'google') {
      new Setting(containerEl)
        .setName('Google Maps API Key')
        .addText((text) => {
          text.setPlaceholder('AIza...')
            .setValue(this.plugin.settings.googleMapsApiKey || '')
            .onChange(async (value) => {
              await this.plugin.updateSettings({ googleMapsApiKey: value });
            });
        });
    }

    if (this.plugin.settings.mapApiProvider === 'gaode') {
      const gaodeDesc = containerEl.createDiv({ cls: 'setting-item-description' });
      gaodeDesc.setText('高德控制台一个 Key 只能选一个服务平台，需同时用地图与搜索/静态图时请创建两个 Key 分别填下面两项。');
      gaodeDesc.style.marginBottom = '8px';

      new Setting(containerEl)
        .setName('高德 Web 端(JS API) Key')
        .setDesc('地图展示用，控制台服务平台选「Web端(JS API)」')
        .addText((text) => {
          text.setPlaceholder('地图展示用')
            .setValue(this.plugin.settings.gaodeJsApiKey || '')
            .onChange(async (value) => {
              await this.plugin.updateSettings({ gaodeJsApiKey: value });
            });
        });

      new Setting(containerEl)
        .setName('高德 Web 服务 Key')
        .setDesc('搜索/静态图/坐标转换用，控制台服务平台选「Web服务」')
        .addText((text) => {
          text.setPlaceholder('搜索/静态图用')
            .setValue(this.plugin.settings.gaodeWebServiceKey || '')
            .onChange(async (value) => {
              await this.plugin.updateSettings({ gaodeWebServiceKey: value });
            });
        });
    }
  }
}


