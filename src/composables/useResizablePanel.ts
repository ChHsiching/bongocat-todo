import { LogicalSize, PhysicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { onMounted } from 'vue'

/**
 * useResizablePanel：单形态手绘面板窗口的「可调尺寸」公共逻辑（issue #19 后续）。
 *
 * 与 todo 窗口的差异：todo 双形态复用同一 label（约束要动态套/清），
 * mail-list / mail-archive 各自独立窗口、单一形态，逻辑更简单：
 * 打开时套约束 + 恢复尺寸；onResized 防抖持久化（logical）。
 *
 * 用法（页面 setup 内）：
 *   const { applyConstraints } = useResizablePanel({
 *     min: { width: 400, height: 320 },
 *     max: { width: 720, height: 8192 },
 *     restore: () => store.panelSize,
 *     persist: size => store.setPanelSize(size),
 *   })
 *   // SHOW 事件 handler 里：const target = await applyConstraints()
 */
export interface ResizablePanelOptions {
  /** 尺寸约束（logical px） */
  min: { width: number, height: number }
  max: { width: number, height: number }
  /** 默认尺寸（logical；恢复值为 null 时用它） */
  fallback: { width: number, height: number }
  /** 读持久化尺寸（返回 null 表示从未调整） */
  restore: () => { width: number, height: number } | null
  /** 写持久化尺寸 */
  persist: (size: { width: number, height: number }) => void
}

export function useResizablePanel(options: ResizablePanelOptions) {
  const appWindow = getCurrentWebviewWindow()

  let programmaticResize = false
  let programmaticTimer: ReturnType<typeof setTimeout> | undefined
  let persistTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * 打开窗口时调用：套约束 + 恢复用户尺寸（clamp 到约束内），返回物理目标尺寸
   * （供贴猫定位计算用）。程序化 setSize 期间置 programmaticResize，
   * 让 onResized 的持久化跳过（恢复值不该写回 store）。
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
