import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import type { DatabaseDriver, RunResult } from './types.js';
import logger from '../log.js';

export class SqliteDriver implements DatabaseDriver {
    readonly type = 'sqlite' as const;
    private db: BetterSqlite3.Database | null = null;
    private filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    async connect(): Promise<void> {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new BetterSqlite3(this.filePath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('busy_timeout = 5000');

        logger.info(`SQLite connected: ${this.filePath}`);
    }

    async close(): Promise<void> {
        if (this.db) {
            this.db.close();
            this.db = null;
            logger.info('SQLite connection closed');
        }
    }

    private getDb(): BetterSqlite3.Database {
        if (!this.db) {
            throw new Error('SQLite database not connected. Call connect() first.');
        }
        return this.db;
    }

    getPlaceholder(_index: number): string {
        return '?';
    }

    async execute(sql: string, params: unknown[] = []): Promise<void> {
        const db = this.getDb();
        try {
            db.prepare(sql).run(...params);
        } catch (e) {
            logger.error(`SQLite execute error: ${sql} - ${e}`);
            throw e;
        }
    }

    async query<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
        const db = this.getDb();
        try {
            return db.prepare(sql).all(...params) as T[];
        } catch (e) {
            logger.error(`SQLite query error: ${sql} - ${e}`);
            throw e;
        }
    }

    async run(sql: string, params: unknown[] = []): Promise<RunResult> {
        const db = this.getDb();
        try {
            const result = db.prepare(sql).run(...params);
            return {
                changes: result.changes,
                lastInsertRowid: result.lastInsertRowid as number | bigint,
            };
        } catch (e) {
            logger.error(`SQLite run error: ${sql} - ${e}`);
            throw e;
        }
    }

    async transaction<T>(callback: () => Promise<T>): Promise<T> {
        const db = this.getDb();
        const tx = db.transaction(() => {
            return callback();
        });

        try {
            return await tx();
        } catch (e) {
            logger.error(`SQLite transaction error: ${e}`);
            throw e;
        }
    }
}
