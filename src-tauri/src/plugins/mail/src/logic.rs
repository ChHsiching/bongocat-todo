//! Pure logic for mail connection management (TDD focus; no network/keyring/Tauri dependencies).
//!
//! These functions decide "when to reset IDLE / when to reconnect / how long to wait before reconnecting";
//! extracted as pure functions so boundaries can be covered under `#[cfg(test)]`, while actual IMAP connections are verified manually via tracer bullets.

use std::time::Duration;

/// Polling interval for servers without IDLE support (e.g. old Coremail/论客 versions).
///
/// When IDLE is unavailable, degrade to periodic FETCH checks for new mails; the 5-second interval matches
/// the `wait_with_timeout` fallback period on the IDLE path, keeping perceived latency under control.
pub const POLL_INTERVAL: Duration = Duration::from_secs(5);

/// IDLE auto-reset threshold. RFC 2177 recommends resetting within 30 minutes to guard against server timeouts;
/// 29 minutes leaves a 1-minute margin.
///
/// IDLE keep-alive is currently provided by async-imap `Handle::wait()`'s built-in 29min timeout (see manager.rs);
/// this constant + [`should_reset_idle`] are kept as a pure-logic seam for the unit-test coverage required by
/// ticket #11's AC, and reserved for future scenarios needing manual keep-alive timing (e.g. a custom loop not using wait_with_timeout).
#[allow(dead_code)]
pub const IDLE_RESET_INTERVAL: Duration = Duration::from_secs(29 * 60);

/// Classification of IDLE command failures (decides degradation vs reconnection).
///
/// Servers like Coremail (论客) do not support the IMAP IDLE extension and return
/// `BAD command not support` for the IDLE command. Retrying IDLE will never succeed in that case, so degrade to polling.
/// Transient errors (network jitter etc.) should retry IDLE after reconnecting.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdleSupport {
    /// The server does not support IDLE (BAD command not support) → degrade to polling, never try IDLE again.
    Unsupported,
    /// Transient error (network jitter etc.) → retry IDLE after reconnecting.
    Transient,
}

/// Classify an error message as "IDLE unsupported" vs "transient error".
///
/// Pure function, easy to unit test. The message matching is based on actually observed server responses:
/// - Coremail: `BAD command not support` (the io error message returned by init)
/// - Transient errors: network jitter, connection reset etc., not containing "not support" / "unknown command"
pub fn classify_idle_error(err_msg: &str) -> IdleSupport {
    let lower = err_msg.to_lowercase();
    // Coremail: "command not support"
    // Generic IMAP: "unknown command" (RFC 3501's standard BAD response for unrecognized commands)
    if lower.contains("not support") || lower.contains("unknown command") {
        IdleSupport::Unsupported
    } else {
        IdleSupport::Transient
    }
}

/// Reconnect backoff cap (exponential backoff ceiling, avoiding absurdly long waits from unbounded growth).
pub const BACKOFF_MAX: Duration = Duration::from_secs(5 * 60);

/// Whether IDLE has reached the point where it should be reset.
///
/// @param elapsed Time elapsed since the last IDLE reset (or start)
/// @returns Whether [`IDLE_RESET_INTERVAL`] has been reached/exceeded
///
/// Pure function, does not read the system clock, easy to unit test. Currently the runtime is covered by `wait()`'s built-in timeout;
/// this function is kept as a pure-logic seam (ticket #11's AC requires unit tests).
#[allow(dead_code)]
pub fn should_reset_idle(elapsed: Duration) -> bool {
    elapsed >= IDLE_RESET_INTERVAL
}

