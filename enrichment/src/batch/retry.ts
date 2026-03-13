export const RETRY_DELAYS = [2000, 5000] as const

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[attempt]
        console.warn(
          `[Retry] ${label} attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`,
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}
