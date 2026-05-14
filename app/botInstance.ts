import * as fs from 'fs';
import { Bot, normalizePrefix } from './bot.js';
import type { Config } from './config.js';
import { createBotConfig } from './config.js';
import { Plugin } from './plugin.js';
import { AdapterManager } from './adapterManager.js';
import { Counter } from './counter.js';
import databaseManager from './database/manager.js';
import { registerEventHandlers } from './eventLogging.js';
import { registerSchedulers } from './scheduler.js';
import logger from './log.js';

export interface BotInstanceOptions {
    botId: string;
    version: string;
    globalConfig: Config;
}

export class BotInstance {
    public readonly botId: string;
    public config: Config;
    public bot: Bot;
    public adapterManager: AdapterManager;
    public counter: Counter;
    public plugin: Plugin;
    public version: string;
    public globalConfig: Config;
    private running = false;

    private constructor(opts: BotInstanceOptions) {
        this.botId = opts.botId;
        this.version = opts.version;
        this.globalConfig = opts.globalConfig;
        this.config = createBotConfig(opts.botId);
        this.bot = new Bot(this.config.get('self_id'), normalizePrefix(this.config.get('prefix')));
        this.adapterManager = new AdapterManager(this.bot, this.config);
        this.plugin = new Plugin('./plugins', this.config, opts.version);
        this.counter = new Counter(databaseManager.botCore(this.botId, 'counter'));
    }

    static async create(opts: BotInstanceOptions): Promise<BotInstance> {
        const instance = new BotInstance(opts);
        await instance.init();
        return instance;
    }

    private async init(): Promise<void> {
        await this.counter.init();

        this.plugin.setDbProvider((pluginName: string) =>
            databaseManager.botPlugin(this.botId, pluginName)
        );
        this.adapterManager.setDbProvider((adapterId: string) =>
            databaseManager.botAdapter(this.botId, adapterId)
        );
    }

    async start(): Promise<void> {
        if (this.running) return;

        logger.info(`[BotInstance:${this.botId}] Starting bot "${this.config.get('name') || this.botId}"`);

        registerEventHandlers(this);

        await this.plugin.loadPlugins(this.bot, this.adapterManager, this.globalConfig);
        await this.adapterManager.loadFromConfig();

        this.plugin.watchPlugins(this.globalConfig);
        this.adapterManager.watchAdapters();
        registerSchedulers(this.counter);

        this.running = true;
        logger.info(`[BotInstance:${this.botId}] Bot started`);
    }

    async stop(): Promise<void> {
        if (!this.running) return;

        logger.info(`[BotInstance:${this.botId}] Stopping bot`);

        this.adapterManager.close();
        await this.adapterManager.stopAll();
        await this.plugin.close();

        this.running = false;
        logger.info(`[BotInstance:${this.botId}] Bot stopped`);
    }

    isRunning(): boolean {
        return this.running;
    }

    getInfo(): BotInfo {
        return {
            botId: this.botId,
            name: this.config.get('name') || this.botId,
            self_id: this.config.get('self_id'),
            running: this.running,
            pluginCount: this.plugin.getLoadedPluginCount(),
            adapterCount: this.adapterManager.listAdapters().length,
            prefix: this.bot.prefix,
        };
    }
}

export interface BotInfo {
    botId: string;
    name: string;
    self_id: number;
    running: boolean;
    pluginCount: number;
    adapterCount: number;
    prefix: string[];
}
