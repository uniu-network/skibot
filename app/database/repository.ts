import type { ScopedDatabaseClient, TableSchema, QueryOptions, RunResult } from './types.js';

export interface RepositoryOptions {
    schema?: TableSchema;
    autoCreate?: boolean;
}

export class Repository<T extends Record<string, any>> {
    private db: ScopedDatabaseClient;
    readonly tableName: string;
    private schema: TableSchema | null;
    private autoCreate: boolean;
    private tableReady = false;

    constructor(db: ScopedDatabaseClient, tableName: string, options: RepositoryOptions = {}) {
        this.db = db;
        this.tableName = tableName;
        this.schema = options.schema || null;
        this.autoCreate = options.autoCreate !== false;
    }

    async ensureTable(): Promise<void> {
        if (this.tableReady) return;
        if (this.schema && this.autoCreate) {
            await this.db.createTable(this.tableName, this.schema);
        }
        this.tableReady = true;
    }

    async create(data: Partial<T>): Promise<T> {
        await this.ensureTable();
        await this.db.insert(this.tableName, data as Record<string, unknown>);
        return data as T;
    }

    async createMany(rows: Partial<T>[]): Promise<void> {
        await this.ensureTable();
        await this.db.insertMany(this.tableName, rows as Record<string, unknown>[]);
    }

    async find(where?: Partial<T>, options?: Omit<QueryOptions, 'where'>): Promise<T[]> {
        await this.ensureTable();
        return this.db.select<T>(this.tableName, {
            ...options,
            where: where as Record<string, unknown> | undefined,
        });
    }

    async findOne(where: Partial<T>): Promise<T | null> {
        await this.ensureTable();
        return this.db.selectOne<T>(this.tableName, where as Record<string, unknown>);
    }

    async findAll(options?: Omit<QueryOptions, 'where'>): Promise<T[]> {
        await this.ensureTable();
        return this.db.select<T>(this.tableName, options);
    }

    async update(data: Partial<T>, where: Partial<T>): Promise<number> {
        await this.ensureTable();
        return this.db.update(
            this.tableName,
            data as Record<string, unknown>,
            where as Record<string, unknown>
        );
    }

    async delete(where: Partial<T>): Promise<number> {
        await this.ensureTable();
        return this.db.delete(this.tableName, where as Record<string, unknown>);
    }

    async deleteAll(): Promise<number> {
        await this.ensureTable();
        return this.db.deleteAll(this.tableName);
    }

    async count(where?: Partial<T>): Promise<number> {
        await this.ensureTable();
        return this.db.count(this.tableName, where as Record<string, unknown> | undefined);
    }

    async hasTable(): Promise<boolean> {
        return this.db.hasTable(this.tableName);
    }

    async dropTable(): Promise<void> {
        await this.db.dropTable(this.tableName);
        this.tableReady = false;
    }
}