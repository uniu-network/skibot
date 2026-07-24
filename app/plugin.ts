import * as fs from "fs";
import logger from "./log.js";
import { Bot } from "./bot.js";
import type { Config } from "./config.js";
import { AdapterManager } from "./adapterManager.js";
import type { ScopedDatabaseClient } from "./database/types.js";
import type { BasePlugin as BasePluginType } from "./pluginBase.js";
import { getConfigSchema } from "./pluginBase.js";
import { validateConfig } from "./pluginConfig.js";
import ts from "typescript";
import path from "path";
import { pathToFileURL } from "url";

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  experimentalDecorators: true,
};

export class Plugin {
  private pluginDir: string;
  private plugins: Array<string>;
  private loadedPlugins: Map<string, { dir: string; instance: BasePluginType }>;
  private watcher: fs.FSWatcher | null = null;
  private watchers: Set<fs.FSWatcher> = new Set();
  private reloadTimer: NodeJS.Timeout | null = null;
  private reloading = false;
  private bot: Bot | null = null;
  private adapterManager: AdapterManager | null = null;
  private dbProvider: ((pluginName: string) => ScopedDatabaseClient) | null =
    null;
  private botConfig: Config;
  private version: string;

  constructor(pluginDir: string, botConfig: Config, version: string) {
    this.pluginDir = pluginDir;
    this.botConfig = botConfig;
    this.version = version;
    this.plugins = [];
    this.loadedPlugins = new Map();
  }

  setDbProvider(provider: (pluginName: string) => ScopedDatabaseClient): void {
    this.dbProvider = provider;
  }

  async loadPlugins(
    bot: Bot,
    adapterManager: AdapterManager,
    globalConfig: Config,
  ): Promise<void> {
    this.bot = bot;
    this.adapterManager = adapterManager;
    if (!fs.existsSync(this.pluginDir)) return;

    const files = fs.readdirSync(this.pluginDir);
    for (const file of files) {
      await this.loadPlugin(file, bot, adapterManager, globalConfig);
    }
  }

  async loadPlugin(
    file: string,
    bot: Bot,
    adapterManager: AdapterManager,
    globalConfig: Config,
  ): Promise<void> {
    let fileIndexPath = `${this.pluginDir}/${file}/index.ts`;
    const pluginInfoPath = `${this.pluginDir}/${file}/plugin.json`;

    try {
      if (!fs.existsSync(fileIndexPath) || !fs.existsSync(pluginInfoPath))
        return;

      const tsFileCode = fs.readFileSync(fileIndexPath, "utf8");
      const result = ts.transpileModule(tsFileCode, {
        compilerOptions,
        fileName: fileIndexPath,
      }).outputText;
      const jsIndexPath = fileIndexPath.replace(".ts", ".js");
      // 仅在内容实际变化时写盘，避免无变化触发 watch 自激
      let shouldWrite = true;
      try {
        if (fs.existsSync(jsIndexPath)) {
          const existing = fs.readFileSync(jsIndexPath, "utf8");
          if (existing === result) shouldWrite = false;
        }
      } catch {}
      if (shouldWrite) {
        fs.writeFileSync(jsIndexPath, result);
      }
      fileIndexPath = jsIndexPath;

      const pluginJson = JSON.parse(fs.readFileSync(pluginInfoPath, "utf-8"));
      const pluginName = pluginJson.name;

      const pluginUrl = pathToFileURL(path.resolve(fileIndexPath)).href;
      const pluginModule = await import(`${pluginUrl}?t=${Date.now()}`);
      const PluginClass = pluginModule.default;

      if (!PluginClass || typeof PluginClass !== "function") {
        logger.error(`Plugin ${pluginName}: missing default export class`);
        return;
      }

      const schema = getConfigSchema(PluginClass);

      let rawConfig = this.botConfig.get(`plugin_config.${pluginName}`);
      if (rawConfig === null || typeof rawConfig !== "object") {
        rawConfig = globalConfig.get(`plugins.${pluginName}`);
      }

      if (rawConfig === null || typeof rawConfig !== "object") {
        rawConfig = {};
      }

      const enabled = rawConfig.enabled ?? true;

      const {
        valid,
        config: validatedConfig,
        errors,
      } = validateConfig(rawConfig, schema);
      if (!valid) {
        logger.warn(
          `Plugin ${pluginName} config validation warnings: ${errors.join(", ")}`,
        );
      }

      if (enabled !== true) {
        logger.info(`Plugin ${pluginName} is disabled`);
        return;
      }

      const scope = `plugin:${pluginName}`;
      const instance: BasePluginType = new PluginClass();
      instance.config = validatedConfig;

      const pluginDb = this.dbProvider ? this.dbProvider(pluginName) : null;

      await bot.withScope(scope, async () => {
        await instance.onLoad({
          bot,
          adapterManager,
          db: pluginDb,
          botConfig: this.botConfig,
          version: this.version,
        });
      });

      this.loadedPlugins.set(pluginName, { dir: file, instance });
      if (!this.plugins.includes(pluginName)) {
        this.plugins.push(pluginName);
      }
      logger.info(`Loaded plugin: ${pluginName}`);
    } catch (e) {
      logger.error(`Failed to load plugin ${file}: ${e}`);
    }
  }

