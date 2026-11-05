# issue19 diagnostics: the todo window's style bits (WS_THICKFRAME) and its child window list
param(
  [string]$ProcessName = 'bongo-cat',
  [string]$Title = '待办'
)
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public class WDiagQa {
  delegate bool EnumWindowsProc(IntPtr h, IntPtr lp);

  [DllImport("user32.dll")]
  static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);

  [DllImport("user32.dll")]
  static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc cb, IntPtr lp);

  [DllImport("user32.dll")]
  static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);

  [DllImport("user32.dll")]
  public static extern int GetWindowLong(IntPtr h, int index);

  [DllImport("user32.dll")]
  static extern bool GetWindowRect(IntPtr h, out RECT r);

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

  public static List<string> Children(IntPtr parent) {
    var list = new List<string>();
    EnumChildWindows(parent, (h, lp) => {
      var sb = new StringBuilder(256);
      GetClassNameW(h, sb, 256);
      list.Add(sb.ToString());
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
'@

$p = Get-Process -Name $ProcessName -ErrorAction Stop
[WDiagQa]::Find([uint32]$p.Id, $Title)
if ([WDiagQa]::found -eq [IntPtr]::Zero) {
  Write-Output "window '$Title' NOT found"
  exit 1
}
$h = [WDiagQa]::found
$style = [WDiagQa]::GetWindowLong($h, -16)
Write-Output ("hwnd=0x{0:X}" -f $h.ToInt64())
Write-Output ("WS_THICKFRAME(0x40000)=" + (($style -band 0x00040000) -ne 0) + "  style=0x" + $style.ToString('X'))
Write-Output ("children: " + ([WDiagQa]::Children($h) -join ', '))
