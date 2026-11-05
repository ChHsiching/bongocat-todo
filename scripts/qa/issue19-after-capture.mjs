/**
 * issue19 "after" screenshots: really drag to each target size, then capture (docs/screenshots/issue19/after/).
 *
 * Size set: 380×560 (default, vs the baseline) / 560×640 (mid) / 720×560 (maxWidth full width) / mini 380×130.
 * After dragging into place, capture the actual rect (±3px tolerance, filenames rounded).
 */
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { emitAppEvent, todoWindowInfo, waitForCdp } from './lib/cdp.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PS = resolve(ROOT, 'scripts/qa/lib/native.ps1')
const OUT = resolve(ROOT, 'docs/screenshots/issue19/after')

function ps(args) {
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS, ...args], { stdio: 'pipe' })
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function dragEdge(edge, dx, dy) {
  const r = await todoWindowInfo()
  const cx = edge === 'left' ? r.x + 2 : edge === 'right' ? r.x + r.width - 3 : r.x + r.width / 2
  const cy = edge === 'top' ? r.y + 2 : edge === 'bottom' ? r.y + r.height - 3 : r.y + r.height / 2
  ps(['-Action', 'drag', '-FromX', String(Math.round(cx)), '-FromY', String(Math.round(cy)), '-ToX', String(Math.round(cx + dx)), '-ToY', String(Math.round(cy + dy)), '-Steps', '25'])
  await sleep(400)
  return todoWindowInfo()
}

async function sizeTo(width, height) {
  for (let i = 0; i < 4; i++) {
    const r = await todoWindowInfo()
    const dw = width - r.width
    const dh = height - r.height
    if (Math.abs(dw) <= 2 && Math.abs(dh) <= 2)
      break
    if (Math.abs(dw) > 2)
      await dragEdge('right', dw, 0)
    if (Math.abs(dh) > 2)
      await dragEdge('bottom', 0, dh)
  }
  return todoWindowInfo()
}

async function capture(name) {
  const r = await todoWindowInfo()
  const out = resolve(OUT, name)
  ps(['-Action', 'capture', '-X', String(r.x), '-Y', String(r.y), '-W', String(r.width), '-H', String(r.height), '-Out', out])
  console.log(`saved ${name} (${r.width}x${r.height} @${r.x},${r.y})`)
  return r
}

console.log('Waiting for CDP ...')
await waitForCdp()

await emitAppEvent('show-todo-full')
await sleep(700)

await sizeTo(380, 560)
await sleep(300)
await capture('after-panel-380x560.png')

await sizeTo(560, 640)
await sleep(300)
await capture('after-panel-560x640.png')

await sizeTo(720, 560)
await sleep(300)
await capture('after-panel-720x560.png')

await emitAppEvent('show-todo-mini')
await sleep(700)
await capture('after-mini-380x130.png')

console.log('\n=== After screenshots done ===')
