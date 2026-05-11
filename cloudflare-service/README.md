# Sun Panel Cloudflare Worker 后端

这个目录是 Sun-Panel Cloudflare 版的 Worker 后端，替代原来的 Go 后端。

技术栈：

- Hono + TypeScript：提供 HTTP API。
- Cloudflare D1：持久化数据库。
- Cloudflare Workers KV：缓存登录 token、系统配置、favicon 查询结果等短期数据。
- Cloudflare R2：存储上传的图标、壁纸等文件；上传成功后会使用 Worker 变量 `R2_PUBLIC_BASE_URL` 和 R2 返回的 object key 生成完整公开地址，并把该地址写入 D1。

## 本地运行

第一次使用前，先复制 Worker 配置示例：

```sh
copy wrangler.example.toml wrangler.toml
```

`wrangler.toml` 会包含你的 Cloudflare D1、KV、R2 资源 ID，因此不会提交到 Git。

然后安装依赖并初始化本地 D1 数据库：

```sh
npm install
npm run db:migrate:local
```

在 `cloudflare-service` 目录中启动：

```sh
npm run dev:local
```

也可以在仓库根目录一条命令启动后端：

```sh
npm run dev:service
```

默认本地地址：

```text
http://127.0.0.1:8787
```

前端本地开发时，根目录 `.env.development` 中的 API 地址应指向：

```env
VITE_GLOB_API_URL=/api
VITE_APP_API_BASE_URL=http://127.0.0.1:8787/
```

根目录不再需要单独创建 `.env`。`.env.development`、`.env.production` 不会提交到 Git，第一次运行前请在仓库根目录执行：

```sh
copy .env.development.example .env.development
copy .env.production.example .env.production
```

`npm run dev` 会自动读取 `.env.development`，`npm run build` 会自动读取 `.env.production`。`.env.example` 仅作为通用环境变量参考，不是必须复制的运行文件。

## Cloudflare 绑定

`wrangler.toml` 中需要配置以下绑定：

- `DB`：Cloudflare D1 数据库。
- `CACHE`：Cloudflare KV 命名空间，用于缓存 token、系统配置和短期接口数据。
- `UPLOADS`：Cloudflare R2 bucket，用于保存上传的图标和壁纸。
- `R2_PUBLIC_BASE_URL`：R2 公开访问基地址，用于把 R2 object key 拼成前端可直接访问的图片地址。

创建资源后，需要把 `wrangler.toml` 中的占位 ID 替换成真实 ID。

如果没有 `wrangler.toml`，先复制示例文件：

```sh
copy wrangler.example.toml wrangler.toml
```

## 默认账号

第一次迁移会自动创建一个管理员账号：

- 账号：`admin@sun.cc`
- 密码：`12345678`

首次登录后建议立即修改密码。

## 生产部署

创建 R2 bucket：

```sh
wrangler r2 bucket create sun-panel-uploads
wrangler r2 bucket create sun-panel-uploads-preview
```

开启 R2 Public Development URL 或绑定自定义域后，将公开访问基地址写入 `wrangler.toml`：

```toml
[vars]
R2_PUBLIC_BASE_URL = "https://你的-r2-public-development-url.r2.dev"
```

应用远程 D1 迁移并部署 Worker：

```sh
npm run db:migrate:remote
npm run deploy
```

## 接口兼容说明

- API 统一挂载在 `/api` 下，匹配当前 Vue 前端的代理方式。
- 登录认证继续兼容当前前端使用的 `token` 请求头。
- D1 保存面板用户、图标、配置等业务数据。
- KV 用于缓存客户端 token、用户信息、系统配置和 favicon 查询结果。
- R2 保存上传图片。上传成功后，Worker 根据 R2 返回的 object key 和 `R2_PUBLIC_BASE_URL` 拼出完整公开地址，写入 D1 并返回给前端；后续加载图片时前端直接访问 R2 公开地址，不再通过 Worker 代理图片请求。
- Cloudflare Worker 无法读取宿主机 CPU、内存、磁盘等信息，因此系统监控接口返回稳定的空值结构，避免前端调用失败。

## 推荐部署流程

1. 创建 D1 数据库、KV 命名空间和 R2 bucket。
2. 修改 `wrangler.toml`，填入真实的 D1、KV、R2 配置，并设置 `R2_PUBLIC_BASE_URL`。
3. 执行 D1 数据库迁移。
4. 部署 Worker。
5. 将前端 API 地址指向 Worker 路由。
