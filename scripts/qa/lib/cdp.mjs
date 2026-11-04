/**
 * issue19 QA：最小 CDP 客户端（仅 dev 调试用，零依赖，Node>=22 内置 WebSocket/fetch）。
 *
 * 用法：tauri dev 需带环境变量启动：
 *   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222" pnpm tauri dev
 *
 * 能力：
 * - targets()：列出所有 webview page
 * - evalIn(urlSubstr, expr)：在匹配 url 的 webview 里执行 JS（awaitPromise），返回 JSON 值
 *
 * 注意：__TAURI_INTERNALS__.invoke 是 Tauri v2 webview 内部 IPC 桥（非公开 API），
 * QA 脚本仅用于 dev 环境编排（打开面板、读窗口尺寸/存储），不进生产代码。
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

/** 在 url 含 substr 的 page target 上执行表达式，返回 JSON 化的结果值 */
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

/** 读取 todo 窗口物理位置/尺寸（在 todo 页面上下文里执行） */
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

/** 发出 app 级事件（如 show-todo-full / show-todo-mini / hide-window+payload） */
export async function emitAppEvent(event, payload) {
  const payloadJson = payload === undefined ? 'null' : JSON.stringify(payload)
  return evalIn('#/todo', `
    window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: ${JSON.stringify(event)}, payload: ${payloadJson} })
      .then(() => 'emitted')
  `)
}
