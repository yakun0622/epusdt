# 页面与组件结构矩阵（JS 编译产物）
> 只按 `src/www/assets/*.js` 的确证导入关系、组件字段和 JSX 属性整理。未运行页面，不保证全部组件树与屏幕布局已复原。完整路由以 [ROUTES.md](./ROUTES.md) 为准。

## 共享组件
| 组件 / chunk | 证据 | 复用范围 / 要求 |
|---|---|---|
| `route-TItYb9Ps.js` | 后台侧栏、用户菜单、主内容布局 | AuthenticatedLayout：侧栏折叠、导航组、用户操作、内容 Outlet |
| `main-DpDyQAvX.js` | Header / Main，主题语言按钮，最大容器宽度 | 统一页面顶部与容器 |
| `route-BkjShyH8.js`、`sidebar-nav-Cwns29Yf.js` | 设置分组导航；小屏 Select、大屏侧栏 | SettingsLayout 与导航 |
| `route-D2PyayuP.js` | 登录页面视觉动画、GMPay Logo、主题切换 | AuthLayout，可延后动画但不能遗漏品牌/响应式 |
| `data-table-B4zl2fnV.js` | 通用 DataTable、查询筛选/列设置/骨架/空状态 | 订单、钱包、RPC、链等 |
| `confirm-dialog-DQcteNah.js` | 确认危险操作 | 关闭订单、删除资源、轮换密钥 |
| `form-CQLgQ8B6.js` / `zod-Dad3wW4a.js` | Hook Form + Zod | 输入校验与错误反馈 |
| `page-header-IBw7XS2q.js` | 页面标题/描述 | 模块统一排版 |
| `theme-provider-BOCf9qy2.js`、`font-provider-Bx1j1BoA.js` | 主题/字体持久化 | 个性化设置 |
| `messages-Cl9iE86Z.js` | 六语编译词条 | I18n provider/错误码文本 |
| `checkout-model-CU56hvYm.js` | 收银台映射、错误码、计时常量 | 支付专用状态及数据转换 |

## 页面级组件和动作
| 页面 | 源 Chunk | 观察到的组件或操作 | 下一步必验 |
|---|---|---|---|
| `/dashboard` | dashboard | 卡片、趋势图、Tabs、最近订单、RPC 状态信息 | 图表指标公式、时间范围、空状态及 RPC 数据一致性 |
| `/orders` | orders | 数据表、分页、搜索/长文本、操作菜单、订单详情 Dialog、操作确认 | 完整列/列显隐、关闭/手工标记/重发条件 |
| `/addresses` | addresses | 表单 Dialog、网络 Select、启停、批量导入、数据表 | 地址去重反馈、批量逐项结果、网络过滤 |
| `/keys` | keys | 添加/编辑、密钥显示隐藏/复制、轮换、统计、列表、空状态 | 密钥只短时显示、不泄露日志 |
| `/chains` | chains | 网络列表与 Token 编辑、状态开关、搜索/Tab | 网络与 Token 依赖，字段校验 |
| `/rpc` | rpc | 节点表单、启停、健康检查、状态/延迟 | 错误与健康状态映射 |
| `/settings/system` | system | 日志级别下拉、保存与重置 | 设置项批量提交及失败反馈 |
| `/settings/telegram` | telegram | Bot Token/Chat ID/通知启停、保存与重置 | 凭证隐藏、类型转换、失败项反馈 |
| `/settings/pay` | pay | 汇率模式、精度、API URL、TTL、JSON 编辑器/预览 | Monaco 延迟加载、JSON 约束与 rate.status |
| `/settings/okpay` | okpay | 密钥输入、开关、可读禁用字段 | 保存字段与重置字段不同 |
| `/settings/appearance` | appearance | Font Select + Light/Dark 主题卡、提交展示 | **本地设置，不是后端持久化** |
| `/settings/display` | display | 复选框多个偏好项，要求至少勾选一项 | **只有 show-submitted-data 演示，不是真实用户偏好保存** |
| `/settings/notifications` | notifications | 邮件/手机通知演示表单 | **只有 show-submitted-data** |
| `/payment-setup/integrations` | integrations | GMPay/EPay/OKPay 接口静态表格 | **静态说明，不是已配置接口列表** |
| `/cashier/:trade_id` | _trade_id | 方法/链 Token 选择、地址复制、支付提示/计时、交易哈希/错误面板 | 以 [CHECKOUT-STATE-MACHINE.md](./CHECKOUT-STATE-MACHINE.md) 验收 |

## 订单表格确认列
从 `orders-BnOHTHOA.js` 的 `accessorKey` 静态提取：
`trade_id`、`order_id`、`name`、`amount`、`actual_amount`、`network`、`receive_address`、`created_at`、`updated_at`、`block_transaction_id`、`is_selected`、`callback_confirm`、`callback_num`、`notify_url`、`redirect_url`、`api_key_id`。

> 上述为检测到的 16 个字段，不代表全部默认可见，也不能据此断言显示顺序或每个字段均能过滤。应再解析 DataTable 列显隐/菜单条件。

## 组件工程建议（不是原版源码路径）
```text
web/src/
  app/                 # provider + router
  layouts/             # authenticated/auth/settings/cashier
  components/ui/       # 统一基础组件
  components/data-table/
  features/dashboard/
  features/orders/
  features/wallets/
  features/api-keys/
  features/chains/
  features/rpc/
  features/settings/
  features/checkout/
```

先还原公共 Table/Form/Dialog/SideBar，避免每个模块单独仿造相同视觉组件；涉及支付对话框的按钮操作必须补充禁用/防重复提交逻辑。

## 未完成证据
- 还需验证 Dashboard 图形库的具体图表系列、轴标签、时间粒度和响应式布局；体积较大的 dashboard chunk 混合了第三方可视化实现。
- CSS 主要 token 已在 [DESIGN-TOKENS.md](./DESIGN-TOKENS.md)；还需要截图核对边距/字体像素。
- 键盘操作/无障碍、移动端弹层、列表筛选状态持久化及 PWA 场景未做实机验证。
