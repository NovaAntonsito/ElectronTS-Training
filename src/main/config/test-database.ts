import path from 'path'
import os from 'os'
import { DatabaseConfig } from './database'
import { migration_001_initial } from '../migrations/001_initial_schema'

// Use a unique database name for each test run
const timestamp = Date.now()
export const testDatabaseConfig: DatabaseConfig = {
  path: path.join(os.tmpdir(), 'lightdb-test'),
  name: `test-${timestamp}.lightdb`,
  version: 1,
  migrations: [migration_001_initial],
  connectionPool: {
    min: 1,
    max: 5,
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
