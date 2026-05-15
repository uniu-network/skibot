import { IAdapter, IHTTPAdapter, AdapterContext } from './types.js';
import { Bot } from './bot.js';
import logger from './log.js';
import type { Config } from './config.js';
import type { ScopedDatabaseClient } from './database/types.js';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

export class AdapterManager {
    private adapters: Map<string, IAdapter> = new Map();
    private adapterConfigs: Map<string, any> = new Map();
    private bot: Bot;
    private dbProvider: ((adapterId: string) => ScopedDatabaseClient) | null = null;
    private watcher: fs.FSWatcher | null = null;
    private configWatcher: fs.FSWatcher | null = null;
    private reloadTimer: NodeJS.Timeout | null = null;
    private reloading = false;
    private botConfig: Config;

    constructor(bot: Bot, botConfig: Config) {
        this.bot = bot;
        this.botConfig = botConfig;
    }

    setDbProvider(provider: (adapterId: string) => ScopedDatabaseClient): void {
        this.dbProvider = provider;
    }

    async registerAdapter(adapter: IAdapter): Promise<void> {
        this.adapters.set(adapter.id, adapter);
        const adapterDb = this.dbProvider ? this.dbProvider(adapter.id) : null;
        const ctx: AdapterContext = {
            bot: this.bot,
            db: adapterDb,
            emitEvent: (eventName, event) => this.bot.emitEvent(eventName, event)
        };
        await adapter.start(ctx);
        logger.info(`Adapter "${adapter.name}" (${adapter.id}) registered`);
    }

    async loadFromConfig(): Promise<void> {
        const adapters = this.botConfig.get('adapters') || [];
        if (!Array.isArray(adapters)) return;

        for (const adapterConfig of adapters) {
            await this.loadAdapter(adapterConfig.type, adapterConfig.config || {});
        }
    }

    async loadAdapter(type: string, adapterConfig: any): Promise<void> {
        this.transpileAdapter(type);
        const module = await import(`../adapters/${type}/index.js?t=${Date.now()}`);
        const AdapterClass = module.default || module[Object.keys(module).find(k => k.endsWith('Adapter')) || Object.keys(module)[0]];
        if (!AdapterClass || typeof AdapterClass !== 'function') {
            throw new Error(`Adapter "${type}" does not export a valid class. Found keys: ${Object.keys(module).join(', ')}`);
        }
        const adapter: IAdapter = new AdapterClass(adapterConfig || {});
        this.adapterConfigs.set(type, adapterConfig || {});
        await this.registerAdapter(adapter);
    }

    async unloadAdapter(id: string): Promise<void> {
        const adapter = this.adapters.get(id);
        if (!adapter) return;

        try {
            await adapter.stop();
        } catch (e) {
            logger.error(`Error stopping adapter ${id}: ${e}`);
        }
        this.adapters.delete(id);
    }

    async reloadAdapter(type: string): Promise<void> {
        this.botConfig.reload();
        const configuredAdapters = this.botConfig.get('adapters') || [];
        const configuredAdapter = Array.isArray(configuredAdapters)
            ? configuredAdapters.find((item: any) => item.type === type)
            : null;
        const adapterConfig = configuredAdapter?.config || this.adapterConfigs.get(type);
        if (!adapterConfig) return;

        logger.info(`Reloading adapter ${type}`);
        await this.unloadAdapter(type);
        await this.loadAdapter(type, adapterConfig);
    }

    async reloadAll(): Promise<void> {
        this.reloading = true;
        try {
            this.botConfig.reload();
            await this.stopAll();
            this.adapterConfigs.clear();
            await this.loadFromConfig();
        } finally {
            this.reloading = false;
        }
    }

    async stopAll(): Promise<void> {
        for (const adapter of this.adapters.values()) {
            try {
                await adapter.stop();
            } catch (e) {
                logger.error(`Error stopping adapter ${adapter.id}: ${e}`);
            }
        }
        this.adapters.clear();
    }

    getAdapter<T extends IAdapter>(id: string): T | undefined {
        return this.adapters.get(id) as T | undefined;
    }

    listAdapters(): Array<{ id: string; name: string; loaded: boolean; config: any }> {
        const configuredAdapters = this.botConfig.get('adapters') || [];
        const result: Array<{ id: string; name: string; loaded: boolean; config: any }> = [];

        if (Array.isArray(configuredAdapters)) {
            for (const adapterConfig of configuredAdapters) {
                const adapter = this.adapters.get(adapterConfig.type);
                result.push({
                    id: adapterConfig.type,
                    name: adapter?.name || adapterConfig.type,
                    loaded: !!adapter,
                    config: adapterConfig.config || {},
                });
            }
        }

        for (const adapter of this.adapters.values()) {
            if (result.some(item => item.id === adapter.id)) continue;
            result.push({
                id: adapter.id,
                name: adapter.name,
                loaded: true,
                config: this.adapterConfigs.get(adapter.id) || {},
            });
        }

        return result;
    }

