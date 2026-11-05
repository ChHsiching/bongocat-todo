/**
 * Pure functions for mail retention rules (T5, D9).
 *
 * Decisions from ADR 0002 D9:
 * - Unread mails are auto-archived (moved into the archive list) after **24 hours** by default.
 * - After a mail is marked read locally by clicking, it is auto-archived after **5 minutes**.
 * - Archived mails are purged (removed from the archive list) after **30 days**.
 *
 * All pure functions, no side effects; timestamps are injected by the caller (handy for tests to inject a fixed time).
 *
 * @see docs/adr/0002-phase2-mail-and-bubble.md D9
 */

/** Auto-archive deadline for unread mails (ms). 24 hours. */
export const UNREAD_ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000

/** Auto-archive deadline for read mails (ms). 5 minutes. */
export const READ_ARCHIVE_AFTER_MS = 5 * 60 * 1000

/** Auto-purge deadline for archived mails (ms). 30 days. */
export const ARCHIVE_PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Whether an unread mail has timed out and should be archived.
 *
 * Rule: arrived more than UNREAD_ARCHIVE_AFTER_MS (24h) ago and still unread → archive.
 *
 * @param arrivedAt Mail arrival timestamp (ms)
 * @param now Current timestamp (ms), injected by the caller
 */
export function shouldArchiveUnread(arrivedAt: number, now: number): boolean {
  return now - arrivedAt >= UNREAD_ARCHIVE_AFTER_MS
}

/**
 * Whether a read mail has timed out and should be archived.
 *
 * Rule: read more than READ_ARCHIVE_AFTER_MS (5min) ago → archive.
 *
 * @param readAt Timestamp when marked read (ms)
 * @param now Current timestamp (ms), injected by the caller
 */
export function shouldArchiveRead(readAt: number, now: number): boolean {
  return now - readAt >= READ_ARCHIVE_AFTER_MS
}

/**
 * Whether an archived mail should be purged entirely (removed from the list).
 *
 * Rule: archived more than ARCHIVE_PURGE_AFTER_MS (30 days) ago → purge.
 *
 * @param archivedAt Archive timestamp (ms)
 * @param now Current timestamp (ms), injected by the caller
 */
export function shouldPurgeArchived(archivedAt: number, now: number): boolean {
  return now - archivedAt >= ARCHIVE_PURGE_AFTER_MS
}

/**
 * Compute the remaining minutes for the "Read · archived in N minutes" countdown (floored, minimum 0).
 *
 * The mail list design shows copy like "Read, archived in 4 minutes"; this function computes the remaining minutes.
 *
 * @param readAt Timestamp when marked read (ms)
 * @param now Current timestamp (ms), injected by the caller
 * @returns Remaining minutes (0 when already due)
 */
export function minutesUntilArchive(readAt: number, now: number): number {
  const elapsed = now - readAt
  const remaining = READ_ARCHIVE_AFTER_MS - elapsed
  return Math.max(0, Math.floor(remaining / 60000))
}
