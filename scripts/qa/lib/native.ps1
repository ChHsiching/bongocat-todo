# issue19 QA native input/screenshot layer (local dev only, not for CI)
# Usage: powershell -NoProfile -File native.ps1 -Action <drag|move|click|capture> [params]
#   drag    -FromX -FromY -ToX -ToY [-Steps N]   real SendInput press-and-drag
#   move    -ToX -ToY
#   capture -X -Y -W -H -Out <png path>
param(
  [Parameter(Mandatory)][string]$Action,
  [int]$FromX, [int]$FromY, [int]$ToX, [int]$ToY, [int]$Steps = 20,
  [int]$X, [int]$Y, [int]$W, [int]$H,
  [string]$Out,
  [byte]$VK = 0x1B
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NativeQa {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
'@
[NativeQa]::SetProcessDPIAware() | Out-Null

Add-Type -AssemblyName System.Windows.Forms, System.Drawing

function Move-Abs([int]$px, [int]$py) {
  [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($px, $py)
}

function Drag-Input([int]$fx, [int]$fy, [int]$tx, [int]$ty, [int]$steps) {
  Move-Abs $fx $fy
  Start-Sleep -Milliseconds 80
  [NativeQa]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero) # LEFTDOWN
  for ($i = 1; $i -le $steps; $i++) {
    $cx = [int]($fx + ($tx - $fx) * $i / $steps)
    $cy = [int]($fy + ($ty - $fy) * $i / $steps)
    [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($cx, $cy)
    Start-Sleep -Milliseconds 12
  }
  Start-Sleep -Milliseconds 60
  [NativeQa]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero) # LEFTUP
}

function Click-Input([int]$x, [int]$y, [uint32]$flags) {
  # flags: 0x0002 LEFTDOWN / 0x0008 RIGHTDOWN (UP = flags*2)
  Move-Abs $x $y
  Start-Sleep -Milliseconds 60
  [NativeQa]::mouse_event($flags, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 30
  [NativeQa]::mouse_event(($flags * 2), 0, 0, 0, [UIntPtr]::Zero)
}

function Capture-Region([int]$cx, [int]$cy, [int]$cw, [int]$ch, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($cw, $ch)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($cx, $cy, 0, 0, (New-Object System.Drawing.Size($cw, $ch)))
  $g.Dispose()
  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "saved $path"
}

function Key-Press([byte]$vk) {
  # vk: 0x1B ESC, 0x0D Enter, 0x28 DOWN ...
  [NativeQa]::keybd_event($vk, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [NativeQa]::keybd_event($vk, 0, 2, [UIntPtr]::Zero) # KEYEVENTF_KEYUP
}

switch ($Action) {
  'drag' { Drag-Input $FromX $FromY $ToX $ToY $Steps }
  'move' { Move-Abs $ToX $ToY }
  'lclick' { Click-Input $X $Y 0x0002 }
  'rclick' { Click-Input $X $Y 0x0008 }
  'key' { Key-Press $VK }
  'capture' { Capture-Region $X $Y $W $H $Out }
  default { throw "unknown action: $Action" }
}