    async handleHttpRequest(req: any, res: any): Promise<boolean> {
        if (this.reloading) {
            res.status(503).send('Adapters are reloading');
            return true;
        }

        for (const adapter of this.adapters.values()) {
            if ('handleHttpRequest' in adapter) {
                const handled = await (adapter as IHTTPAdapter).handleHttpRequest(req, res);
                if (handled) return true;
            }
        }
        return false;
    }

    watchAdapters(): void {
        if (this.watcher || !fs.existsSync('./adapters')) return;

        this.watcher = fs.watch('./adapters', { recursive: true }, (eventType, filename) => {
            if (!filename) return;
            const normalized = filename.toString();
            if (!normalized.endsWith('.ts') && !normalized.endsWith('.json')) return;

            const adapterType = normalized.split(/[\\/]/)[0];
            if (!adapterType) return;

            if (this.reloadTimer) clearTimeout(this.reloadTimer);
            this.reloadTimer = setTimeout(async () => {
                try {
                    await this.reloadAdapter(adapterType);
                } catch (e) {
                    logger.error(`Failed to reload adapter ${adapterType}: ${e}`);
                }
            }, 300);
        });
    }

    private transpileAdapter(type: string): void {
        const sourceDir = path.resolve('./adapters', type);
        const outputDir = path.resolve('./dist/adapters', type);
        if (!fs.existsSync(sourceDir)) return;

        fs.mkdirSync(outputDir, { recursive: true });
        for (const file of fs.readdirSync(sourceDir)) {
            const sourcePath = path.join(sourceDir, file);
            if (file.endsWith('.ts')) {
                const outputPath = path.join(outputDir, file.replace(/\.ts$/, '.js'));
                const source = fs.readFileSync(sourcePath, 'utf8');
                const output = ts.transpileModule(source, {
                    compilerOptions: {
                        target: ts.ScriptTarget.ESNext,
                        module: ts.ModuleKind.ESNext,
                        moduleResolution: ts.ModuleResolutionKind.Bundler,
                        verbatimModuleSyntax: true,
                    },
                    fileName: sourcePath,
                }).outputText;
                fs.writeFileSync(outputPath, output, 'utf8');
            } else if (file === 'frontend' || file === 'static') {
                const destPath = path.join(outputDir, file);
                this.copyDirSync(sourcePath, destPath);
            }
        }
    }

    private copyDirSync(src: string, dest: string): void {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                this.copyDirSync(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    static getAvailableTypes(): Array<{ id: string; name: string; defaultConfig: Record<string, any> }> {
        const result: Array<{ id: string; name: string; defaultConfig: Record<string, any> }> = [];
        const adaptersDir = path.resolve('./adapters');
        if (!fs.existsSync(adaptersDir)) return result;

        for (const dir of fs.readdirSync(adaptersDir)) {
            const adapterDir = path.join(adaptersDir, dir);
            if (!fs.statSync(adapterDir).isDirectory()) continue;
            const indexPath = path.join(adapterDir, 'index.ts');
            if (!fs.existsSync(indexPath)) continue;

            const metadata = this.readAdapterMetadata(adapterDir, dir);
            result.push({
                id: metadata.id,
                name: metadata.name,
                defaultConfig: metadata.defaultConfig,
            });
        }

        return result;
    }

    private static readAdapterMetadata(adapterDir: string, fallbackId: string): { id: string; name: string; defaultConfig: Record<string, any> } {
        const metadataPath = path.join(adapterDir, 'adapter.json');
        if (!fs.existsSync(metadataPath)) {
            return { id: fallbackId, name: fallbackId, defaultConfig: {} };
        }

        try {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            const id = typeof metadata.id === 'string' && metadata.id ? metadata.id : fallbackId;
            const name = typeof metadata.name === 'string' && metadata.name ? metadata.name : id;
            const defaultConfig = metadata.defaultConfig && typeof metadata.defaultConfig === 'object' && !Array.isArray(metadata.defaultConfig)
                ? metadata.defaultConfig
                : {};

            return { id, name, defaultConfig };
        } catch (e) {
            logger.warn(`Failed to read adapter metadata ${metadataPath}: ${e}`);
            return { id: fallbackId, name: fallbackId, defaultConfig: {} };
        }
    }

    close(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        if (this.configWatcher) {
            this.configWatcher.close();
            this.configWatcher = null;
        }
        if (this.reloadTimer) {
            clearTimeout(this.reloadTimer);
            this.reloadTimer = null;
        }
    }
}
