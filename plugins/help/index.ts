import { BasePlugin, ConfigField } from '../../dist/app/pluginBase.js';
import type { ParsedArgs } from '../../dist/app/argParser.js';
import type { Handler } from '../../dist/app/bot.js';
import type { Message } from '../../dist/app/messages.js';
import type { PluginContext } from '../../dist/app/types.js';
import { MessageSegment } from '../../dist/app/messages.js';

function normalizePrefix(prefix: string | string[] | undefined): string[] {
    if (!prefix) return ['/'];
    if (Array.isArray(prefix)) return prefix.map(s => String(s));
    return [String(prefix)];
}

export default class Help extends BasePlugin {
    @ConfigField({ type: 'boolean', default: true, description: '是否启用 /help 指令' })
    enabled = true;

    async onLoad(ctx: PluginContext): Promise<void> {
        const prefixes = normalizePrefix(ctx.botConfig.get('prefix'));

        ctx.bot.command('help', '获取帮助信息', async (args: ParsedArgs, handler: Handler, msg: Message) => {
            let helpMsg = '当前共有以下可用指令:\n';
            for (const item of ctx.bot.commands) {
                const prefixStr = prefixes.length === 1
                    ? `${prefixes[0]}${item.command}`
                    : `[${prefixes.join('/')}]${item.command}`;
                helpMsg += `${prefixStr} - ${item.description}\n`;
            }
            msg.addMessage(MessageSegment.text(helpMsg));
            handler.finish(msg);
        });
    }
}
