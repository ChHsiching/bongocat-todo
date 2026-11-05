import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDismissScheduler } from './dismissQueue'

describe('dismiss scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('dismisses a key after the delay', () => {
    const onDismiss = vi.fn()
    const s = createDismissScheduler({ onDismiss, delayMs: 5000 })

    s.schedule('a')
    vi.advanceTimersByTime(4999)
    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDismiss).toHaveBeenCalledWith('a')
  })

  it('pause freezes the countdown; resume continues from the remaining time', () => {
    const onDismiss = vi.fn()
    const s = createDismissScheduler({ onDismiss, delayMs: 5000 })

    s.schedule('a')
    vi.advanceTimersByTime(3000)
    s.pause()
    vi.advanceTimersByTime(60000)
    expect(onDismiss).not.toHaveBeenCalled()

    s.resume()
    // 2000ms remain from the original 5000
    vi.advanceTimersByTime(1999)
    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDismiss).toHaveBeenCalledWith('a')
  })

  it('pause is idempotent and resume without pause is a no-op', () => {
    const s = createDismissScheduler({ onDismiss: vi.fn(), delayMs: 1000 })
    s.schedule('a')
    s.pause()
    s.pause()
    s.resume()
    s.resume()
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
  })

  it('cancel stops dismissal', () => {
    const onDismiss = vi.fn()
    const s = createDismissScheduler({ onDismiss, delayMs: 5000 })

    s.schedule('a')
    s.cancel('a')
    vi.advanceTimersByTime(60000)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('reschedule resets the countdown', () => {
    const onDismiss = vi.fn()
    const s = createDismissScheduler({ onDismiss, delayMs: 5000 })

    s.schedule('a')
    vi.advanceTimersByTime(4000)
    s.schedule('a') // same key again: countdown restarts
    vi.advanceTimersByTime(4000)
    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(onDismiss).toHaveBeenCalledWith('a')
  })
})
