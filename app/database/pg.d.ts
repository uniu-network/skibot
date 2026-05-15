declare module "pg" {
  export class Pool {
    constructor(config?: any);
    query(
      sql: string,
      params?: unknown[],
    ): Promise<{ rows: any[]; rowCount: number | null }>;
    connect(): Promise<{
      query(
        sql: string,
        params?: unknown[],
      ): Promise<{ rows: any[]; rowCount: number | null }>;
      release(): void;
    }>;
    on(event: string, callback: (err: Error) => void): void;
    end(): Promise<void>;
  }
}
