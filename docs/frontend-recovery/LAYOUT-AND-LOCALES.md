# 布局组件、设计系统与国际化恢复规格

证据：`index-DMvm0YrM.js`、`route-TItYb9Ps.js`、`route-D2PyayuP.js`、`sidebar-nav-Cwns29Yf.js`、`main-DpDyQAvX.js`、`theme-provider-BOCf9qy2.js`、`messages-Cl9iE86Z.js`、`src/www/index.html`。

## 全局 Provider 和页面骨架

`index-DMvm0YrM.js` 首屏用 React StrictMode、React Query/客户端组件、ThemeProvider、FontProvider、TooltipProvider、RouterProvider 等逐层装配。不能仅复制当前 `web/src/main.tsx` 的临时布局。

- 管理后台：`route-TItYb9Ps.js` 提供侧栏、主内容区域、移动布局和底部用户菜单。存在团队/品牌、导航组、折叠组件、外链更新提示。
- 公共管理页头：`main-DpDyQAvX.js` 的响应式主菜单在 `lg` 断点切换，页头含搜索、主题/语言/个人操作，内容区最大宽度 `max-w-7xl`（非固定全屏表格）。
- 设置子导航：`sidebar-nav-Cwns29Yf.js` 在小屏下用 Select，在中屏以上用侧边列表；激活项严格匹配路径。
- 认证布局：`route-D2PyayuP.js` 为 GMPay 标识、主题与语言切换、双栏/动画区域；其中较大的 JS 体积与动画库相关，并不等于业务逻辑特别多。
- `src/www/index.html` 的根挂载节点为 `#app`；主页面首屏有 splash；恢复源码可以选择新的挂载节点，但与静态部署、视觉回归要一致。
- `src/www/assets` 还包含 Monaco Editor worker、CSS、Inter/Manrope/Noto Sans/Nunito 字体；后续做许可证确认及按需引入，禁止无理由把大体积 editor 包直接同步进新工程。

## 主题

- `theme-provider-BOCf9qy2.js`：Cookie 名 `theme`，允许 `system` / `light` / `dark`；系统模式监听 `prefers-color-scheme: dark`，更新 `document.documentElement.dataset.mode` 和 `colorScheme`。
- Theme Cookie 的过期时间是 365 天（并非通用 cookie 工具的默认 7 天）。
- 颜色等其他外观偏好可能由页面模块或 CSS Variables 实现，须进一步分析 `appearance`、`display` 才能给出完整主题数据模型。

## 国际化

- `messages-Cl9iE86Z.js` 是 Paraglide 风格的编译消息包。可确定支持的语言码：
  - `en-US`（默认）
  - `ja-JP`
  - `ko-KR`
  - `ru-RU`
  - `zh-TW`
  - `zh-CN`
- 语言选择优先级：Cookie `PARAGLIDE_LOCALE` → 浏览器 `navigator.languages` → 默认 `en-US`；编译产物的策略顺序为 `cookie`、`preferredLanguage`、`baseLocale`。
- 修改语言写 Cookie（约 40 天），默认情况下如果语言改变会刷新页面。不能只修改 JS 内存而导致刷新后语言重置。
- 单个消息多语言值打包进 JS 的分支函数内；缺少原消息 key 的完整映射，需要 AST 分析/生成资源及 UI 对照，不应该凭空翻译再宣称还原完成。

## 前端国际化和主题实现要求

1. 单一语种词条库存，基于恢复的 key 建立对应关系；缺失值标记待翻译，不静默回退为错误语言。
2. 登录、管理后台、收银台必须一致切换语言；对错误码、Zod 表单提示也要覆盖。
3. 主题在刷新、系统明暗变化、移动浏览器上必须保持一致；PWA 缓存刷新另测。
4. UI 响应式至少覆盖移动、平板、桌面三类；菜单折叠、设置下拉和收银台尺寸要用原 UI 截图对比。

## 进一步取证 TODO

- `src/www/assets/index-FzNGhQ2G.css` 的 token / spacing / breakpoints；`appearance`、`display` 的主题变量。
- `search-provider` 等复合组件的菜单导航数据源。
- 消息 key 的可靠提取和翻译覆盖统计。
- PWA `sw.js` 的预缓存资源及旧资源清理策略。
