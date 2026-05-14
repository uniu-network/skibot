import type { BotInstance } from './botInstance.js';
import { BotEvent, BotMessageEvent, BotSendEvent, GroupMessageEvent, MetaEvent, NoticeEvent, PrivateMessageEvent, RequestEvent } from './events.js';
import logger from './log.js';

function formatEvent(event: BotEvent): string {
    const base = `adapter=${event.adapter_id} self=${event.self_id}`;

    if (event instanceof GroupMessageEvent) {
        return `message group ${base} group=${event.group_id} user=${event.user_id} message_id=${event.message_id} text=${JSON.stringify(event.raw_message)}`;
    }

    if (event instanceof PrivateMessageEvent) {
        return `message private ${base} user=${event.user_id} message_id=${event.message_id} text=${JSON.stringify(event.raw_message)}`;
    }

    if (event instanceof BotMessageEvent) {
        return `message ${base} message_id=${event.message_id} user=${event.sender?.user_id ?? 'unknown'} text=${JSON.stringify(event.raw_message)}`;
    }

    if (event instanceof BotSendEvent) {
        return `bot_send ${event.message_type} ${base} target=${event.target_id}`;
    }

    if (event instanceof NoticeEvent) {
        return `notice ${base} type=${event.notice_type}`;
    }

    if (event instanceof RequestEvent) {
        return `request ${base} type=${event.request_type}`;
    }

    if (event instanceof MetaEvent) {
        return `meta_event ${base} type=${event.meta_event_type}`;
    }

    return `event ${base}`;
}

function debugEvent(botId: string, event: BotEvent): void {
    logger.debug(`[${botId}] ${JSON.stringify(event)}`);
}

export function registerEventHandlers(instance: BotInstance): void {
    const { bot, counter } = instance;

    bot.on('message', async (event: BotEvent) => {
        if (!(event instanceof BotMessageEvent)) return;
        logger.info(`[${instance.botId}] ${formatEvent(event)}`);
        debugEvent(instance.botId, event);
        await counter.addMessage(event, 'recv');
        if (event instanceof GroupMessageEvent) {
            await counter.addGroup(event.group_id);
        }
        await counter.addUser(event.sender.user_id);
    });

    bot.on('bot_send', async (event: BotEvent) => {
        if (!(event instanceof BotSendEvent)) return;
        logger.info(`[${instance.botId}] ${formatEvent(event)}`);
        debugEvent(instance.botId, event);
        await counter.addBotSendMessage(JSON.stringify(event));
    });

    bot.on('meta_event', async (event: BotEvent) => {
        logger.info(`[${instance.botId}] ${formatEvent(event)}`);
        debugEvent(instance.botId, event);
    });

    bot.on('request', async (event: BotEvent) => {
        logger.info(`[${instance.botId}] ${formatEvent(event)}`);
        debugEvent(instance.botId, event);
    });

    bot.on('notice', async (event: BotEvent) => {
        logger.info(`[${instance.botId}] ${formatEvent(event)}`);
        debugEvent(instance.botId, event);
    });
}