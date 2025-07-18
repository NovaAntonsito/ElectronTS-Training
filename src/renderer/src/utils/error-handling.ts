/**
 * Utility functions for error handling and retry logic
 */

export interface RetryOptions {
  maxAttempts: number
  delayMs: number
  backoffMultiplier?: number
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { maxAttempts, delayMs, backoffMultiplier = 2 } = options
  let lastError: Error

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')

      // Don't retry on validation errors
      if (lastError.name === 'ValidationError') {
        throw lastError
      }

      // Don't retry on the last attempt
      if (attempt === maxAttempts) {
        break
      }

      // Calculate delay with exponential backoff
      const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1)
      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message)

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError!
}

/**
 * Add timeout to a promise
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })
  ])
}

/**
 * Combine retry and timeout functionality
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  retryOptions: RetryOptions,
  timeoutMs: number
): Promise<T> {
  return withRetry(() => withTimeout(fn(), timeoutMs), retryOptions)
}

/**
 * Check if an error is recoverable (should be retried)
 */
export function isRecoverableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  // Don't retry validation errors
  if (error.name === 'ValidationError') {
    return false
  }

  // Retry storage errors (except corruption)
  if (error.name === 'StorageError') {
    return !error.message.includes('CORRUPTED_FILE') && !error.message.includes('RECOVERY_FAILED')
  }

  // Retry network/IPC errors
  if (error.message.includes('IPC') || error.message.includes('invoke')) {
    return true
  }

  // Retry timeout errors
  if (error.message.includes('timeout')) {
    return true
  }

  return false
}
