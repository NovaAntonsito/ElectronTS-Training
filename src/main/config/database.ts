import { app } from 'electron'
import path from 'path'
import Database from 'better-sqlite3'
import { migration_001_initial } from '../migrations/001_initial_schema'
import { migration_002_migrate_json } from '../migrations/002_migrate_json_data'
import { migration_003_performance_indexes } from '../migrations/003_performance_indexes'

export interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => Promise<void>
  down: (db: Database.Database) => Promise<void>
}

export interface DatabaseConfig {
  path: string
  name: string
  version: number
  migrations: Migration[]
  connectionPool: {
    min: number
    max: number
    timeout: number
  }
  pragmas: {
    journal_mode: string
    synchronous: string
    cache_size: number
    temp_store: string
    mmap_size: number
  }
}

export const databaseConfig: DatabaseConfig = {
  path: path.join(app.getPath('userData'), 'database'),
  name: 'app.lightdb',
  version: 3,
  migrations: [
    migration_001_initial,
    migration_002_migrate_json,
    migration_003_performance_indexes
  ],
  connectionPool: {
    min: 2,
    max: 10,
    timeout: 30000
  },
  pragmas: {
    journal_mode: 'WAL',
    synchronous: 'NORMAL',
    cache_size: -64000, // 64MB
    temp_store: 'MEMORY',
    mmap_size: 268435456 // 256MB
  }
}
