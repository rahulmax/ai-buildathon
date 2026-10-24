import 'server-only'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'

const globalForDb = globalThis as unknown as { sql?: postgres.Sql; migrated?: Promise<void> }

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL!, {
    max: 5,
    idle_timeout: 20,
    prepare: false,
    onnotice: () => {},
    // Paise fit comfortably in a JS number. Dates stay YYYY-MM-DD strings.
    types: {
      int8: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  })

if (process.env.NODE_ENV !== 'production') globalForDb.sql = sql

// Run the schema once per process. It's idempotent, so cold starts are safe.
export function migrate() {
  globalForDb.migrated ??= sql
    .unsafe(readFileSync(join(process.cwd(), 'db/schema.sql'), 'utf8'))
    .then(() => undefined)
  return globalForDb.migrated
}

export async function db() {
  await migrate()
  return sql
}
