import { BotEvent, BotMessageEvent, GroupMessageEvent, PrivateMessageEvent, NoticeEvent, RequestEvent, MetaEvent } from '../../app/events.js';
import type { MessageSender } from '../../app/events.js';
import type { ISendMessage } from '../../app/types.js';
import { Message, MessageSegment } from '../../app/messages.js';
import { getSkiBotUserRole } from './utils.js';

export type OneBotAdapterId = 'onebotHttp';

export interface OneBotSenderExtra {
    sex?: 'male' | 'female' | 'unknown' | string;
    age?: number;
    area?: string;
    level?: string;
    role?: 'owner' | 'admin' | 'member' | string;
    title?: string;
    card?: string;
}

export type OneBotSender = MessageSender<OneBotSenderExtra>;
export type OneBotMessageEvent = BotMessageEvent<OneBotAdapterId, OneBotSender>;
export type OneBotGroupMessageEvent = GroupMessageEvent<OneBotAdapterId, OneBotSender>;
export type OneBotPrivateMessageEvent = PrivateMessageEvent<OneBotAdapterId, OneBotSender>;
export type OneBotNoticeEvent = NoticeEvent<OneBotAdapterId>;
export type OneBotRequestEvent = RequestEvent<OneBotAdapterId>;
export type OneBotMetaEvent = MetaEvent<OneBotAdapterId>;

export class OneBotRawEvent extends BotEvent<OneBotAdapterId> {
    post_type: string;
    detail_type?: string;
    sub_type?: string;

    constructor(time: number, selfId: number, adapter: ISendMessage, eventData: any) {
        super(time, selfId, 'onebotHttp', adapter);
        this.post_type = String(eventData.post_type || 'unknown');
        this.detail_type = eventData.message_type || eventData.notice_type || eventData.request_type || eventData.meta_event_type;
        this.sub_type = eventData.sub_type;
        this.raw_event = eventData;
    }
}

export function isOneBotEvent(event: BotEvent): event is BotEvent<OneBotAdapterId> {
    return event.adapter_id === 'onebotHttp';
}

export function isOneBotMessageEvent(event: BotEvent): event is OneBotMessageEvent {
    return isOneBotEvent(event)
        && typeof (event as any).raw_message === 'string'
        && typeof (event as any).sender?.user_id === 'number';
}

export function isOneBotGroupMessageEvent(event: BotEvent): event is OneBotGroupMessageEvent {
    return isOneBotMessageEvent(event)
        && (event as any).message_type === 'group'
        && typeof (event as any).group_id === 'number';
}

export function isOneBotPrivateMessageEvent(event: BotEvent): event is OneBotPrivateMessageEvent {
    return isOneBotMessageEvent(event)
        && (event as any).message_type === 'private'
        && typeof (event as any).user_id === 'number';
}

export function isOneBotRawEvent(event: BotEvent): event is OneBotRawEvent {
    return isOneBotEvent(event) && typeof (event as any).post_type === 'string';
}

export function getOneBotEventName(eventData: any): string {
    const postType = eventData.post_type;
    switch (postType) {
        case 'message':
            return 'message';
        case 'notice':
            return 'notice';
        case 'request':
            return 'request';
        case 'meta_event':
            return 'meta_event';
        default:
            return `onebotHttp.${postType || 'unknown'}`;
    }
}

export function matchEvents(eventData: any, adapterId: OneBotAdapterId, adapter: ISendMessage): BotEvent | null {
    const postType = eventData.post_type;
    const messageType = eventData.message_type || '';
    const noticeType = eventData.notice_type || '';
    const requestType = eventData.request_type || '';
    const metaEventType = eventData.meta_event_type || '';
    const subType = eventData.sub_type || '';

    let key: string;
    switch (postType) {
        case "message":
            key = `${postType}.${messageType}.${subType}`;
            break;
        case "notice":
            key = `${postType}.${noticeType}${subType ? `.${subType}` : ''}`;
            break;
        case "request":
            key = `${postType}.${requestType}${subType ? `.${subType}` : ''}`;
            break;
        case "meta_event":
            key = `${postType}.${metaEventType}${subType ? `.${subType}` : ''}`;
            break;
        default:
            return new OneBotRawEvent(eventData.time, eventData.self_id, adapter, eventData);
    }

    const time = eventData.time;
    const selfId = eventData.self_id;
    const sender: OneBotSender = {
        ...eventData.sender,
        ski_user_role: getSkiBotUserRole(eventData.sender?.role),
    };
    const message = eventData.message;

    const parsedMessage = MessageSegment.fromJson(message || []);

    let event: BotEvent | null = null;

    switch (postType) {
        case "message": {
            const msgId = eventData.message_id;
            const rawMsg = eventData.raw_message;

            if (messageType === "group") {
                event = new GroupMessageEvent(
                    time, selfId, adapterId, adapter,
                    msgId, parsedMessage, rawMsg, sender,
                    eventData.group_id, eventData.user_id
                );
            } else if (messageType === "private") {
                event = new PrivateMessageEvent(
                    time, selfId, adapterId, adapter,
                    msgId, parsedMessage, rawMsg, sender,
                    eventData.user_id
                );
            }
            break;
        }
        case "notice": {
            event = new NoticeEvent(time, selfId, adapterId, adapter, noticeType);
            (event as any).raw_event = eventData;
            break;
        }
        case "request": {
            event = new RequestEvent(time, selfId, adapterId, adapter, requestType);
            (event as any).raw_event = eventData;
            break;
        }
        case "meta_event": {
            event = new MetaEvent(time, selfId, adapterId, adapter, metaEventType, eventData.status);
            break;
        }
    }

    return event;
}
