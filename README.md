# Codetime

一个在同一端口承载 HTTP + WebSocket + Vue 的开发时长统计系统：
- VS Code 插件每分钟发送心跳（含项目名），服务端按分钟粒度去重记账到 MySQL；
- HTTP 提供最近 7 天/3 天/今天/昨天等区间的统计；
- Vue 前端作为仪表盘消费 API 并可视化；支持 GitHub 登录与多用户 PAT 管理；提供 Prometheus 指标与轻量限流。

---

快速搭建教程（Windows cmd）

1) 前置准备
- Node 18+、npm；MySQL 8（本机或 Docker Compose）
- GitHub OAuth 应用（可选，用于多用户登录与 PAT 管理）

2) 拉起 MySQL（两种方式）
- 已有 MySQL：按下文配置 .env 的 DB_* 并确保可连接
- 或使用 Docker Compose（在项目根）：
  - `docker compose up -d`
  - schema.sql 会自动导入；数据卷持久化到 mysql-data

3) 配置环境（创建 .env）
- 在项目根复制 .env.example 为 .env 并填写：
  - 基本：PORT（默认 3000）、WS_PATH（默认 /ws）
  - MySQL：DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_DATABASE
  - DEV_TOKEN_AUTO=true（开发期便捷：首次使用任意 token 自动创建用户并绑定）
  - SESSION_SECRET（启用会话与 GitHub 登录必填）
  - 可选 OAuth：GITHUB_CLIENT_ID、GITHUB_CLIENT_SECRET、GITHUB_CALLBACK_URL（如 http://localhost:3000/auth/github/callback）
  - 可选 TOKEN_PEPPER（token 哈希 pepper，生产建议设置）

4) 安装与启动服务
- 项目根执行：
  - `npm install`
  - `npm start`
- 启动日志会显示端口、WS 路径；访问 `http://localhost:3000/api/health` 验证存活。

5) 构建前端仪表盘
- `cd web && npm install && npm run build && cd ..`
- 打开 `http://localhost:3000/`，可通过“GitHub 登录”进入会话（如已配置 OAuth），或直接在页面上输入 PAT Token 并查询统计。

6) 获取或创建 Token（PAT）
- 开发期便捷（无须登录）：若 `.env` 中 `DEV_TOKEN_AUTO=true`，你可以直接使用任意 token，例如 `devtoken`。
  - 发送一次 WS 心跳：
    - `set SMOKE_URL=ws://localhost:3000/ws?token=devtoken^&clientId=smoke && node scripts\ws-smoke.js`
  - 拉取今日统计：
    - `node scripts\http-smoke.js`
- GitHub 登录 + PAT 管理（推荐生产）：
  - 浏览器访问 `/auth/github` 完成 OAuth 登录
  - 通过接口生成/撤销 PAT（仅登录态可用）：
    - 生成：`POST /api/token/rotate`（返回一次性可见的 token 明文）
    - 列表：`GET /api/token/list`
    - 撤销：`POST /api/token/revoke`（参数 id）
  - 将生成的 token 写入 VS Code 插件或前端页面用于统计查询

7) VS Code 插件（vscode-extension/）
- 打开文件夹并执行：`npm install`
- 在 VS Code F5 启动扩展开发宿主
- 在“设置”里配置：
  - codetime.serverUrl: ws://localhost:3000/ws
  - codetime.httpBase: http://localhost:3000
  - codetime.authToken: 你的 PAT（或 devtoken）
- 插件每 60s 发送心跳（空闲暂停），状态栏显示今日分钟，可通过命令“Codetime: Open Dashboard”打开仪表盘

8) Prometheus 指标与限流
- 指标：`/metrics`（http_requests_total、http_duration_seconds、ws_active_connections、ws_heartbeats_total）
- 限流（环境变量可调）：
  - RATE_HTTP_PER_MIN（默认 1200 次/分钟/Token）
  - RATE_WS_PER_MIN（默认 120 次/分钟/Token 心跳）

