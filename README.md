# Sun-Panel Cloudflare

English | [中文](./README.zh-CN.md)

> A Cloudflare-native adaptation of [Sun-Panel v1.3.0](https://github.com/hslr-s/sun-panel). The frontend remains Vue 3, while the backend has been replaced with a Cloudflare Workers service using D1, KV, and R2.

<div align="center">
  <img src="./doc/images/logo.png" width="100" height="100" />

  <h1>Sun-Panel</h1>

  <p>A clean personal navigation panel for servers, NAS, home labs, and browser start pages.</p>
</div>

![Main screen](./doc/images/main-dark.png)

## Overview

This repository keeps the Sun-Panel frontend experience and replaces the original backend with `cloudflare-service`, a lightweight Cloudflare Workers backend.

- Frontend: Vue 3 + Vite + Naive UI.
- Backend: Hono + TypeScript running on Cloudflare Workers.
- Database: Cloudflare D1.
- Cache: Cloudflare Workers KV.
- File storage: Cloudflare R2 for uploaded icons and wallpapers.
- Uploaded images are stored in R2, then exposed through a public R2 URL generated from `R2_PUBLIC_BASE_URL` and the R2 object key. The final public URL is saved to D1, so image loading does not need to go through the Worker proxy.

The old Go backend is not maintained in this Cloudflare edition. This project uses `cloudflare-service/` as the backend.

## Why Cloudflare

The main goal of this fork is to make Sun-Panel cheap and easy to run without maintaining a server.

- Free-friendly: Workers, Pages, D1, KV, and R2 all provide useful free quotas. A personal or small-team dashboard can usually run within those limits.
- No server maintenance: no VPS, reverse proxy, database process, object storage server, or system service management.
- One platform: frontend hosting, API, database, cache, and uploaded files all live on Cloudflare.
- Global delivery: Cloudflare's edge network is a good fit for static assets, API requests, and public image delivery.
- Persistent data: D1 stores application data, KV stores short-lived cache and session data, and R2 stores uploaded images.
- Lower Worker traffic: uploaded images are returned as direct R2 public URLs instead of being proxied through the Worker.

## Features

- Clean navigation dashboard UI.
- Multi-user isolation.
- Icon groups, sorting, import, and export.
- Upload local images for icons and wallpapers.
- Custom panel style, background, search engine, and layout configuration.
- Public visit mode.
- Compatible with the original frontend `token` request header authentication flow.

## Project Structure

```text
.
├── src/                  Vue frontend source
├── public/               Frontend static assets
├── cloudflare-service/   Cloudflare Workers backend
├── doc/                  Documentation images
├── package.json          Frontend npm scripts
└── vite.config.ts        Vite development and proxy config
```

## Local Development

Install frontend dependencies from the repository root:

```powershell
npm install
```

Install Worker backend dependencies:

```powershell
cd cloudflare-service
npm install
cd ..
```

Create local frontend environment files:

```powershell
Copy-Item .env.development.example .env.development
Copy-Item .env.production.example .env.production
```

Recommended local frontend API settings:

```env
VITE_GLOB_API_URL=/api
VITE_APP_API_BASE_URL=http://127.0.0.1:8787/
```

Copy the Worker config example:

```powershell
Copy-Item cloudflare-service/wrangler.example.toml cloudflare-service/wrangler.toml
```

Apply the local D1 migrations:

```powershell
cd cloudflare-service
npm run db:migrate:local
cd ..
```

Start the Worker backend:

```powershell
npm run dev:service
```

The backend defaults to:

```text
http://127.0.0.1:8787
```

Start the Vue frontend in another terminal:

```powershell
npm run dev
```

The frontend defaults to:

```text
http://127.0.0.1:1002
```

## Cloudflare Deployment

### 1. Login

```powershell
cd cloudflare-service
npx wrangler login
```

### 2. Create D1

```powershell
npx wrangler d1 create sun-panel
```

Copy the generated `database_id` into `cloudflare-service/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "sun-panel"
database_id = "your-d1-database-id"
migrations_dir = "migrations"
```

### 3. Create KV

```powershell
npx wrangler kv namespace create CACHE
npx wrangler kv namespace create CACHE_PREVIEW
```

Fill the generated IDs into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-id"
preview_id = "your-preview-kv-id"
```

### 4. Create R2

```powershell
npx wrangler r2 bucket create sun-panel-uploads
npx wrangler r2 bucket create sun-panel-uploads-preview
```

Configure the R2 binding:

```toml
[[r2_buckets]]
binding = "UPLOADS"
bucket_name = "sun-panel-uploads"
preview_bucket_name = "sun-panel-uploads-preview"
```

Enable an R2 Public Development URL or bind a custom domain, then configure the public base URL in `wrangler.toml`:

```toml
[vars]
R2_PUBLIC_BASE_URL = "https://your-r2-public-domain.example.com"
```

### 5. Migrate Remote D1 And Deploy Worker

Run the remote migration from the repository root:

```powershell
npm --prefix cloudflare-service run db:migrate:remote
```

Deploy the Worker backend from the repository root:

```powershell
npm run back
```

The `back` script delegates to the deploy script inside `cloudflare-service/`, so you do not need to change directories.

After deployment, Wrangler will print your Worker URL, for example:

```text
https://sun-panel-cloudflare-service.<your-account>.workers.dev
```

### 6. Configure Frontend Production API

Update `.env.production` in the repository root:

```env
VITE_GLOB_API_URL=https://your-worker-url.workers.dev/api
VITE_APP_API_BASE_URL=
```

To build and deploy the frontend to Cloudflare Pages from the repository root:

```powershell
npm run front
```

The `front` script runs `npm run build` first, then deploys `dist/` with:

```powershell
npx wrangler pages deploy dist --project-name sun-panel-cloudflare
```

## Default Account

The D1 migration creates a default administrator account:

```text
Account: admin@sun.cc
Password: 12345678
```

Change the password immediately after your first login.

## Common Issues

### Frontend Network Error

Check that the production build uses the correct Worker API URL:

```env
VITE_GLOB_API_URL=https://your-worker-url.workers.dev/api
```

For local development, keep:

```env
VITE_GLOB_API_URL=/api
VITE_APP_API_BASE_URL=http://127.0.0.1:8787/
```

### Image Upload Fails

Check that the R2 bucket binding exists and that `R2_PUBLIC_BASE_URL` is configured:

```toml
[[r2_buckets]]
binding = "UPLOADS"
bucket_name = "sun-panel-uploads"
preview_bucket_name = "sun-panel-uploads-preview"

[vars]
R2_PUBLIC_BASE_URL = "https://your-r2-public-domain.example.com"
```

Redeploy the Worker after changing `wrangler.toml`:

```powershell
npm run back
```

### System Monitor Data Is Empty

Cloudflare Workers cannot read CPU, memory, disk, or network stats from your own server. The Cloudflare edition returns stable empty monitor structures so the frontend does not fail.

## Original Project

Original author: [红烧猎人](https://github.com/hslr-s)

Original repository: [hslr-s/sun-panel](https://github.com/hslr-s/sun-panel)
