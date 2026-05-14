import type { IHTTPAdapter, ISendMessage, AdapterContext } from '../../app/types.js';
import { Message } from '../../app/messages.js';
import { getOneBotEventName, matchEvents } from './events.js';
import { callApi } from './api.js';
import { toOneBotMessage } from './messages.js';
import logger from '../../app/log.js';

export class OneBotHTTPAdapter implements IHTTPAdapter, ISendMessage {
    readonly id = 'onebotHttp';
    readonly name = 'OneBot HTTP';
    private config: any;
    private ctx: AdapterContext | null = null;

    constructor(config: any) {
        this.config = config;
    }

    async start(ctx: AdapterContext): Promise<void> {
        this.ctx = ctx;
        logger.info(`OneBot HTTP adapter started, API url: ${this.config.url}`);
    }

    async stop(): Promise<void> {
        this.ctx = null;
    }

    async handleHttpRequest(req: any, res: any): Promise<boolean> {
        if (!this.ctx) return false;

        const event = matchEvents(req.body, this.id, this);
        if (event) {
            const eventName = getOneBotEventName(req.body);
            this.ctx.emitEvent(eventName, event);
            res.send('success');
            return true;
        }
        return false;
    }

    async send_group_msg(target_id: string | number, message: Message): Promise<void> {
        const msg = toOneBotMessage(message);

        await callApi(this.config.url, '/send_group_msg', {
            group_id: target_id,
            message: msg
        });
    }

    async send_private_msg(target_id: string | number, message: Message): Promise<void> {
        const msg = toOneBotMessage(message);

        await callApi(this.config.url, '/send_private_msg', {
            user_id: target_id,
            message: msg
        });
    }

    async approveFriend(flag: any, remark?: string): Promise<void> {
        const { approveFriend } = await import('./api.js');
        await approveFriend(this.config.url, flag, remark);
    }

    async rejectFriend(flag: any): Promise<void> {
        const { rejectFriend } = await import('./api.js');
        await rejectFriend(this.config.url, flag);
    }

    async approveGroup(flag: any, subType: any): Promise<void> {
        const { approveGroup } = await import('./api.js');
        await approveGroup(this.config.url, flag, subType);
    }

    async rejectGroup(flag: any, subType: any, reason?: string): Promise<void> {
        const { rejectGroup } = await import('./api.js');
        await rejectGroup(this.config.url, flag, subType, reason);
    }

    async setGroupBan(groupId: number, userId: number, duration: number): Promise<void> {
        const { setGroupBan } = await import('./api.js');
        await setGroupBan(this.config.url, groupId, userId, duration);
    }
}
