import {
  BotEvent,
  BotMessageEvent,
  BotSendEvent,
  GroupMessageEvent,
  PrivateMessageEvent,
} from "./events.js";
import { Message, MessageSegment } from "./messages.js";
import logger from "./log.js";
import { IAdapter, IHandler, AdapterContext } from "./types.js";
import async from "async";
import { parseArgs, type ParsedArgs } from "./argParser.js";
import { SkiUserRole, type SkiUserRole as SkiUserRoleType } from "./roles.js";

export interface CommandOptions {
  requireRole?: SkiUserRoleType;
}

export interface CommandRegistryEntry {
  command: string;
  description: string;
  scope?: string;
  requireRole: SkiUserRoleType;
}

export function normalizePrefix(
  prefix: string | string[] | undefined,
): string[] {
  if (!prefix) return ["/"];
  if (Array.isArray(prefix)) return prefix.map((s) => String(s));
  return [String(prefix)];
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class FinishSignal extends Error {
  constructor() {
    super("finish");
    this.name = "FinishSignal";
  }
}

const BOTS: { [key: number]: Bot } = {};

export function getBot(id: number, prefix?: string | string[]): Bot {
  if (!(id in BOTS)) {
    BOTS[id] = new Bot(id, prefix);
  }
  return BOTS[id];
}

export class Handler implements IHandler {
  private _event: BotEvent;
  private _bot: Bot | null;

  constructor(event: BotEvent, bot: Bot | null = null) {
    this._event = event;
    this._bot = bot;
  }

  finish(message: Message): Promise<void> {
    let sendTask: Promise<void> | null = null;
    let messageType: string | null = null;
    let targetId: number | null = null;

    if (this._event instanceof GroupMessageEvent) {
      messageType = "group";
      targetId = this._event.group_id;
      sendTask = this._event.adapter.send_group_msg(
        this._event.group_id,
        message,
      );
    } else if (this._event instanceof PrivateMessageEvent) {
      messageType = "private";
      targetId = this._event.user_id;
      sendTask = this._event.adapter.send_private_msg(
        this._event.user_id,
        message,
      );
    }

    if (sendTask && messageType && targetId !== null) {
      sendTask
        .then(() => {
          if (this._bot) {
            const sendEvent = new BotSendEvent(
              Date.now(),
              this._event.self_id,
              this._event.adapter_id,
              this._event.adapter,
              messageType,
              targetId,
              message.json(),
            );
            this._bot.emitEvent("bot_send", sendEvent);
          }
        })
        .catch((e) => {
          logger.error(`error when sending finish message, ${e}`);
        });
    } else {
      sendTask?.catch((e) => {
        logger.error(`error when sending finish message, ${e}`);
      });
    }

    throw new FinishSignal();
  }
}

export class Bot {
  public self_id: number;
  public prefix: string[];
  public error_reply_enabled: boolean;
  public admins: string[];
  private adapters: Map<string, IAdapter> = new Map();
  private eventHandlers: Map<
    string,
    Array<{ callback: Function; scope?: string }>
  > = new Map();
  private eventQueue: Array<{ eventName: string; event: BotEvent }> = [];
  public commands: CommandRegistryEntry[];
  private currentScope: string | null = null;

  constructor(
    self_id: number,
    prefix: string | string[] = ["/"],
    error_reply_enabled = true,
    admins: string[] = [],
  ) {
    this.self_id = self_id;
    this.prefix = normalizePrefix(prefix);
    this.error_reply_enabled = error_reply_enabled;
    this.admins = admins;
    this.commands = [];
    this.startEventLoop();
    BOTS[self_id] = this;
  }

  async useAdapter(adapter: IAdapter): Promise<void> {
    this.adapters.set(adapter.id, adapter);
    const ctx: AdapterContext = {
      bot: this,
      db: null,
      emitEvent: (eventName, event) => this.emitEvent(eventName, event),
    };
    await adapter.start(ctx);
    logger.info(`Adapter "${adapter.name}" (${adapter.id}) started`);
  }

  async stopAdapters(): Promise<void> {
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

  emitEvent<TEvent extends BotEvent = BotEvent>(
    eventName: string,
    event: TEvent,
  ): void {
    this.eventQueue.push({ eventName, event });
  }

  registerCommand(
    command: string,
    description: string,
    scope?: string,
    requireRole: SkiUserRoleType = SkiUserRole.USER,
  ) {
    const data = {
      command: command,
      description: description,
      scope: scope || this.currentScope || undefined,
      requireRole,
    };
    if (this.commands.some((cmd) => cmd.command === command)) {
      throw new Error("Command already registered");
    }
    this.commands.push(data);
  }

  on<TEvent extends BotEvent = BotEvent>(
    event: string,
    callback: (
      event: TEvent,
      handler: Handler,
      reply_msg: Message,
    ) => void | Promise<void>,
  ) {
    const eventName = event.toLowerCase();
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    this.eventHandlers
      .get(eventName)
      .push({ callback, scope: this.currentScope || undefined });
  }

  async withScope(
    scope: string,
    callback: () => Promise<void> | void,
  ): Promise<void> {
    const previousScope = this.currentScope;
    this.currentScope = scope;
    try {
      await callback();
    } finally {
      this.currentScope = previousScope;
    }
  }

  unloadScope(scope: string): void {
    this.commands = this.commands.filter((command) => command.scope !== scope);
    for (const [eventName, handlers] of this.eventHandlers.entries()) {
      const nextHandlers = handlers.filter(
        (handler) => handler.scope !== scope,
      );
      if (nextHandlers.length === 0) {
        this.eventHandlers.delete(eventName);
      } else {
        this.eventHandlers.set(eventName, nextHandlers);
      }
    }
  }

  command(
    command: string,
    description: string,
    callback: (
      arg: ParsedArgs,
      handler: Handler,
      reply_msg: Message,
      event: BotMessageEvent,
    ) => void,
    options: CommandOptions = {},
  ) {
    const requireRole = options.requireRole ?? SkiUserRole.USER;
    this.registerCommand(command, description, undefined, requireRole);

    const handler = async (event: any, handlerObj: any, reply_msg: any) => {
      const prefixes = this.prefix;
      const prefixGroup = prefixes.map((p) => escapeRegex(p)).join("|");
      const regex = new RegExp(
        `^(?:${prefixGroup})${escapeRegex(command)}(?:\\s+(.*))?$`,
      );
      const match = regex.exec(event.raw_message);
      if (match) {
        const effectiveRole = this.getEffectiveRole(event);
        event.sender.ski_user_role = effectiveRole;
        if (effectiveRole < requireRole) {
          const message = new Message();
          message.addMessage(MessageSegment.text("无足够权限执行指令"));
          await handlerObj.finish(message);
          return;
        }
        const rawArgs = match[1] ? match[1].split(/\s+/) : [];
        const args = parseArgs(rawArgs);
        try {
          await callback(args, handlerObj, reply_msg, event);
          return;
        } catch (e) {
          if (e instanceof FinishSignal) return;
          logger.error(`error when handling command ${command}, ${e}`);
          await this.handleError(e, event);
          return;
        }
      }
    };

    this.on("message", handler);
  }

  private getEffectiveRole(event: BotMessageEvent): SkiUserRoleType {
    const senderRole = event.sender.ski_user_role ?? SkiUserRole.USER;
    const adminKey = `${event.adapter_id}:${event.sender.user_id}`;
    if (this.admins.includes(adminKey)) {
      return Math.max(senderRole, SkiUserRole.BOT_ADMIN) as SkiUserRoleType;
    }
    return senderRole;
  }

  private async handleError(error: Error, event: BotEvent) {
    if (!this.error_reply_enabled) {
      logger.error(`error handling ${event.constructor.name} event: ${error}`);
      return;
    }

    const message = new Message();
    const handler = new Handler(event, this);
    message.addMessage(
      MessageSegment.text(
        `在处理 ${event.constructor.name} 事件时出错: ${error}`,
      ),
    );
    try {
      await handler.finish(message);
    } catch (e) {
      if (!(e instanceof FinishSignal)) {
        throw e;
      }
    }
  }

  private invokeCallbacks(eventName: string, event: BotEvent) {
    return new Promise<void>((resolve, reject) => {
      const handlers = this.eventHandlers.get(eventName);
      if (!handlers || handlers.length === 0) {
        resolve();
        return;
      }
      async.parallel(
        handlers.map((handler) => {
          return (callback: Function) => {
            Promise.resolve(
              handler.callback(event, new Handler(event, this), new Message()),
            )
              .then(() => callback(null))
              .catch((error: Error) => {
                if (error instanceof FinishSignal) {
                  callback(null);
                  return;
                }
                console.error(
                  `Error in handler for event ${eventName}:`,
                  error,
                );
                this.handleError(error, event)
                  .then(() => callback(null))
                  .catch((err) => callback(err));
              });
          };
        }),
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
      );
    });
  }

  private startEventLoop() {
    setInterval(async () => {
      const queue = [...this.eventQueue];
      this.eventQueue = [];
      for (const { eventName, event } of queue) {
        await this.invokeCallbacks(eventName, event);
      }
    }, 0);
  }
}
