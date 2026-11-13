#!/bin/sh
# 鸡狗杀 · 一键启动（Linux / macOS / VPS）
# 用法：sh start.sh        （默认 8787）
#      PORT=8080 sh start.sh
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 node，请先安装 Node.js 18+： https://nodejs.org/"
  exit 1
fi

PORT="${PORT:-8787}"
echo "♪ 鸡狗杀启动中… 端口 $PORT"
echo "   本机： http://127.0.0.1:$PORT"
echo "   局域网/公网： http://<你的IP>:$PORT"
echo "   健康检查： http://127.0.0.1:$PORT/api/health"
echo ""

PORT="$PORT" node server.js
