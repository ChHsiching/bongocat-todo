/**
 * issue19 mail e2e：邮件两窗口（mail-list / mail-archive）拖拽调整大小断言。
 *
 * 编排走 CDP（打开窗口/读尺寸），被测行为全部真鼠标（SendInput）。
 * 断言组（每窗口）：
 *   M1 打开默认/恢复尺寸（400 宽档或持久值，高 560 或持久值）
 *   M2 贴边把手拖 +100 精确生效
 *   M3 原生边缘拖 +2000 → max 720 钳制
 *   M4 压宽 -5000 → min 400 钳制
 *   M5 关/重开 → 尺寸恢复（会话内持久化；跨重启持久化人工抽查或读盘文件）
 *
 * 用法：node scripts/qa/issue19-mail-e2e.mjs
 * 前置：应用带 CDP 端口启动（见 lib/cdp.mjs 头注释）。
 */
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { emitAppEvent, evalIn, waitForCdp } from './lib/cdp.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PS = resolve(ROOT, 'scripts/qa/lib/native.ps1')
const TOL = 3

function ps(args) {
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS, ...args], { stdio: 'pipe' })
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function rectOf(urlSub) {
  return evalIn(urlSub, `(async () => {
    const w = (await import('/@id/@tauri-apps/api/window')).getCurrentWindow()
    const p = await w.outerPosition(), s = await w.outerSize()
    return { x: p.x, y: p.y, width: s.width, height: s.height }
  })()`)
}

async function dragEdge(urlSub, dx) {
  const r = await rectOf(urlSub)
  const cx = r.x + r.width - 3
  const cy = r.y + Math.round(r.height / 2)
  ps(['-Action', 'drag', '-FromX', String(cx), '-FromY', String(cy), '-ToX', String(cx + dx), '-ToY', String(cy), '-Steps', '25'])
  await sleep(450)
  return rectOf(urlSub)
}

function assert(name, cond, detail) {
  if (!cond)
    throw new Error(`✗ ${name}: ${detail}`)
  console.log(`✓ ${name}`)
}

async function suite(urlSub, eventKey, label) {
  console.log(`\n── ${label} ──`)
  await emitAppEvent(eventKey)
  await sleep(900)

  const m1 = await rectOf(urlSub)
  assert(`${label} M1 打开（${m1.width}×${m1.height}）`, m1.width >= 400 - TOL && m1.width <= 720 + TOL, JSON.stringify(m1))

  // M2 贴边把手（边内 24px）拖 +100
  const grabX = m1.x + m1.width - 24
  const grabY = m1.y + Math.round(m1.height / 2)
  ps(['-Action', 'drag', '-FromX', String(grabX), '-FromY', String(grabY), '-ToX', String(grabX + 100), '-ToY', String(grabY), '-Steps', '20'])
  await sleep(500)
  const m2 = await rectOf(urlSub)
  assert(`${label} M2 把手拖 +100`, Math.abs(m2.width - m1.width - 100) <= TOL, `before=${m1.width} after=${m2.width}`)

  const m3 = await dragEdge(urlSub, 2000)
  assert(`${label} M3 max ≤720`, m3.width <= 720 + TOL, `w=${m3.width}`)

  const m4 = await dragEdge(urlSub, -5000)
  assert(`${label} M4 min ≥400`, m4.width >= 400 - TOL, `w=${m4.width}`)

  // M5 关/重开恢复
  await emitAppEvent('hide-window', urlSub.includes('archive') ? 'mail-archive' : 'mail-list')
  await sleep(400)
  await emitAppEvent(eventKey)
  await sleep(900)
  const m5 = await rectOf(urlSub)
  assert(`${label} M5 重开恢复`, Math.abs(m5.width - m4.width) <= TOL, `target=${m4.width} got=${m5.width}`)
}

console.log('等待 CDP …')
await waitForCdp()
await suite('#/mail-list', 'show-mail-list', 'mail-list')
await suite('#/mail-archive', 'show-mail-archive', 'mail-archive')
console.log('\n=== mail e2e 全部通过 ===')
