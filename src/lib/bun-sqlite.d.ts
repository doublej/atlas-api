// Minimal ambient typing for bun:sqlite — atlas-api runs under Bun (see the
// launchd plist), but ships no bun-types; only the surface /api/agent-log uses.
declare module 'bun:sqlite' {
  export class Database {
    constructor(filename: string, options?: { readonly?: boolean; create?: boolean })
    query(sql: string): { all(...params: (unknown[] | Record<string, unknown>)[]): unknown[] }
    close(): void
  }
}
