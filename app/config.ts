import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import logger from "./log.js";

interface ConfigObject {
  [key: string]: any;
}

export class Config {
  private config: ConfigObject;
  private configFile: string;

  constructor(configFile: string) {
    this.configFile = configFile;
    logger.info(`Loading config from: ${this.configFile}`);
    this.loadConfig();
  }

  public get(key: string, defaultValue: any = null): any {
    if (typeof key !== "string") {
      throw new Error(`The key must be a string, received key: ${key}`);
    }

    const keys = key.split(".");
    return keys.reduce((config, k) => {
      if (config && typeof config === "object" && k in config) {
        return config[k];
      }
      return defaultValue;
    }, this.config);
  }

  public set(key: string, value: any): void {
    if (typeof key !== "string") {
      throw new Error(`The key must be a string, received key: ${key}`);
    }

    const keys = key.split(".");
    let config: any = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in config)) {
        config[k] = {};
      }
      config = config[k];
    }
    config[keys[keys.length - 1]] = value;
    this.saveConfig();
  }

  public reload(): void {
    this.loadConfig();
  }

  private loadConfig(): void {
    const fileContents = fs.readFileSync(this.configFile, "utf8");
    this.config = yaml.load(fileContents) as ConfigObject;
  }

  private saveConfig(): void {
    const fileContents = yaml.dump(this.config);
    fs.writeFileSync(this.configFile, fileContents, "utf8");
  }
}

export function createGlobalConfig(): Config {
  return new Config("./config/config.yml");
}

export function createBotConfig(botId: string): Config {
  return new Config(`./config/bots/${botId}.yml`);
}

export function listBotIds(): string[] {
  const botsDir = "./config/bots";
  if (!fs.existsSync(botsDir)) return [];
  return fs
    .readdirSync(botsDir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => f.replace(/\.(yml|yaml)$/, ""));
}

export function botConfigExists(botId: string): boolean {
  const botsDir = "./config/bots";
  return (
    fs.existsSync(path.join(botsDir, `${botId}.yml`)) ||
    fs.existsSync(path.join(botsDir, `${botId}.yaml`))
  );
}

export function createBotConfigFile(
  botId: string,
  config: {
    name?: string;
    self_id?: number;
    prefix?: string | string[];
    error_reply_enabled?: boolean;
    admin?: string[];
    adapters?: any[];
    plugin_config?: any;
  },
): void {
  const botsDir = "./config/bots";
  if (!fs.existsSync(botsDir)) {
    fs.mkdirSync(botsDir, { recursive: true });
  }
  const filePath = path.join(botsDir, `${botId}.yml`);
  if (fs.existsSync(filePath)) {
    throw new Error(`Bot config file already exists: ${botId}`);
  }
  const defaultConfig: any = {
    name: config.name || botId,
    self_id: config.self_id ?? 10000,
    prefix: config.prefix || ["/"],
    error_reply_enabled: config.error_reply_enabled ?? true,
    admin: config.admin || [],
  };
  if (config.adapters && config.adapters.length > 0) {
    defaultConfig.adapters = config.adapters;
  } else {
    defaultConfig.adapters = [];
  }
  defaultConfig.plugin_config = config.plugin_config || {};
  fs.writeFileSync(filePath, yaml.dump(defaultConfig), "utf8");
}

export function deleteBotConfigFile(botId: string): void {
  const botsDir = "./config/bots";
  const ymlPath = path.join(botsDir, `${botId}.yml`);
  const yamlPath = path.join(botsDir, `${botId}.yaml`);
  if (fs.existsSync(ymlPath)) {
    fs.unlinkSync(ymlPath);
  } else if (fs.existsSync(yamlPath)) {
    fs.unlinkSync(yamlPath);
  }
}

const globalConfig = new Config("./config/config.yml");
export default globalConfig;
