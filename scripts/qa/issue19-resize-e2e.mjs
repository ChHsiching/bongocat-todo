/**
 * issue19 e2e: real OS mouse (SendInput) edge-drag resize assertions.
 *
 * Orchestration goes through CDP (open the panel / read the window rect); the behavior under test (dragging edges to
 * resize the window) is entirely real system mouse events — injected via mouse_event in scripts/qa/lib/native.ps1.
 *
 * Assertion groups:
 *   T1 drag the right edge +120px → width grows by ≈120 (resize works)
 *   T2 drag the right edge +2000px → width clamped ≤720 (maxWidth)
 *   T3 drag the right/bottom edges inward -5000px → width ≥380 and height ≥280 (minWidth/minHeight)
 *   T4 drag to 550×640 → close and reopen the panel → size restored (pinia persistence)
 *   T5 mini mode → exactly 380×130 (constraints cleared, not clamped to death by minHeight)
 *
 * Usage: node scripts/qa/issue19-resize-e2e.mjs
 * Prerequisites: the app started with a CDP port (see the header comment in lib/cdp.mjs), cat window on screen.
 */

import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { emitAppEvent, todoWindowInfo, waitForCdp } from './lib/cdp.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PS = resolve(ROOT, 'scripts/qa/lib/native.ps1')

const TOL = 3

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

function assert(name, cond, detail) {
  if (!cond)
    throw new Error(`✗ ${name}: ${detail}`)
  console.log(`✓ ${name}`)
}

console.log('Waiting for CDP ...')
await waitForCdp()

// Open the panel
await emitAppEvent('show-todo-full')
await sleep(700)

// T0 reset: squeeze to min (380×280) to establish a known starting point (a previous run may have left a persisted
// size like 720×560; testing directly would clamp T1's +120 against max → a false failure)
{
  await dragEdge('right', -5000, 0)
  await dragEdge('bottom', 0, -5000)
  const r = await todoWindowInfo()
  assert('T0 reset to min 380×280', Math.abs(r.width - 380) <= TOL && Math.abs(r.height - 280) <= TOL, `got=${r.width}x${r.height}`)
}

// T1 drag the right edge +120
{
  const before = await todoWindowInfo()
  const after = await dragEdge('right', 120, 0)
  const grew = after.width - before.width
  assert('T1 drag right edge +120 → width grows', Math.abs(grew - 120) <= TOL, `before=${before.width} after=${after.width} grew=${grew}`)
}

// T2 drag the right edge +2000 → max 720
{
  const after = await dragEdge('right', 2000, 0)
  assert('T2 drag right edge +2000 → width ≤ 720', after.width <= 720 + TOL, `width=${after.width}`)
}

// T3 squeeze inward → min 380×280
{
  const after = await dragEdge('right', -5000, 0)
  assert('T3a squeeze width → width ≥ 380', after.width >= 380 - TOL, `width=${after.width}`)
  const after2 = await dragEdge('bottom', 0, -5000)
  assert('T3b squeeze height → height ≥ 280', after2.height >= 280 - TOL, `height=${after2.height}`)
}

// T4 drag to ~550×640 → persistence restore
{
  await dragEdge('right', 170, 0) // 380 → ~550
  const sized = await dragEdge('bottom', 0, 120)
  const target = { width: sized.width, height: sized.height }
  await sleep(600) // wait for the debounce(300ms) to persist
  // Close then reopen (hide → show runs the full open flow)
  await emitAppEvent('hide-window', 'todo')
  // hide-window's payload is the label string; App.vue matches by label — the todo window's own handler closes itself
  await sleep(400)
  await emitAppEvent('show-todo-full')
  await sleep(700)
  const restored = await todoWindowInfo()
  assert('T4 user size restored after reopen', Math.abs(restored.width - target.width) <= TOL && Math.abs(restored.height - target.height) <= TOL, `target=${target.width}x${target.height} restored=${restored.width}x${restored.height}`)
}

// T5 mini mode
{
  await emitAppEvent('show-todo-mini')
  await sleep(900)
  const mini = await todoWindowInfo()
  assert('T5a mini height locked at 130 (single-axis lock)', Math.abs(mini.height - 130) <= TOL, `h=${mini.height}`)
  assert('T5b mini width within the persisted range [380,720]', mini.width >= 380 - TOL && mini.width <= 720 + TOL, `w=${mini.width}`)
  // T5c drag wider by +50 (grabbing the band handle's void position: 12px inside the edge)
  const grabX = mini.x + mini.width - 12
  const grabY = mini.y + Math.round(mini.height / 2)
  ps(['-Action', 'drag', '-FromX', String(grabX), '-FromY', String(grabY), '-ToX', String(grabX + 50), '-ToY', String(grabY), '-Steps', '20'])
  await sleep(500)
  const widened = await todoWindowInfo()
  assert('T5c mini band handle widens +50', Math.abs(widened.width - mini.width - 50) <= TOL, `before=${mini.width} after=${widened.width}`)
  const bx = widened.x + Math.round(widened.width / 2)
  const by = widened.y + widened.height - 3
  ps(['-Action', 'drag', '-FromX', String(bx), '-FromY', String(by), '-ToX', String(bx), '-ToY', String(by + 80), '-Steps', '20'])
  await sleep(500)
  const locked = await todoWindowInfo()
  assert('T5d mini vertical lock', Math.abs(locked.height - 130) <= TOL, `h=${locked.height}`)
  await emitAppEvent('show-todo-full')
  await sleep(500)
}

console.log('\n=== All e2e assertions passed ===')
