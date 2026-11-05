# Open the mail list window without CDP: right-click the cat → DOWN×7 + ENTER (the 8th item, '邮件列表')
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class OpenM {
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
[OpenM]::Find([uint32]$proc.Id, 'BongoCat Todo')
$cat = [OpenM]::found
if ($cat -eq [IntPtr]::Zero) { throw 'main window not found' }
$r = New-Object OpenM+RECT
[OpenM]::GetWindowRect($cat, [ref]$r) | Out-Null
$cx = [int](($r.L + $r.R) / 2)
$cy = [int](($r.T + $r.B) / 2)

[OpenM]::SetCursorPos($cx, $cy) | Out-Null
Start-Sleep -Milliseconds 80
[OpenM]::mouse_event(8, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 40
[OpenM]::mouse_event(16, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 700

for ($i = 0; $i -lt 7; $i++) {
  [OpenM]::keybd_event(40, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 90
  [OpenM]::keybd_event(40, 0, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 90
}
[OpenM]::keybd_event(13, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 90
[OpenM]::keybd_event(13, 0, 2, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 1000

[OpenM]::found = [IntPtr]::Zero
[OpenM]::Find([uint32]$proc.Id, '邮件列表')
if ([OpenM]::found -eq [IntPtr]::Zero) { throw 'mail list window did not open (menu item index may be wrong)' }
$mr = New-Object OpenM+RECT
[OpenM]::GetWindowRect([OpenM]::found, [ref]$mr) | Out-Null
Write-Output ("mail list: " + $mr.L + "," + $mr.T + " " + ($mr.R - $mr.L) + "x" + ($mr.B - $mr.T))