9) 烟囱测试（本仓库脚本）
- 健康：`node scripts\health-smoke.js`
- WS 心跳（注意 ^& 转义）：
  - `set SMOKE_URL=ws://localhost:3000/ws?token=devtoken^&clientId=smoke && node scripts\ws-smoke.js`
- 概览统计（today）：`node scripts\http-smoke.js`
- 今日日序列：`node scripts\daily-smoke.js`

10) 常见问题
- 端口无法访问：确认服务日志、Windows 防火墙、端口占用与 .env 生效
- Bearer 无法鉴权：生产下需通过 GitHub 登录生成 PAT；开发期可启用 DEV_TOKEN_AUTO 简化验证
- `&` 在 cmd 中需写 `^&`；PowerShell 兼容性注意使用 cmd 执行示例命令

---

多用户说明
- 每个用户通过 GitHub 登录创建；或在 DEV_TOKEN_AUTO 下由首次 token 使用自动生成（仅开发期建议）。
- 每个用户可在会话登录后生成多个 PAT，用于 IDE、脚本或不同设备；可随时撤销。
- 统计按 User/Project/Day 聚合；exclusive 策略默认每用户每分钟只计一个项目（可改 allow-multi）。

开发与测试
- 单元测试：`npm test`（当前包含 utils 的基础用例）
- 建议补充 API/WS 的契约测试与性能测评，根据需要扩展 test/ 目录。

---

项目结构（要点）
- src/server.js：HTTP+WS 服务、鉴权与指标
- src/store.js：内存/ MySQL 存储实现（分钟 UPSERT、日聚合）
- src/auth.js：token 哈希、GitHub OAuth
- src/migrate.js：启动迁移（tokens 表）
- src/utils.js：工具函数（范围解析、项目名校验）
- web/：Vue 仪表盘（Vite 构建输出到 public）
- vscode-extension/：VS Code 插件
- scripts/：冒烟脚本

---

试运行（最短路径）
```
npm install
npm start
cd web && npm install && npm run build && cd ..
node scripts\health-smoke.js
set SMOKE_URL=ws://localhost:3000/ws?token=devtoken^&clientId=smoke && node scripts\ws-smoke.js
node scripts\http-smoke.js
node scripts\daily-smoke.js
```

准备好后可关闭 DEV_TOKEN_AUTO，改用 GitHub 登录 + PAT 管理进行生产化验证。

---

Docker 部署

方式 A：docker compose（推荐本地快速起步）

1) 在项目根目录准备 .env（可选）：
- SESSION_SECRET=你的随机字符串（用于会话）
- DEV_TOKEN_AUTO=true（开发期便捷，生产建议 false）
- TOKEN_PEPPER=可选哈希 pepper
- 如需 GitHub 登录：GITHUB_CLIENT_ID/SECRET/CALLBACK_URL

2) 启动
```cmd
cd C:\Users\Administrator\WebstormProjects\codetime
docker compose up -d --build
```
3) 访问
- 仪表盘：http://localhost:3000/
- 健康检查：http://localhost:3000/api/health
- 指标：http://localhost:3000/metrics

方式 B：单独构建镜像
```cmd
cd C:\Users\Administrator\WebstormProjects\codetime
docker build -t codetime-app:latest .
# 需要外部 MySQL，容器运行示例：
docker run --rm -p 3000:3000 ^
  -e PORT=3000 -e WS_PATH=/ws ^
  -e DB_HOST=host.docker.internal -e DB_PORT=3306 ^
  -e DB_USER=codetime -e DB_PASSWORD=codetime -e DB_DATABASE=codetime ^
  -e SESSION_SECRET=change-me -e DEV_TOKEN_AUTO=true ^
  codetime-app:latest
```
提示
- compose 会自动拉起 MySQL 并导入 db/schema.sql；首次启动等待 MySQL 完成初始化后，app 即可读写。
- 生产环境请关闭 DEV_TOKEN_AUTO，使用 GitHub 登录 + PAT 管理生成 Token。
