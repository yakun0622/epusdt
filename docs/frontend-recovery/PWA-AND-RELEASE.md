# PWA、静态资源部署及升级风险
> 来源：`src/www/index.html`、`registerSW.js`、`sw.js`、`manifest.webmanifest`、`src/main.go`、`src/util/http/spa.go`、`Dockerfile`。

## 当前产物事实
- manifest name/short_name 为 `GMPay`，`start_url=/`，`display=standalone`，作用域 `/`；包含 192/512 和 maskable PNG 图标。
- `index.html` 引用 `registerSW.js`，它在 window load 后用 `navigator.serviceWorker.register('/sw.js',{scope:'/'})` 注册。
- `sw.js` 使用 Workbox 的 `skipWaiting()`、`clientsClaim()`、`precacheAndRoute(...)`、`cleanupOutdatedCaches()`。
- 从 `sw.js` 解析到 **210 个预缓存 URL 条目**，其中 **191 个以 assets/ 开头**。SW 清单未含 `index.html` 条目，且在当前 `sw.js` 未找到单独的 NetworkFirst/CacheFirst/自定义导航 fallback/动态 API 缓存路由注册；不能因此推断所有网络情况下均不会缓存。
- `src/www/assets` 目录是 **205 个文件**，SW 的 191 个 assets URL 与目录全量不相同（部分辅助模块、Worker/字体或其他资源存在差异）；不要把两个计数混为一谈。
- Go 在 `src/main.go` 中 `go:embed all:www`，启动将资源解压到运行目录；`src/util/http/spa.go` 有排除 `/api`、`/admin/api`、`/payments`、`/pay` 的 SPA fallback 判断。

## 上线切换要点
1. 在恢复完成前始终维持旧 `src/www` 构建；`web/dist` 不能直接作为生产默认前端。
2. 新 `index.html` 的 bundle 路径、缓存头、资源 hash、SW 是否继续注册要统一验证。
3. 旧 SW 使用根 scope `/`；如果新构建不继续使用 SW，需要设计**明确的注销与 CacheStorage 清理迁移**，不能仅删除 `sw.js` 文件后假定旧用户自动恢复。
4. 如果继续用 Workbox，保留版本更新期间的 `skipWaiting/clientsClaim` 影响评估，确保缓存 key 与静态资源 hash 重新生成。
5. 返回 HTTP 401、400、500 的后台 API 不得被 SPA fallback 或离线缓存替换为 HTML；支付状态轮询必须实时访问后端。
6. 通过 Docker 多阶段构建 `web → dist → src/www → go embed` 前，需在测试环境验证当前 Go 解压覆盖、历史残留文件处理以及单进程部署方式。
7. 生产验证需检查浏览器安装型 PWA、新旧标签页共存、收银台支付状态不会因旧客户端代码与新后端不匹配。

## 回归矩阵
| 测试情形 | 预期 |
|---|---|
| 全新 Chrome/Firefox/Safari 浏览器访问 | 加载新 index、assets、主题和路由 |
| 已注册旧 SW 的用户升级 | 不被旧预缓存资源卡住；必要时主动迁移/清缓存 |
| 已打开旧页面同时部署 | 旧 bundle 不因文件清理造成 404，或有明确强刷指引 |
| 直接刷新 /orders、/cashier/:trade_id | SPA 路由正确，后台 API/支付 API 不回退 HTML |
| 断网/弱网/恢复后 | 不能误报支付成功，API 错误和状态轮询明确显示 |
| 密码、API Key、支付地址 | 不随预缓存持久化敏感数据，不在公开 PWA 中泄露 |
| Docker/Go 编译包 | 可重现，构建产物和嵌入静态资源一致 |

## 仍待检查
- 当前 HTTP Cache-Control/CDN/Nginx 行为（静态代码不能确认生产配置）。
- 生成 Service Worker 的 Vite PWA 插件配置及旧源版本（目前只有生成物）。
- 在用户浏览器中实际安装、更新和注销 SW 的测试结果。
