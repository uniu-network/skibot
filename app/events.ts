import type { ISendMessage } from "./types.js";
import type { SkiUserRole } from "./roles.js";

export type MessageSender<TExtra extends object = {}> = {
  user_id: number;
  ski_user_role: SkiUserRole;
  nickname?: string;
  sex?: string;
  age?: number;
  area?: string;
  level?: string;
  role?: string;
  title?: string;
  card?: string;
} & TExtra;

export interface MessageAnonymous {
  id: number;
  name: string;
  flag: string;
}

export interface GroupUploadFile {
  id: string;
  name: string;
  size: number;
  busid: number;
}

export class BotEvent<TAdapterId extends string = string> {
  time: number;
  self_id: number;
  adapter_id: TAdapterId;
  adapter: ISendMessage | null;
  raw_event?: unknown;

  constructor(
    time: number,
    self_id: number,
    adapter_id: TAdapterId,
    adapter: ISendMessage | null = null,
  ) {
    this.time = time;
    this.self_id = self_id;
    this.adapter_id = adapter_id;
    this.adapter = adapter;
  }
}

export function isAdapterEvent<TAdapterId extends string>(
  event: BotEvent,
  adapterId: TAdapterId,
): event is BotEvent<TAdapterId> {
  return event.adapter_id === adapterId;
}

export class BotMessageEvent<
  TAdapterId extends string = string,
  TSender extends MessageSender = MessageSender,
> extends BotEvent<TAdapterId> {
  message_id: string | number;
  message: any;
  raw_message: string;
  sender: TSender;

  constructor(
    time: number,
    self_id: number,
    adapter_id: TAdapterId,
    adapter: ISendMessage | null,
    message_id: string | number,
    message: any,
    raw_message: string,
    sender: TSender,
  ) {
    super(time, self_id, adapter_id, adapter);
    this.message_id = message_id;
    this.message = message;
    this.raw_message = raw_message;
    this.sender = sender;
  }
}

export class GroupMessageEvent<
  TAdapterId extends string = string,
  TSender extends MessageSender = MessageSender,
> extends BotMessageEvent<TAdapterId, TSender> {
  message_type: string = "group";
  group_id: number;
  user_id: number;

  constructor(
    time: number,
    self_id: number,
    adapter_id: TAdapterId,
    adapter: ISendMessage | null,
    message_id: string | number,
    message: any,
    raw_message: string,
    sender: TSender,
    group_id: number,
    user_id: number,
  ) {
    super(
      time,
      self_id,
      adapter_id,
      adapter,
      message_id,
      message,
      raw_message,
      sender,
    );
    this.group_id = group_id;
    this.user_id = user_id;
  }
}

export class PrivateMessageEvent<
  TAdapterId extends string = string,
  TSender extends MessageSender = MessageSender,
> extends BotMessageEvent<TAdapterId, TSender> {
  message_type: string = "private";
  user_id: number;

  constructor(
    time: number,
    self_id: number,
    adapter_id: TAdapterId,
    adapter: ISendMessage | null,
    message_id: string | number,
    message: any,
    raw_message: string,
    sender: TSender,
    user_id: number,
  ) {
    super(
      time,
      self_id,
      adapter_id,
      adapter,
      message_id,
      message,
      raw_message,
      sender,
    );
    this.user_id = user_id;
  }
}

export class NoticeEvent<
  TAdapterId extends string = string,
> extends BotEvent<TAdapterId> {
  notice_type: string;

  constructor(
    time: number,
    self_id: number,
    adapter_id: TAdapterId,
    adapter: ISendMessage | null,
    notice_type: string = "",
  ) {
    super(time, self_id, adapter_id, adapter);
    this.notice_type = notice_type;
  }
}

export class RequestEvent<
  TAdapterId extends string = string,
> extends BotEvent<TAdapterId> {
  request_type: string;

  constructor(
    time: number,
    self_id: number,
    adapter_id: TAdapterId,
    adapter: ISendMessage | null,
    request_type: string = "",
  ) {
    super(time, self_id, adapter_id, adapter);
    this.request_type = request_type;
  }
}

export class MetaEvent<
  TAdapterId extends string = string,
> extends BotEvent<TAdapterId> {
  meta_event_type: string;
  status?: unknown;

  constructor(
    time: number,
    self_id: number,
    adapter_id: TAdapterId,
    adapter: ISendMessage | null,
    meta_event_type: string = "",
    status?: unknown,
  ) {
    super(time, self_id, adapter_id, adapter);
    this.meta_event_type = meta_event_type;
    if (status !== undefined) {
      this.status = status;
    }
  }
}

export class BotSendEvent<
  TAdapterId extends string = string,
> extends BotEvent<TAdapterId> {
  message_type: string;
  target_id: number;
  message: any;

  constructor(
    time: number,
    self_id: number,
    adapter_id: TAdapterId,
    adapter: ISendMessage | null,
    message_type: string,
    target_id: number,
    message: any,
  ) {
    super(time, self_id, adapter_id, adapter);
    this.message_type = message_type;
    this.target_id = target_id;
    this.message = message;
  }
}
