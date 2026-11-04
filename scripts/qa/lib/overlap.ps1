# issue19 诊断：找覆盖指定屏幕矩形的所有可见顶层窗口（跨进程）
# 用法：overlap.ps1 -X -Y -W -H
param(
  [Parameter(Mandatory)][int]$X,
  [Parameter(Mandatory)][int]$Y,
  [Parameter(Mandatory)][int]$W,
  [Parameter(Mandatory)][int]$H
)
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public class OverlapQa {
  delegate bool EnumWindowsProc(IntPtr h, IntPtr lp);

  [DllImport("user32.dll")]
  static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);

  [DllImport("user32.dll")]
  static extern bool IsWindowVisible(IntPtr h);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);

  [DllImport("user32.dll")]
  static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

  [DllImport("user32.dll")]
  static extern bool GetWindowRect(IntPtr h, out RECT r);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int L, T, R, B; }

  public static List<string> hits = new List<string>();

  public static void Go(int x, int y, int w, int h) {
    hits.Clear();
    EnumWindows((wnd, lp) => {
      if (!IsWindowVisible(wnd)) return true;
      var r = new RECT();
      GetWindowRect(wnd, out r);
      // 相交测试
      if (r.L < x + w && r.R > x && r.T < y + h && r.B > y) {
        var t = new StringBuilder(256); GetWindowTextW(wnd, t, 256);
        var c = new StringBuilder(256); GetClassNameW(wnd, c, 256);
        uint pid; GetWindowThreadProcessId(wnd, out pid);
        if (r.R - r.L < 4 || r.B - r.T < 4) return true; // 忽略微型辅助窗口
        hits.Add(String.Format("pid={0} class={1} title={2} rect={3},{4} {5}x{6}",
          pid, c, t, r.L, r.T, r.R - r.L, r.B - r.T));
      }
      return true;
    }, IntPtr.Zero);
  }
}
'@

[OverlapQa]::Go($X, $Y, $W, $H)
[OverlapQa]::hits | ForEach-Object { Write-Output $_ }
