export type D1Result<T> = { results?: T[] };

export type D1Prepared = {
  bind(...values: unknown[]): D1Prepared;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
};

/** Enough of the Cloudflare D1 binding for Better Auth and the access list. */
export type D1Database = {
  prepare(query: string): D1Prepared;
  batch(statements: D1Prepared[]): Promise<unknown[]>;
  exec(query: string): Promise<unknown>;
};
