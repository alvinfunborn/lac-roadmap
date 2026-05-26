import { App, PluginSettingTab, Setting } from 'obsidian';
import RoadmapPlugin from '../../main';
import { RoadmapSettings } from '../../types';
import { t } from '../../i18n';

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

    // 说明与 TOML 示例（与 lifeflow 同款分区）
    containerEl.createEl('p', { text: t('settings.description'), cls: 'setting-item-description' });
    containerEl.createEl('p', { text: t('settings.tomlDescription'), cls: 'setting-item-description' });

    const tomlExample = `name = "Japan Trip"

[detail]
description = "Tokyo · Kyoto · Nara"
start_time = "2025-10-04"
end_time = "2025-10-09"
map_provider = "google"

[detail.address]
name = "Japan"

[[Ginza]]
start_time = "2025-10-04 11:00"
route = { travelMode = "walk", distance = 800, duration = 12, tolls = 0 }
[[Akihabara]]
start_time = "2025-10-04 15:00"`;
    containerEl.createEl('p', { text: t('settings.tomlExample'), cls: 'setting-item-description' });
    containerEl.createEl('pre', { text: tomlExample, cls: 'setting-item-description' });

    containerEl.createEl('p', { text: t('settings.usage'), cls: 'setting-item-description' });
    containerEl.createEl('ul', { cls: 'setting-item-description' }, (ul) => {
      ul.createEl('li', { text: t('settings.usage.openView') });
      ul.createEl('li', { text: t('settings.usage.dataFormat') });
      ul.createEl('li', { text: t('settings.usage.mapFeature') });
    });

    // 入口文件
    new Setting(containerEl)
      .setName(t('settings.entryFile.name'))
      .setDesc(t('settings.entryFile.desc'))
      .addText((text) => text
        .setPlaceholder('LaC/Roadmap/roadmap.md')
        .setValue(this.plugin.settings.entryFile || 'LaC/Roadmap/roadmap.md')
        .onChange(async (value) => {
          this.plugin.settings.entryFile = value?.trim() || 'LaC/Roadmap/roadmap.md';
          await this.plugin.saveSettings();
        }));

    // 语言
    new Setting(containerEl)
      .setName(t('settings.locale.name'))
      .setDesc(t('settings.locale.desc'))
      .addDropdown((dropdown) => dropdown
        .addOption('auto', t('settings.locale.option.auto'))
        .addOption('zh', '中文')
        .addOption('en', 'English')
        .setValue(this.plugin.settings.locale || 'auto')
        .onChange(async (value) => {
          this.plugin.settings.locale = value as RoadmapSettings['locale'];
          await this.plugin.saveSettings();
          // 重渲染让设置页文本立即跟新语言
          this.display();
        }));

    // 地图分区
    containerEl.createEl('h3', { text: t('settings.map.title') });

    new Setting(containerEl)
      .setName(t('settings.map.provider.name'))
      .setDesc(t('settings.map.provider.desc'))
      .addDropdown((dropdown) => dropdown
        .addOption('none', t('settings.map.provider.option.none'))
        .addOption('gaode', t('settings.map.provider.option.gaode'))
        .addOption('google', t('settings.map.provider.option.google'))
        .setValue(this.plugin.settings.mapApiProvider || 'none')
        .onChange(async (value) => {
          const next = (['none', 'google', 'gaode'].includes(value) ? value : 'none') as MapApiProvider;
          this.plugin.settings.mapApiProvider = next;
          await this.plugin.saveSettings();
          this.display();
        }));

    if (this.plugin.settings.mapApiProvider === 'google') {
      new Setting(containerEl)
        .setName(t('settings.map.googleKey.name'))
        .setDesc(t('settings.map.googleKey.desc'))
        .addText((text) => text
          .setPlaceholder(t('settings.map.googleKey.placeholder'))
          .setValue(this.plugin.settings.googleMapsApiKey || '')
          .onChange(async (value) => {
            this.plugin.settings.googleMapsApiKey = value?.trim() || '';
            await this.plugin.saveSettings();
          }));
    }

    if (this.plugin.settings.mapApiProvider === 'gaode') {
      // 高德两把 Key 不是冗余 —— 一个 Key 在控制台只能绑一种服务平台，
      // 渲染（JS API）与搜索/静态图（Web 服务）必须各开一个。
      new Setting(containerEl)
        .setName('高德 Web 端 (JS API) Key')
        .setDesc('地图渲染用，控制台「服务平台」选 Web端(JS API)')
        .addText((text) => text
          .setPlaceholder(t('settings.map.gaodeKey.placeholder'))
          .setValue(this.plugin.settings.gaodeJsApiKey || '')
          .onChange(async (value) => {
            this.plugin.settings.gaodeJsApiKey = value?.trim() || '';
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName(t('settings.map.gaodeKey.name'))
        .setDesc(t('settings.map.gaodeKey.desc'))
        .addText((text) => text
          .setPlaceholder(t('settings.map.gaodeKey.placeholder'))
          .setValue(this.plugin.settings.gaodeWebServiceKey || '')
          .onChange(async (value) => {
            this.plugin.settings.gaodeWebServiceKey = value?.trim() || '';
            await this.plugin.saveSettings();
          }));
    }
  }
}
