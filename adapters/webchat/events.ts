import type { BotEvent, MessageSender } from '../../app/events.js';
import type { GroupMessageEvent, PrivateMessageEvent } from '../../app/events.js';

export type WebChatAdapterId = 'webchat';

export interface WebChatSenderExtra {
    display_name?: string;
    session_id?: string;
}

export type WebChatSender = MessageSender<WebChatSenderExtra>;
export type WebChatGroupMessageEvent = GroupMessageEvent<WebChatAdapterId, WebChatSender>;
export type WebChatPrivateMessageEvent = PrivateMessageEvent<WebChatAdapterId, WebChatSender>;

type WebChatMessageShape = BotEvent & {
    message_type?: unknown;
    group_id?: unknown;
    user_id?: unknown;
    sender?: { user_id?: unknown };
};

export function isWebChatEvent(event: BotEvent): event is BotEvent<WebChatAdapterId> {
    return event.adapter_id === 'webchat';
}

export function isWebChatPrivateMessageEvent(event: BotEvent): event is WebChatPrivateMessageEvent {
    const candidate = event as WebChatMessageShape;
    return isWebChatEvent(event)
        && candidate.message_type === 'private'
        && typeof candidate.user_id === 'number'
        && typeof candidate.sender?.user_id === 'number';
}

export function isWebChatGroupMessageEvent(event: BotEvent): event is WebChatGroupMessageEvent {
    const candidate = event as WebChatMessageShape;
    return isWebChatEvent(event)
        && candidate.message_type === 'group'
        && typeof candidate.group_id === 'number'
        && typeof candidate.user_id === 'number'
        && typeof candidate.sender?.user_id === 'number';
}
