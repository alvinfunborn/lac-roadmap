import { App, TFile, Notice } from 'obsidian';
import * as TOML from 'toml';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TOMLStringify: { toToml: (obj: unknown) => string } = require('tomlify-j0.4');
import { Roadmap, Place, RouteSegment, computeRoadmapEndpoints } from '../types/roadmap';

/** 解析后的 TOML 头部（路线 / 地点 / 根文件共用，字段都可缺省） */
interface ParsedTomlHeader {
  type?: string;
  renders?: string | string[];
  name?: string;
  detail?: Record<string, any>;
  [key: string]: unknown;
}

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
      const parsed = this.parseToml(header);
      const typeVal = String(parsed.type ?? '').toLowerCase();
      const renders = this.normalizeRenders(parsed.renders);
      const hasRoadmapSet = renders.some(s => s.includes('roadmapset'));
      return typeVal === 'root' && hasRoadmapSet;
    } catch (e) {
      console.warn('[RoadmapRepository] isValidEntry failed', e);
      return false;
    }
  }

  /**
   * 检查某个被父路线以 [[...]] 引用的文件是否是「子路线」（应作为 roadmap 打开，
   * 而非地点编辑器）。
   *
   * 判定（满足其一即可）：
   *   1) 显式标识：`type = "root"` 且 renders 含 "roadmap" —— 由 saveSubRoadmapFile
   *      写入、并在后续重写中保留（见 updateRoadmapItems / updateRoadmapMeta）。
   *   2) 结构判定：文件正文里至少有一行独立的 [[wikilink]] 地点引用 —— 一个普通
   *      地点文件只有 TOML 头部，绝不会列出 [[...]] 子项；含子项的必然是嵌套
   *      路线。这样即便旧文件丢了标识（早期重写会抹掉 type/renders），只要它有
   *      地点就仍能被正确识别为子路线，不必改动文件本身。
   */
  async isSubRoadmapEntry(filePath: string): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) return false;
    try {
      const content = await this.app.vault.read(file);
      const header = this.extractTomlHeader(content);
      const parsed = this.parseToml(header);
      const typeVal = String(parsed.type ?? '').toLowerCase();
      const renders = this.normalizeRenders(parsed.renders);
      const hasRoadmap = renders.some(s => s.includes('roadmap'));
      if (typeVal === 'root' && hasRoadmap) return true;
      // 结构兜底：正文存在独立的 [[...]] 行（与 loadRoadmap 解析 item 的口径一致）。
      const body = content.slice(header.length);
      if (/^\s*\[\[[^\]]+\]\]/m.test(body)) return true;
      return false;
    } catch (e) {
      console.warn('[RoadmapRepository] isSubRoadmapEntry failed', e);
      return false;
    }
  }

  /**
   * 读取既有文件头部中的「路线标识」字段（type / renders），用于在重写时原样
   * 保留。普通地点文件没有这些字段，返回空对象，不会被误加标识。
   */
  private async readPreservedMarkers(filePath: string): Promise<{ type?: unknown; renders?: unknown }> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) return {};
    try {
      const content = await this.app.vault.read(file);
      const parsed = this.parseToml(this.extractTomlHeader(content));
      const out: { type?: unknown; renders?: unknown } = {};
      if (parsed.type !== undefined) out.type = parsed.type;
      if (parsed.renders !== undefined) out.renders = parsed.renders;
      return out;
    } catch (e) {
      console.warn('[RoadmapRepository] readPreservedMarkers failed', e);
      return {};
    }
  }

  private normalizeRenders(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(v => String(v).toLowerCase());
    if (typeof value === 'string') return [value.toLowerCase()];
    return [];
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

    const header = this.extractTomlHeader(content);
    const parsedData = this.parseToml(header);
    const { name, detail } = parsedData;

    const items: Array<Place | RouteSegment> = [];
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const m = line.match(/^\[\[([^\]]+)\]\]/);
      if (m) {
        const linkTarget = m[1].split('|')[0].trim();
        let dest = this.app.metadataCache.getFirstLinkpathDest(linkTarget, filePath);
        if (!dest) {
          // metadataCache 是异步索引的：刚 savePlaceFile 新建地点后立即 loadRoadmap
          // 时，缓存可能还没收录这个文件，getFirstLinkpathDest 返回 null，导致新加的
          // 地点被整条跳过、保存后看不见。回退到按「与 trip 同目录的同名 .md」直接查
          // —— savePlaceFile 总把地点写在该目录，且 getAbstractFileByPath 在 create
          // 完成后即同步可见，能绕开这个竞态。
          const folder = filePath.split('/').slice(0, -1).join('/');
          const guess = folder ? `${folder}/${linkTarget}.md` : `${linkTarget}.md`;
          const byPath = this.app.vault.getAbstractFileByPath(guess);
          if (byPath instanceof TFile) dest = byPath;
        }
        if (dest && dest instanceof TFile) {
          try {
            const pContent = await this.app.vault.read(dest);
            const placeHeader = this.extractTomlHeader(pContent);
            const pData = this.parseToml(placeHeader) || {};

            const place: Place = {
              id: dest.basename,
              name: pData.name || linkTarget,
              detail: pData.detail || {}
            };
            // start_time / end_time 是 per-trip 字段（架构约定写在 trip 文件
            // 的 [[wikilink]] 覆盖行里，不污染 place 文件）。这里先把可能残留
            // 在 place 文件 detail 里的旧字段抹掉，再单独应用 trip 覆盖 ——
            // 否则在 trip 文件清掉覆盖（如长按日期 tab 的 clear）后，旧的
            // place-file 值会"重新冒出来"，造成日期看着没被清掉的假象。
            delete place.detail.start_time;
            delete place.detail.end_time;
            // 覆盖：若 roadmap 文档中紧随该 wikilink 行包含 start_time / end_time，则写入 place.detail
            if (i + 1 < lines.length) {
              const lookahead: string[] = [];
              for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
                const t = lines[j].trim();
                if (t.startsWith('[[')) break; // 下一个地点开始
                if (!t) continue; // 跳过空行继续向下看
                lookahead.push(t);
              }
              for (const la of lookahead) {
                const ms = la.match(/^start_time\s*=\s*"([^"]+)"/);
                if (ms) place.detail.start_time = ms[1];
                const me = la.match(/^end_time\s*=\s*"([^"]+)"/);
                if (me) place.detail.end_time = me[1];
                // 若遇到 route 行也停止继续向下看
                if (/^route\s*=\s*\{/.test(la)) break;
              }
            }
            items.push(place);
            // 尝试读取后续行是否为 route = {...}（跳过空行和 time 覆盖行）
            for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
              const next = lines[j].trim();
              if (!next) continue; // 跳过空行
              if (/^(start_time|end_time)\s*=/.test(next)) continue; // 跳过时间覆盖行
              if (next.startsWith('[[')) break; // 下一个地点
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
              break; // 非空非时间覆盖行处理完毕
            }
          } catch (e) {
            console.warn(`[RoadmapRepository] Failed to load place: ${linkTarget}`, e);
          }
        }
      }
    }
    // Compute startPoint / endPoint — first / last geocoded place in the
    // trip. Used by the parent roadmap when this file is referenced as a
    // sub-roadmap "place": route-segment calculation prefers the trip's
    // entry/exit points over the wide trip-level address (e.g. "厦门"
    // is a region; the first place is what you actually drive to).
    const { start, end } = computeRoadmapEndpoints(items);

    // Derive trip-level start_time / end_time from dated places. The TOML
    // header value is treated as a stale cache — every consumer (header
    // daterange, roadmapset sorting, stats) reads through this derivation
    // so changes via tab clear / drag / long-press auto-reflect without
    // an extra "rewrite the header" step on every place-date mutation.
    // Places whose date includes time-of-day (HH:MM:SS) get truncated to
    // the date part here; the per-place time is still kept on the place.
    const derivedDetail = { ...(detail || {}) };
    let earliest: string | undefined;
    let latest: string | undefined;
    for (const it of items) {
      if (!it || typeof it !== 'object' || !('detail' in it)) continue;
      const st = (it as Place).detail?.start_time;
      if (!st) continue;
      const date = String(st).slice(0, 10);
      if (!earliest || date < earliest) earliest = date;
      if (!latest || date > latest) latest = date;
    }
    // 派生覆盖头部缓存的规则：
    //   有地点带日期    → 用派生的最早/最晚日期覆盖（单一事实源）。
    //   没有任何带日期的地点 → 保留头部里手填/继承的「计划日期」。无论是完全没地点，
    //                    还是地点都还没排日期，都不抹掉计划日期 —— 否则一条「已定
    //                    日期、地点还没排期」的（子）路线会丢日期，加地点也无从继承。
    //                    需要清空计划日期时走 meta 编辑器（saveMetaEditor 显式删除）。
    if (earliest) derivedDetail.start_time = earliest;
    if (latest) derivedDetail.end_time = latest;

    return {
      id: (file as TFile).basename,
      name: name || (file as TFile).basename,
      detail: derivedDetail,
      items,
      startPoint: start,
      endPoint: end,
    } as Roadmap;
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

  /**
   * 创建嵌套子路线文件 — 用户在父路线中"添加地点"时选择 trip 选项走这条路径。
   * 写入的文件带 `type = "root"` + `renders = ["roadmap"]` header，配合 detail 字段，
   * body 留空（用户进入该子路线详情页后再添加 places）。
   * 文件命名为 `{name}.md`；若已存在同名文件，返回该 TFile 不覆盖。
   */
  async saveSubRoadmapFile(folderPath: string, name: string, detail: any): Promise<TFile> {
    const fileName = `${name}.md`;
    const filePath = `${folderPath}/${fileName}`;
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing && existing instanceof TFile) return existing;

    // Header order matches the design draft (docs/draft.md): `name` first,
    // then the marker pair, then `[detail]` table — so the file reads as a
    // proper roadmap-typed note when opened directly.
    const headerObj: any = {
      name,
      type: 'root',
      renders: ['roadmap'],
    };
    if (detail && typeof detail === 'object') headerObj.detail = detail;
    const headerToml = this.stringifyToml(headerObj);

    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) await this.app.vault.createFolder(folderPath);
    await this.app.vault.create(filePath, headerToml + '\n');
    return this.app.vault.getAbstractFileByPath(filePath) as TFile;
  }

  /**
   * 仅更新路线文件的 TOML header（name + detail），保留 body（[[...]] 与 route = {...} 行）。
   * 若文件不存在，则作为新建文件写入（仅 header）。
   */
  async updateRoadmapMeta(filePath: string, name: string, detail: any): Promise<void> {
    const headerObj: any = { name };
    // 同 updateRoadmapItems：保留子路线标识，避免改名/改描述时把 type/renders 抹掉。
    const markers = await this.readPreservedMarkers(filePath);
    if (markers.type !== undefined) headerObj.type = markers.type;
    if (markers.renders !== undefined) headerObj.renders = markers.renders;
    if (detail && typeof detail === 'object') headerObj.detail = detail;
    const headerToml = this.stringifyToml(headerObj);

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      await this.app.vault.create(filePath, headerToml + '\n');
      return;
    }
    const original = await this.app.vault.read(file);
    const oldHeader = this.extractTomlHeader(original);
    // body 起始位置：保留 oldHeader 之后的全部字节（包括首个 [[...]] 及其以后）
    const body = original.slice(oldHeader.length);
    const headerClean = headerToml.replace(/\s+$/g, '');
    // 在 header 与 body 之间保证有一个换行分隔
    let glue = '\n';
    if (body.startsWith('\n')) glue = '';
    const finalContent = headerClean + glue + body;
    await this.app.vault.modify(file, finalContent);
  }

  /**
   * 更新/插入/删除地点后的单条 route segment（placeIndex 指向 Place 在 items 数组中的位置）
   * 传入的 segment 为 null 时删除。仅影响目标 route 行，不动其它 items。
   */
  async updateRouteSegment(
    filePath: string,
    placeIndex: number,
    segment: RouteSegment | null,
  ): Promise<void> {
    const data = await this.loadRoadmap(filePath);
    if (!data) return;
    const items = [...data.items];
    const place = items[placeIndex];
    if (!place || !('name' in place)) return;
    const nextIdx = placeIndex + 1;
    const next = items[nextIdx];
    const hasRoute = next && typeof next === 'object' && !('name' in next) && (next as RouteSegment).travelMode;
    if (segment) {
      if (hasRoute) items[nextIdx] = segment;
      else items.splice(nextIdx, 0, segment);
    } else if (hasRoute) {
      items.splice(nextIdx, 1);
    }
    await this.updateRoadmapItems(filePath, data.name, data.detail || {}, items);
  }

  // 重写某条路线文件的条目顺序（[[Place]] + 可选 start_time/end_time 覆盖 + 可选 route 行）
  //
  // 关键：
  //  1) per-place 的 start_time/end_time（来自 place.detail）必须以"覆盖行"形式
  //     落在 [[Place]] 之后、route 之前，否则下次重写会把这些时间丢光。
  //  2) 写之前对 (Place, 紧随的 route) 配对做 canonical 排序：有 start_time 的
  //     按时间戳升序；只有 detail.days 的按 days 升序；两者都没有的（wishlist）
  //     落到最后。stable sort 保留同层内的相对顺序，让用户手动微调不被打乱。
  //     这样无论文件之前怎么乱，保存一次就归到正确顺序，wishlist 永远在尾巴。
  async updateRoadmapItems(filePath: string, name: string, detail: any, items: Array<Place | RouteSegment>): Promise<void> {
    const headerObj: any = { name };
    // 保留子路线标识（type = "root" / renders）。只从 name+detail 重建会把它们
    // 悄悄丢掉，使一条子路线在被编辑后退化成普通地点（点击 → 地点编辑器）。
    const markers = await this.readPreservedMarkers(filePath);
    if (markers.type !== undefined) headerObj.type = markers.type;
    if (markers.renders !== undefined) headerObj.renders = markers.renders;
    if (detail && typeof detail === 'object') headerObj.detail = detail;
    const headerToml = this.stringifyToml(headerObj);
    const escape = (s: string) => String(s).replace(/"/g, '\\"');

    // 把 items 切成 (place, 可选紧随 route) 的 block，做规范化排序
    interface Block { place: Place; route?: RouteSegment }
    const blocks: Block[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it && typeof it === 'object' && 'name' in it) {
        const p = it as Place;
        const next = items[i + 1];
        if (next && !('name' in next) && (next as RouteSegment).travelMode) {
          blocks.push({ place: p, route: next as RouteSegment });
          i++;
        } else {
          blocks.push({ place: p });
        }
      }
    }
    // 排序 key：[tier, sub]。tier 越小越靠前。
    // tier=0 已排日期 → sub = 时间戳；tier=1 显式 days → sub = days；tier=2 wishlist。
    const rank = (p: Place): [number, number] => {
      const start = p.detail?.start_time;
      if (start) {
        const t = new Date(String(start).replace(' ', 'T')).getTime();
        if (!isNaN(t)) return [0, t];
      }
      const days = p.detail?.days;
      if (days != null) return [1, days];
      return [2, 0];
    };
    // Array.prototype.sort 在 V8 是 stable —— 同 rank 的 block 保留原相对位置
    blocks.sort((a, b) => {
      const [ra, va] = rank(a.place);
      const [rb, vb] = rank(b.place);
      return ra - rb || va - vb;
    });

    const bodyLines: string[] = [];
    for (const block of blocks) {
      const { place, route } = block;
      const id = place.id || place.name;
      bodyLines.push(`[[${id}]]`);
      const st = place.detail?.start_time;
      const et = place.detail?.end_time;
      if (st) bodyLines.push(`start_time = "${escape(st)}"`);
      if (et) bodyLines.push(`end_time = "${escape(et)}"`);
      if (route) {
        const kv: string[] = [`travelMode = "${route.travelMode}"`];
        if (typeof route.distance === 'number') kv.push(`distance = ${route.distance}`);
        if (typeof route.duration === 'number') kv.push(`duration = ${route.duration}`);
        if (typeof route.tolls === 'number') kv.push(`tolls = ${route.tolls}`);
        bodyLines.push(`route = { ${kv.join(', ')} }`);
      }
    }
    const finalContent = `${headerToml}\n${bodyLines.join('\n')}${bodyLines.length ? '\n' : ''}`;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file && file instanceof TFile) await this.app.vault.modify(file, finalContent); else await this.app.vault.create(filePath, finalContent);
  }

  /**
   * 仅更新地点文件（.md）本体的 TOML header 中的"通用字段"：name、description、address
   * 不修改 start_time / end_time（这些属于路线专属的时间覆盖，写入路线文件）
   */
  async updatePlaceGeneric(
    placePath: string,
    fields: { name?: string; description?: string; address?: any },
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(placePath);
    if (!file || !(file instanceof TFile)) return;
    const original = await this.app.vault.read(file);
    const oldHeader = this.extractTomlHeader(original);
    const parsed = this.parseToml(oldHeader) || {};
    // 合并
    if (typeof fields.name === 'string') parsed.name = fields.name;
    parsed.detail = parsed.detail || {};
    if (fields.description !== undefined) {
      if (fields.description) parsed.detail.description = fields.description;
      else delete parsed.detail.description;
    }
    if (fields.address !== undefined) {
      if (fields.address) parsed.detail.address = fields.address;
      else delete parsed.detail.address;
    }
    const newHeader = this.stringifyToml(parsed);
    const body = original.slice(oldHeader.length);
    const headerClean = newHeader.replace(/\s+$/g, '');
    const glue = body.startsWith('\n') ? '' : '\n';
    await this.app.vault.modify(file, headerClean + glue + body);
  }

  /**
   * 在路线文件中，为某个地点 wikilink 行后插入/替换"时间覆盖"行（start_time=/end_time=）
   * - 若对应行已存在则替换
   * - 若不存在则插入在 [[PlaceName]] 之后（route 行之前）
   * - 若传入 null 则删除对应覆盖行
   */
  async updatePlaceScheduleInRoadmap(
    roadmapPath: string,
    placeName: string,
    times: { start_time?: string | null; end_time?: string | null },
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(roadmapPath);
    if (!file || !(file instanceof TFile)) return;
    const content = await this.app.vault.read(file);
    const lines = content.split(/\r?\n/);

    // 找到目标 wikilink 行
    let targetIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].trim().match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/);
      if (m && m[1].trim() === placeName) { targetIdx = i; break; }
    }
    if (targetIdx < 0) return;

    // 扫描后续行，直到下一个 [[...]] 或 route 行 —— 收集已有的 start_time/end_time 覆盖行索引
    const overrideIdx: { start?: number; end?: number } = {};
    let scanEnd = lines.length;
    for (let j = targetIdx + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t.startsWith('[[')) { scanEnd = j; break; }
      if (/^route\s*=/.test(t)) { scanEnd = j; break; }
      if (/^start_time\s*=\s*"/.test(t)) overrideIdx.start = j;
      else if (/^end_time\s*=\s*"/.test(t)) overrideIdx.end = j;
    }

    const applyOne = (
      key: 'start_time' | 'end_time',
      value: string | null | undefined,
      existingIdx: number | undefined,
    ) => {
      if (value === null) {
        // 删除
        if (existingIdx !== undefined) {
          lines.splice(existingIdx, 1);
          // 修正后续索引
          if (overrideIdx.start !== undefined && overrideIdx.start > existingIdx) overrideIdx.start--;
          if (overrideIdx.end !== undefined && overrideIdx.end > existingIdx) overrideIdx.end--;
          scanEnd--;
        }
      } else if (value !== undefined) {
        const newLine = `${key} = "${String(value).replace(/"/g, '\\"')}"`;
        if (existingIdx !== undefined) {
          lines[existingIdx] = newLine;
        } else {
          // 插入到 targetIdx+1 之后已有覆盖行的末尾（在 scanEnd 之前）
          let insertAt = targetIdx + 1;
          if (overrideIdx.start !== undefined) insertAt = Math.max(insertAt, overrideIdx.start + 1);
          if (overrideIdx.end !== undefined) insertAt = Math.max(insertAt, overrideIdx.end + 1);
          lines.splice(insertAt, 0, newLine);
          if (key === 'start_time') overrideIdx.start = insertAt;
          else overrideIdx.end = insertAt;
          if (overrideIdx.start !== undefined && overrideIdx.start >= insertAt && key !== 'start_time') overrideIdx.start++;
          if (overrideIdx.end !== undefined && overrideIdx.end >= insertAt && key !== 'end_time') overrideIdx.end++;
          scanEnd++;
        }
      }
    };

    applyOne('start_time', times.start_time, overrideIdx.start);
    applyOne('end_time', times.end_time, overrideIdx.end);

    await this.app.vault.modify(file, lines.join('\n'));
  }

  /**
   * 查找引用某地点名的所有路线文件路径（通过扫描同目录下的 .md 中的 [[placeName]]）
   */
  async findRoadmapsReferencingPlace(placeName: string): Promise<string[]> {
    const files = this.app.vault.getMarkdownFiles();
    const results: string[] = [];
    const pattern = new RegExp(`\\[\\[${placeName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(\\||\\])`);
    for (const f of files) {
      if (f.path === this.rootFilePath) continue;
      // 只考虑路线文件：排除 name === placeName 的地点文件本身
      if (f.basename === placeName) continue;
      try {
        const content = await this.app.vault.read(f);
        if (pattern.test(content)) results.push(f.path);
      } catch (e) { console.warn(`[RoadmapRepository] read file failed during reference scan: ${f.path}`, e); }
    }
    return results;
  }

  // 工具：Place -> TOML 文本
  private placeToToml(place: Place): string {
    const obj: any = { name: place.name || place.id || 'Untitled' };
    if (place.detail) {
      const detail: any = { ...place.detail };
      // per-trip 字段不写入 place 文件 —— start_time / end_time / days 都属于
      // 「这条 trip 里这一次安排」，写到 place 文件会污染跨 trip 复用的语义，
      // 也会让 trip 上的 clear 操作看起来失效（旧值从 place 文件复活）。
      delete detail.start_time;
      delete detail.end_time;
      delete detail.days;
      obj.detail = detail;
    }
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
    } catch (e) {
      console.warn('[RoadmapRepository] Failed to read root file', e);
    }
    // 使用简单策略：清理旧的 [[...]]，追加新的（保留顶部 TOML 头部）
    const header = this.extractTomlHeader(rootContent);
    const rest = rootContent.slice(header.length);
    const cleaned = rest.replace(/\[\[[^\]]+\]\]\s*/g, '');
    const links = roadmapIds.map(id => `[[${id}]]`).join('\n');
    const finalContent = header + (header && !header.endsWith('\n') ? '\n' : '') + cleaned + (cleaned && !cleaned.endsWith('\n') ? '\n' : '') + links + '\n';
    const existingRoot = this.app.vault.getAbstractFileByPath(rootPath);
    if (existingRoot && existingRoot instanceof TFile) await this.app.vault.modify(existingRoot, finalContent); else await this.app.vault.create(rootPath, finalContent);
  }

  /**
   * 提取 TOML 头部：收集所有行直到遇到独立的 [[wikilink]] 行。
   * 空行不会中断提取（TOML section 间允许空行），仅 [[...]] 行表示数据区开始。
   */
  private extractTomlHeader(content: string): string {
    const lines = (content || '').split(/\r?\n/);
    const out: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      // 仅独立的 [[...]] wikilink 行终止 header（不匹配 TOML 的 [section]）
      if (/^\[\[[^\]]+\]\]/.test(trimmed)) break;
      out.push(line);
    }
    return out.join('\n');
  }

  private parseToml(content: string): ParsedTomlHeader {
    try {
      const normalized = (content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      return (TOML.parse(normalized) || {}) as ParsedTomlHeader;
    } catch (e) {
      console.warn('[RoadmapRepository] TOML parse error', e);
      return {};
    }
  }

  // 生成稳定 TOML 文本（扁平 + section）
  private stringifyToml(obj: Record<string, unknown>): string {
    try {
      return TOMLStringify.toToml(obj);
    } catch (e) {
      console.warn('[RoadmapRepository] TOML stringify failed, using fallback', e);
      // 回退极简渲染
      const lines: string[] = [];
      if (obj && typeof obj === 'object') {
        if (obj.name) lines.push(`name = "${String(obj.name).replace(/"/g, '\\"')}"`);
        Object.keys(obj).forEach(k => {
          if (k === 'name') return;
          const v = obj[k];
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            lines.push('');
            lines.push(`[${k}]`);
            const subObj = v as Record<string, unknown>;
            Object.keys(subObj).forEach(sk => {
              const sv = subObj[sk];
              if (typeof sv === 'number') lines.push(`${sk} = ${sv}`);
              else lines.push(`${sk} = "${String(sv ?? '').replace(/"/g, '\\"')}"`);
            });
          }
        });
      }
      return lines.join('\n') + '\n';
    }
  }
}
