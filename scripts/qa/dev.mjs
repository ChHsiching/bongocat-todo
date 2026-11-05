/**
 * QA dev launcher: wraps `tauri dev` with the WebView2 CDP debugging port
 * injected, and guarantees the tracked tauri.conf.json is restored on exit.
 *
 * Before this existed, e2e runs hand-edited src-tauri/tauri.conf.json and
 * rebuilt — the debug args nearly got committed twice. Now: `pnpm qa:dev`.
 *
 * How it works:
 * 1. Verify the working tree is clean for tauri.conf.json (refuse to run
 *    over uncommitted edits we would clobber on restore).
 * 2. Inject `additionalBrowserArgs` (with the CDP port) into every window
 *    of the config, in place.
 * 3. Spawn `corepack pnpm tauri dev` and forward its exit.
 * 4. On exit (including Ctrl+C / SIGINT), restore the file via git checkout.
 *
 * Note (banked pitfall, ADR 0003): WebView2 silently kills webviews created
 * after the first one when additionalBrowserArgs differ within the same
 * user-data dir — that is why ALL windows get the same args.
 */
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CONF = resolve(ROOT, 'src-tauri/tauri.conf.json')
const CDP_ARGS = '--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=9222'

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

// 1. Refuse to clobber uncommitted config edits
const status = git(['status', '--porcelain', '--', 'src-tauri/tauri.conf.json'])
if (status) {
  console.error('src-tauri/tauri.conf.json has uncommitted changes; commit or stash first (this script restores it via git on exit).')
  process.exit(1)
}

// 2. Inject args into every window
const conf = JSON.parse(readFileSync(CONF, 'utf8'))
for (const win of conf.app.windows)
  win.additionalBrowserArgs = CDP_ARGS
writeFileSync(CONF, `${JSON.stringify(conf, null, 2)}\n`)
console.log('[qa:dev] CDP port 9222 injected into all windows')

// 3. Spawn tauri dev, 4. restore on any exit path
const child = spawn('corepack', ['pnpm', 'tauri', 'dev'], { cwd: ROOT, stdio: 'inherit', shell: true })

function restore() {
  try {
    execFileSync('git', ['checkout', '--', 'src-tauri/tauri.conf.json'], { cwd: ROOT })
    console.log('\n[qa:dev] tauri.conf.json restored')
  } catch {
    console.error('\n[qa:dev] FAILED to restore tauri.conf.json, run manually: git checkout -- src-tauri/tauri.conf.json')
  }
}

// The wrapper itself can be killed (task runners kill the parent, not the
// child), so restoration must live on the wrapper's own exit paths — a bare
// child.on('close') never fires when the parent dies first.
let restored = false
function restoreOnce() {
  if (!restored) {
    restored = true
    restore()
  }
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    child.kill(sig)
    restoreOnce()
    process.exit(0)
  })
}
process.on('exit', restoreOnce)
child.on('close', (code) => {
  restoreOnce()
  process.exit(code ?? 0)
})
