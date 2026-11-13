# 鸡狗杀 · 部署镜像
FROM node:20-alpine

WORKDIR /app

# 零依赖：直接把源码拷进去即可（不需要 npm install）
COPY . .

ENV PORT=8787
EXPOSE 8787

# 账号 / 存档写在 /app/data/users.json；需要持久化就挂一个卷到这个目录
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["node", "server.js"]
