import {
  listBotIds,
  botConfigExists,
  createBotConfigFile,
  deleteBotConfigFile,
  createBotConfig,
} from "./config.js";
import type { Config } from "./config.js";
import { BotInstance, BotInfo } from "./botInstance.js";
import logger from "./log.js";

export class BotManager {
  private instances: Map<string, BotInstance> = new Map();
  private globalConfig: Config;
  private version: string;

  constructor(globalConfig: Config, version: string) {
    this.globalConfig = globalConfig;
    this.version = version;
  }

  async loadAll(): Promise<void> {
    const botIds = listBotIds();
    logger.info(
      `[BotManager] Found ${botIds.length} bot configuration(s): ${botIds.join(", ")}`,
    );

    for (const botId of botIds) {
      await this.startInstance(botId);
    }
  }

  async startInstance(botId: string): Promise<void> {
    if (this.instances.has(botId)) {
      logger.warn(`[BotManager] Bot ${botId} is already loaded`);
      return;
    }

    try {
      const instance = await BotInstance.create({
        botId,
        version: this.version,
        globalConfig: this.globalConfig,
      });
      await instance.start();
      this.instances.set(botId, instance);
    } catch (e) {
      logger.error(`[BotManager] Failed to start bot ${botId}: ${e}`);
    }
  }

  async stopInstance(botId: string): Promise<void> {
    const instance = this.instances.get(botId);
    if (!instance) {
      logger.warn(`[BotManager] Bot ${botId} not found`);
      return;
    }

    await instance.stop();
    this.instances.delete(botId);
  }

  async reloadInstance(botId: string): Promise<void> {
    await this.stopInstance(botId);
    await this.startInstance(botId);
  }

  hasInstance(botId: string): boolean {
    return this.instances.has(botId);
  }

  getInstance(botId: string): BotInstance | undefined {
    return this.instances.get(botId);
  }

  getFirstInstance(): BotInstance | undefined {
    return this.instances.values().next().value;
  }

  listInstances(): BotInfo[] {
    return Array.from(this.instances.values()).map((inst) => inst.getInfo());
  }

  listAllBots(): BotInfo[] {
    const allBotIds = listBotIds();
    return allBotIds.map((botId) => {
      const instance = this.instances.get(botId);
      if (instance) {
        return instance.getInfo();
      }
      const config = createBotConfig(botId);
      return {
        botId,
        name: config.get("name") || botId,
        self_id: config.get("self_id"),
        running: false,
        pluginCount: 0,
        adapterCount: 0,
        prefix: Array.isArray(config.get("prefix"))
          ? config.get("prefix")
          : [config.get("prefix") || "/"],
      };
    });
  }

  async createInstance(
    botId: string,
    config: {
      name?: string;
      self_id?: number;
      prefix?: string | string[];
      adapters?: any[];
      plugin_config?: any;
    },
  ): Promise<BotInstance> {
    if (botConfigExists(botId)) {
      throw new Error(`Bot "${botId}" already exists`);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(botId)) {
      throw new Error(
        "botId can only contain letters, numbers, underscores, and hyphens",
      );
    }

    createBotConfigFile(botId, config);

    await this.startInstance(botId);
    const instance = this.instances.get(botId);
    if (!instance) {
      throw new Error(`Failed to start bot "${botId}" after creation`);
    }
    return instance;
  }

  async deleteInstance(botId: string): Promise<void> {
    if (this.instances.has(botId)) {
      await this.stopInstance(botId);
    }
    if (!botConfigExists(botId)) {
      throw new Error(`Bot config "${botId}" not found`);
    }
    deleteBotConfigFile(botId);
  }

  async stopAll(): Promise<void> {
    for (const [botId, instance] of this.instances) {
      try {
        await instance.stop();
      } catch (e) {
        logger.error(`[BotManager] Error stopping bot ${botId}: ${e}`);
      }
    }
    this.instances.clear();
  }
}
