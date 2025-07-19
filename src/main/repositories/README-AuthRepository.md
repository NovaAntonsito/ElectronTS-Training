# AuthRepository - Authentication User Management

The `AuthRepository` class provides comprehensive authentication user and session management for the LightDB migration project. It handles authentication users, session management, user locking, and failed login attempt tracking.

## Features

### Authentication User Management

- Create, read, update authentication users
- Username-based user lookup with optimized indexes
- User activation/deactivation
- Password change requirements tracking

### Session Management

- Create and manage user sessions with expiration
- Token-based session lookup
- Automatic session cleanup
- User-specific session management

### Security Features

- Failed login attempt tracking
- User account locking with time-based unlocking
- Session expiration handling
- Secure password hash storage

### Statistics and Monitoring

- User statistics (total, active, locked)
- Session statistics (total, active)
- Cleanup operation tracking

## Usage Examples

### Basic User Operations

```typescript
import { AuthRepository } from './repositories/auth-repository'
import Database from 'better-sqlite3'

const db = new Database('app.db')
const authRepo = new AuthRepository(db)

// Create a new authentication user
const user = await authRepo.createUser({
  username: 'admin',
  password_hash: 'hashed_password_123',
  display_name: 'Administrator',
  active: true,
  must_change_password: false
})

// Find user by username
const foundUser = await authRepo.findUserByUsername('admin')

// Update user
const updatedUser = await authRepo.updateUser(user.id, {
  display_name: 'System Administrator',
  active: false
})
```

### Session Management

```typescript
// Create a session
const session = await authRepo.createSession({
  user_id: user.id,
  token: 'secure_session_token',
  expires_at: new Date(Date.now() + 3600000) // 1 hour from now
})

// Find session by token
const activeSession = await authRepo.findSessionByToken('secure_session_token')

// Get all active sessions for a user
const userSessions = await authRepo.getUserActiveSessions(user.id)

// Delete session
await authRepo.deleteSession('secure_session_token')

// Delete all user sessions
await authRepo.deleteUserSessions(user.id)
```

### Security Operations

```typescript
// Track failed login attempts
await authRepo.incrementFailedAttempts(user.id)

// Check if user is locked
const isLocked = await authRepo.isUserLocked(user.id)

// Lock user for 30 minutes
const lockUntil = new Date(Date.now() + 30 * 60 * 1000)
await authRepo.lockUser(user.id, lockUntil)

// Reset failed attempts and unlock
await authRepo.resetFailedAttempts(user.id)

// Update last login
await authRepo.updateLastLogin(user.id)
```

### Session Cleanup

```typescript
import { SessionCleanupService } from '../services/session-cleanup'

// Create cleanup service
const cleanupService = new SessionCleanupService(authRepo, {
  intervalMinutes: 30, // Run every 30 minutes
  maxSessionAge: 24, // Sessions expire after 24 hours
  batchSize: 100 // Process 100 sessions at once
})

// Start automatic cleanup
cleanupService.start()

// Manual cleanup
await cleanupService.runCleanup()

// Get cleanup statistics
const stats = cleanupService.getStats()
console.log('Cleanup stats:', stats)

// Stop cleanup service
cleanupService.stop()
```

### Statistics and Monitoring

```typescript
// Get authentication statistics
const stats = await authRepo.getAuthStats()
console.log('Auth stats:', {
  totalUsers: stats.users.total,
  activeUsers: stats.users.active,
  lockedUsers: stats.users.locked,
  totalSessions: stats.sessions.total,
  activeSessions: stats.sessions.active
})

// Find users with filtering
const activeUsers = await authRepo.findAllUsers({ activeOnly: true })
const lockedUsers = await authRepo.findAllUsers({ lockedOnly: true })
const searchResults = await authRepo.findAllUsers({ searchTerm: 'admin' })
```

## Database Schema

The AuthRepository uses the following database tables:

### auth_users Table

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

### auth_sessions Table

```sql
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
)
```

## Performance Optimizations

The implementation includes several performance optimizations:

- **Indexes**: Optimized indexes on username, token, and expiration fields
- **Transactions**: All write operations use database transactions
- **Prepared Statements**: All queries use prepared statements for better performance
- **Batch Operations**: Session cleanup processes multiple sessions efficiently
- **Connection Pooling**: Designed to work with connection pooling (when implemented)

## Error Handling

The AuthRepository provides comprehensive error handling:

- **DatabaseError**: For database operation failures
- **Validation Errors**: For invalid input data
- **Constraint Violations**: For duplicate usernames or other constraint violations
- **Not Found Errors**: For operations on non-existent records

## Security Considerations

- **Password Hashing**: Stores only password hashes, never plain text passwords
- **Session Security**: Sessions have expiration times and can be invalidated
- **Account Locking**: Prevents brute force attacks with automatic account locking
- **Input Validation**: All inputs are validated before database operations
- **SQL Injection Prevention**: Uses prepared statements to prevent SQL injection

## Integration with Migration System

The AuthRepository is designed to work seamlessly with the LightDB migration system:

- Uses the same database connection as other repositories
- Follows the same error handling patterns
- Integrates with the migration runner for schema updates
- Compatible with the existing database manager

## Testing

A comprehensive test suite is available in `test-auth-repository.ts` that demonstrates:

- User creation and management
- Session lifecycle management
- Security feature testing
- Statistics and monitoring
- Session cleanup functionality

Run the test with:

```bash
npx tsc src/main/test-auth-repository.ts --outDir temp --target es2020 --module commonjs --esModuleInterop --skipLibCheck
node temp/test-auth-repository.js
```

## Requirements Fulfilled

This implementation fulfills the following requirements from the specification:

- **Requirement 4.1**: Authentication user table with secure storage
- **Requirement 4.2**: Password hash storage and validation
- **Requirement 4.3**: Session management in database
- **Requirement 4.4**: User locking and failed attempt control

The AuthRepository provides a robust, secure, and performant solution for authentication user management in the LightDB migration project.
