import { createRequire } from "node:module";

export interface Statement<T, P extends unknown[]> {
  all(...params: P): T[];
  run(...params: P): void;
}

interface BunStatement {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): unknown;
}

interface BunDatabase {
  query(sql: string): BunStatement;
  run(sql: string, ...params: unknown[]): unknown;
  close(): void;
}

interface NodeStatement {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): unknown;
}

interface NodeDatabase {
  exec(sql: string): void;
  prepare(sql: string): NodeStatement;
  close(): void;
}

interface DatabaseOptions {
  create?: boolean;
  readonly?: boolean;
}

type Driver =
  | { kind: "bun"; db: BunDatabase }
  | { kind: "node"; db: NodeDatabase };

const require = createRequire(import.meta.url);

function openDriver(path: string, opts: DatabaseOptions): Driver {
  if (process.versions.bun) {
    const mod = require("bun:sqlite") as {
      Database: new (path: string, opts?: DatabaseOptions) => BunDatabase;
    };
    return { kind: "bun", db: new mod.Database(path, opts) };
  }

  const mod = require("node:sqlite") as {
    DatabaseSync: new (
      path: string,
      opts?: { open?: boolean; readOnly?: boolean },
    ) => NodeDatabase;
  };
  return {
    kind: "node",
    db: new mod.DatabaseSync(path, { readOnly: opts.readonly }),
  };
}

/**
 * Tiny compatibility wrapper over Bun's `bun:sqlite` and Node's `node:sqlite`.
 * The host runs under Node during dev/tests/default Docker, but the packaged
 * host-sidecar still runs inside Bun's compiled runtime. Keep this seam narrow:
 * the migration only needs `run`, `query().all`, `query().run`, and `close`.
 */
export class Database {
  private readonly driver: Driver;

  constructor(path: string, opts: DatabaseOptions = {}) {
    this.driver = openDriver(path, opts);
  }

  run(sql: string, ...params: unknown[]): void {
    if (this.driver.kind === "bun") {
      this.driver.db.run(sql, ...params);
      return;
    }
    if (params.length === 0) {
      this.driver.db.exec(sql);
      return;
    }
    this.driver.db.prepare(sql).run(...params);
  }

  query<T, P extends unknown[] = unknown[]>(sql: string): Statement<T, P> {
    if (this.driver.kind === "bun") {
      const stmt = this.driver.db.query(sql);
      return {
        all: (...params: P) => stmt.all(...params) as T[],
        run: (...params: P) => {
          stmt.run(...params);
        },
      };
    }

    const stmt = this.driver.db.prepare(sql);
    return {
      all: (...params: P) => stmt.all(...params) as T[],
      run: (...params: P) => {
        stmt.run(...params);
      },
    };
  }

  close(): void {
    this.driver.db.close();
  }
}
