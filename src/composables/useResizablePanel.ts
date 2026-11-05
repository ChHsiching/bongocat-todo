import { LogicalSize, PhysicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { onMounted } from 'vue'

/**
 * useResizablePanel: shared "resizable" logic for single-mode hand-drawn panel windows (issue #19 follow-up).
 *
 * Difference from the todo window: todo's dual-mode reuses the same label (constraints must be applied/cleared dynamically),
 * while mail-list / mail-archive are each independent single-mode windows with simpler logic:
 * apply constraints + restore the size on open; debounced persistence on onResized (logical).
 *
 * Usage (inside a page's setup):
 *   const { applyConstraints } = useResizablePanel({
 *     min: { width: 400, height: 320 },
 *     max: { width: 720, height: 8192 },
 *     restore: () => store.panelSize,
 *     persist: size => store.setPanelSize(size),
 *   })
 *   // In the SHOW event handler: const target = await applyConstraints()
 */
export interface ResizablePanelOptions {
  /** Size constraints (logical px) */
  min: { width: number, height: number }
  max: { width: number, height: number }
  /** Default size (logical; used when the restored value is null) */
  fallback: { width: number, height: number }
  /** Read the persisted size (null means never resized) */
  restore: () => { width: number, height: number } | null
  /** Write the persisted size */
  persist: (size: { width: number, height: number }) => void
}

export function useResizablePanel(options: ResizablePanelOptions) {
  const appWindow = getCurrentWebviewWindow()

  let programmaticResize = false
  let programmaticTimer: ReturnType<typeof setTimeout> | undefined
  let persistTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * Called when opening the window: apply constraints + restore the user's size (clamped into the constraints),
   * returning the physical target size (for the anchor-to-the-cat positioning math). Sets programmaticResize
   * during the programmatic setSize so onResized's persistence is skipped (the restored value must not be written back to the store).
   */
  async function applyConstraints(): Promise<PhysicalSize> {
    await appWindow.setResizable(true)
    await appWindow.setMinSize(new LogicalSize(options.min.width, options.min.height))
    await appWindow.setMaxSize(new LogicalSize(options.max.width, options.max.height))

    const stored = options.restore()
    const logical = stored
      ? {
          width: Math.min(options.max.width, Math.max(options.min.width, stored.width)),
          height: Math.min(options.max.height, Math.max(options.min.height, stored.height)),
        }
      : options.fallback
    const scale = await appWindow.scaleFactor()
    const target = new PhysicalSize(
      Math.round(logical.width * scale),
      Math.round(logical.height * scale),
    )

    programmaticResize = true
    if (programmaticTimer)
      clearTimeout(programmaticTimer)
    programmaticTimer = setTimeout(() => {
      programmaticResize = false
    }, 500)
    await appWindow.setSize(target)
    return target
  }

  onMounted(() => {
    appWindow.onResized(async () => {
      if (persistTimer)
        clearTimeout(persistTimer)
      persistTimer = setTimeout(async () => {
        if (programmaticResize)
          return
        const [size, scale] = await Promise.all([appWindow.outerSize(), appWindow.scaleFactor()])
        const logical = size.toLogical(scale)
        options.persist({ width: Math.round(logical.width), height: Math.round(logical.height) })
      }, 300)
    })
  })

  return { applyConstraints }
}
