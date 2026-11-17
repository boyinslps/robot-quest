# 備用的小型網頁伺服器（沒有安裝 Python 時用）。只提供這個資料夾，只接受本機連線。
param([int]$Port = 8765)
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.mjs'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'
  '.json'='application/json; charset=utf-8'; '.wasm'='application/wasm'; '.zip'='application/zip'; '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml'
  '.mp3'='audio/mpeg'; '.ogg'='audio/ogg'; '.wav'='audio/wav'; '.cur'='image/x-icon'; '.ico'='image/x-icon'; '.map'='application/json'; '.md'='text/plain; charset=utf-8' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
try { $l.Start() } catch { Write-Host "無法啟動（埠 $Port 可能已被占用）：$($_.Exception.Message)"; exit 1 }
Write-Host "已啟動：http://localhost:$Port/ （關掉這個視窗就會結束）"
while ($l.IsListening) {
  $c = $l.GetContext()
  try {
    $rel = [System.Uri]::UnescapeDataString($c.Request.Url.LocalPath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $f = [System.IO.Path]::GetFullPath((Join-Path $root ($rel -replace '/', '\')))
    if ($f.StartsWith($root) -and (Test-Path -LiteralPath $f -PathType Leaf)) {
      $ext = [System.IO.Path]::GetExtension($f).ToLower()
      $c.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $b = [System.IO.File]::ReadAllBytes($f)
      $c.Response.ContentLength64 = $b.Length
      $c.Response.OutputStream.Write($b, 0, $b.Length)
    } else { $c.Response.StatusCode = 404 }
  } catch { $c.Response.StatusCode = 500 }
  $c.Response.Close()
}
