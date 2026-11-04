/**
 * issue19 基线截图编排器（修改代码前运行！）。
 *
 * 前置：
 *   1. tauri dev 以 CDP 端口启动（见 lib/cdp.mjs 头注释）
 *   2. 猫窗口已显示在屏幕上（todo 面板贴猫定位）
 *
 * 动作：
 *   1. emit show-todo-full → 等 500ms（setSize+show+渐显）→ 读窗口物理 rect
 *   2. PowerShell 截图该区域 → docs/screenshots/issue19/before/panel-380x560.png
 *   3. 校验 PNG 尺寸 == rect 尺寸
 *   4. emit show-todo-mini → 同样流程 → mini-380x130.png
 *
 * 用法：node scripts/qa/issue19-baseline.mjs
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { emitAppEvent, todoWindowInfo, waitForCdp } from './lib/cdp.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PS = resolve(ROOT, 'scripts/qa/lib/native.ps1')
const OUT_DIR = resolve(ROOT, 'docs/screenshots/issue19/before')

function ps(args) {
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS, ...args], { stdio: 'pipe' })
}

function pngSize(path) {
  // PNG IHDR: 签名8B + 长度4B + 类型4B → width@16, height@20
  const buf = readFileSync(path)
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function captureForm(eventKey, filename, expect) {
  await emitAppEvent(eventKey)
  await sleep(600) // setSize + show + 渐显 200ms
  const info = await todoWindowInfo()
  console.log(`[${eventKey}] window rect: x=${info.x} y=${info.y} w=${info.width} h=${info.height} scale=${info.scale}`)
  if (expect && (info.width !== expect.width || info.height !== expect.height)) {
    console.warn(`WARN: 预期 ${expect.width}x${expect.height}，实际 ${info.width}x${info.height}`)
  }
  const out = resolve(OUT_DIR, filename)
  ps(['-Action', 'capture', '-X', String(info.x), '-Y', String(info.y), '-W', String(info.width), '-H', String(info.height), '-Out', out])
  const size = pngSize(out)
  console.log(`saved ${out} (${size.width}x${size.height})`)
  if (size.width !== info.width || size.height !== info.height) {
    throw new Error(`截图尺寸 ${size.width}x${size.height} != 窗口尺寸 ${info.width}x${info.height}（DPI 映射问题？）`)
  }
  return info
}

console.log('等待 CDP …')
await waitForCdp()
const list = await (await import('./lib/cdp.mjs')).targets()
console.log('CDP pages:', list.map(t => t.url).join(' | '))

const panel = await captureForm('show-todo-full', 'panel-380x560.png', { width: 380, height: 560 })
await sleep(300)
const mini = await captureForm('show-todo-mini', 'mini-380x130.png', { width: 380, height: 130 })

console.log('\n=== 基线完成 ===')
console.log(JSON.stringify({ panel, mini }, null, 2))
