/**
 * Per-key auto-dismiss scheduler with hover pause.
 *
 * Backs the "bubble auto-dismiss" setting (ADR 0002's original 5s design,
 * resurrected 2026-11-05 behind the toggle; default remains persistent).
 * Pause computes each key's remaining time so resume continues the countdown
 * instead of restarting it — hovering a stack must not extend every bubble.
 */
export interface DismissSchedulerOptions {
  onDismiss: (key: string) => void
  delayMs: number
}

export function createDismissScheduler(options: DismissSchedulerOptions) {
  const deadlines = new Map<string, number>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let pausedAt: number | null = null

  function arm(key: string, delay: number) {
    const timer = setTimeout(() => {
      timers.delete(key)
      deadlines.delete(key)
      options.onDismiss(key)
    }, delay)
    timers.set(key, timer)
  }

  function schedule(key: string) {
    cancel(key)
    deadlines.set(key, Date.now() + options.delayMs)
    arm(key, options.delayMs)
  }

  function cancel(key: string) {
    const timer = timers.get(key)
    if (timer)
      clearTimeout(timer)
    timers.delete(key)
    deadlines.delete(key)
  }

  function pause() {
    if (pausedAt !== null)
      return
    pausedAt = Date.now()
    for (const timer of timers.values())
      clearTimeout(timer)
    timers.clear()
  }

  function resume() {
    if (pausedAt === null)
      return
    const now = Date.now()
    // Shift deadlines forward by the paused duration: the countdown freezes
    // while paused (wall clock keeps running, so remaining-from-original
    // deadline would silently swallow the hover time).
    const pausedFor = now - pausedAt
    pausedAt = null
    for (const [key, deadline] of deadlines) {
      const shifted = deadline + pausedFor
      deadlines.set(key, shifted)
      arm(key, Math.max(0, shifted - now))
    }
  }

  function cancelAll() {
    for (const timer of timers.values())
      clearTimeout(timer)
    timers.clear()
    deadlines.clear()
    pausedAt = null
  }

  return { schedule, cancel, pause, resume, cancelAll }
}
