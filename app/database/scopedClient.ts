import type {
  DatabaseDriver,
  ScopedDatabaseClient,
  TableSchema,
  ColumnDefinition,
  QueryOptions,
  RunResult,
  OwnerScope,
} from "./types.js";
import logger from "../log.js";

const VALID_TABLE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class ScopedDatabaseClientImpl implements ScopedDatabaseClient {
  private driver: DatabaseDriver;
  private prefix: string;
  private knownSchemas: Map<string, TableSchema> = new Map();

  constructor(
    driver: DatabaseDriver,
    owner: string,
    scope: OwnerScope,
    botId?: string,
  ) {
    this.driver = driver;
    if (botId) {
      const safeBotId = botId.replace(/[^a-zA-Z0-9_]/g, "_");
      this.prefix = `bot_${safeBotId}_${scope}_${owner}`;
    } else {
      this.prefix = `${scope}_${owner}`;
    }
  }

  private resolveTableName(table: string): string {
    return `${this.prefix}_${table}`;
  }

  private validateTableName(table: string): void {
    if (!VALID_TABLE_NAME.test(table)) {
      throw new Error(
        `[ScopedDB:${this.prefix}] Invalid table name: "${table}". ` +
          `Only alphanumeric and underscore characters allowed, must start with a letter or underscore.`,
      );
    }
  }

  private getFullTableName(table: string): string {
    this.validateTableName(table);
    return this.resolveTableName(table);
  }

  private mapColumnType(
    colDef: ColumnDefinition | string,
    driverType: string,
  ): string {
    if (typeof colDef === "string") {
      return this.mapSimpleType(colDef, driverType);
    }

    const parts: string[] = [];
    const typeStr = this.mapSimpleType(colDef.type, driverType);
    parts.push(typeStr);

    if (colDef.primaryKey) {
      if (driverType === "sqlite") {
        if (colDef.autoIncrement) {
          parts.push("PRIMARY KEY AUTOINCREMENT");
        } else {
          parts.push("PRIMARY KEY");
        }
      } else {
        if (colDef.autoIncrement) {
          parts.push("PRIMARY KEY GENERATED ALWAYS AS IDENTITY");
        } else {
          parts.push("PRIMARY KEY");
        }
      }
    } else {
      if (colDef.notNull) {
        parts.push("NOT NULL");
      }
      if (colDef.unique) {
        parts.push("UNIQUE");
      }
      if (colDef.default !== undefined) {
        const defaultVal =
          typeof colDef.default === "string"
            ? `'${colDef.default}'`
            : String(colDef.default);
        parts.push(`DEFAULT ${defaultVal}`);
      }
    }

    return parts.join(" ");
  }

  private mapSimpleType(type: string, driverType: string): string {
    const typeMap: Record<string, { sqlite: string; pgsql: string }> = {
      text: { sqlite: "TEXT", pgsql: "TEXT" },
      integer: { sqlite: "INTEGER", pgsql: "INTEGER" },
      real: { sqlite: "REAL", pgsql: "REAL" },
      blob: { sqlite: "BLOB", pgsql: "BYTEA" },
      json: { sqlite: "TEXT", pgsql: "JSONB" },
      boolean: { sqlite: "INTEGER", pgsql: "BOOLEAN" },
      serial: {
        sqlite: "INTEGER PRIMARY KEY AUTOINCREMENT",
        pgsql: "SERIAL PRIMARY KEY",
      },
    };

    const normalized = type.toLowerCase().trim();
    if (typeMap[normalized]) {
      return typeMap[normalized][driverType as "sqlite" | "pgsql"];
    }

    return type;
  }

  async createTable(table: string, schema: TableSchema): Promise<void> {
    const fullName = this.getFullTableName(table);
    const driverType = this.driver.type;

    const columnDefs: string[] = [];
    for (const [colName, colDef] of Object.entries(schema.columns)) {
      const sqlType = this.mapColumnType(colDef, driverType);
      columnDefs.push(`"${colName}" ${sqlType}`);
    }

    let sql = `CREATE TABLE IF NOT EXISTS "${fullName}" (\n  ${columnDefs.join(",\n  ")}\n)`;

    if (driverType === "sqlite") {
      sql += ";";
    }

    await this.driver.execute(sql);

    if (schema.indexes) {
      for (const idx of schema.indexes) {
        const uniqueStr = idx.unique ? "UNIQUE " : "";
        const idxName = `idx_${fullName}_${idx.name}`;
        const cols = idx.columns.map((c) => `"${c}"`).join(", ");
        const indexSql = `CREATE ${uniqueStr}INDEX IF NOT EXISTS "${idxName}" ON "${fullName}" (${cols})`;
        await this.driver.execute(indexSql);
      }
    }

    this.knownSchemas.set(table, schema);
  }

  async dropTable(table: string): Promise<void> {
    const fullName = this.getFullTableName(table);
    await this.driver.execute(`DROP TABLE IF EXISTS "${fullName}"`);
    this.knownSchemas.delete(table);
    logger.info(`[ScopedDB:${this.prefix}] Table dropped: ${fullName}`);
  }

  async insert(
    table: string,
    data: Record<string, unknown>,
  ): Promise<RunResult> {
    const fullName = this.getFullTableName(table);
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map((_, i) =>
      this.driver.getPlaceholder(i + 1),
    );
    const colList = columns.map((c) => `"${c}"`).join(", ");
    const valList = placeholders.join(", ");

    const sql = `INSERT INTO "${fullName}" (${colList}) VALUES (${valList})`;
    return this.driver.run(sql, values);
  }

  async insertMany(
    table: string,
    rows: Record<string, unknown>[],
  ): Promise<void> {
    if (rows.length === 0) return;

    const fullName = this.getFullTableName(table);
    const columns = Object.keys(rows[0]);
    const colList = columns.map((c) => `"${c}"`).join(", ");

    await this.driver.transaction(async () => {
      for (const data of rows) {
        const values = columns.map((c) => data[c]);
        const placeholders = columns.map((_, i) =>
          this.driver.getPlaceholder(i + 1),
        );
        const valList = placeholders.join(", ");
        const sql = `INSERT INTO "${fullName}" (${colList}) VALUES (${valList})`;
        await this.driver.run(sql, values);
      }
    });
  }

  async update(
    table: string,
    data: Record<string, unknown>,
    where: Record<string, unknown>,
  ): Promise<number> {
    const fullName = this.getFullTableName(table);

    if (!data || Object.keys(data).length === 0) {
      throw new Error(
        `[ScopedDB:${this.prefix}] update() requires at least one field to update.`,
      );
    }
    if (!where || Object.keys(where).length === 0) {
      throw new Error(
        `[ScopedDB:${this.prefix}] update() requires at least one where condition to prevent accidental bulk updates.`,
      );
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(data)) {
      setClauses.push(`"${key}" = ${this.driver.getPlaceholder(paramIdx++)}`);
      values.push(value);
    }

    const whereClauses: string[] = [];
    for (const [key, value] of Object.entries(where)) {
      whereClauses.push(`"${key}" = ${this.driver.getPlaceholder(paramIdx++)}`);
      values.push(value);
    }

    const sql = `UPDATE "${fullName}" SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")}`;
    const result = await this.driver.run(sql, values);
    return result.changes;
  }

  async delete(table: string, where: Record<string, unknown>): Promise<number> {
    if (!where || Object.keys(where).length === 0) {
      throw new Error(
        `[ScopedDB:${this.prefix}] delete() requires at least one where condition. Use deleteAll() to delete all rows.`,
      );
    }

    const fullName = this.getFullTableName(table);
    const whereClauses: string[] = [];
    const values: unknown[] = [];

    let paramIdx = 1;
    for (const [key, value] of Object.entries(where)) {
      whereClauses.push(`"${key}" = ${this.driver.getPlaceholder(paramIdx++)}`);
      values.push(value);
    }

    const sql = `DELETE FROM "${fullName}" WHERE ${whereClauses.join(" AND ")}`;
    const result = await this.driver.run(sql, values);
    return result.changes;
  }

  async deleteAll(table: string): Promise<number> {
    const fullName = this.getFullTableName(table);
    const sql = `DELETE FROM "${fullName}"`;
    const result = await this.driver.run(sql);
    return result.changes;
  }

  async select<T = Record<string, any>>(
    table: string,
    options?: QueryOptions,
  ): Promise<T[]> {
    const fullName = this.getFullTableName(table);
    let sql = `SELECT * FROM "${fullName}"`;
    const values: unknown[] = [];
    let paramIdx = 1;

    if (options?.where && Object.keys(options.where).length > 0) {
      const clauses: string[] = [];
      for (const [key, value] of Object.entries(options.where)) {
        clauses.push(`"${key}" = ${this.driver.getPlaceholder(paramIdx++)}`);
        values.push(value);
      }
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }

    if (options?.orderBy) {
      const order = options.order || "asc";
      sql += ` ORDER BY "${options.orderBy}" ${order.toUpperCase()}`;
    }

    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
    }

    if (options?.offset) {
      sql += ` OFFSET ${options.offset}`;
    }

    return this.driver.query<T>(sql, values);
  }

  async selectOne<T = Record<string, any>>(
    table: string,
    where: Record<string, unknown>,
  ): Promise<T | null> {
    const results = await this.select<T>(table, { where, limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  async count(table: string, where?: Record<string, unknown>): Promise<number> {
    const fullName = this.getFullTableName(table);
    let sql = `SELECT COUNT(*) AS cnt FROM "${fullName}"`;
    const values: unknown[] = [];
    let paramIdx = 1;

    if (where && Object.keys(where).length > 0) {
      const clauses: string[] = [];
      for (const [key, value] of Object.entries(where)) {
        clauses.push(`"${key}" = ${this.driver.getPlaceholder(paramIdx++)}`);
        values.push(value);
      }
      sql += ` WHERE ${clauses.join(" AND ")}`;
    }

    const result = await this.driver.query<{ cnt: number }>(sql, values);
    return result[0]?.cnt ?? 0;
  }

  async hasTable(table: string): Promise<boolean> {
    const fullName = this.getFullTableName(table);
    const isPgsql = (this.driver as any).connectionString !== undefined;

    if (isPgsql) {
      const result = await this.driver.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = $1`,
        [fullName],
      );
      return result.length > 0;
    } else {
      const result = await this.driver.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [fullName],
      );
      return result.length > 0;
    }
  }
}
