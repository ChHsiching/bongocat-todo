/**
 * issue19 mail e2e: drag-resize assertions for the two mail windows (mail-list / mail-archive).
 *
 * Orchestration goes through CDP (open windows / read sizes); the behavior under test is entirely real mouse (SendInput).
 * Assertion groups (per window):
 *   M1 opens at the default/restored size (400-wide tier or persisted value, height 560 or persisted value)
 *   M2 edge-hugging handle drag +100 takes effect exactly
 *   M3 native edge drag +2000 → clamped to max 720
 *   M4 squeeze width -5000 → clamped to min 400
 *   M5 close/reopen → size restored (in-session persistence; cross-restart persistence by manual spot-check or reading the disk file)
 *
 * Usage: node scripts/qa/issue19-mail-e2e.mjs
 * Prerequisites: the app started with a CDP port (see the header comment in lib/cdp.mjs).
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
  assert(`${label} M1 opens (${m1.width}×${m1.height})`, m1.width >= 400 - TOL && m1.width <= 720 + TOL, JSON.stringify(m1))

  // M2 edge-hugging handle (24px inside the edge) drag +100
  const grabX = m1.x + m1.width - 24
  const grabY = m1.y + Math.round(m1.height / 2)
  ps(['-Action', 'drag', '-FromX', String(grabX), '-FromY', String(grabY), '-ToX', String(grabX + 100), '-ToY', String(grabY), '-Steps', '20'])
  await sleep(500)
  const m2 = await rectOf(urlSub)
  assert(`${label} M2 handle drag +100`, Math.abs(m2.width - m1.width - 100) <= TOL, `before=${m1.width} after=${m2.width}`)

  const m3 = await dragEdge(urlSub, 2000)
  assert(`${label} M3 max ≤720`, m3.width <= 720 + TOL, `w=${m3.width}`)

  const m4 = await dragEdge(urlSub, -5000)
  assert(`${label} M4 min ≥400`, m4.width >= 400 - TOL, `w=${m4.width}`)

  // M5 close/reopen restore
  await emitAppEvent('hide-window', urlSub.includes('archive') ? 'mail-archive' : 'mail-list')
  await sleep(400)
  await emitAppEvent(eventKey)
  await sleep(900)
  const m5 = await rectOf(urlSub)
  assert(`${label} M5 restored after reopen`, Math.abs(m5.width - m4.width) <= TOL, `target=${m4.width} got=${m5.width}`)
}

console.log('Waiting for CDP ...')
await waitForCdp()
await suite('#/mail-list', 'show-mail-list', 'mail-list')
await suite('#/mail-archive', 'show-mail-archive', 'mail-archive')
console.log('\n=== All mail e2e assertions passed ===')
