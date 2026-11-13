# 鸡狗杀 · 部署指南

零依赖：**不需要 `npm install`**，有 Node.js 18+ 就能跑（`node server.js`），
也提供了 Dockerfile 和 Render / Railway 的配置。

---

## 方式一：Render（免费，最简单）

1. 把整个项目（本目录）推到 GitHub 仓库；
2. 打开 https://render.com → New → **Web Service** → 连接仓库；
3. Runtime 选 **Node**，Build Command 留空，Start Command 填 `node server.js`；
4. Plan 选 Free，Create Web Service；
5. 部署完成后拿到 `https://xxx.onrender.com`，手机直接打开。

> 免费实例闲置 15 分钟会休眠，第一次打开要等 30 秒左右。

## 方式二：Railway

1. 推仓库到 GitHub，https://railway.app → New Project → Deploy from GitHub；
2. 会自动识别 `Dockerfile`（或 `railway.json`）；
3. 部署后 Settings → Networking → Generate Domain；
4. 用生成的域名访问。

## 方式三：VPS + Docker（推荐长期用）

```bash
# 上传项目到服务器后
docker build -t jigousha .
docker run -d --name jigousha -p 8787:8787 -v $(pwd)/data:/app/data --restart unless-stopped jigousha
```

访问 `http://服务器IP:8787`。建议再用 Caddy / Nginx 套一层 HTTPS：

```caddy
game.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Caddy 会自动申请证书，HTTPS 下 PWA「添加到主屏幕」才是完整形态。

## 方式四：VPS 直接跑

```bash
scp -r jigousha user@server:~/
ssh user@server
cd jigousha
sh start.sh          # 或 PORT=8080 sh start.sh
```

用 `pm2` 守护：`pm2 start server.js --name jigousha && pm2 save`。

---

## 端口

服务器优先读命令行参数，其次读环境变量 `PORT`，最后默认 8787：

```bash
node server.js 9000     # 命令行
PORT=9000 node server.js # 环境变量（Render / Railway 会自动注入）
```

## 数据持久化

账号、好友、云端存档写在 `data/users.json`（首次启动自动创建，含密钥 `secret.txt`）。

- Render 免费实例的磁盘是临时的，**重新部署会清空账号**；
- 需要保留：Render 付费磁盘 / Railway Volume / 或 Docker 挂卷 `-v data:/app/data`；
- 也可以定期备份 `data/` 目录。

## 健康检查

`GET /api/health` → `{"ok":true,"uptime":秒}`，Render / Railway 用它判断服务是否存活。

## 包含的内容

| 目录 | 说明 |
|---|---|
| `index.html` / `css` / `js` | 游戏本体 |
| `img` / `voice` / `music` | 立绘、角色语音、BGM（约 20MB） |
| `server.js` | 零依赖 HTTP + WebSocket 服务端（房间、账号、好友、存档） |
| `Dockerfile` / `render.yaml` / `railway.json` | 一键部署配置 |
| `start.sh` | Linux 一键启动 |

## 常见问题

- **打不开 / 403**：确认用的是 `https://` 域名，且平台没有额外拦截 WebSocket；
- **联机房间进不去**：确认域名支持 WebSocket（Render / Railway / VPS 都支持）；
- **好友列表显示离线**：好友需要 90 秒内有过请求才算在线；
- **存档没了**：多半是重新部署导致 `data/` 被清空，按上面的持久化方案处理。
