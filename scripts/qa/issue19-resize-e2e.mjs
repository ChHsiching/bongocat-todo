/**
 * issue19 e2e：真实 OS 鼠标（SendInput）拖边 resize 断言。
 *
 * 编排走 CDP（打开面板/读窗口 rect），被测行为（拖边缘调整窗口大小）全部是
 * 真实系统鼠标事件——由 scripts/qa/lib/native.ps1 的 mouse_event 注入。
 *
 * 断言组：
 *   T1 拖右边缘 +120px → 宽度增加 ≈120（resize 可用）
 *   T2 拖右边缘 +2000px → 宽度被钳制 ≤720（maxWidth）
 *   T3 拖右/下边缘向内 -5000px → 宽 ≥380 且高 ≥280（minWidth/minHeight）
 *   T4 拖到 550×640 → 关面板重开 → 尺寸恢复（pinia 持久化）
 *   T5 mini 形态 → 精确 380×130（约束已清空，不被 minHeight 钳死）
 *
 * 用法：node scripts/qa/issue19-resize-e2e.mjs
 * 前置：应用以 CDP 端口启动（见 lib/cdp.mjs 头注释），猫窗口在屏。
 */

import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { emitAppEvent, todoWindowInfo, waitForCdp } from './lib/cdp.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PS = resolve(ROOT, 'scripts/qa/lib/native.ps1')

const TOL = 3 // 像素容差（命中偏移/取整）

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

console.log('等待 CDP …')
await waitForCdp()

// 打开 panel
await emitAppEvent('show-todo-full')
await sleep(700)

// T0 归位：压到 min（380×280）建立已知起点（上次运行可能停在 720×560 等持久化尺寸，
// 直接开测会让 T1 的 +120 被 max 钳制 → 假失败）
{
  await dragEdge('right', -5000, 0)
  await dragEdge('bottom', 0, -5000)
  const r = await todoWindowInfo()
  assert('T0 归位到 min 380×280', Math.abs(r.width - 380) <= TOL && Math.abs(r.height - 280) <= TOL, `got=${r.width}x${r.height}`)
}

// T1 拖右边缘 +120
{
  const before = await todoWindowInfo()
  const after = await dragEdge('right', 120, 0)
  const grew = after.width - before.width
  assert('T1 拖右边缘 +120 → 宽度增加', Math.abs(grew - 120) <= TOL, `before=${before.width} after=${after.width} grew=${grew}`)
}

// T2 拖右边缘 +2000 → max 720
{
  const after = await dragEdge('right', 2000, 0)
  assert('T2 拖右边缘 +2000 → 宽 ≤ 720', after.width <= 720 + TOL, `width=${after.width}`)
}

// T3 向内压缩 → min 380×280
{
  const after = await dragEdge('right', -5000, 0)
  assert('T3a 压宽 → 宽 ≥ 380', after.width >= 380 - TOL, `width=${after.width}`)
  const after2 = await dragEdge('bottom', 0, -5000)
  assert('T3b 压高 → 高 ≥ 280', after2.height >= 280 - TOL, `height=${after2.height}`)
}

// T4 拖到 ~550×640 → 持久化恢复
{
  await dragEdge('right', 170, 0) // 380 → ~550
  const sized = await dragEdge('bottom', 0, 120) // 280 → ~400? T3 后高度在 min；先拉高
  // 以实测为准：拉到目标附近即可，记录当前值
  const target = { width: sized.width, height: sized.height }
  await sleep(600) // 等 debounce(300ms) 落库
  // 关闭再重开（hide → show 走完整打开流程）
  await emitAppEvent('hide-window', 'todo')
  // hide-window 的 payload 是 label 字符串；App.vue 按 label 匹配——todo 窗口自己的 handler 关掉自己
  await sleep(400)
  await emitAppEvent('show-todo-full')
  await sleep(700)
  const restored = await todoWindowInfo()
  assert('T4 重开后恢复用户尺寸', Math.abs(restored.width - target.width) <= TOL && Math.abs(restored.height - target.height) <= TOL, `target=${target.width}x${target.height} restored=${restored.width}x${restored.height}`)
}

// T5 mini 形态不被钳制
{
  await emitAppEvent('show-todo-mini')
  await sleep(700)
  const mini = await todoWindowInfo()
  assert('T5 mini 形态 380×130', Math.abs(mini.width - 380) <= TOL && Math.abs(mini.height - 130) <= TOL, `got=${mini.width}x${mini.height}`)
  // 收尾：回到 panel 形态方便人工查看
  await emitAppEvent('show-todo-full')
  await sleep(500)
}

console.log('\n=== e2e 全部通过 ===')
