export interface SqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): SqliteRunResult;
}

export interface SqliteDatabase {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

export interface SqliteModule {
  DatabaseSync: new (
    path: string,
    options?: { timeout?: number; enableForeignKeyConstraints?: boolean },
  ) => SqliteDatabase;
  backup(
    database: SqliteDatabase,
    path: string,
    options?: { rate?: number },
  ): Promise<number>;
}

export const loadSqlite = (): SqliteModule => {
  const runtimeProcess = process as typeof process & {
    getBuiltinModule?: (id: string) => unknown;
  };
  if (runtimeProcess.getBuiltinModule) {
    return runtimeProcess.getBuiltinModule('node:sqlite') as SqliteModule;
  }
  return require('node:sqlite') as SqliteModule;
};
