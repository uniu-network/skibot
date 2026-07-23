import crypto from 'crypto';
import type {
  IHTTPAdapter,
  ISendMessage,
  AdapterContext,
} from "../../app/types.js";
import { Message } from "../../app/messages.js";
import { getOneBotEventName, matchEvents } from "./events.js";
import { callApi } from "./api.js";
import { toOneBotMessage } from "./messages.js";
import logger from "../../app/log.js";

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getHeader(headers: unknown, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) || undefined;
  if (!headers || typeof headers !== "object") return undefined;

  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerName) continue;
    if (Array.isArray(value)) return value[0];
    return typeof value === "string" ? value : undefined;
  }

  return undefined;
}

function verifySignature(rawBody: string, secret: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha1=')) return false;
  const expected = `sha1=${crypto.createHmac('sha1', secret).update(rawBody).digest('hex')}`;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signatureHeader);
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export class OneBotHTTPAdapter implements IHTTPAdapter, ISendMessage {
  readonly id = "onebotHttp";
  readonly name = "OneBot HTTP";
  private config: any;
  private ctx: AdapterContext | null = null;

  constructor(config: any) {
    this.config = config;
  }

  async start(ctx: AdapterContext): Promise<void> {
    this.ctx = ctx;
    logger.info(`OneBot HTTP adapter started, outbound API url: ${this.apiUrl}`);
  }

  async stop(): Promise<void> {
    this.ctx = null;
  }

  private get accessToken(): string | undefined {
    return optionalString(this.config.access_token);
  }

  private get apiUrl(): string {
    return this.config.api_url;
  }

  async handleHttpRequest(req: any, res: any): Promise<boolean> {
    if (!this.ctx) return false;

    const secret = optionalString(this.config.secret);
    if (secret) {
      const sigHeader = getHeader(req.headers, "x-signature");
      if (!sigHeader) {
        res.status(401).json({ error: "missing signature" });
        return true;
      }
      if (!verifySignature(req.rawBody ?? '', secret, sigHeader)) {
        res.status(403).json({ error: "invalid signature" });
        return true;
      }
    }

    const event = matchEvents(req.body, this.id, this);
    if (event) {
      const eventName = getOneBotEventName(req.body);
      this.ctx.emitEvent(eventName, event);
      res.json({ status: "ok" });
      return true;
    }
    return false;
  }

  async send_group_msg(
    target_id: string | number,
    message: Message,
  ): Promise<void> {
    const msg = toOneBotMessage(message);

    await callApi(this.apiUrl, "/send_group_msg", {
      group_id: target_id,
      message: msg,
    }, this.accessToken);
  }

  async send_private_msg(
    target_id: string | number,
    message: Message,
  ): Promise<void> {
    const msg = toOneBotMessage(message);

    await callApi(this.apiUrl, "/send_private_msg", {
      user_id: target_id,
      message: msg,
    }, this.accessToken);
  }

  async approveFriend(flag: any, remark?: string): Promise<void> {
    const { approveFriend } = await import("./api.js");
    await approveFriend(this.apiUrl, flag, remark, this.accessToken);
  }

  async rejectFriend(flag: any): Promise<void> {
    const { rejectFriend } = await import("./api.js");
    await rejectFriend(this.apiUrl, flag, this.accessToken);
  }

  async approveGroup(flag: any, subType: any): Promise<void> {
    const { approveGroup } = await import("./api.js");
    await approveGroup(this.apiUrl, flag, subType, this.accessToken);
  }

  async rejectGroup(flag: any, subType: any, reason?: string): Promise<void> {
    const { rejectGroup } = await import("./api.js");
    await rejectGroup(this.apiUrl, flag, subType, reason, this.accessToken);
  }

  async setGroupBan(
    groupId: number,
    userId: number,
    duration: number,
  ): Promise<void> {
    const { setGroupBan } = await import("./api.js");
    await setGroupBan(this.apiUrl, groupId, userId, duration, this.accessToken);
  }
}
