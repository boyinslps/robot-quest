@echo off
chcp 65001 >nul
title SPIKE 模擬器（本機版）
cd /d "%~dp0"
set PORT=8765
if not exist "%~dp0index.html" (
  echo  找不到 index.html。請先把壓縮檔「解壓縮」，再雙擊這個檔案（不要在壓縮檔裡直接開）。
  goto :end
)
echo.
echo  SPIKE 模擬器（本機版）。黑色視窗請不要關，關掉就結束了。
echo.
rem 找「真的能用」的 Python（Windows 內建的假 python.exe 只會打開商店，要排除）
set PY=
py -3 -c "import http.server" >nul 2>nul
if %errorlevel%==0 set PY=py -3
if "%PY%"=="" (
  python -c "import http.server" >nul 2>nul
  if %errorlevel%==0 set PY=python
)
if "%PY%"=="" (
  python3 -c "import http.server" >nul 2>nul
  if %errorlevel%==0 set PY=python3
)
if not "%PY%"=="" (
  echo  使用 Python 啟動： %PY%
  echo  網址： http://127.0.0.1:%PORT%/
  start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:%PORT%/'"
  %PY% -m http.server %PORT% --bind 127.0.0.1
  goto :end
)
echo  這台電腦沒有可用的 Python，改用 Windows 內建的 PowerShell 啟動（備用方式）。
echo  網址： http://localhost:%PORT%/
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:%PORT%/'"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port %PORT%
:end
echo.
echo  伺服器已停止。如果是一開始就停了，請把上面的訊息拍給老師看。
pause
