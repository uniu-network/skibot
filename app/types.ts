import type { Bot } from "./bot.js";
import type { BotEvent } from "./events.js";
import type { Message } from "./messages.js";
import type { ScopedDatabaseClient } from "./database/types.js";
import type { AdapterManager } from "./adapterManager.js";
import type { Config } from "./config.js";

export interface IAdapter {
  readonly id: string;
  readonly name: string;
  start(ctx: AdapterContext): Promise<void>;
  stop(): Promise<void>;
}

export interface IHTTPAdapter extends IAdapter {
  handleHttpRequest(req: any, res: any): Promise<boolean>;
}

export interface AdapterContext {
  bot: Bot;
  db: ScopedDatabaseClient | null;
  emitEvent<TEvent extends BotEvent = BotEvent>(
    eventName: string,
    event: TEvent,
  ): void;
}

export interface ISendMessage {
  send_group_msg(target_id: string | number, message: Message): Promise<void>;
  send_private_msg(target_id: string | number, message: Message): Promise<void>;
}

export interface IHandler {
  finish(message: Message): Promise<void>;
}

export interface IPlugin {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly author: string;
  onLoad(ctx: PluginContext): Promise<void>;
  onUnload(): Promise<void>;
}

export interface PluginContext {
  bot: Bot;
  adapterManager: AdapterManager;
  db: ScopedDatabaseClient | null;
  botConfig: Config;
  version: string;
}

export interface ConfigFieldDefinition {
  propertyKey: string;
  type: "string" | "number" | "boolean" | "string[]" | "object";
  default?: any;
  description?: string;
  required?: boolean;
}
