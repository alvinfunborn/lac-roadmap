// Minimal Obsidian API mock — covers the surface used by RoadmapRepository
// and the page components in test contexts. Anything else throws so tests can
// catch unintended dependencies on Obsidian internals.

export class TFile {
  path: string;
  basename: string;
  extension: string;
  constructor(path: string) {
    this.path = path;
    const segs = path.split('/');
    const file = segs[segs.length - 1] || '';
    const dot = file.lastIndexOf('.');
    this.basename = dot > 0 ? file.slice(0, dot) : file;
    this.extension = dot > 0 ? file.slice(dot + 1) : '';
  }
}

export class TFolder {
  path: string;
  constructor(path: string) { this.path = path; }
}

export type Vault = ReturnType<typeof createVault>;

export function createVault() {
  const files = new Map<string, { file: TFile; content: string }>();
  const folders = new Set<string>();
  return {
    files,
    folders,
    getAbstractFileByPath(p: string): TFile | TFolder | null {
      if (folders.has(p)) return new TFolder(p);
      const entry = files.get(p);
      return entry ? entry.file : null;
    },
    async read(file: TFile): Promise<string> {
      const entry = files.get(file.path);
      if (!entry) throw new Error(`File not in mock vault: ${file.path}`);
      return entry.content;
    },
    async modify(file: TFile, content: string): Promise<void> {
      const entry = files.get(file.path);
      if (entry) entry.content = content;
      else files.set(file.path, { file, content });
    },
    async create(p: string, content: string): Promise<TFile> {
      const file = new TFile(p);
      files.set(p, { file, content });
      return file;
    },
    async createFolder(p: string): Promise<void> { folders.add(p); },
    getMarkdownFiles(): TFile[] {
      const out: TFile[] = [];
      for (const { file } of files.values()) {
        if (file.extension === 'md') out.push(file);
      }
      return out;
    },
  };
}

export type MetadataCache = ReturnType<typeof createMetadataCache>;

export function createMetadataCache(vault: ReturnType<typeof createVault>) {
  return {
    /** Resolve a Wikilink path: we look up `${linkpath}.md` or any file whose basename matches. */
    getFirstLinkpathDest(linkpath: string, _sourcePath: string): TFile | null {
      const direct = vault.files.get(`${linkpath}.md`);
      if (direct) return direct.file;
      for (const { file } of vault.files.values()) {
        if (file.basename === linkpath) return file;
      }
      return null;
    },
    resolvedLinks: {} as Record<string, Record<string, number>>,
  };
}

export interface WorkspaceLeafLike {
  setViewState: (state: any) => Promise<void>;
  getViewState: () => any;
  history?: { back: () => void };
}

export type App = {
  vault: Vault;
  metadataCache: MetadataCache;
  fileManager: { trashFile: (file: TFile) => Promise<void>; renameFile: (file: TFile, newPath: string) => Promise<void> };
  workspace: {
    activeLeaf: WorkspaceLeafLike | null;
    getLeaf: (newTab?: boolean | 'tab' | 'split') => WorkspaceLeafLike;
    revealLeaf: (leaf?: WorkspaceLeafLike) => void;
    on: (eventName: string, handler: (...args: any[]) => void) => { eventName: string; handler: Function };
    _trigger: (eventName: string, ...args: any[]) => void;
    _lastLeaf: WorkspaceLeafLike | null;
  };
};

export function createApp(): App {
  const vault = createVault();
  const metadataCache = createMetadataCache(vault);
  const handlers: Record<string, Array<(...args: any[]) => void>> = {};
  const workspace: App['workspace'] = {
    activeLeaf: null,
    _lastLeaf: null,
    getLeaf: jest.fn(function (_newTab?: boolean | 'tab' | 'split') {
      const leafState: { type?: string; state?: any; active?: boolean } = {};
      const leaf: WorkspaceLeafLike = {
        async setViewState(s: any) { Object.assign(leafState, s); },
        getViewState() { return leafState; },
        history: { back: jest.fn() },
      };
      workspace._lastLeaf = leaf;
      return leaf;
    }) as App['workspace']['getLeaf'],
    revealLeaf: jest.fn() as App['workspace']['revealLeaf'],
    on(eventName: string, handler: (...args: any[]) => void) {
      (handlers[eventName] ||= []).push(handler);
      return { eventName, handler };
    },
    _trigger(eventName: string, ...args: any[]) {
      (handlers[eventName] || []).forEach(h => h(...args));
    },
  };
  return {
    vault,
    metadataCache,
    fileManager: {
      trashFile: jest.fn(async (file: TFile) => { vault.files.delete(file.path); }),
      renameFile: jest.fn(async (file: TFile, newPath: string) => {
        const entry = vault.files.get(file.path);
        if (!entry) return;
        vault.files.delete(file.path);
        const renamed = new TFile(newPath);
        vault.files.set(newPath, { file: renamed, content: entry.content });
      }),
    },
    workspace,
  };
}

