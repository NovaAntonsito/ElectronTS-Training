# DataMigrator - JSON to LightDB Migration System

## Overview

The DataMigrator is a comprehensive system for migrating user data from JSON files to a LightDB database. It provides automatic backup, data validation, integrity checking, and detailed logging throughout the migration process.

## Features

- **Automatic Backup**: Creates timestamped backups before migration
- **Data Validation**: Validates JSON data structure and user fields
- **Integrity Checking**: Verifies migrated data matches original data
- **Error Handling**: Graceful error handling with detailed logging
- **Transaction Safety**: Uses database transactions for atomic operations
- **Detailed Logging**: Comprehensive logging with different severity levels

## Usage

### Basic Migration

```typescript
import { DataMigrator } from './services/data-migrator'
import { DatabaseManager } from './services/database-manager'
import { databaseConfig } from './config/database'

// Initialize database manager
const dbManager = new DatabaseManager(databaseConfig)
await dbManager.initialize()

// Create and run migrator
const migrator = new DataMigrator(dbManager)
const result = await migrator.migrateFromJSON()

if (result.success) {
  console.log(`Migration successful: ${result.migratedUsers} users migrated`)
} else {
  console.error(`Migration failed: ${result.errors.join(', ')}`)
}
```

### Migration Result

The `migrateFromJSON()` method returns a `MigrationResult` object:

```typescript
interface MigrationResult {
  success: boolean // Overall migration success
  migratedUsers: number // Number of users successfully migrated
  createdAuthUsers: number // Number of auth users created
  errors: string[] // Array of error messages
  backupPath: string // Path to created backup
  duration: number // Migration duration in milliseconds
  validationResult: ValidationResult // Data validation results
}
```

### Validation Result

The validation result provides detailed information about data quality:

```typescript
interface ValidationResult {
  isValid: boolean // Overall validation status
  totalUsers: number // Total users in source data
  validUsers: number // Number of valid users
  invalidUsers: number // Number of invalid users
  missingFields: string[] // Fields with missing data
  duplicateDnis: number[] // Duplicate DNI values found
  errors: ValidationError[] // Detailed validation errors
}
```

## Data Sources

The DataMigrator looks for user data in the following order:

1. **Primary**: `{userData}/users.json`
2. **Backup**: `{userData}/users.backup.json`
3. **Empty**: Creates empty dataset if no files found

## Expected JSON Structure

```json
{
  "users": [
    {
      "id": "uuid-string",
      "nombre": "User Name",
      "edad": 30,
      "dni": 12345678
    }
  ],
  "metadata": {
    "version": "1.0",
    "lastModified": "2024-01-01T00:00:00.000Z"
  }
}
```

## Validation Rules

### User Validation

- **ID**: Must be non-empty string
- **Nombre**: Must be non-empty string, 2-100 characters, letters and spaces only
- **Edad**: Must be integer between 1-120
- **DNI**: Must be integer between 1,000,000-99,999,999 (7-8 digits)

### Data Integrity

- No duplicate DNI values allowed
- All required fields must be present
- Data types must match expected types

## Backup System

### Automatic Backups

- Created before each migration attempt
- Timestamped directory structure
- Includes manifest file with backup details
- Backs up JSON files and existing database

### Backup Location

```
{userData}/migration-backups/pre-migration-{timestamp}/
├── users.json
├── users.backup.json
├── app.lightdb (if exists)
└── manifest.json
```

## Error Handling

### Migration Errors

- Database connection failures
- Transaction rollback on errors
- Validation failures
- File system errors

### Recovery Strategies

- Automatic backup restoration
- Graceful degradation
- Detailed error reporting
- Transaction atomicity

## Logging

### Log Levels

- **INFO**: General information and progress
- **WARN**: Non-critical issues and warnings
- **ERROR**: Critical errors and failures

### Log Output

- Console output for immediate feedback
- File logging to `{userData}/migration.log`
- Structured log entries with timestamps

### Log Methods

```typescript
// Access migration logs
const logs = migrator.getLogs()

// Clear logs
migrator.clearLogs()
```

## Testing

### Manual Testing

```typescript
import { testMigration } from './test-migration'

// Run migration test
await testMigration()
```

### IPC Testing

The migration can be tested through IPC:

```typescript
// From renderer process
const result = await window.electron.ipcRenderer.invoke('migration:test')
```

## Database Schema

The migrator creates the following tables:

### Users Table

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  edad INTEGER NOT NULL CHECK (edad > 0 AND edad <= 120),
  dni INTEGER NOT NULL UNIQUE CHECK (dni >= 1000000 AND dni <= 99999999),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Auth Users Table

```sql
CREATE TABLE auth_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  must_change_password BOOLEAN DEFAULT FALSE,
  last_login DATETIME,
  failed_attempts INTEGER DEFAULT 0,
  locked_until DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## Performance Considerations

- Uses database transactions for atomicity
- Batch operations for efficiency
- Indexed columns for fast lookups
- Memory-efficient streaming for large datasets

## Security Features

- Password hashing for auth users
- File permission checks
- Input validation and sanitization
- SQL injection prevention through prepared statements

## Troubleshooting

### Common Issues

1. **File Not Found**: Ensure JSON files exist in userData directory
2. **Permission Errors**: Check file system permissions
3. **Database Locked**: Ensure no other processes are using the database
4. **Validation Failures**: Check JSON data format and user field values

### Debug Information

Enable detailed logging by checking the migration logs:

```typescript
const result = await migrator.migrateFromJSON()
const logs = migrator.getLogs()
logs.forEach((log) => console.log(`[${log.level}] ${log.message}`))
```
