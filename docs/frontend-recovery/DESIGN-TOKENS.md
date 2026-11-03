# GMPay 原版 CSS 设计规范（静态逆向）
> 基线：`src/www/assets/index-FzNGhQ2G.css`、`src/www/index.html`、`theme-provider-BOCf9qy2.js`，2026-11-03。CSS 是生产压缩产物，参数以源文件字面值为准。**尚未进行浏览器截图像素对比**。

## 构建技术证据
- CSS 文件头明确声明 `tailwindcss v4.2.2`（MIT）。后续恢复可选同一主版本，以降低 token 命名和层叠差异。
- `index-FzNGhQ2G.css` 约 153 KB，包含大量 Tailwind 自动生成工具类、`--tw-*` 内部变量以及主题变量。不能把所有 `--tw-*` 当作项目设计 token。
- CSS 亮色定义于 `:root`，暗色定义于 `[data-mode=dark]`；`src/www/index.html` 在首屏脚本读取 Cookie `theme`，将 `html.dataset.mode` 设为解析后的 `light` / `dark`，防止首屏闪烁。
- 主题 provider 有 `system` 选项，系统模式监听 `prefers-color-scheme` 并写 `data-mode`。

## 语义色彩（直接抄录原 CSS）
| 变量 | Light | Dark |
|---|---|---|
| `--background` | `oklch(100% 0 0)` | `oklch(14.5% 0 0)` |
| `--foreground` | `oklch(14.5% 0 0)` | `oklch(98.5% 0 0)` |
| `--card` | `oklch(100% 0 0)` | `oklch(20.5% 0 0)` |
| `--primary` | `oklch(20.5% 0 0)` | `oklch(92.2% 0 0)` |
| `--primary-foreground` | `oklch(98.5% 0 0)` | `oklch(20.5% 0 0)` |
| `--secondary` | `oklch(97% 0 0)` | `oklch(26.9% 0 0)` |
| `--muted` | `oklch(97% 0 0)` | `oklch(26.9% 0 0)` |
| `--muted-foreground` | `oklch(55.6% 0 0)` | `oklch(70.8% 0 0)` |
| `--border` | `oklch(92.2% 0 0)` | `oklch(100% 0 0/.1)` |
| `--ring` | `oklch(70.8% 0 0)` | `oklch(55.6% 0 0)` |
| `--destructive` | `oklch(57.7% .245 27.325)` | `oklch(70.4% .191 22.216)` |
| `--sidebar` | `oklch(98.5% 0 0)` | `oklch(20.5% 0 0)` |
| `--sidebar-primary` | `oklch(20.5% 0 0)` | `oklch(48.8% .243 264.376)` |
| `--sidebar-border` | `oklch(92.2% 0 0)` | `oklch(100% 0 0/.1)` |

还具有 `--popover`、`--accent`、`--input`、`--sidebar-ring`、`--chart-1` ~ `--chart-10` 等变量；正式构建应从 CSS 完整拷贝语义 token 并保持主题映射，不要只使用此表的摘要。

## 尺寸、断点、字体
- 基础半径 `--radius:.625rem`，约为 10px（按浏览器根字体 16px）。各组件圆角由 Tailwind 派生类决定。
- 编译 CSS 出现断点 `40rem` (640px)、`48rem` (768px)、`64rem` (1024px)、`80rem` (1280px)、`96rem` (1536px)。具体组件在哪些断点切换须根据对应 JSX 核查。
- CSS 默认 `--font-sans:var(--font-inter)`，`--font-inter:"Inter Variable",sans-serif`；打包资源另有 `Manrope Variable`、Noto Sans、Nunito 字体切片。实际字体通过 `font-provider` 和外观设置控制，不能臆断全站总是 Inter。
- `@font-face` 使用 `font-display:swap` 和按 Unicode 字形范围的 WOFF2 切片；中文/日韩字符可能使用后备字体。
- CSS 暴露 sidebar、dialog、popover、input、card、table、skeleton 等通用组件样式，反推 UI 组件时优先统一处理基础组件。

## 首屏/响应式
- `src/www/index.html` 在 React 入口前执行主题初始化，并包含 `#splash` 覆盖层及进度条动画。还设置移动端 viewport、icon 与社交分享 metadata。
- `route-TItYb9Ps.js` 的后台 Sidebar 可折叠；`main-DpDyQAvX.js` 主内容在宽屏有 `max-w-7xl` 约束；设置子导航在小屏下改 Select。
- 不要因为当前 `web/src/style.css` 是临时简化版，就以它作为设计样式基准。

## 恢复工作验收
1. 创建主题变量源文件，并实现 `data-mode` 切换与首屏同步；深/浅两种主题组件快照对照。
2. 验证 360/768/1280/1536px 页面下布局，不以“响应式可用”代替视觉核对。
3. 对照实际渲染检查字体回退、对话框、表格列宽、长字符串溢出、收银台二维码/地址排版。
4. 划清打包资源版权和二进制字体许可，避免盲目复制全部 Monaco/字体产物。
