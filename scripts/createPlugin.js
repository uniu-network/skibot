import readLine from "readline";
import * as fs from 'fs';

const rl = readLine.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function askQuestion(query) {
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            resolve(answer);
        });
    });
}

async function getUserInput() {
    const name = await askQuestion("插件名称: ");
    const description = await askQuestion("插件描述: ");
    const author = await askQuestion("插件作者: ");
    const version = await askQuestion("插件版本: ");
    const license = await askQuestion("插件许可证: ");

    rl.close();

    return {
        name: name.replace(/ /g, "-"),
        description: description.replace(/ /g, "-"),
        author: author.replace(/ /g, "-"),
        version: version.replace(/ /g, "-"),
        license: license.replace(/ /g, "-")
    };
}

async function createPlugin(plugindata) {
    console.log('Creating plugin directory...');
    fs.mkdirSync(`./plugins/${plugindata.name}`);
    console.log('Creating plugin.json...');

    const plugin_json = {
        "name": plugindata.name,
        "version": plugindata.version,
        "description": plugindata.description,
        "author": plugindata.author,
        "license": plugindata.license
    };
    fs.writeFileSync(`./plugins/${plugindata.name}/plugin.json`, JSON.stringify(plugin_json, null, 2));

    console.log('Creating package.json...');
    const pkg_json = {
        "name": plugindata.name,
        "version": plugindata.version,
        "type": "module",
        "dependencies": {}
    };
    fs.writeFileSync(`./plugins/${plugindata.name}/package.json`, JSON.stringify(pkg_json, null, 2));

    console.log('Creating plugin index.ts...');
    const template = `import { BasePlugin, ConfigField } from '../../app/pluginBase.js';
import type { PluginContext } from '../../app/types.js';
import type { ParsedArgs } from '../../app/argParser.js';
import { MessageSegment } from '../../app/messages.js';

export default class ${plugindata.name.replace(/-/g, '_')} extends BasePlugin {

    @ConfigField({ type: 'string', default: 'Hello from plugin!', description: '示例回复内容' })
    declare replyText: string;

    async onLoad(ctx: PluginContext): Promise<void> {
        ctx.bot.command('example', '示例指令', async (args: ParsedArgs, handler, msg, event) => {
            // Positional args: args._[0], args._[1], ...
            // Boolean flags: --verbose  →  args.verbose === true
            //    Negation:    --no-flag → args.flag === false
            // Key-value:     --name foo → args.name === 'foo'
            // Short flags:   -x         → args.x === true
            //    Combined:    -xyz       → args.x, args.y, args.z are true
            // Short KV:      -n foo     → args.n === 'foo'
            msg.addMessage(MessageSegment.text(this.config.replyText));
            await handler.finish(msg);
        });
    }

    async onUnload(): Promise<void> {
        // Cleanup when plugin is unloaded
    }
}
`;
    fs.writeFileSync(`./plugins/${plugindata.name}/index.ts`, template);
    console.log('Plugin created!');
    console.log(`To add dependencies: cd plugins/${plugindata.name} && npm install <package> --save`);
    console.log(`To install all plugin deps: npm run install-dependencies`);
}

async function main() {
    if (!fs.existsSync('./plugins')) {
        fs.mkdirSync('./plugins');
    }
    const plugindata = await getUserInput();
    await createPlugin(plugindata);
}

main();
