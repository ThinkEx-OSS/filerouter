export const RESULT_RETENTION_DAYS = 7
export const JOB_RETENTION_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

export function resultExpiresAt(completedAt: Date): Date {
  return new Date(completedAt.getTime() + RESULT_RETENTION_DAYS * DAY_MS)
}

export function jobsCreatedBefore(now: Date): Date {
  return new Date(now.getTime() - JOB_RETENTION_DAYS * DAY_MS)
}
