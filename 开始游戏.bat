@echo off
chcp 65001 >nul
title 鸡狗杀 · 联机服务器
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   未找到 Node.js。请先安装 Node.js 18 或更高版本：
  echo   https://nodejs.org/
  echo.
  echo   提示：只玩「经典模式」的话，直接双击 index.html 即可，不需要服务器。
  echo.
  pause
  exit /b 1
)

echo.
echo   正在启动鸡狗杀服务器…
echo   浏览器会自动打开 http://localhost:8787
echo   关闭此窗口即可停止服务器。
echo.

start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8787'"
node server.js 8787
pause
