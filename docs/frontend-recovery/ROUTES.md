# 原编译前端路由与页面模块

证据：`src/www/assets/router-aZWjwYfd.js` 中静态路由注册 `E(`...`)`、`path`、懒加载 `import()`；各页面模块独立检查。括号路由分组 `(auth)`、`(errors)` 和 `_authenticated` 是路由内部 ID，不一定出现在浏览器 URL 中。

| 实际 URL / 路由 | 模块 | 保护 | 确认情况 |
|---|---|---|---|
| `/` | 根重定向 | 公共 | 根据 accessToken 导向 /dashboard 或 /sign-in（JS 确认） |
| `/sign-in` | `sign-in-DJ_9-JGk.js` | 公共 | 登录，支持 redirect 查询参数 |
| `/install` | `install-WZR1-zKU.js` | 公共 | 安装页（JS 注册确认，细节待复核） |
| `/cashier/$trade_id` | `_trade_id-ygb9_KBy.js` → `_trade_id-B2s-YYlo.js` | 公共 | 收银台，动态交易号 |
| `/dashboard` | `dashboard-Cw_CStip.js` | JWT 路由守卫 | 仪表盘 |
| `/orders` | `orders-BnOHTHOA.js` | JWT | 订单列表 |
| `/addresses` | `addresses-JEZCoidP.js` | JWT | 钱包/地址列表 |
| `/chains` | `chains-tUDg5ohy.js` | JWT | 网络及代币配置 |
| `/rpc` | `rpc-BkV2cf1-.js` | JWT | RPC 节点管理 |
| `/keys` | `keys-DoklatfJ.js` | JWT | API Key 管理 |
| `/payment-setup` | `payment-setup-Cf85SBU2.js` | JWT | 通过公共 config 读取支付方式 |
| `/payment-setup/integrations` | `integrations-DDlt0riN.js` | JWT | **静态接口说明表**，非真实接口 CRUD |
| `/settings` | `settings-CHL6qaLI.js` | JWT | 设置首页，含外观/颜色相关实现；需区分 UI 个性化与服务端设置 |
| `/settings/system` | `system-CkRcAjXh.js` | JWT | 日志级别配置 |
| `/settings/telegram` | `telegram-Cecf2wsy.js` | JWT | Telegram 参数配置 |
| `/settings/pay` | `pay-fSH4oF9b.js` | JWT | 汇率/计费精度设置；不是收银台 |
| `/settings/epay` | `epay-B1eGq7C0.js` | JWT | EPay 参数 |
| `/settings/okpay` | `okpay-DzwNhqlx.js` | JWT | OKPay 参数 |
| `/settings/notifications` | `notifications-CuHKJSeV.js` | JWT | **表单仅显示提交数据，无服务端持久化证据** |
| `/settings/display` | `display-C3ZkrCHd.js` | JWT | 显示设置，待细查 |
| `/settings/appearance` | `appearance-Byhds5-7.js` | JWT | 外观主题，待细查 |
| `/account` | 重定向 | JWT | 导向 /account/password |
| `/account/password` | `password-DKY5aHg5.js` | JWT | 修改密码 |
| `/help` | `help-DIz70wvS.js` | JWT | 帮助页，待细查 |
| `/401` `/403` `/404` `/500` `/503` | 对应数字模块 | 公共错误页 | 均在路由注册中 |

共同布局：`route-TItYb9Ps.js`（已登录后台）；`route-BkjShyH8.js`（设置侧边栏）；`route-DXrwc_pp.js`（支付配置布局）；`route-DQZC3sEH.js`（账户布局）；`route-CDUzvxx5.js`（收银台布局）；`route-D2PyayuP.js`（登录相关布局）。路径对应关系来自 router 懒加载调用。

## 路由行为（JS 确认）

- `/_authenticated` 的 `beforeLoad` 检查 `accessToken`；未认证重定向 `/sign-in?redirect=<original href>`（搜索参数结构由 Zod 校验）。
- 根 `/` 根据 token 状态重定向。
- `/orders` 查询参数包括 `page`、`pageSize`；`/rpc`、`/addresses`、`/payment-setup` 等使用各自 Zod 规则进行 URL 查询校验。
- 不应将 `/settings/pay` 错误映射成 `/cashier/:trade_id`，两者是不同入口。

## 待验证

1. 子路由刷新后的 Echo SPA fallback：`src/util/http/spa.go` 排除 `/admin/api`、`/pay`、`/payments` 等后端路径。
2. 404 及权限边界、桌面/移动侧栏实际视觉差异。
3. 需扫描 `display`、`appearance`、`help`、`install` 等具体页面内部状态与存储行为。
