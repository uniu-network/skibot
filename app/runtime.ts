import * as fs from 'fs';
import type { ChildProcess } from 'child_process';
import config from './config.js';
import { BotManager } from './botManager.js';
import databaseManager from './database/manager.js';

export interface Runtime {
    botManager: BotManager;
    dashboardDevServer?: ChildProcess;
    version: string;
}

export async function createRuntime(): Promise<Runtime> {
    const version = JSON.parse(fs.readFileSync('./package.json', 'utf-8')).version;

    const engine = config.get('database.engine') || 'sqlite';
    await databaseManager.init({
        engine: engine as 'sqlite' | 'pgsql',
        sqlite: {
            file: config.get('database.sqlite.file') || './data/skibot.sqlite',
        },
        pgsql: {
            connectionString: config.get('database.pgsql.connectionString') || '',
            pool: config.get('database.pgsql.pool') || undefined,
        },
    });

    const botManager = new BotManager(config, version);

    return {
        botManager,
        version,
    };
}
