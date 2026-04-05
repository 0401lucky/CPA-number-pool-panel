# 实时号池统计面板

这是一个部署在 `Zeabur` 的单服务 `Next.js` 看板，用来聚合：

- `CLIProxyAPI` 两个号池的账号状态与 usage 汇总
- `sub2api` 的请求量类指标

## 本地运行

```bash
npm install
copy .env.example .env
npm run dev
```

打开 `http://localhost:3000`。

## 环境变量

- `POOL_CLI_BASE_URL` / `POOL_CLI_MANAGEMENT_KEY`
- `POOL_CPA_BASE_URL` / `POOL_CPA_MANAGEMENT_KEY`
- `SUB2API_BASE_URL` / `SUB2API_ADMIN_API_KEY`
- `DASHBOARD_FRAME_ANCESTORS`
- `DASHBOARD_TIMEZONE`
- `DASHBOARD_REFRESH_SECONDS`
- `UPSTREAM_TIMEOUT_MS`

如果需要把看板嵌入到别的后台页面里，可以配置
`DASHBOARD_FRAME_ANCESTORS`，填允许嵌入的来源域名，多个值可用空格或逗号分隔。
项目也会自动把 `SUB2API_BASE_URL` 的源加入 `frame-ancestors` 白名单。

`management key` 就是 `CLIProxyAPI` 管理页使用的密码，后端会通过
`Authorization: Bearer <key>` 去访问 `/v0/management/*`。

## 页面指标口径

- 号池总账号：`/v0/management/auth-files` 返回的文件数
- 可用账号：未禁用，且不处于 `error / pending / refreshing / unavailable / cooldown`
- 异常 / 冷却：`unavailable=true` 或状态异常，或 `next_retry_after` 仍未到期
- 已禁用：`disabled=true` 或 `status=disabled`
- 号池请求量：来自 `/v0/management/usage`
- `sub2api` 请求指标：来自 `/api/v1/admin/usage`

## Zeabur 部署

1. 把当前目录推到 GitHub。
2. 在 `Zeabur` 新建一个 Git 服务，选择这个仓库。
3. 在服务变量里填入 `.env.example` 中的所有真实值。
4. 生成一个公开域名，或绑定你自己的域名。
5. 部署完成后直接访问首页即可。

`Zeabur` 会自动识别这是 `Next.js` 项目。当前项目没有把任何上游密钥下发到浏览器，密钥只保存在服务端环境变量中。

## 校验命令

```bash
npm run test
npm run build
```
