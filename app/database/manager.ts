import type { DatabaseConfig, DatabaseDriver, OwnerScope } from './types.js';
import { SqliteDriver } from './sqliteDriver.js';
import { PgsqlDriver } from './pgsqlDriver.js';
import { ScopedDatabaseClientImpl } from './scopedClient.js';
import type { ScopedDatabaseClient } from './types.js';
import logger from '../log.js';

class DatabaseManager {
    private driver: DatabaseDriver | null = null;
    private config: DatabaseConfig | null = null;
    private initialized = false;

    async init(config: DatabaseConfig): Promise<void> {
        if (this.initialized) {
            logger.warn('[DatabaseManager] Already initialized, skipping');
            return;
        }

        this.config = config;

        switch (config.engine) {
            case 'sqlite':
                this.driver = new SqliteDriver(config.sqlite?.file || './data/skibot.sqlite');
                break;
            case 'pgsql':
                if (!config.pgsql) {
                    throw new Error('[DatabaseManager] PostgreSQL config missing. Provide pgsql.connectionString.');
                }
                this.driver = new PgsqlDriver(config.pgsql);
                break;
            default:
                throw new Error(`[DatabaseManager] Unsupported engine: ${config.engine}`);
        }

        await this.driver.connect();
        this.initialized = true;
        logger.info(`[DatabaseManager] Initialized with engine: ${config.engine}`);
    }

    private getDriver(): DatabaseDriver {
        if (!this.driver || !this.initialized) {
            throw new Error('[DatabaseManager] Not initialized. Call init() first.');
        }
        return this.driver;
    }

    core(namespace: string): ScopedDatabaseClient {
        return new ScopedDatabaseClientImpl(this.getDriver(), namespace, 'core');
    }

    plugin(pluginName: string): ScopedDatabaseClient {
        const safeName = pluginName.replace(/[^a-zA-Z0-9_]/g, '_');
        return new ScopedDatabaseClientImpl(this.getDriver(), safeName, 'plugin');
    }

    adapter(adapterId: string): ScopedDatabaseClient {
        const safeId = adapterId.replace(/[^a-zA-Z0-9_]/g, '_');
        return new ScopedDatabaseClientImpl(this.getDriver(), safeId, 'adapter');
    }

    forBot(botId: string, namespace: string, scope: OwnerScope): ScopedDatabaseClient {
        const safeName = namespace.replace(/[^a-zA-Z0-9_]/g, '_');
        return new ScopedDatabaseClientImpl(this.getDriver(), safeName, scope, botId);
    }

    botPlugin(botId: string, pluginName: string): ScopedDatabaseClient {
        const safeName = pluginName.replace(/[^a-zA-Z0-9_]/g, '_');
        return new ScopedDatabaseClientImpl(this.getDriver(), safeName, 'plugin', botId);
    }

    botAdapter(botId: string, adapterId: string): ScopedDatabaseClient {
        const safeId = adapterId.replace(/[^a-zA-Z0-9_]/g, '_');
        return new ScopedDatabaseClientImpl(this.getDriver(), safeId, 'adapter', botId);
    }

    botCore(botId: string, namespace: string): ScopedDatabaseClient {
        const safeName = namespace.replace(/[^a-zA-Z0-9_]/g, '_');
        return new ScopedDatabaseClientImpl(this.getDriver(), safeName, 'core', botId);
    }

    async close(): Promise<void> {
        if (this.driver) {
            await this.driver.close();
            this.driver = null;
            this.initialized = false;
            logger.info('[DatabaseManager] Closed');
        }
    }

    isInitialized(): boolean {
        return this.initialized;
    }
}

const databaseManager = new DatabaseManager();
export default databaseManager;
export { DatabaseManager };
