# 手动 Web 编译验证工作流

> 对应 `.github/workflows/web-build-manual.yml`。**仅能通过 GitHub Actions 手动触发**，不配置 push、pull_request、schedule、tag 或 workflow_run 触发器。

## 运行方式

1. 打开仓库 `yakun0622/epusdt` → **Actions** → **Web build verification (manual)**。
2. 点击 **Run workflow**，选择需要验证的分支（通常 `master`），再点击运行。
3. 查看各步骤日志：依赖安装、TypeScript 类型检查、Vitest 单元测试、Vite 构建。
4. 有失败时只修复代码并提交，不会自动重新运行；修好后需要再次手动触发。

## 资源保护

- 单个 job，Ubuntu runner，超时 12 分钟；并发同一分支的新运行会取消旧运行。
- 不执行 Go 后端测试；不构建 Docker；不发布制品；不上传 artifact；不提交/推送代码。
- `web/dist` 仅存在于临时 runner，**绝不会同步到生产 `src/www`**。
- `permissions: contents: read`，checkout 禁用凭证持久化，无额外 secrets。

## package-lock 情况和下一步

当前 `web/` 没有 `package-lock.json`；本轮尝试通过 npm registry 生成锁文件，失败：EAI_AGAIN（无法解析 registry.npmjs.org）。为了现在就能通过 GitHub Actions 手动验证，工作流优先 `npm ci`（存在锁文件时），无锁文件时降级为 `npm install` 并输出 warning。**该降级不保证依赖版本完全可复现。**

首次手动运行成功后，应在能访问 npm registry 的环境下执行 `cd web && npm install --package-lock-only`，将生成的 `web/package-lock.json` 正式提交；此后工作流会自动选用 `npm ci`。不能把没有锁文件的首次运行视为可复现构建已完成。

## 与现有 GitHub Actions 的关系

这次只新增独立 Web 验证工作流。仓库已存在：
- `sync-www.yml`：dev push / 手动触发，**可能更新 src/www**；
- `release.yml`：v* tag push / 手动触发；
- `docker-alpine.yml`：v* tag push。

上面三个现有工作流**没有被此项改动禁用或修改**。因此“只手动触发”目前专指新建的 **Web build verification**。如果要将整个仓库所有编译/发布统一改成手动，需要对其余工作流另行调整触发条件。

## 验收记录

本次仅核对 YAML 定义和路径、提交到 GitHub。**尚未从 GitHub Actions 运行该工作流，也没有类型检查、测试或构建成功的证据**。首次执行应保存 workflow run 链接及日志，逐步修复失败项。
