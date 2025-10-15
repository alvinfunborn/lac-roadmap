import { App, TFile, Notice } from 'obsidian';
import * as TOML from 'toml';
import * as TOMLStringify from 'tomlify-j0.4';
import { Roadmap, Place, RouteSegment } from '../types/roadmap';

export class RoadmapRepository {
  private app: App;
  private rootFilePath: string;

  constructor(app: App, rootFilePath: string) {
    this.app = app;
    this.rootFilePath = rootFilePath;
  }

  getRootPath(): string { return this.rootFilePath; }

  async isValidEntry(): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(this.rootFilePath);
    if (!file || !(file instanceof TFile)) return false;
    try {
      const content = await this.app.vault.read(file);
      const header = this.extractTomlHeader(content);
      const parsed = this.parseToml(header) || {};
      const typeVal = String((parsed as any)['type'] ?? '').toLowerCase();
      let renders: any = (parsed as any)['renders'];
      if (!Array.isArray(renders)) renders = typeof renders === 'string' ? [renders] : [];
      const hasRoadmapSet = (renders as any[]).map(v => String(v).toLowerCase()).some(s => s.includes('roadmapset'));
      return typeVal === 'root' && hasRoadmapSet;
    } catch (_) {
      return false;
    }
  }

  async loadRoadmapSet(): Promise<string[]> {
    const rootFile = this.app.vault.getAbstractFileByPath(this.rootFilePath);
    if (!rootFile || !(rootFile instanceof TFile)) return [];
    const content = await this.app.vault.read(rootFile);
    const matches = content.match(/\[\[[^\]]+\]\]/g) || [];
    return matches.map(m => m.replace(/^\[\[|\]\]$/g, '')).map(s => s.split('|')[0]?.trim()).filter(Boolean) as string[];
  }

  async loadRoadmap(filePath: string): Promise<Roadmap | null> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) return null;
    const content = await this.app.vault.read(file);
    
    console.log(`[RoadmapRepository] Loading roadmap from: ${filePath}`);
    console.log(`[RoadmapRepository] File content:`, content);
    
    // 使用修复后的 quoteWikilinksForToml 方法
    const quotedContent = this.quoteWikilinksForToml(content);
    console.log(`[RoadmapRepository] Quoted content:`, quotedContent);
    
    const parsedData = this.parseToml(quotedContent);
    console.log(`[RoadmapRepository] Parsed TOML data:`, parsedData);
    
    const { name, detail } = parsedData;
    console.log(`[RoadmapRepository] Extracted name: ${name}, detail:`, detail);
    
    const items: Array<Place | RouteSegment> = [];
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const m = line.match(/^\[\[([^\]]+)\]\]/);
      if (m) {
        const linkTarget = m[1].split('|')[0].trim();
        const dest = this.app.metadataCache.getFirstLinkpathDest(linkTarget, filePath);
        if (dest && dest instanceof TFile) {
          try {
            const pContent = await this.app.vault.read(dest);
            console.log(`[RoadmapRepository] Loading place file: ${dest.path}`);
            console.log(`[RoadmapRepository] Place content:`, pContent);
            
            const quotedPlaceContent = this.quoteWikilinksForToml(pContent);
            console.log(`[RoadmapRepository] Quoted place content:`, quotedPlaceContent);
            
            const pData = this.parseToml(quotedPlaceContent) || {};
            console.log(`[RoadmapRepository] Parsed place data:`, pData);
            
            const place: Place = {
              id: dest.basename,
              name: pData.name || linkTarget,
              detail: pData.detail || {}
            };
            console.log(`[RoadmapRepository] Created place:`, place);
            items.push(place);
            // 尝试读取下一行是否为 route = {...}
            if (i + 1 < lines.length) {
              const next = lines[i + 1].trim();
              const r = next.match(/^route\s*=\s*\{([^}]*)\}/);
              if (r) {
                const kv = r[1];
                const seg: any = {};
                kv.split(',').forEach(pair => {
                  const [k, v] = pair.split('=').map(s => s.trim());
                  if (!k) return;
                  if (k === 'travelMode') seg.travelMode = String(v).replace(/^"|"$/g, '');
                  else if (['distance', 'duration', 'tolls'].includes(k)) seg[k] = Number(String(v).replace(/[^0-9.-]/g, ''));
                });
                if (seg.travelMode) items.push(seg as RouteSegment);
              }
            }
          } catch (_) {}
        }
      }
    }
    return { id: (file as TFile).basename, name: name || (file as TFile).basename, detail, items } as Roadmap;
  }

  // 创建路线文件并返回其路径
  async createRoadmapFile(folderPath: string, name: string, detail?: any): Promise<string> {
    const filePath = `${folderPath}/${name}.md`;
    const headerObj: any = { name };
    if (detail && typeof detail === 'object') headerObj.detail = detail;
    const content = this.stringifyToml(headerObj) + '\n';
    const exists = this.app.vault.getAbstractFileByPath(filePath);
    if (exists && exists instanceof TFile) {
      await this.app.vault.modify(exists, content);
    } else {
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) await this.app.vault.createFolder(folderPath);
      await this.app.vault.create(filePath, content);
    }
    return filePath;
  }

  // 将路线加入集合根文件
  async addRoadmapToSet(roadmapId: string): Promise<void> {
    const ids = await this.loadRoadmapSet();
    if (ids.includes(roadmapId)) return;
    await this.updateRootFile([...ids, roadmapId]);
  }

  // 保存（创建或更新）地点文件（使用纯 TOML 重写，保留字段语义）
  async savePlaceFile(folderPath: string, place: Place): Promise<TFile> {
    const fileName = `${place.id || place.name}.md`;
    const filePath = `${folderPath}/${fileName}`;
    let target: TFile | null = null;
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    const toml = this.placeToToml(place);
    if (existing && existing instanceof TFile) {
      await this.app.vault.modify(existing, toml);
      target = existing;
    } else {
      // 确保文件夹存在
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) await this.app.vault.createFolder(folderPath);
      await this.app.vault.create(filePath, toml);
      target = this.app.vault.getAbstractFileByPath(filePath) as TFile;
    }
    return target;
  }

  // 重写某条路线文件的条目顺序（[[Place]] 与紧随的 route 行）
  async updateRoadmapItems(filePath: string, name: string, detail: any, items: Array<Place | RouteSegment>): Promise<void> {
    const headerObj: any = { name };
    if (detail && typeof detail === 'object') headerObj.detail = detail;
    const headerToml = this.stringifyToml(headerObj);
    const bodyLines: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i] as any;
      if (it && typeof it === 'object' && 'name' in it) {
        const id = (it as Place).id || (it as Place).name;
        bodyLines.push(`[[${id}]]`);
        // 如果下一项是段落，则输出 route 行
        const next = items[i + 1] as any;
        if (next && !('name' in next) && next.travelMode) {
          const seg = next as RouteSegment;
          const kv: string[] = [`travelMode = "${seg.travelMode}"`];
          if (typeof seg.distance === 'number') kv.push(`distance = ${seg.distance}`);
          if (typeof seg.duration === 'number') kv.push(`duration = ${seg.duration}`);
          if (typeof seg.tolls === 'number') kv.push(`tolls = ${seg.tolls}`);
          bodyLines.push(`route = { ${kv.join(', ')} }`);
          i++; // 跳过该段
        }
      }
    }
    const finalContent = `${headerToml}\n${bodyLines.join('\n')}${bodyLines.length ? '\n' : ''}`;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file && file instanceof TFile) await this.app.vault.modify(file, finalContent); else await this.app.vault.create(filePath, finalContent);
  }

  // 工具：Place -> TOML 文本
  private placeToToml(place: Place): string {
    const obj: any = { name: place.name || place.id || 'Untitled' };
    if (place.detail) obj.detail = { ...place.detail };
    return this.stringifyToml(obj);
  }

  async updateRootFile(roadmapIds: string[]): Promise<void> {
    const rootPath = this.rootFilePath;
    let rootContent = '';
    try {
      const rootFile = this.app.vault.getAbstractFileByPath(rootPath);
      if (rootFile && rootFile instanceof TFile) {
        rootContent = await this.app.vault.read(rootFile);
      }
    } catch (_) {}
    // 使用简单策略：清理旧的 [[...]]，追加新的（保留顶部 TOML 头部）
    const header = this.extractTomlHeader(rootContent);
    const rest = rootContent.slice(header.length);
    const cleaned = rest.replace(/\[\[[^\]]+\]\]\s*/g, '');
    const links = roadmapIds.map(id => `[[${id}]]`).join('\n');
    const finalContent = header + (header && !header.endsWith('\n') ? '\n' : '') + cleaned + (cleaned && !cleaned.endsWith('\n') ? '\n' : '') + links + '\n';
    const existingRoot = this.app.vault.getAbstractFileByPath(rootPath);
    if (existingRoot && existingRoot instanceof TFile) await this.app.vault.modify(existingRoot, finalContent); else await this.app.vault.create(rootPath, finalContent);
  }

  // 工具
  private extractTomlHeader(content: string): string {
    const lines = (content || '').split(/\r?\n/);
    const out: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('[[')) break;
      out.push(line);
    }
    return out.join('\n');
  }

  private parseToml(content: string): any {
    try {
      const normalized = (content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      return TOML.parse(normalized);
    } catch (_) { return {}; }
  }

  // 生成稳定 TOML 文本（扁平 + section）
  private stringifyToml(obj: any): string {
    try {
      return TOMLStringify.toToml(obj);
    } catch (_) {
      // 回退极简渲染
      const lines: string[] = [];
      if (obj && typeof obj === 'object') {
        if (obj.name) lines.push(`name = "${String(obj.name).replace(/"/g, '\\"')}"`);
        Object.keys(obj).forEach(k => {
          if (k === 'name') return;
          const v = (obj as any)[k];
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            lines.push('');
            lines.push(`[${k}]`);
            Object.keys(v).forEach(sk => {
              const sv = (v as any)[sk];
              if (typeof sv === 'number') lines.push(`${sk} = ${sv}`);
              else lines.push(`${sk} = "${String(sv ?? '').replace(/"/g, '\\"')}"`);
            });
          }
        });
      }
      return lines.join('\n') + '\n';
    }
  }

  private quoteWikilinksForToml(content: string): string {
    const normalized = (content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normalized.replace(/\[\[([^\]]+)\]\]/g, (match: string, linkText: string) => {
      // 将 [[xxx]] 转换成 [["xxx"]]
      return `[["${linkText}"]]`;
    });
  }
}


