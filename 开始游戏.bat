@echo off
title 鸡狗杀 - 云端版
cd /d "%~dp0"
set CLOUD=https://pjzdvnfskrdu.cloud.sealos.io
echo.
echo   正在打开云端：%CLOUD%
start "" "%CLOUD%"
echo.
echo   如果浏览器没有自动打开，请手动复制上面的地址。
ping -n 6 127.0.0.1 >nul
