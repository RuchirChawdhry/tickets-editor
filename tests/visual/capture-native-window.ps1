param(
  [Parameter(Mandatory = $true)]
  [string]$WindowHandle,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class NativeWindow {
    [StructLayout(LayoutKind.Sequential)]
    public struct Rect {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetWindowRect(IntPtr handle, out Rect rect);
}
'@

$handle = [IntPtr]::new([long]::Parse($WindowHandle))
$rect = [NativeWindow+Rect]::new()
if (-not [NativeWindow]::GetWindowRect($handle, [ref]$rect)) {
  throw ('GetWindowRect failed for HWND {0}' -f $WindowHandle)
}

$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top

if ($width -lt 100 -or $height -lt 100) {
  throw ('Invalid native window dimensions: {0}x{1}' -f $width, $height)
}

$bitmap = [System.Drawing.Bitmap]::new($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen(
    $rect.Left, $rect.Top, 0, 0,
    [System.Drawing.Size]::new($width, $height)
  )
  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Output ('Native HWND captured: {0}x{1} -> {2}' -f $width, $height, $OutputPath)
