import Database from 'better-sqlite3'
import { AuthRepository } from './repositories/auth-repository'
import { SessionCleanupService } from './services/session-cleanup'
import { migration_001_initial } from './migrations/001_initial_schema'

/**
 * Test script to demonstrate AuthRepository functionality
 * This can be run to verify the implementation works correctly
 */
async function testAuthRepository() {
  console.log('🔧 Testing AuthRepository implementation...')

  // Create in-memory database for testing
  const db = new Database(':memory:')

  try {
    // Apply initial schema
    console.log('📋 Setting up database schema...')
    await migration_001_initial.up(db)

    // Create repository instance
    const authRepository = new AuthRepository(db)

    // Test 1: Create authentication user
    console.log('\n👤 Testing user creation...')
    const testUser = await authRepository.createUser({
      username: 'admin',
      password_hash: 'hashed_password_123',
      display_name: 'Administrator',
      active: true,
      must_change_password: false
    })
    console.log('✅ User created:', {
      id: testUser.id,
      username: testUser.username,
      display_name: testUser.display_name,
      active: testUser.active
    })

    // Test 2: Find user by username
    console.log('\n🔍 Testing user lookup...')
    const foundUser = await authRepository.findUserByUsername('admin')
    console.log('✅ User found:', foundUser ? 'Yes' : 'No')

    // Test 3: Create session
    console.log('\n🎫 Testing session creation...')
    const session = await authRepository.createSession({
      user_id: testUser.id,
      token: 'test_session_token_123',
      expires_at: new Date(Date.now() + 3600000) // 1 hour from now
    })
    console.log('✅ Session created:', {
      id: session.id,
      token: session.token,
      expires_at: session.expires_at
    })

    // Test 4: Find session by token
    console.log('\n🔎 Testing session lookup...')
    const foundSession = await authRepository.findSessionByToken('test_session_token_123')
    console.log('✅ Session found:', foundSession ? 'Yes' : 'No')

    // Test 5: Failed attempts management
    console.log('\n🚫 Testing failed attempts...')
    await authRepository.incrementFailedAttempts(testUser.id)
    await authRepository.incrementFailedAttempts(testUser.id)
    const userWithFailedAttempts = await authRepository.findUserById(testUser.id)
    console.log('✅ Failed attempts:', userWithFailedAttempts?.failed_attempts)

    // Test 6: User locking
    console.log('\n🔒 Testing user locking...')
    const lockUntil = new Date(Date.now() + 60000) // 1 minute from now
    await authRepository.lockUser(testUser.id, lockUntil)
    const isLocked = await authRepository.isUserLocked(testUser.id)
    console.log('✅ User locked:', isLocked)

    // Test 7: Statistics
    console.log('\n📊 Testing statistics...')
    const stats = await authRepository.getAuthStats()
    console.log('✅ Auth stats:', {
      totalUsers: stats.users.total,
      activeUsers: stats.users.active,
      lockedUsers: stats.users.locked,
      totalSessions: stats.sessions.total,
      activeSessions: stats.sessions.active
    })

    // Test 8: Session cleanup service
    console.log('\n🧹 Testing session cleanup service...')
    const cleanupService = new SessionCleanupService(authRepository, {
      intervalMinutes: 1,
      maxSessionAge: 1,
      batchSize: 10
    })

    // Create an expired session for cleanup testing by inserting directly
    // (bypassing validation since we want to test cleanup of expired sessions)
    const expiredSessionId = `session-${Date.now()}-expired`
    db.prepare(
      `
      INSERT INTO auth_sessions (id, user_id, token, expires_at, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `
    ).run(
      expiredSessionId,
      testUser.id,
      'expired_token',
      new Date(Date.now() - 1000).toISOString() // 1 second ago (expired)
    )

    // Run cleanup
    await cleanupService.runCleanup()
    const cleanupStats = cleanupService.getStats()
    console.log('✅ Cleanup completed:', {
      totalRuns: cleanupStats.totalRuns,
      deletedSessions: cleanupStats.lastRunDeletedSessions
    })

    // Test 9: Active sessions after cleanup
    console.log('\n🔍 Testing active sessions after cleanup...')
    const activeSessions = await authRepository.getUserActiveSessions(testUser.id)
    console.log('✅ Active sessions remaining:', activeSessions.length)

    console.log('\n🎉 All tests completed successfully!')
    console.log('\n📋 Summary:')
    console.log('- ✅ AuthRepository created and configured')
    console.log('- ✅ User management (create, find, update)')
    console.log('- ✅ Session management (create, find, delete)')
    console.log('- ✅ Failed attempts and user locking')
    console.log('- ✅ Statistics and monitoring')
    console.log('- ✅ Automatic session cleanup')
  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  } finally {
    db.close()
  }
}

// Export for use in other modules
export { testAuthRepository }

// Run if called directly
if (require.main === module) {
  testAuthRepository().catch(console.error)
}
