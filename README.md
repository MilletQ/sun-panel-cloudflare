# Sun-Panel Cloudflare 版

> 本项目基于 [Sun-Panel v1.3.0 开源版](https://github.com/hslr-s/sun-panel) 改造，默认中文说明。前端仍然是 Vue 3，后端已替换为 Cloudflare Worker 版本，可部署到 Cloudflare Workers + D1 + KV + R2。

<div align="center">
  <img src="./doc/images/logo.png" width="100" height="100" />

  <h1>Sun-Panel</h1>

  <p>
    一个服务器、NAS、个人导航页、浏览器首页面板。
  </p>

  <p>
    <a href="https://github.com/hslr-s/sun-panel">原项目 GitHub</a> |
    <a href="https://gitee.com/hslr/sun-panel">原项目 Gitee</a> |
    <a href="https://sun-panel-doc.enianteam.com/zh_cn">原项目文档</a> |
    <a href="http://sunpaneldemo.enianteam.com">Demo</a>
  </p>
</div>

![主界面](./doc/images/main-dark.png)

## 项目说明

这个仓库在原 Sun-Panel 前端基础上，使用 `cloudflare-service` 作为后端：

- 前端：Vue 3 + Vite + Naive UI。
- 后端：Hono + TypeScript，运行在 Cloudflare Workers。
- 数据库：Cloudflare D1。
- 缓存：Cloudflare Workers KV。
- 文件存储：Cloudflare R2，用于上传图标、壁纸等图片；上传成功后会使用 Worker 变量 `R2_PUBLIC_BASE_URL` 和 R2 返回的 object key 生成完整公开地址，并把该地址写入 D1。

原 Go 后端目录已不再作为当前项目的一部分维护，Cloudflare 版只使用 `cloudflare-service/`。

## Cloudflare 部署优势

- 成本低：Workers、D1、KV、R2 和 Pages 都有可用的免费额度，个人导航面板、小团队面板通常可以在免费额度内运行。
- 免维护：不需要自建服务器、反向代理、数据库服务和对象存储服务，部署后主要由 Cloudflare 托管运行。
- 全球访问：Cloudflare 边缘网络天然适合静态前端、API 和图片公开资源分发。
- 部署简单：前端可部署到 Cloudflare Pages，后端运行在 Cloudflare Workers，数据库、缓存和图片存储都使用同一平台资源。
- 数据持久化完整：D1 保存业务数据，KV 处理短期缓存，R2 保存上传图片，适合轻量级面板长期运行。

## 功能特点

- 简洁的导航面板界面。
- 支持多用户隔离。
- 支持图标分组、排序、导入导出。
- 支持本地上传图片作为图标或壁纸，Cloudflare 版会存储到 R2。
- 支持自定义面板样式、背景、搜索引擎等配置。
- 支持公开访问用户模式。
- Cloudflare Worker 后端保留原前端 `token` 请求头认证方式。

## 目录结构

```text
.
├─ src/                  Vue 前端源码
├─ public/               前端静态资源
├─ cloudflare-service/   Cloudflare Worker 后端
├─ doc/                  图片、说明素材
├─ package.json          前端 npm 脚本
└─ vite.config.ts        Vite 开发与代理配置
```

## 本地开发

### 1. 准备环境配置

项目不会提交真实环境配置。根目录不再需要单独创建 `.env`，推荐只使用 Vite 的模式配置文件，这样本地开发和生产构建不用来回修改同一个文件：

```powershell
Copy-Item .env.development.example .env.development
Copy-Item .env.production.example .env.production
```

本地开发配置 `.env.development`：

```env
VITE_GLOB_API_URL=/api
VITE_APP_API_BASE_URL=http://127.0.0.1:8787/
```

生产构建配置 `.env.production`：

```env
VITE_GLOB_API_URL=https://你的-worker地址.workers.dev/api
VITE_APP_API_BASE_URL=
```

之后：

- `npm run dev` 会自动读取 `.env.development`，请求本地 `8787`。
- `npm run build` 会自动读取 `.env.production`，请求线上 Worker。

### 2. 安装前端依赖

在项目根目录执行：

```powershell
npm install
```

### 3. 安装 Worker 后端依赖

```powershell
cd cloudflare-service
npm install
cd ..
```

### 4. 准备 Worker 本地配置

`wrangler.toml` 会包含你的 Cloudflare D1、KV、R2 资源 ID，因此不会提交到 Git。第一次运行前需要从示例文件复制一份：

```powershell
Copy-Item cloudflare-service/wrangler.example.toml cloudflare-service/wrangler.toml
```

本地开发时可以先保留示例中的占位 ID，Wrangler 会使用本地模拟资源。部署到 Cloudflare 前再替换为真实 ID。

### 5. 初始化本地 D1 数据库

```powershell
cd cloudflare-service
npm run db:migrate:local
cd ..
```

### 6. 启动 Cloudflare Worker 后端

在项目根目录执行：

```powershell
npm run dev:service
```

后端默认运行在：

```text
http://127.0.0.1:8787
```

### 7. 启动 Vue 前端

另开一个终端，在项目根目录执行：

```powershell
npm run dev
```

前端默认运行在：

```text
http://127.0.0.1:1002
```

本地开发时，根目录 `.env.development` 应保持：

```env
VITE_GLOB_API_URL=/api
VITE_APP_API_BASE_URL=http://127.0.0.1:8787/
```

这样前端请求 `/api` 会由 Vite 代理到本地 Worker 后端。

### 默认管理员账号

本地 D1 迁移会自动创建一个管理员账号：

```text
账号：admin@sun.cc
密码：12345678
```

首次登录后建议立即修改密码。

## Cloudflare 部署教程

下面流程面向第一次使用 Cloudflare 的用户，按步骤做即可。

### 准备条件

你需要先准备：

- 一个 Cloudflare 账号。
- 本机已安装 Node.js 和 npm。
- 已经克隆或下载本项目代码。

Cloudflare 官方文档参考：

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [D1 命令](https://developers.cloudflare.com/workers/wrangler/commands/d1/)
- [KV 命名空间](https://developers.cloudflare.com/workers/wrangler/commands/kv/)
- [R2 bucket](https://developers.cloudflare.com/workers/wrangler/commands/r2/)
- [Pages 直接上传部署](https://developers.cloudflare.com/pages/get-started/direct-upload/)

### 第一步：登录 Cloudflare

如果你还没有本地 `wrangler.toml`，先从示例文件复制：

```powershell
Copy-Item cloudflare-service/wrangler.example.toml cloudflare-service/wrangler.toml
```

进入 Worker 后端目录：

```powershell
cd cloudflare-service
```

登录 Cloudflare：

```powershell
npx wrangler login
```

命令会打开浏览器，按提示授权即可。

### 第二步：创建 D1 数据库

```powershell
npx wrangler d1 create sun-panel
```

命令执行后会输出一段类似下面的配置：

```toml
[[d1_databases]]
binding = "DB"
database_name = "sun-panel"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

把输出中的 `database_id` 复制到 `cloudflare-service/wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "sun-panel"
database_id = "你的 D1 database_id"
migrations_dir = "migrations"
```

### 第三步：创建 KV 命名空间

创建正式环境 KV：

```powershell
npx wrangler kv namespace create CACHE
```

创建预览环境 KV：

```powershell
npx wrangler kv namespace create CACHE_PREVIEW
```

两个命令都会输出 `id`。将它们填入 `cloudflare-service/wrangler.toml`：

```toml
[[kv_namespaces]]
binding = "CACHE"
id = "正式环境 KV 的 id"
preview_id = "预览环境 KV 的 id"
```

KV 用来缓存登录 token、用户信息、系统配置、favicon 查询结果等。

### 第四步：创建 R2 存储桶

创建正式环境 R2：

```powershell
npx wrangler r2 bucket create sun-panel-uploads
```

创建预览环境 R2：

```powershell
npx wrangler r2 bucket create sun-panel-uploads-preview
```

确认 `cloudflare-service/wrangler.toml` 中有：

```toml
[[r2_buckets]]
binding = "UPLOADS"
bucket_name = "sun-panel-uploads"
preview_bucket_name = "sun-panel-uploads-preview"
```

在 R2 控制台开启公开访问地址后，将公开访问基地址写入 `cloudflare-service/wrangler.toml` 的 Worker 变量：

```toml
[vars]
R2_PUBLIC_BASE_URL = "https://你的-r2-public-development-url.r2.dev"
```

R2 用来保存用户上传的图片。上传成功后，Worker 会根据 R2 返回的 object key 和 `R2_PUBLIC_BASE_URL` 拼出可直接访问的 R2 地址，把完整地址保存到 D1，并返回给前端。后续加载图片时前端直接访问 R2 公开地址，不再通过 Worker 代理图片请求。

### 第五步：迁移远程 D1 数据库

在 `cloudflare-service` 目录执行：

```powershell
npm run db:migrate:remote
```

这一步会在 Cloudflare D1 中创建表，并写入默认管理员账号。

### 第六步：部署 Worker 后端

在 `cloudflare-service` 目录执行：

```powershell
npm run deploy
```

部署成功后，终端会输出 Worker 地址，通常类似：

```text
https://sun-panel-cloudflare-service.<你的账号>.workers.dev
```

记下这个地址，后面部署前端时要用。

### 第七步：配置前端生产 API 地址

回到项目根目录：

```powershell
cd ..
```

生产环境前端不能继续只写 `/api`，因为 Cloudflare Pages 上的 `/api` 默认不会自动代理到 Worker。

推荐修改 `.env.production`，把 `VITE_GLOB_API_URL` 设置为 Worker 的完整 API 地址：

```env
VITE_GLOB_API_URL=https://你的-worker地址.workers.dev/api
VITE_APP_API_BASE_URL=
```

然后执行：

```powershell
npm run build
```

也可以临时通过命令行覆盖：

```powershell
$env:VITE_GLOB_API_URL="https://你的-worker地址.workers.dev/api"
npm run build
```

例如：

```powershell
$env:VITE_GLOB_API_URL="https://sun-panel-cloudflare-service.example.workers.dev/api"
npm run build
```

构建完成后会生成 `dist/` 目录。

### 第八步：部署前端到 Cloudflare Pages

#### 方法 A：使用命令行部署

首次创建 Pages 项目：

```powershell
npx wrangler pages project create sun-panel-cloudflare
```

部署前端静态文件：

```powershell
npx wrangler pages deploy dist --project-name sun-panel-cloudflare
```

部署成功后，Cloudflare 会输出 Pages 地址，通常类似：

```text
https://sun-panel-cloudflare.pages.dev
```

#### 方法 B：使用 Cloudflare 控制台部署

如果你不想用命令行部署前端，也可以用控制台：

1. 打开 Cloudflare Dashboard。
2. 进入 Workers & Pages。
3. 选择 Create application。
4. 选择 Pages。
5. 上传项目构建后的 `dist/` 目录，或连接你的 GitHub 仓库。
6. 如果使用 GitHub 自动构建，构建命令填写 `npm run build`，输出目录填写 `dist`。
7. 在 Pages 的环境变量中添加：

```text
VITE_GLOB_API_URL=https://你的-worker地址.workers.dev/api
```

注意：Vite 的环境变量是在构建时写入前端代码的，修改后需要重新部署前端。

### 第九步：访问和登录

打开 Cloudflare Pages 给出的前端地址，使用默认账号登录：

```text
账号：admin@sun.cc
密码：12345678
```

登录成功后，建议先修改管理员密码。

## 常见问题

### 1. 前端提示网络错误

先确认前端构建时的 API 地址是否正确：

```text
VITE_GLOB_API_URL=https://你的-worker地址.workers.dev/api
```

如果是本地开发，`.env.development` 应使用：

```env
VITE_GLOB_API_URL=/api
VITE_APP_API_BASE_URL=http://127.0.0.1:8787/
```

### 2. 上传图片失败

确认 R2 bucket 已创建，并且 `wrangler.toml` 中存在：

```toml
[[r2_buckets]]
binding = "UPLOADS"
bucket_name = "sun-panel-uploads"
preview_bucket_name = "sun-panel-uploads-preview"
```

同时确认 `wrangler.toml` 的 `[vars]` 中已经配置 R2 公开访问基地址：

```toml
R2_PUBLIC_BASE_URL = "https://你的-r2-public-development-url.r2.dev"
```

然后重新部署 Worker：

```powershell
cd cloudflare-service
npm run deploy
```

### 3. 登录后马上过期

确认 KV 命名空间已经创建，并且 `wrangler.toml` 中的 `id`、`preview_id` 已替换为真实值。

### 4. D1 没有表或默认账号不存在

重新执行远程迁移：

```powershell
cd cloudflare-service
npm run db:migrate:remote
```

### 5. 系统监控没有真实 CPU、内存、磁盘数据

Cloudflare Worker 运行在边缘网络中，不能读取你本机或服务器的系统资源，所以 Cloudflare 版系统监控接口只返回空值结构，避免前端报错。

## 截图预览

**多种图标样式**

![图标样式](./doc/images/icon-small-new.png)
![透明背景信息](./doc/images/transparent-info.png)
![透明背景小图标](./doc/images/transparent-small.png)
![纯色背景信息](./doc/images/solid-color-info.png)
![完整颜色小图标](./doc/images/full-color-small.jpg)

## 关于原作者

原项目作者：**[红烧猎人](https://blog.enianteam.com/u/sun/content/11)**

原项目仓库：[hslr-s/sun-panel](https://github.com/hslr-s/sun-panel)
