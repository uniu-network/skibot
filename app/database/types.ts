export type DatabaseEngine = 'sqlite' | 'pgsql';

export interface SqliteConfig {
    file: string;
}

export interface PgsqlConfig {
    connectionString: string;
    pool?: {
        min?: number;
        max?: number;
    };
}

export interface DatabaseConfig {
    engine: DatabaseEngine;
    sqlite?: SqliteConfig;
    pgsql?: PgsqlConfig;
}

export interface QueryOptions {
    where?: Record<string, unknown>;
    limit?: number;
    offset?: number;
    orderBy?: string;
    order?: 'asc' | 'desc';
}

export interface ColumnDefinition {
    type: string;
    primaryKey?: boolean;
    autoIncrement?: boolean;
    notNull?: boolean;
    unique?: boolean;
    default?: unknown;
}

export interface TableSchema {
    columns: Record<string, ColumnDefinition | string>;
    indexes?: Array<{
        name: string;
        columns: string[];
        unique?: boolean;
    }>;
}

export interface DatabaseDriver {
    readonly type: DatabaseEngine;
    connect(): Promise<void>;
    close(): Promise<void>;
    execute(sql: string, params?: unknown[]): Promise<void>;
    query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
    run(sql: string, params?: unknown[]): Promise<RunResult>;
    transaction<T>(callback: () => Promise<T>): Promise<T>;
    getPlaceholder(index: number): string;
}

export interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
}

export type OwnerScope = 'core' | 'plugin' | 'adapter';

export interface ScopedDatabaseClient {
    createTable(table: string, schema: TableSchema): Promise<void>;
    dropTable(table: string): Promise<void>;
    insert(table: string, data: Record<string, unknown>): Promise<RunResult>;
    insertMany(table: string, rows: Record<string, unknown>[]): Promise<void>;
    update(table: string, data: Record<string, unknown>, where: Record<string, unknown>): Promise<number>;
    delete(table: string, where: Record<string, unknown>): Promise<number>;
    deleteAll(table: string): Promise<number>;
    select<T = Record<string, any>>(table: string, options?: QueryOptions): Promise<T[]>;
    selectOne<T = Record<string, any>>(table: string, where: Record<string, unknown>): Promise<T | null>;
    count(table: string, where?: Record<string, unknown>): Promise<number>;
    hasTable(table: string): Promise<boolean>;
}
