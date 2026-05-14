import type { BotEvent, MessageSender } from '../../app/events.js';
import type { PrivateMessageEvent } from '../../app/events.js';

export type WebChatAdapterId = 'webchat';

export interface WebChatSenderExtra {
    display_name?: string;
    session_id?: string;
}

export type WebChatSender = MessageSender<WebChatSenderExtra>;
export type WebChatPrivateMessageEvent = PrivateMessageEvent<WebChatAdapterId, WebChatSender>;

export function isWebChatEvent(event: BotEvent): event is BotEvent<WebChatAdapterId> {
    return event.adapter_id === 'webchat';
}

export function isWebChatPrivateMessageEvent(event: BotEvent): event is WebChatPrivateMessageEvent {
    return isWebChatEvent(event)
        && (event as any).message_type === 'private'
        && typeof (event as any).user_id === 'number'
        && typeof (event as any).sender?.user_id === 'number';
}
