# Rebuild bundled PNG icons on Windows; production builds use the committed files.
Add-Type -AssemblyName System.Drawing
$iconDirectory = Join-Path $PSScriptRoot '..\public\icons'
New-Item -ItemType Directory -Path $iconDirectory -Force | Out-Null
foreach ($size in @(16, 48, 128)) {
    $bitmap = [Drawing.Bitmap]::new($size, $size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform($size / 64.0, $size / 64.0)
    $path = [Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc(0, 0, 38, 38, 180, 90)
    $path.AddArc(26, 0, 38, 38, 270, 90)
    $path.AddArc(26, 26, 38, 38, 0, 90)
    $path.AddArc(0, 26, 38, 38, 90, 90)
    $path.CloseFigure()
    $background = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#151d31'))
    $graphics.FillPath($background, $path)
    $pen = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#b5c6ff'), 2.4)
    $graphics.DrawEllipse($pen, 17, 17, 30, 30)
    $graphics.TranslateTransform(32, 32)
    $graphics.RotateTransform(-35)
    $graphics.DrawEllipse($pen, -25, -9, 50, 18)
    $graphics.ResetTransform()
    $graphics.ScaleTransform($size / 64.0, $size / 64.0)
    $dot = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#d9e2ff'))
    $graphics.FillEllipse($dot, 41, 14, 8, 8)
    $bitmap.Save((Join-Path $iconDirectory "icon-$size.png"), [Drawing.Imaging.ImageFormat]::Png)
    $dot.Dispose(); $pen.Dispose(); $background.Dispose(); $path.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
