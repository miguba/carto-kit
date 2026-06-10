# Carto npm 发布流程

本文记录 `carto-kit` 仓库发布新版到 npm 的固定流程，适用于模板、CLI 或 wrapper 更新后的版本发布。

## 快速清单

推荐使用脚本发布：

```bash
npm run release:npm -- --patch --dry-run
npm run release:npm -- --patch --publish
```

如果你明确知道目标版本，也可以直接传版本号：

```bash
npm run release:npm -- 0.1.6 --dry-run
npm run release:npm -- 0.1.6 --publish
```

如果 npm 账号要求 2FA：

```bash
npm run release:npm -- 0.1.6 --publish --otp 123456
```

脚本默认是 dry run，只有显式传 `--publish` 才会真正发布到 npm。脚本会自动同步两个包的版本、刷新 `package-lock.json`、运行测试和构建、执行 pack/publish dry run，然后按顺序发布 `carto-kit` 和 `create-carto`。

如果忘记上次发到哪个版本，直接用 `--patch`。脚本会读取 npm 上 `carto-kit` / `create-carto` 已发布的最新版本，取最大值后自动加一位 patch。需要发破坏性版本或功能版本时，可以改用 `--major` 或 `--minor`。

自动 bump 以 npm registry 为准，不以本地 `package.json` 为准。如果上一次 `--publish` 中途失败导致本地版本号临时高于 npm 最新版本，脚本会提示这个差异，但仍然按 npm 最新版本计算下一版。

dry run 会临时写入目标版本来检查真实包内容，但结束或失败时会恢复 `package.json` 和 `package-lock.json`。只有 `--publish` 会保留版本号变更并真正发布。

发布后 npm registry 可能短时间内不同步。脚本会等待并重试确认 `carto-kit@<version>` 和 `create-carto@<version>` 的 tarball 都可见。如果只发布成功其中一个包，重复执行同一条 `--publish` 命令即可恢复，脚本会跳过已经存在的包并继续发布缺失的包。

正式 `--publish` 默认要求存在发布相关源码变更，包括 `templates/*`、`packages/carto-kit/src/*`、`packages/carto-kit/scripts/copy-template.mjs` 或 `packages/create-carto-wrapper/cli.js`。如果这些源码没有变化，脚本会拒绝发布空版本。只有两种情况例外：恢复半发布版本，或你显式传 `--force`。

每次发布按这个顺序执行：

1. 确认工作区只包含本次要发布的变更。
2. 运行 `npm install`、`npm run test`。
3. 如果改过 `templates/*`，运行 `npm run build`，让发布副本同步到 `packages/carto-kit/templates/*`。
4. bump `carto-kit` 和 `create-carto` 两个包的版本，并同步 wrapper 依赖。
5. 运行 `npm install --package-lock-only` 刷新 lockfile。
6. 运行 pack 和 publish dry run。
7. 先发布 `carto-kit`，再发布 `create-carto`。
8. 用 `npm view` 和干净临时目录验证 npm 侧结果。

## 发布包

当前仓库发布两个 npm 包：

- `packages/carto-kit` 发布为 `carto-kit`，包含 CLI、构建产物和发布用模板副本。
- `packages/create-carto-wrapper` 发布为 `create-carto`，用于支持 `npm create carto@latest`。

发布顺序必须是先发布 `carto-kit`，再发布 `create-carto`，因为 `create-carto` 依赖指定版本的 `carto-kit`。

## 源文件边界

- 模板开发源文件在 `templates/*`。
- npm 包实际发布的模板副本在 `packages/carto-kit/templates/*`。
- `packages/carto-kit/scripts/copy-template.mjs` 负责在构建时同步模板副本，并过滤本地运行产物。

因此，模板改动的发布路径是：

```bash
# 修改 templates/*
npm run build
# 再检查 packages/carto-kit/templates/* 是否已刷新
```

不要手动只改 `packages/carto-kit/templates/*` 后发布，否则源码模板和发布模板会分叉。

## 1. 发布前检查

先确认本地依赖和检查通过：

```bash
npm install
npm run test
```

再确认当前工作区状态：

```bash
git status --short
```

这里不要求工作区必须干净，但要确认每个待发布变更都属于本次版本。不要把临时文件、测试输出或无关修改带进 npm 包。

如果刚更新过模板，必须执行构建：

```bash
npm run build
```

`npm run build` 会构建 CLI，并把 `templates/*` 同步到 `packages/carto-kit/templates/*`。发布包使用的是 `packages/carto-kit/templates/*`，所以模板更新后不能跳过这一步。