// Notice is widely used; in tests just capture them.
export class Notice {
  static recent: string[] = [];
  constructor(public message: string) { Notice.recent.push(String(message)); }
  static reset() { Notice.recent = []; }
}

// requestUrl: stubbable HTTP layer used by RouteCalculationService and any
// future network-bound code. Tests register handlers with `mockRequestUrl` —
// each handler is matched against the URL by substring or RegExp; the first
// matching handler wins. Unmatched calls throw so unintended network use is
// loud, not silent. Handlers can throw to simulate request failure.
type RequestUrlParam = { url: string; method?: string; headers?: Record<string, string>; body?: string };
type RequestUrlResponse = { status: number; json: any; text: string };
type RequestUrlHandler = (req: RequestUrlParam) => RequestUrlResponse | Promise<RequestUrlResponse>;
type RequestUrlMatcher = string | RegExp;

const requestUrlHandlers: Array<{ match: RequestUrlMatcher; handler: RequestUrlHandler }> = [];
const requestUrlCalls: RequestUrlParam[] = [];

export function mockRequestUrl(match: RequestUrlMatcher, handler: RequestUrlHandler): void {
  requestUrlHandlers.push({ match, handler });
}
export function resetRequestUrlMocks(): void {
  requestUrlHandlers.length = 0;
  requestUrlCalls.length = 0;
}
export function getRequestUrlCalls(): RequestUrlParam[] {
  return [...requestUrlCalls];
}

export async function requestUrl(req: RequestUrlParam): Promise<RequestUrlResponse> {
  requestUrlCalls.push(req);
  const found = requestUrlHandlers.find(({ match }) =>
    typeof match === 'string' ? req.url.includes(match) : match.test(req.url),
  );
  if (!found) {
    throw new Error(`[mock requestUrl] No handler for URL: ${req.url}. Register one with mockRequestUrl().`);
  }
  return await found.handler(req);
}

// Modal/PluginSettingTab/Plugin/Setting are imported in places we may not
// reach in P0/P1, but exporting them keeps `import { ... } from 'obsidian'`
// statements compiling.
export class Modal { open() {} close() {} }

// Plugin: enough surface for the real RoadmapPlugin#onload to run against a
// mock app — registers views/commands/settings into in-memory maps the test
// can inspect. Data persistence (loadData/saveData) lives on the instance.
export class Plugin {
  app: any;
  manifest: any;
  _data: any = null;
  _views: Record<string, (leaf: any) => any> = {};
  _commands: Record<string, { id: string; name: string; callback?: () => any }> = {};
  _events: any[] = [];
  _settingTabs: any[] = [];
  constructor(app?: any, manifest?: any) { this.app = app; this.manifest = manifest; }
  registerView(type: string, factory: (leaf: any) => any) { this._views[type] = factory; }
  registerEvent(ref: any) { this._events.push(ref); }
  addCommand(cmd: { id: string; name: string; callback?: () => any }) { this._commands[cmd.id] = cmd; }
  addSettingTab(tab: any) { this._settingTabs.push(tab); }
  async loadData(): Promise<any> { return this._data; }
  async saveData(data: any): Promise<void> { this._data = data; }
}
export class PluginSettingTab { app: any; constructor(app: any) { this.app = app; } display() {} }
export class Setting { constructor(_el: HTMLElement) {} setName() { return this; } setDesc() { return this; } addText() { return this; } addToggle() { return this; } addDropdown() { return this; } }
export class ItemView {
  containerEl: HTMLElement;
  leaf: any;
  constructor(leaf: any) {
    this.leaf = leaf;
    this.containerEl = (typeof document !== 'undefined') ? document.createElement('div') : ({ empty() {}, createDiv() { return this; } } as any);
    // Augment the real DOM element with the methods Obsidian's ItemView relies on.
    const el: any = this.containerEl;
    if (typeof el.empty !== 'function') {
      el.empty = function() { while (this.firstChild) this.removeChild(this.firstChild); };
    }
    if (typeof el.createDiv !== 'function') {
      el.createDiv = function(opts?: { cls?: string }) {
        const div = document.createElement('div');
        if (opts && opts.cls) div.className = opts.cls;
        this.appendChild(div);
        return div;
      };
    }
  }
}
export const MarkdownView = class {};
export class WorkspaceLeaf { setViewState(_s: any) { return Promise.resolve(); } getViewState() { return {}; } }
