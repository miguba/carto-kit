# Carto npm 发布流程

本文记录 `carto-kit` 仓库发布新版到 npm 的固定流程，适用于模板、CLI 或 wrapper 更新后的版本发布。

## 发布包

当前仓库发布两个 npm 包：

- `packages/carto-kit` 发布为 `carto-kit`，包含 CLI、构建产物和发布用模板副本。
- `packages/create-carto-wrapper` 发布为 `create-carto`，用于支持 `npm create carto@latest`。

发布顺序必须是先发布 `carto-kit`，再发布 `create-carto`，因为 `create-carto` 依赖指定版本的 `carto-kit`。

## 1. 发布前检查

先确认本地依赖和检查通过：

```bash
npm install
npm run test
```

如果刚更新过模板，必须执行构建：

```bash
npm run build
```

`npm run build` 会构建 CLI，并把 `templates/*` 同步到 `packages/carto-kit/templates/*`。发布包使用的是 `packages/carto-kit/templates/*`，所以模板更新后不能跳过这一步。

## 2. 修改版本号

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
