# 无 CDP 打开 todo 面板：右键猫 → 键盘导航（DOWN×5 + ENTER → 「待办」）
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class OpenP {
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
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
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
[OpenP]::Find([uint32]$proc.Id, 'BongoCat Todo')
$h = [OpenP]::found
if ($h -eq [IntPtr]::Zero) { throw '主窗口未找到' }
$r = New-Object OpenP+RECT
[OpenP]::GetWindowRect($h, [ref]$r) | Out-Null
$cx = [int](($r.L + $r.R) / 2)
$cy = [int](($r.T + $r.B) / 2)
Write-Output "猫中心: $cx,$cy"

# 右键
[OpenP]::SetCursorPos($cx, $cy) | Out-Null
Start-Sleep -Milliseconds 80
[OpenP]::mouse_event(8, 0, 0, 0, [UIntPtr]::Zero)   # RIGHTDOWN
Start-Sleep -Milliseconds 40
[OpenP]::mouse_event(16, 0, 0, 0, [UIntPtr]::Zero)  # RIGHTUP
Start-Sleep -Milliseconds 700

# 键盘导航：菜单项顺序 偏好设置/隐藏猫咪/窗口穿透/窗口尺寸/不透明度/待办 → DOWN×5 + ENTER
# （原生菜单键盘导航自动跳过分隔线）
for ($i = 0; $i -lt 5; $i++) {
  [OpenP]::keybd_event(40, 0, 0, [UIntPtr]::Zero)   # VK_DOWN
  Start-Sleep -Milliseconds 50
  [OpenP]::keybd_event(40, 0, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 60
}
[OpenP]::keybd_event(13, 0, 0, [UIntPtr]::Zero)     # VK_RETURN
Start-Sleep -Milliseconds 60
[OpenP]::keybd_event(13, 0, 2, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 800

# 确认面板窗口可见
[OpenP]::found = [IntPtr]::Zero
[OpenP]::Find([uint32]$proc.Id, '待办')
if ([OpenP]::found -ne [IntPtr]::Zero) {
  $tr = New-Object OpenP+RECT
  [OpenP]::GetWindowRect([OpenP]::found, [ref]$tr) | Out-Null
  Write-Output ("待办窗口: " + $tr.L + "," + $tr.T + " " + ($tr.R - $tr.L) + "x" + ($tr.B - $tr.T))
}
