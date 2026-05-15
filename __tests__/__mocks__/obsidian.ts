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

export type App = {
  vault: Vault;
  metadataCache: MetadataCache;
  fileManager: { trashFile: (file: TFile) => Promise<void>; renameFile: (file: TFile, newPath: string) => Promise<void> };
  workspace: { activeLeaf: null; getLeaf: () => any; revealLeaf: () => void };
};

export function createApp(): App {
  const vault = createVault();
  const metadataCache = createMetadataCache(vault);
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
    workspace: {
      activeLeaf: null,
      getLeaf: () => ({ setViewState: async () => {} }),
      revealLeaf: () => {},
    },
  };
}

// Notice is widely used; in tests just capture them.
export class Notice {
  static recent: string[] = [];
  constructor(public message: string) { Notice.recent.push(String(message)); }
  static reset() { Notice.recent = []; }
}

// Modal/PluginSettingTab/Plugin/Setting are imported in places we may not
// reach in P0/P1, but exporting them keeps `import { ... } from 'obsidian'`
// statements compiling.
export class Modal { open() {} close() {} }
export class Plugin {}
export class PluginSettingTab { app: any; constructor(app: any) { this.app = app; } display() {} }
export class Setting { constructor(_el: HTMLElement) {} setName() { return this; } setDesc() { return this; } addText() { return this; } addToggle() { return this; } addDropdown() { return this; } }
export class ItemView { constructor(_leaf: any) {} }
export const MarkdownView = class {};
