# Web 前端编译验证工作流（Push + Manual）

> 工作流文件：`.github/workflows/web-build-manual.yml`，沿用原文件路径。2026-11-10 更新触发规则；这份说明替代旧的“仅手动运行”说明。

## 自动触发范围

- `master` 分支发生包含 `web/**` 的 push 时运行；单独变更 `web/package-lock.json` 不触发（避免锁文件更新无意义重复验证）。
- 修改 `.github/workflows/web-build-manual.yml` 时也触发。
- 仍支持 Actions 页面 `Run workflow` → 选择分支 → 运行。
- 其他分支的普通 push、文档和 Go 源码的独立修改、tag/release 均不触发本工作流。
- 现有的 `sync-www.yml`、`release.yml`、`docker-alpine.yml` 均未改动；它们仍有各自触发机制。

## 成功后自动更新 lock 文件

1. Checkout + Node.js 22（actions/checkout@v6、actions/setup-node@v6）。
2. 如缺少 `web/package-lock.json`，先通过 `npm install --package-lock-only --ignore-scripts` 生成。
3. 无论是否首次生成，都执行 `npm ci` 做严格依赖安装。
4. 执行 `npm run typecheck`、`npm run test`、`npm run build`，并验证 `web/dist/index.html` 存在。
5. **前述全部通过后**，且当前是 `master`，仅在 `web/package-lock.json` 发生变化时自动提交，并尝试快进推送到 `master`。
6. Push 失败（例如分支保护或有并发提交）会使提交步骤失败，不做 force push；需要查看日志并处理权限/冲突。其他分支的手动运行只测试不推送。

## 防循环和写入边界

- 锁文件机器人提交消息为 `chore(web): update npm dependency lockfile [skip ci]`。
- GitHub 默认 `GITHUB_TOKEN` 提交不会再次触发同仓库的 push 工作流；另外 paths 规则忽略仅更新锁文件的提交。
- Actions job 使用 `contents: write`，用于成功后的锁文件提交；不得上传秘钥、推送其他源码或同步 `src/www`。
- 同一 ref 顺序执行（`cancel-in-progress: false`）；若其他进程抢先推进 master，则 fast-forward-only push 失败而不覆盖他人提交。
- 仅构建 `web/dist`；不部署生产、无 Docker、无 Go 编译、无 CI 发布。

## 验收现状

- 已运行的前一版手动工作流 [Actions #1](https://github.com/yakun0622/epusdt/actions/runs/42653433274) 通过：TypeScript、3 文件/11 测试、Vite 编译；当时由于没有锁文件使用了 npm install。
- 本次更新仅提交工作流配置，**新版本的 push 自动执行及锁文件自动提交需要以新运行记录为准**，不能把之前的成功当作新流程验收。
- 如果仓库设置禁止 GitHub Actions 写入或启用了保护规则，成功构建后 lockfile push 仍可能被拒绝。

## 旧版手动工作流说明

旧说明已由本文件上述规则替代。最初的纯手动设计及首次缺少锁文件的背景详见 Git 提交历史。