/// Compute the wait before the `retries`-th reconnect (exponential backoff, capped at [`BACKOFF_MAX`]).
///
/// Strategy: start at 2s, double each time (2 → 4 → 8 → 16 → 32 → 64 → 128 → 240=MAX),
/// and stop growing once the cap is reached. `retries` starts at 0 (first retry = retries=0 → wait 2s).
///
/// Pure function, easy to unit test.
pub fn backoff_delay(retries: u32) -> Duration {
    // Start at 2 seconds; double for each additional retry. Use checked_shl + saturating_mul to prevent overflow,
    // then cap at BACKOFF_MAX with min.
    let base = Duration::from_secs(2);
    // Duration::saturating_mul takes a u32; with a huge retries the factor saturates to u32::MAX
    // (subsequently capped by BACKOFF_MAX, so no overflow).
    let factor = 1u32.checked_shl(retries).unwrap_or(u32::MAX);
    let delay = base.saturating_mul(factor);
    delay.min(BACKOFF_MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    mod should_reset_idle {
        use super::*;

        #[test]
        fn 零时间不重置() {
            assert!(!should_reset_idle(Duration::ZERO));
        }

        #[test]
        fn 远小于阈值不重置() {
            assert!(!should_reset_idle(Duration::from_secs(60)));
            assert!(!should_reset_idle(Duration::from_secs(10 * 60)));
        }

        #[test]
        fn 接近但未达阈值不重置_28分钟() {
            assert!(!should_reset_idle(Duration::from_secs(28 * 60)));
        }

        #[test]
        fn 恰好达到阈值应重置_29分钟() {
            assert!(should_reset_idle(Duration::from_secs(29 * 60)));
        }

        #[test]
        fn 超过阈值应重置_30分钟() {
            assert!(should_reset_idle(Duration::from_secs(30 * 60)));
            assert!(should_reset_idle(Duration::from_secs(60 * 60)));
        }

        #[test]
        fn 阈值边界_比28分多1秒仍不到29分() {
            assert!(!should_reset_idle(Duration::from_secs(28 * 60 + 59)));
        }
    }

    mod backoff_delay {
        use super::*;

        #[test]
        fn 首次重试_retries0_等2秒() {
            assert_eq!(backoff_delay(0), Duration::from_secs(2));
        }

        #[test]
        fn 逐次翻倍() {
            assert_eq!(backoff_delay(1), Duration::from_secs(4));
            assert_eq!(backoff_delay(2), Duration::from_secs(8));
            assert_eq!(backoff_delay(3), Duration::from_secs(16));
            assert_eq!(backoff_delay(4), Duration::from_secs(32));
            assert_eq!(backoff_delay(5), Duration::from_secs(64));
            assert_eq!(backoff_delay(6), Duration::from_secs(128));
        }

        #[test]
        fn 达到上限后封顶不再增长() {
            // BACKOFF_MAX = 5min = 300s. 2 * 2^7 = 256s < 300s (not capped),
            // 2 * 2^8 = 512s > 300s → capped at 300s from retries=8 on.
            assert_eq!(backoff_delay(8), BACKOFF_MAX);
            assert_eq!(backoff_delay(9), BACKOFF_MAX);
            assert_eq!(backoff_delay(20), BACKOFF_MAX);
            assert_eq!(backoff_delay(100), BACKOFF_MAX);
        }

        #[test]
        fn retries7_未封顶_256秒() {
            // 2 * 2^7 = 256s < 300s (BACKOFF_MAX), not yet at the cap
            assert_eq!(backoff_delay(7), Duration::from_secs(256));
        }

        #[test]
        fn 永不返回超过上限的值() {
            for retries in 0..=50 {
                assert!(
                    backoff_delay(retries) <= BACKOFF_MAX,
                    "retries={retries} 超过上限"
                );
            }
        }

        #[test]
        fn 退避序列单调不减() {
            let mut prev = Duration::ZERO;
            for retries in 0..=30 {
                let cur = backoff_delay(retries);
                assert!(cur >= prev, "retries={retries} 退避变小了");
                prev = cur;
            }
        }
    }

    mod classify_idle_error {
        use super::*;

        #[test]
        fn coremail_不支持的响应判定为不支持() {
            // Actually observed Coremail responses (log: A0004 BAD command not support)
            assert_eq!(classify_idle_error("io: command not support"), IdleSupport::Unsupported);
            assert_eq!(classify_idle_error("BAD command not support"), IdleSupport::Unsupported);
        }

        #[test]
        fn 通用unknown_command也判定为不支持() {
            // RFC 3501's standard "unrecognized command" response
            assert_eq!(classify_idle_error("BAD unknown command"), IdleSupport::Unsupported);
            assert_eq!(classify_idle_error("BAD Error: unknown command IDLE"), IdleSupport::Unsupported);
        }

        #[test]
        fn 大小写不敏感() {
            assert_eq!(classify_idle_error("COMMAND NOT SUPPORT"), IdleSupport::Unsupported);
            assert_eq!(classify_idle_error("Unknown Command"), IdleSupport::Unsupported);
        }

        #[test]
        fn 网络抖动判定为临时错误() {
            assert_eq!(classify_idle_error("connection reset by peer"), IdleSupport::Transient);
            assert_eq!(classify_idle_error("broken pipe"), IdleSupport::Transient);
            assert_eq!(classify_idle_error("timed out"), IdleSupport::Transient);
        }

        #[test]
        fn 空字符串判定为临时错误() {
            assert_eq!(classify_idle_error(""), IdleSupport::Transient);
        }
    }
}
