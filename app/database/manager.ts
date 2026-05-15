import type { DatabaseConfig, DatabaseDriver, OwnerScope } from "./types.js";
import { SqliteDriver } from "./sqliteDriver.js";
import { PgsqlDriver } from "./pgsqlDriver.js";
import { ScopedDatabaseClientImpl } from "./scopedClient.js";
import type { ScopedDatabaseClient } from "./types.js";
import logger from "../log.js";

class DatabaseManager {
  private driver: DatabaseDriver | null = null;
  private config: DatabaseConfig | null = null;
  private initialized = false;

  async init(config: DatabaseConfig): Promise<void> {
    if (this.initialized) {
      logger.warn("[DatabaseManager] Already initialized, skipping");
      return;
    }

    this.config = config;

    switch (config.engine) {
      case "sqlite":
        this.driver = new SqliteDriver(
          config.sqlite?.file || "./data/skibot.sqlite",
        );
        break;
      case "pgsql":
        if (!config.pgsql) {
          throw new Error(
            "[DatabaseManager] PostgreSQL config missing. Provide pgsql.connectionString.",
          );
        }
        this.driver = new PgsqlDriver(config.pgsql);
        break;
      default:
        throw new Error(
          `[DatabaseManager] Unsupported engine: ${config.engine}`,
        );
    }

    await this.driver.connect();
    this.initialized = true;
    logger.info(`[DatabaseManager] Initialized with engine: ${config.engine}`);
  }

  private getDriver(): DatabaseDriver {
    if (!this.driver || !this.initialized) {
      throw new Error("[DatabaseManager] Not initialized. Call init() first.");
    }
    return this.driver;
  }

  core(namespace: string): ScopedDatabaseClient {
    return new ScopedDatabaseClientImpl(this.getDriver(), namespace, "core");
  }

  plugin(pluginName: string): ScopedDatabaseClient {
    const safeName = pluginName.replace(/[^a-zA-Z0-9_]/g, "_");
    return new ScopedDatabaseClientImpl(this.getDriver(), safeName, "plugin");
  }

  adapter(adapterId: string): ScopedDatabaseClient {
    const safeId = adapterId.replace(/[^a-zA-Z0-9_]/g, "_");
    return new ScopedDatabaseClientImpl(this.getDriver(), safeId, "adapter");
  }

  forBot(
    botId: string,
    namespace: string,
    scope: OwnerScope,
  ): ScopedDatabaseClient {
    const safeName = namespace.replace(/[^a-zA-Z0-9_]/g, "_");
    return new ScopedDatabaseClientImpl(
      this.getDriver(),
      safeName,
      scope,
      botId,
    );
  }

  botPlugin(botId: string, pluginName: string): ScopedDatabaseClient {
    const safeName = pluginName.replace(/[^a-zA-Z0-9_]/g, "_");
    return new ScopedDatabaseClientImpl(
      this.getDriver(),
      safeName,
      "plugin",
      botId,
    );
  }

  botAdapter(botId: string, adapterId: string): ScopedDatabaseClient {
    const safeId = adapterId.replace(/[^a-zA-Z0-9_]/g, "_");
    return new ScopedDatabaseClientImpl(
      this.getDriver(),
      safeId,
      "adapter",
      botId,
    );
  }

  botCore(botId: string, namespace: string): ScopedDatabaseClient {
    const safeName = namespace.replace(/[^a-zA-Z0-9_]/g, "_");
    return new ScopedDatabaseClientImpl(
      this.getDriver(),
      safeName,
      "core",
      botId,
    );
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      this.initialized = false;
      logger.info("[DatabaseManager] Closed");
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getEngineType(): string {
    return this.config?.engine || "unknown";
  }

  async listTables(): Promise<string[]> {
    const driver = this.getDriver();
    if (driver.type === "sqlite") {
      const rows = await driver.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      );
      return rows.map((r) => r.name);
    } else {
      const rows = await driver.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
      );
      return rows.map((r) => r.tablename);
    }
  }

  async describeTable(tableName: string): Promise<ColumnInfo[]> {
    const driver = this.getDriver();
    if (driver.type === "sqlite") {
      const rows = await driver.query<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: any;
        pk: number;
      }>(`PRAGMA table_info("${tableName}")`);
      return rows.map((r) => ({
        name: r.name,
        type: r.type,
        notNull: r.notnull === 1,
        defaultValue: r.dflt_value,
        primaryKey: r.pk === 1,
      }));
    } else {
      const rows = await driver.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string;
      }>(
        `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
        [tableName],
      );
      return rows.map((r) => ({
        name: r.column_name,
        type: r.data_type,
        notNull: r.is_nullable === "NO",
        defaultValue: r.column_default,
        primaryKey: false,
      }));
    }
  }

  async getTableRowCount(tableName: string): Promise<number> {
    const driver = this.getDriver();
    if (driver.type === "sqlite") {
      const rows = await driver.query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM "${tableName}"`,
      );
      return rows[0]?.cnt ?? 0;
    } else {
      const rows = await driver.query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM "${tableName}"`,
      );
      return rows[0]?.cnt ?? 0;
    }
  }

  async queryRaw<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]> {
    return this.getDriver().query<T>(sql, params);
  }

  async executeRaw(
    sql: string,
    params?: unknown[],
  ): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
    return this.getDriver().run(sql, params);
  }

  getPlaceholder(index: number): string {
    return this.getDriver().getPlaceholder(index);
  }

  async getRowCount(tableName: string): Promise<number> {
    return this.getTableRowCount(tableName);
  }
}

export interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: any;
  primaryKey: boolean;
}

const databaseManager = new DatabaseManager();
export default databaseManager;
export { DatabaseManager };