## 2. 修改版本号

先查看当前版本：

```bash
npm pkg get version --workspace carto-kit
npm pkg get version --workspace create-carto
npm pkg get dependencies.carto-kit --workspace create-carto
```

假设要从 `0.1.4` 发布到 `0.1.5`，需要修改两个文件。

`packages/carto-kit/package.json`：

```json
{
  "name": "carto-kit",
  "version": "0.1.5"
}
```

`packages/create-carto-wrapper/package.json`：

```json
{
  "name": "create-carto",
  "version": "0.1.5",
  "dependencies": {
    "carto-kit": "0.1.5"
  }
}
```

修改后刷新 lockfile：

```bash
npm install --package-lock-only
```

如果 npm 报目标版本已存在，继续 bump 到一个 npm 上不存在的新版本。npm 已发布版本不能覆盖。

可选：修改后再次确认三个版本值一致：

```bash
npm pkg get version --workspace carto-kit
npm pkg get version --workspace create-carto
npm pkg get dependencies.carto-kit --workspace create-carto
```

## 3. dry run 检查包内容

先检查实际会打进 npm 包里的文件：

```bash
npm pack --workspace carto-kit --dry-run
npm pack --workspace create-carto --dry-run
```

再检查发布命令本身：

```bash
npm publish --workspace carto-kit --access public --dry-run
npm publish --workspace create-carto --access public --dry-run
```

重点确认：

- `carto-kit` 包内包含 `dist` 和 `templates`。
- `carto-kit` 包内不要包含 `.env`、`.astro`、`.wrangler`、`dist`、`node_modules` 等模板运行产物或本地环境文件。
- `create-carto` 包内只需要包含 wrapper 入口文件。

## 4. npm 登录检查

正式发布前确认 npm 登录状态：

```bash
npm whoami
```

如果返回 `401 Unauthorized` 或要求登录，先执行：

```bash
npm login
```

如果账号开启了 2FA，正式发布时可能需要 OTP。npm 报 `EOTP` 时，重新带上一次性验证码发布。

## 5. 正式发布

先发布核心 CLI 包：

```bash
npm publish --workspace carto-kit --access public
```

再发布 `npm create` wrapper：

```bash
npm publish --workspace create-carto --access public
```

如果需要 OTP：

```bash
npm publish --workspace carto-kit --access public --otp 123456
npm publish --workspace create-carto --access public --otp 123456
```

## 6. 发布后验证

确认 npm registry 已经看到新版本：

```bash
npm view carto-kit dist-tags --json
npm view create-carto dist-tags --json
npm view carto-kit versions --json
npm view create-carto versions --json
```

也可以确认指定版本 tarball：

```bash
npm view carto-kit@0.1.5 dist.tarball
npm view create-carto@0.1.5 dist.tarball
```

npm registry 有时会有短暂传播延迟。如果刚发布后 `latest` 或版本列表没有马上更新，先重复检查 dist-tags、versions 和 tarball，不要立即判断发布失败。

## 7. 干净环境安装验证

最后用临时目录验证真实用户入口：

```bash
tmpdir=$(mktemp -d)
cd "$tmpdir"
npm create carto@latest
```

如果只想验证安装，不进入交互式创建流程，可以先检查包安装：

```bash
tmpdir=$(mktemp -d)
cd "$tmpdir"
npm init -y
npm install carto-kit@latest
```

注意：不要用未支持的 CLI flag 当作安装成功与否的判断依据。比如如果 CLI 没有实现 `--version`，`carto --version` 报 unknown option 不是安装失败。

## 常见问题

### 模板改了但发布后还是旧内容

通常是只改了 `templates/*`，但没有运行 `npm run build`。发布包实际读取 `packages/carto-kit/templates/*`，需要重新构建后再检查 dry run 包内容。

### npm publish 报版本已存在

npm 不允许覆盖已发布版本。把 `packages/carto-kit/package.json`、`packages/create-carto-wrapper/package.json` 和 wrapper 里的 `carto-kit` dependency 一起 bump 到新版本，然后运行：

```bash
npm install --package-lock-only
```

### npm publish 报 EOTP

账号需要二次验证。重新执行 publish 命令并加上 `--otp`。

### 发布后 npm create 仍解析到旧版本

先检查：

```bash
npm view create-carto dist-tags --json
npm view create-carto versions --json
```

如果版本已经存在但 `latest` 短时间没更新，通常是 registry 缓存或传播延迟。等待片刻后再用干净目录重试。
