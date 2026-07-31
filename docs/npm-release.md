# Carto Kit npm 发布流程

仓库只发布 `carto-kit`。项目脚手架和 `create-carto` 包已从本仓库移除。

```bash
npm install
npm run test
npm run release:npm -- --patch --dry-run
npm run release:npm -- --patch --publish
```

也可以传明确版本：

```bash
npm run release:npm -- 0.2.0 --dry-run
npm run release:npm -- 0.2.0 --publish --otp 123456
```

发布脚本会更新 `carto-kit` 版本、刷新 lockfile、运行完整检查、执行
`npm pack` 与 publish dry run。只有 `--publish` 会真正发布并保留版本变更；
dry run 会恢复 package 与 lockfile。

正式发布前确认工作区只包含本次变更，并检查：

```bash
git status --short
npm pack --workspace carto-kit --dry-run
```

发布后确认：

```bash
npm view carto-kit dist-tags --json
npm view carto-kit versions --json
```
