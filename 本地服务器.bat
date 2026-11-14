@echo off
title 鸡狗杀 - 本地服务器
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请先安装 Node.js 18+
  pause
  exit /b 1
)
echo.
echo   本地服务器：http://localhost:8787
echo   关闭此窗口即可停止。
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8787'"
node server.js 8787
pause