  async unloadPlugin(pluginName: string): Promise<void> {
    const loaded = this.loadedPlugins.get(pluginName);
    if (loaded) {
      try {
        await loaded.instance.onUnload();
      } catch (e) {
        logger.error(`Error unloading plugin ${pluginName}: ${e}`);
      }
    }
    if (this.bot) {
      this.bot.unloadScope(`plugin:${pluginName}`);
    }
    this.loadedPlugins.delete(pluginName);
    this.plugins = this.plugins.filter((name) => name !== pluginName);
    try {
      fs.unlinkSync(`${this.pluginDir}/${loaded?.dir || pluginName}/index.js`);
    } catch (e) {}
  }

  async reloadPlugins(globalConfig: Config): Promise<void> {
    if (!this.bot || !this.adapterManager) return;
    // 互斥锁：重载进行中不重复触发
    if (this.reloading) return;
    this.reloading = true;
    try {
      this.botConfig.reload();
      const loadedNames = [...this.loadedPlugins.keys()];
      for (const pluginName of loadedNames) {
        await this.unloadPlugin(pluginName);
      }
      await this.loadPlugins(this.bot, this.adapterManager, globalConfig);
    } finally {
      this.reloading = false;
    }
  }

  async reloadPlugin(pluginName: string, globalConfig: Config): Promise<void> {
    if (!this.bot || !this.adapterManager) return;

    this.botConfig.reload();
    await this.unloadPlugin(pluginName);

    const dir = this.getPluginDir(pluginName);
    if (!dir) {
      throw new Error(`Plugin ${pluginName} not found`);
    }
    await this.loadPlugin(dir, this.bot, this.adapterManager, globalConfig);
  }

  private getPluginDir(pluginName: string): string | null {
    if (!fs.existsSync(this.pluginDir)) return null;

    for (const file of fs.readdirSync(this.pluginDir)) {
      const pluginInfoPath = `${this.pluginDir}/${file}/plugin.json`;
      if (!fs.existsSync(pluginInfoPath)) continue;

      try {
        const pluginJson = JSON.parse(fs.readFileSync(pluginInfoPath, "utf-8"));
        if (pluginJson.name === pluginName || file === pluginName) {
          return file;
        }
      } catch (e) {}
    }
    return null;
  }

  getLoadedPluginSchema(pluginName: string): Record<string, any> | null {
    const loaded = this.loadedPlugins.get(pluginName);
    if (!loaded) return null;
    const ctor = loaded.instance.constructor;
    const fields = getConfigSchema(ctor);
    return {
      fields: fields.map((f) => ({
        key: f.propertyKey,
        type: f.type,
        default: f.default,
        description: f.description,
        required: f.required,
      })),
    };
  }

  getLoadedPluginInstance(pluginName: string): BasePluginType | null {
    const loaded = this.loadedPlugins.get(pluginName);
    return loaded ? loaded.instance : null;
  }

  watchPlugins(globalConfig: Config): void {
    if (this.watcher || !fs.existsSync(this.pluginDir)) return;

    const watch = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const handle = fs.watch(dir, (eventType, filename) => {
        if (!filename) return;
        const raw = filename.toString();
        // 归一化路径分隔符，兼容 Windows
        const normalized = raw.split(path.sep).join("/");
        const lower = normalized.toLowerCase();

        // 排除转译产物（避免 reload 自激）
        if (lower.endsWith(".js") || lower.includes("/node_modules/")) return;

        // 只对真正值得关注的文件触发重载
        const isSourceFile =
          lower.endsWith(".ts") ||
          lower.endsWith(".json") ||
          lower === "package.json";
        if (!isSourceFile) return;

        // 排除编辑器的临时/原子保存残留
        if (
          lower.endsWith(".swp") ||
          lower.endsWith(".swo") ||
          lower.endsWith("~") ||
          lower.endsWith(".tmp") ||
          lower.endsWith(".bak") ||
          lower.includes(".un~") ||
          lower.endsWith(".crdownload") ||
          lower.endsWith(".part")
        ) {
          return;
        }

        // 处于重载过程中时直接忽略，避免事件密集到达时排重入队列
        if (this.reloading) return;

        if (this.reloadTimer) clearTimeout(this.reloadTimer);
        this.reloadTimer = setTimeout(async () => {
          this.reloadTimer = null;
          logger.info(
            `Plugin change detected: ${normalized}, reloading plugins`,
          );
          await this.reloadPlugins(globalConfig);
        }, 300);
      });
      if (this.watcher) {
        // 多个 watcher 一起管理
        this.watchers.add(handle);
      } else {
        this.watcher = handle;
        this.watchers.add(handle);
      }
    };

    // 顶层目录
    watch(this.pluginDir);
    // Linux 下 fs.watch 不支持 recursive，Node.js 会发出 experimental 警告。
    // 这里手动 watch 每个插件子目录，规避该限制并确保事件来源精确。
    if (fs.existsSync(this.pluginDir)) {
      for (const entry of fs.readdirSync(this.pluginDir)) {
        const sub = path.join(this.pluginDir, entry);
        try {
          if (fs.statSync(sub).isDirectory()) {
            watch(sub);
          }
        } catch {}
      }
    }
  }

  async close(): Promise<void> {
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {}
    }
    this.watchers.clear();
    this.watcher = null;
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
    const loadedNames = [...this.loadedPlugins.keys()];
    for (const pluginName of loadedNames) {
      await this.unloadPlugin(pluginName);
    }
  }

  getLoadedPluginCount(): number {
    return this.plugins.length;
  }

  getLoadedPluginNames(): string[] {
    return [...this.plugins];
  }

  isPluginLoaded(pluginName: string): boolean {
    return this.loadedPlugins.has(pluginName);
  }
}
