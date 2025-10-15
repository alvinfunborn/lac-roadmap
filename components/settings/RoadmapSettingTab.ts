import { App, PluginSettingTab, Setting } from 'obsidian';
import RoadmapPlugin from '../../main';

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
      .setName('Map Provider')
      .addDropdown((dd) => {
        dd.addOption('none', 'None');
        dd.addOption('google', 'Google Map');
        dd.addOption('gaode', '高德地图');
        dd.setValue(this.plugin.settings.mapApiProvider)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ mapApiProvider: value as any });
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
      new Setting(containerEl)
        .setName('Gaode Web Service Key')
        .addText((text) => {
          text.setPlaceholder('高德 Web 服务 Key')
            .setValue(this.plugin.settings.gaodeWebServiceKey || '')
            .onChange(async (value) => {
              await this.plugin.updateSettings({ gaodeWebServiceKey: value });
            });
        });
    }
  }
}


