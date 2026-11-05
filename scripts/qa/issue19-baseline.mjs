/**
 * issue19 baseline screenshot orchestrator (run BEFORE modifying code!).
 *
 * Prerequisites:
 *   1. tauri dev started with a CDP port (see the header comment in lib/cdp.mjs)
 *   2. the cat window is visible on screen (the todo panel anchors to the cat window)
 *
 * Actions:
 *   1. emit show-todo-full → wait 500ms (setSize+show+fade-in) → read the window's physical rect
 *   2. PowerShell captures that region → docs/screenshots/issue19/before/panel-380x560.png
 *   3. verify the PNG size == the rect size
 *   4. emit show-todo-mini → same flow → mini-380x130.png
 *
 * Usage: node scripts/qa/issue19-baseline.mjs
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
  // PNG IHDR: signature 8B + length 4B + type 4B → width@16, height@20
  const buf = readFileSync(path)
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function captureForm(eventKey, filename, expect) {
  await emitAppEvent(eventKey)
  await sleep(600) // setSize + show + 200ms fade-in
  const info = await todoWindowInfo()
  console.log(`[${eventKey}] window rect: x=${info.x} y=${info.y} w=${info.width} h=${info.height} scale=${info.scale}`)
  if (expect && (info.width !== expect.width || info.height !== expect.height)) {
    console.warn(`WARN: expected ${expect.width}x${expect.height}, got ${info.width}x${info.height}`)
  }
  const out = resolve(OUT_DIR, filename)
  ps(['-Action', 'capture', '-X', String(info.x), '-Y', String(info.y), '-W', String(info.width), '-H', String(info.height), '-Out', out])
  const size = pngSize(out)
  console.log(`saved ${out} (${size.width}x${size.height})`)
  if (size.width !== info.width || size.height !== info.height) {
    throw new Error(`screenshot size ${size.width}x${size.height} != window size ${info.width}x${info.height} (DPI mapping issue?)`)
  }
  return info
}

console.log('Waiting for CDP ...')
await waitForCdp()
const list = await (await import('./lib/cdp.mjs')).targets()
console.log('CDP pages:', list.map(t => t.url).join(' | '))

const panel = await captureForm('show-todo-full', 'panel-380x560.png', { width: 380, height: 560 })
await sleep(300)
const mini = await captureForm('show-todo-mini', 'mini-380x130.png', { width: 380, height: 130 })

console.log('\n=== Baseline done ===')
console.log(JSON.stringify({ panel, mini }, null, 2))
