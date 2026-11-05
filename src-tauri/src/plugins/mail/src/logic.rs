use std::time::Duration;

/// Polling interval for servers without IDLE support (e.g. old Coremail/论客 versions).
///
/// When IDLE is unavailable, degrade to periodic FETCH checks for new mails; the 5-second interval matches
/// the `wait_with_timeout` fallback period on the IDLE path, keeping perceived latency under control.
pub const POLL_INTERVAL: Duration = Duration::from_secs(5);

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

pub fn classify_idle_error(err_msg: &str) -> IdleSupport {
    let lower = err_msg.to_lowercase();
    if lower.contains("not support") || lower.contains("unknown command") {
        IdleSupport::Unsupported
    } else {
        IdleSupport::Transient
    }
}

/// Reconnect backoff cap (exponential backoff ceiling, avoiding absurdly long waits from unbounded growth).
pub const BACKOFF_MAX: Duration = Duration::from_secs(5 * 60);

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
            assert_eq!(backoff_delay(8), BACKOFF_MAX);
            assert_eq!(backoff_delay(9), BACKOFF_MAX);
            assert_eq!(backoff_delay(20), BACKOFF_MAX);
            assert_eq!(backoff_delay(100), BACKOFF_MAX);
        }

        #[test]
        fn retries7_未封顶_256秒() {
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
