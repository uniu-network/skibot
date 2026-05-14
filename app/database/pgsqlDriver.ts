import type { DatabaseDriver, PgsqlConfig, RunResult } from './types.js';
import logger from '../log.js';

interface PgPool {
    query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
    connect(): Promise<PgClient>;
    on(event: string, callback: (err: Error) => void): void;
    end(): Promise<void>;
}

interface PgClient {
    query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
    release(): void;
}

export class PgsqlDriver implements DatabaseDriver {
    readonly type = 'pgsql' as const;
    private config: PgsqlConfig;
    private pool: PgPool | null = null;

    constructor(config: PgsqlConfig) {
        this.config = config;
    }

    async connect(): Promise<void> {
        try {
            const { Pool } = await import('pg') as any;
            this.pool = new Pool({
                connectionString: this.config.connectionString,
                min: this.config.pool?.min ?? 2,
                max: this.config.pool?.max ?? 10,
            });

            this.pool.on('error', (err: Error) => {
                logger.error(`PostgreSQL pool error: ${err.message}`);
            });

            const client = await this.pool.connect();
            await client.query('SELECT 1');
            client.release();
            logger.info('PostgreSQL connected');
        } catch (e) {
            logger.error(`PostgreSQL connection failed: ${e}`);
            throw e;
        }
    }

    async close(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            logger.info('PostgreSQL connection closed');
        }
    }

    private ensurePool(): PgPool {
        if (!this.pool) {
            throw new Error('PostgreSQL not connected. Call connect() first.');
        }
        return this.pool;
    }

    getPlaceholder(index: number): string {
        return `$${index}`;
    }

    async execute(sql: string, params: unknown[] = []): Promise<void> {
        const pool = this.ensurePool();
        try {
            await pool.query(sql, params);
        } catch (e) {
            logger.error(`PostgreSQL execute error: ${sql} - ${e}`);
            throw e;
        }
    }

    async query<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
        const pool = this.ensurePool();
        try {
            const result = await pool.query(sql, params);
            return result.rows as T[];
        } catch (e) {
            logger.error(`PostgreSQL query error: ${sql} - ${e}`);
            throw e;
        }
    }

    async run(sql: string, params: unknown[] = []): Promise<RunResult> {
        const pool = this.ensurePool();
        try {
            const result = await pool.query(sql, params);
            return {
                changes: result.rowCount ?? 0,
                lastInsertRowid: 0,
            };
        } catch (e) {
            logger.error(`PostgreSQL run error: ${sql} - ${e}`);
            throw e;
        }
    }

    async transaction<T>(callback: () => Promise<T>): Promise<T> {
        const pool = this.ensurePool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback();
            await client.query('COMMIT');
            return result;
        } catch (e) {
            await client.query('ROLLBACK');
            logger.error(`PostgreSQL transaction error: ${e}`);
            throw e;
        } finally {
            client.release();
        }
    }
}
