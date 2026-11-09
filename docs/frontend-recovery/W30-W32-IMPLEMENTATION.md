# W30 / W32 订单只读管理与 CSV 导出实现

日期：2026-11-10；仓库：yakun0622/epusdt；分支：master。

## 依据和功能边界

- Go 路由：`GET /admin/api/v1/orders`、`GET /admin/api/v1/orders/{trade_id}`、`GET /admin/api/v1/orders/export`。
- Go 过滤器：network（小写）、token（大写）、address、keyword、status=1–4、start_at/end_at（Unix **秒**）；page/page_size 是列表参数，当前 Go 数据列表每页最多 200。
- 原压缩 UI `orders-BnOHTHOA.js` 使用 pageSize 浏览器路由与 CSV Blob 下载；新 UI 以便于维护的组件恢复功能，而非宣称视觉像素级一致。
- **没有任何 POST/PATCH/DELETE 订单业务 API**；W31 关闭、人工补单、回调重发没有被实现。

## Web 前端

- 新增 `web/src/api/endpoints/orders.ts`：强类型查询与分页验证，过滤参数大小写规范化、URL 与 Go 之间 pageSize/page_size 转换，时间戳 Unix 秒检查、详情 API、CSV Blob 导出。
- 新增 `web/src/features/orders/orders-page.tsx`：列表查询、筛选、状态标签、日期时间范围、分页、每页 10/20/50/100/200 条、订单详情弹窗、刷新、CSV 下载和失败重试。
- 详情严格使用只读 `GET /orders/{trade_id}`；详情可查看金额、币种、网络、状态、收款地址、交易哈希、回调字段、父子单关联标识等。无支付确认/回调动作。
- CSV 使用原生浏览器对象 URL + download 属性；下载请求保留当前搜索筛选，但不包含列表分页，以减少遗漏。
- API Client 增强：非 `text/csv` 成功响应视为错误，防止代理/SPA fallback 的 HTML 被保存成 .csv。
- 六语言订单专用核心词条（zh-CN/zh-TW/en-US/ja-JP/ko-KR/ru-RU）；新页面保持旧版主题变量和移动端表格横向滚动。

## CSV 导出 200 行缺陷修复

原 Go `ExportOrders` 设置 `f.PageSize=10000` 却调用 `data.ListOrders(f)`；后者实际 `if size > 200 { size = 200 }`，导致 CSV 最多只包含 200 条订单。

本轮新增 `data.ListOrdersForExport(f)`，复用相同筛选但采用独立 `LIMIT 10000`；`ExportOrders` 调用它，旧分页列表的 200 限制保持不变。增加 Go 测试插入 205 条订单，检查普通列表只返回 200 条、CSV 查询返回全部 205 条并保持倒序与状态过滤。

## Actions 验证

- 前端已通过 [Actions #42663028503](https://github.com/yakun0622/epusdt/actions/runs/42663028503)：11 文件、35 测试通过，TypeScript 和 Vite 构建通过。
- Go 已通过 [Actions #42663566969](https://github.com/yakun0622/epusdt/actions/runs/42663566969)：`TestListOrdersForExportDoesNotStopAtUIPageLimit` 通过。
- 上述验证基于此前提交。此文档随最终整理提交后的最新 Actions 结果需再次核对并记录；不要把单测结果当成浏览器与真实商户环境已验收。

## 后续验收建议

1. 在隔离后端测试数据上验证筛选、分页、时间单位和明细字段；执行 T20/T22 的浏览器级别测试并留存脱敏证据。
2. 走通 201/205/10000/10001 条数据的导出边界，确认上限准确、结果不被截断、不会一次性加载到浏览器内存过大。
3. CSV 表格软件打开后的编码和单元格公式注入防护需单独安全检查。
4. W31 危险操作继续隔离；下一轮推荐 W33/W34 钱包列表、编辑、批量导入和部分失败反馈。

未修改原 Go embed 静态目录 `src/www`，未发布新前端，也未修改已有支付状态逻辑。
