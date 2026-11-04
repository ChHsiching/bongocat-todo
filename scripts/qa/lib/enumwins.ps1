# issue19 QA：枚举指定进程的顶层窗口（标题/可见性/rect，物理像素）
# 用法：powershell -NoProfile -File enumwins.ps1 [-ProcessName bongo-cat] [-Json]
param(
  [string]$ProcessName = 'bongo-cat',
  [switch]$Json
)
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public class WEnumQa {
  delegate bool EnumWindowsProc(IntPtr h, IntPtr lp);

  [DllImport("user32.dll")]
  static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);

  [DllImport("user32.dll")]
  static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

  [DllImport("user32.dll")]
  static extern bool IsWindowVisible(IntPtr h);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int L, T, R, B; }

  [DllImport("user32.dll")]
  static extern bool GetWindowRect(IntPtr h, out RECT r);

  public static List<string> Go(uint target) {
    var list = new List<string>();
    EnumWindows((h, lp) => {
      uint p;
      GetWindowThreadProcessId(h, out p);
      if (p != target) return true;
      var sb = new StringBuilder(256);
      GetWindowTextW(h, sb, 256);
      var cn = new StringBuilder(256);
      GetClassNameW(h, cn, 256);
      var r = new RECT();
      GetWindowRect(h, out r);
      int w = r.R - r.L, ht = r.B - r.T;
      list.Add("class=" + cn + "|title=" + sb + "|vis=" + IsWindowVisible(h) + "|" + r.L + "," + r.T + " " + w + "x" + ht);
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
'@

$p = Get-Process -Name $ProcessName -ErrorAction Stop
$results = [WEnumQa]::Go([uint32]$p.Id)
if ($Json) {
  $results | ConvertTo-Json
} else {
  $results | ForEach-Object { Write-Output $_ }
}
