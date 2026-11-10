# W33/W34 钱包管理源码恢复交付记录

日期：2026-11-10；仓库 `yakun0622/epusdt`，`master`。本轮直接修改并提交 master，自动 Push Actions；没有创建分支/PR，没有部署 `web/dist`。

## Go 服务端事实（已核对源码）

- `GET /admin/api/v1/wallets`：直接返回 `WalletListItem[]`，不是分页对象；支持 `network`、`status`（1 启用、2 禁用）、`keyword`（地址或备注），行包含 `order_count`。
- `POST /admin/api/v1/wallets`：`{network,address,remark}`，新钱包默认 enabled，来源 manual。钱包是收款/观察地址，不涉及私钥导入。
- `PATCH /admin/api/v1/wallets/{id}`：只提交 `{remark}`，允许空串清空备注；不能与完整 Wallet 模型混用。
- `POST /admin/api/v1/wallets/{id}/status`：`{status:1|2}`；`DELETE /admin/api/v1/wallets/{id}`：Gorm 软删除。
- `POST /admin/api/v1/wallets/batch-import`：请求 `{network,addresses:string[]}`；HTTP 200 的 `ApiEnvelope.data` 为数组，每条为 `{address,ok,error_code?,error?}`，10001 是地址已存在。服务端逐条处理，失败不导致整批回滚。
- `src/model/data/wallet_address_data.go`：EVM 地址大小写规范化、TON/Aptos 规范化、对软删除同地址重新添加时恢复旧记录。`DeleteWalletAddressById` **不检查在途订单/锁**，正式生产使用删除功能须评估风险。

## Web 实现

- 新增 `web/src/api/endpoints/wallets.ts`：列表 URL 解析与服务端筛选、数据结构验证、创建/备注/状态/删除/批量接口和批次结果对齐。对地址保留重复行与原始顺序；响应缺项、地址对不上、额外项不允许被误算为全部成功。
- 新增 `web/src/features/wallets/wallets-page.tsx`：在 `/addresses` 渲染真实表格，包含网络、地址、备注、来源、状态、关联订单数、操作按钮，以及筛选、重置、刷新和加载/异常/空态。
- 新增和备注编辑使用对话框表单；状态启停需确认；软删除需准确键入钱包地址确认，显示历史订单关联数量、在途订单风险；所有写入以服务端成功为准并重新拉取列表，不进行虚假乐观更新。
- 批量导入弹窗：按行 trim、忽略空行、保留重复、指定网络发送；`ok=false` 的每条地址展示 error_code + 错误理由；混合成功显示成功数/失败数，保留弹窗并支持只重试失败行。
- 延续六语言文案和 Light/Dark/System 基础样式，不展示/要求助记词、私钥或其他敏感凭据。

## 编译及单测

- [Actions #42767931148](https://github.com/yakun0622/epusdt/actions/runs/42767931148)：`npm ci`、TS typecheck、Vitest **14 文件/43 测试**、Vite Build 全部通过。
- 新增测试覆盖：数组列表（不能误读订单分页包装）、网络/状态筛选、四种写操作的 HTTP 方法与 JSON body、HTTP 200 + 混合逐行结果、重复输入、服务端结果缺失/错位/额外数据，以及 6 种语言词条完整性。
- Actions 只验证 TypeScript/单测/编译，不代表后端已登录联调或原版 UI 像素级验证。早期中间提交中曾出现 TypeScript unused import 与 Mock Response 复用问题，已修复且最终上述运行通过。

## 尚未完成的验收和风险

1. 用隔离 Go 后端与测试账户完成 T21/T22：真实批量 200 部分失败、重复 EVM/TON/Aptos 地址规范化、筛选与备注清空测试；再做 360/768/1280px 浏览器交互检查。
2. 删除前端虽然有双重确认，但 Go 尚不检查待支付中的订单/交易锁。上线前应评估是否需要阻止删除/禁用在途钱包，避免影响收款；本次不暗改 Go 删除语义。
3. 新版仅对既有 Go 账户绑定的公网收款地址进行管理；不处理钱包私钥、助记词，不能据此声称支持签名或提现。
4. 完整原版分页、可视化视觉对照和真实联网 API 样本仍待确认；原生产 `src/www` 保持不变。

## 下一步

**W35 API Key 管理**：以已有 Go 控制器为准实现列表、新建、编辑、启停、统计、按需查看 secret、轮换和删除；凭证仅在显式操作时短暂显示，不写控制台日志/长期存储。W31 资金相关订单操作继续暂缓。
