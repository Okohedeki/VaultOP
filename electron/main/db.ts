import Database from 'better-sqlite3'
import { log } from './log'

export type Db = Database.Database

/** Open (creating if needed) the vault database and apply the schema. */
export function openDb(dbFile: string, schemaSql: string): Db {
  const db = new Database(dbFile)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(schemaSql)
  runMigrations(db)
  log.info('db.open', { dbFile })
  return db
}

/** Idempotent additive migrations for databases created by an older schema. */
function runMigrations(db: Db): void {
  const segmentCols = new Set(
    (db.pragma('table_info(segment)') as Array<{ name: string }>).map((c) => c.name),
  )
  if (!segmentCols.has('transcript_text')) {
    db.exec('ALTER TABLE segment ADD COLUMN transcript_text TEXT')
  }

  const variantCols = new Set(
    (db.pragma('table_info(variant)') as Array<{ name: string }>).map((c) => c.name),
  )
  if (!variantCols.has('render_state')) {
    db.exec("ALTER TABLE variant ADD COLUMN render_state TEXT NOT NULL DEFAULT 'queued'")
  }
  if (!variantCols.has('render_error')) db.exec('ALTER TABLE variant ADD COLUMN render_error TEXT')
  if (!variantCols.has('duration_ms')) db.exec('ALTER TABLE variant ADD COLUMN duration_ms INTEGER')
}
