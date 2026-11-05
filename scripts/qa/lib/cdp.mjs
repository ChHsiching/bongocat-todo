/**
 * issue19 QA: minimal CDP client (dev debugging only, zero dependencies, Node>=22 built-in WebSocket/fetch).
 *
 * Usage: tauri dev must be started with the env var:
 *   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222" pnpm tauri dev
 *
 * Capabilities:
 * - targets(): list all webview pages
 * - evalIn(urlSubstr, expr): run JS in the webview whose url matches (awaitPromise), returning the JSON value
 *
 * Note: __TAURI_INTERNALS__.invoke is the Tauri v2 webview's internal IPC bridge (not a public API);
 * QA scripts are for dev-environment orchestration only (opening panels, reading window sizes/storage), never production code.
 */

import process from 'node:process'

const CDP_HOST = process.env.QA_CDP_HOST || 'http://127.0.0.1:9222'

export async function targets() {
  const res = await fetch(`${CDP_HOST}/json/list`)
  if (!res.ok)
    throw new Error(`CDP /json/list HTTP ${res.status}`)
  return res.json()
}

export async function waitForCdp({ timeoutMs = 30000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const list = await targets()
      if (Array.isArray(list) && list.length > 0)
        return list
    } catch {}
    await new Promise(r => setTimeout(r, intervalMs))
  }
  throw new Error(`CDP not available at ${CDP_HOST} within ${timeoutMs}ms`)
}

/** Evaluate an expression on the page target whose url contains substr, returning the JSON-ified result value */
export async function evalIn(urlSubstr, expression, { timeoutMs = 10000 } = {}) {
  const list = await targets()
  const page = list.find(t => t.type === 'page' && t.url.includes(urlSubstr))
  if (!page)
    throw new Error(`no CDP page matching "${urlSubstr}" in: ${list.map(t => t.url).join(', ')}`)

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('CDP ws open timeout')), timeoutMs)
      ws.onopen = () => {
        clearTimeout(t)
        resolve()
      }
      ws.onerror = (e) => {
        clearTimeout(t)
        reject(e)
      }
    })

    let msgId = 0
    const pending = new Map()
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
      }
    }
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++msgId
      const t = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`CDP ${method} timeout`))
      }, timeoutMs)
      pending.set(id, (msg) => {
        clearTimeout(t)
        resolve(msg)
      })
      ws.send(JSON.stringify({ id, method, params }))
    })

    const r = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (r.error)
      throw new Error(`CDP error: ${JSON.stringify(r.error)}`)
    const { result, exceptionDetails } = r.result || {}
    if (exceptionDetails)
      throw new Error(`eval exception: ${exceptionDetails.text} ${exceptionDetails.exception?.description || ''}`)
    return result?.value
  } finally {
    ws.close()
  }
}

/** Read the todo window's physical position/size (executed in the todo page context) */
export async function todoWindowInfo() {
  return evalIn('#/todo', `
    (async () => {
      const win = (await import('/@id/@tauri-apps/api/window')).getCurrentWindow()
      const pos = await win.outerPosition()
      const size = await win.outerSize()
      const scale = await win.scaleFactor()
      return { x: pos.x, y: pos.y, width: size.width, height: size.height, scale }
    })()
  `)
}

/** Emit an app-level event (e.g. show-todo-full / show-todo-mini / hide-window+payload) */
export async function emitAppEvent(event, payload) {
  const payloadJson = payload === undefined ? 'null' : JSON.stringify(payload)
  return evalIn('#/todo', `
    window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: ${JSON.stringify(event)}, payload: ${payloadJson} })
      .then(() => 'emitted')
  `)
}
