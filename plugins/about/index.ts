import { BasePlugin } from '../../dist/app/pluginBase.js';
import type { ParsedArgs } from '../../dist/app/argParser.js';
import type { Handler } from '../../dist/app/bot.js';
import type { Message } from '../../dist/app/messages.js';
import type { PluginContext } from '../../dist/app/types.js';
import { MessageSegment } from '../../dist/app/messages.js';

export default class About extends BasePlugin {
    async onLoad(ctx: PluginContext): Promise<void> {
        ctx.bot.command('about', '获取关于信息', async (args: ParsedArgs, handler: Handler, msg: Message) => {
            msg.addMessage(MessageSegment.text(`SkiBot v${ctx.version}\nAuthor: @unify-z\nhttps://github.com/unify-z/skibot`));
            handler.finish(msg);
        });
    }
}
