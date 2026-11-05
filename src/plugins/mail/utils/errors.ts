/**
 * Connection error classification + friendly message generation.
 *
 * Errors returned by the Rust backend are technical strings (e.g. `TLS 握手失败: tls handshake eof`),
 * unreadable if shown to users directly. This module classifies errors by pattern and maps them to short friendly messages.
 *
 * ⚠️ The error box only translates the error classification, no lengthy advice. Input-time guidance is shown live on blur
 * by providerHint (the authorization-code guidance area) in the settings page form.
 */

/**
 * Generate a friendly message for a connection failure.
 *
 * @param rawErr The raw error string returned by the Rust backend
 * @param t i18n translation function (fetches `plugins.mail.labels.errXxx` copy)
 * @returns The friendly message string (translated)
 */
export function formatConnectionError(
  rawErr: string,
  t: (key: string) => string,
): string {
  const lower = rawErr.toLowerCase()

  // TLS handshake failure (includes eof / handshake)
  if (lower.includes('tls') || lower.includes('handshake') || lower.includes('eof')) {
    return t('plugins.mail.labels.errTlsBlocked')
  }

  // domain not local (wrong IMAP server)
  // ⚠️ Must be checked before "login failed" — the domain not local error string also carries the "登录失败" prefix
  if (lower.includes('domain not local')) {
    return t('plugins.mail.labels.errDomainNotLocal')
  }

  // Login failed (wrong authorization code / authentication failure)
  if (lower.includes('登录失败') || lower.includes('auth') || lower.includes('login failed') || lower.includes('authenticate')) {
    return t('plugins.mail.labels.errAuthFailed')
  }

  // Unsafe Login (temporary block on newly enabled IMAP for NetEase-family mailboxes)
  if (lower.includes('unsafe login') || lower.includes('command not support')) {
    return t('plugins.mail.labels.errUnsafeLogin')
  }

  // Timeout
  if (lower.includes('超时') || lower.includes('timeout')) {
    return t('plugins.mail.labels.errTimeout')
  }

  // TCP / network (includes DNS errors like "no such host")
  if (lower.includes('tcp') || lower.includes('网络') || lower.includes('主机') || lower.includes('host')) {
    return t('plugins.mail.labels.errNetwork')
  }

  // Fallback: unclassifiable errors are shown as-is (easier to troubleshoot)
  return rawErr
}
