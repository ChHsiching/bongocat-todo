# issue19 无 CDP 验证：真鼠标拖"贴边框把手"（右边缘内 27px 处）→ 读窗口尺寸断言
# 用法：handle-e2e.ps1  （前置：面板已打开，todo 窗口可见）
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Hq1 {
  delegate bool EnumWindowsProc(IntPtr h, IntPtr lp);
  [DllImport("user32.dll")]
  static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")]
  static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint f, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int x, int y);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int L, T, R, B; }
  public static IntPtr found = IntPtr.Zero;
  public static void Find(uint target, string title) {
    EnumWindows((h, lp) => {
      uint p;
      GetWindowThreadProcessId(h, out p);
      if (p == target) {
        var sb = new StringBuilder(256);
        GetWindowTextW(h, sb, 256);
        if (sb.ToString() == title) found = h;
      }
      return true;
    }, IntPtr.Zero);
  }
}
'@
$proc = Get-Process bongo-cat -ErrorAction Stop
[Hq1]::Find([uint32]$proc.Id, '待办')
$h = [Hq1]::found
if ($h -eq [IntPtr]::Zero) { throw 'todo 窗口未找到' }
function Get-TodoRect {
  $r = New-Object Hq1+RECT
  [Hq1]::GetWindowRect($h, [ref]$r) | Out-Null
  return $r
}

$before = Get-TodoRect
$w0 = $before.R - $before.L
Write-Output ("拖前: " + $w0 + "x" + ($before.B - $before.T) + " @ " + $before.L + "," + $before.T)

# 抓右视觉边框（窗口右缘内 27px），垂直中点，往右拖 80px
$grabX = $before.R - 27
$grabY = $before.T + [int](($before.B - $before.T) / 2)
[Hq1]::SetCursorPos($grabX, $grabY) | Out-Null
Start-Sleep -Milliseconds 80
[Hq1]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero) # LEFTDOWN → mousedown 落在把手 div → startResizeDragging
Start-Sleep -Milliseconds 120
for ($i = 1; $i -le 20; $i++) {
  [Hq1]::SetCursorPos($grabX + [int](80 * $i / 20), $grabY) | Out-Null
  Start-Sleep -Milliseconds 14
}
Start-Sleep -Milliseconds 80
[Hq1]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero) # LEFTUP
Start-Sleep -Milliseconds 500

$after = Get-TodoRect
$w1 = $after.R - $after.L
$delta = $w1 - $w0
Write-Output ("拖后: " + $w1 + "x" + ($after.B - $after.T))
Write-Output ("Δ宽: " + $delta)
if ($delta -ge 78 -and $delta -le 82) { Write-Output 'PASS: 贴边框把手精确生效（±80）' }
elseif ($delta -gt 0) { Write-Output ('PARTIAL: 有响应但不精确（Δ=' + $delta + '）') }
else { Write-Output 'FAIL: 把手无响应' }
