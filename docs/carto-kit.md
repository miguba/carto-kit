# Carto 产品需求与开发文档

## 1. 产品定位

`carto-kit` 是 EMS 的官方自托管前端启动工具，用于帮助用户把 EMS 中的单品内容、订单和支付能力快速落地到自己的前端项目和部署环境。

它不是 EMS 托管服务，不负责代用户销售商品、托管消费者前台、管理用户 VPS 凭证或承担用户的合规责任。

核心定位：

- EMS：内容协议、订单后端、支付配置、API。
- Carto：官方 reference frontend、初始化 CLI、自托管部署脚本。
- 用户：拥有自己的域名、服务器、前端部署环境、支付商户账户和合规责任。

一句话：

> 从 EMS 内容协议生成可自托管的单品电商前端项目。

## 2. 目标功能

第一版目标是提供一个类似 Astro / Vite 的初始化体验：

```bash
npm create carto@latest
```

用户不需要先手动 `npm i`。`npm create carto@latest` 会按照 npm create 约定解析并执行 npm 包 `create-carto`，然后进入交互式项目创建流程。

对应 npm 包：

```text
create-carto
carto-kit
```

CLI 负责交互式生成项目：

- 选择项目名称。
- 选择模板：`single-product` 或 `multi-product`。
- 填写 EMS site domain。
- 选择前端模式：`static` 或 `ssr`，v1 默认 `ssr`。
- 选择部署目标：`none`、`vps`、`cloudflare-workers`；模板决定业务形态，部署目标决定运行配置。
- 生成 `.env`、部署配置、README 和项目文件。
- 输出下一步命令。

示例输出：

```bash
cd my-storefront
npm install
npm run dev
npm run deploy:vps
```

## 3. 项目结构

推荐仓库结构：

```text
carto-kit/
  package.json
  package-lock.json
  README.md
  PRODUCT_REQUIREMENTS.md

  packages/
    carto-kit/
      package.json
      src/
        cli.ts
        prompts.ts
        scaffold.ts
        validators.ts
    create-carto-wrapper/
      package.json
      cli.js

  templates/
    single-product/
      package.json
      astro.config.mjs
      src/
      public/
      scripts/
        deploy-vps.mjs
      .env.example
      README.md

    multi-product/
      package.json
      astro.config.mjs
      src/
      public/
      scripts/
        prepare-deploy-config.ts
        deploy-vps.mjs
      .env.example
      README.md
```

`carto-kit` 负责配置管理、初始化和复制模板，不承担 EMS 后端业务逻辑。`create-carto` 只作为 `npm create carto` 的薄入口。

`templates/single-product` 是可独立运行的官方前端模板。
`templates/multi-product` 是多品目录店铺模板，按 `DEPLOYMENT_TARGET` 生成 Cloudflare 或 VPS 运行配置。

## 4. CLI 需求

CLI 名称：

```bash
carto-kit
```

用户入口：

```bash
npm create carto@latest
carto-kit create
```

交互问题：

```text
Project name
EMS site domain
Frontend mode: SSR / Static
Deployment target: None / VPS / Cloudflare Workers
Configure VPS deploy now? yes/no
```

v1 生成文件：

```text
.env
README.md
package.json
scripts/deploy-vps.mjs
```

`.env` 示例：

```env
EMS_SITE_DOMAIN=example.com
PUBLIC_SITE_URL=https://example.com
PRODUCT_DETAIL_URL_TEMPLATE=/products/{slug}

# SSR only. Do not expose this to browser bundles.
EMS_SERVER_APP_TOKEN=

# VPS deploy
VPS_HOST=
VPS_PORT=22
VPS_USER=ubuntu
VPS_SSH_KEY=
VPS_DEPLOY_DIR=/var/www/carto
VPS_PM2_APP_NAME=carto
VPS_CADDY_DOMAIN=example.com
```

CLI 必须校验：

- 项目目录不存在或为空。
- site domain 非空。
- deployment target 合法。
- 不把 secret 打印到日志里。

## 5. Storefront 模板需求

模板 v1 使用 Astro。

必须支持：

- 商品列表页。
- 商品详情页。
- 图片、主图、gallery、变体、价格、库存、selling points。
- Checkout 页面。
- PayPal 和 Stripe 前端支付接入。
- 从 EMS 拉取公开支付配置。
- 创建订单、创建 payment、确认 payment、capture/verify payment。
- 支付成功后显示 order number 和成功提示。
- 缺失支付配置时显示明确错误，不使用本地 fallback。

支付配置规则：

- PayPal `clientSecret`、Stripe `secretKey`、Stripe `webhookSecret` 不进入 Carto。
- Storefront 只从 EMS 获取浏览器可见配置：
  - PayPal `clientId`
  - PayPal `mode`
  - Stripe `publishableKey`
  - Stripe `mode`
  - provider enabled 状态
- SSR 模式可以使用 EMS server token。
- Static 模式不得嵌入 EMS server token，必须走 public API 和 checkout session token。

## 6. VPS 部署需求

v1 的 VPS 部署脚本由用户本地执行：

```bash
npm run deploy:vps
```

脚本职责：

- 本地构建 Astro 项目。
- 通过 SSH 连接用户 VPS。
- 创建部署目录。
- 上传构建产物和必要运行文件。
- 安装 production dependencies。
- 使用 PM2 启动或重启应用。
- 可选生成 Caddy 配置。
- 输出部署结果和访问 URL。

脚本不做：

- 不把 VPS 凭证发送到 EMS。
- 不长期保存 SSH 密钥。
- 不替用户购买域名、管理 DNS 或承担 HTTPS 失败责任。
- 不修改 EMS 后台支付密钥。

失败处理：

- SSH 连接失败：提示 host/user/key/port 检查。
- 远程目录无权限：提示更换目录或使用有权限用户。
- 构建失败：保留本地 build 日志。
- PM2 启动失败：提示远程日志路径。
- Caddy 配置失败：提示用户手动检查 DNS 和端口。

## 7. EMS 后台配套需求

当前 `carto-kit` 是独立项目，但 EMS 后台后续应提供一个入口：

```text
Carto
```

后台提供：

- 复制初始化命令。
- 显示 site domain。
- 创建或选择 server app token。
- 提供 `.env` 片段。
- 链接到 Carto 文档。

示例命令：

```bash
npm create carto@latest -- \
  --site example.com
```

未来可增加一次性 setup token：

```bash
npm create carto@latest -- --setup-token est_xxx
```

setup token 只能读取初始化所需配置，不能读取支付 secret。

## 8. 安全边界

必须遵守：

- Carto 不接收 PayPal/Stripe secret。
- Carto 不上传 VPS 凭证到 EMS。
- CLI 日志自动脱敏 token、secret、SSH key path。
- `.env.example` 不包含真实密钥。
- 生成的 README 明确说明：前台由用户自托管，EMS 不托管消费者页面。
- 支付后端状态以 EMS capture/verification 为准，不信任浏览器支付回调。

## 9. 开发实现建议

推荐依赖：

- `commander`：CLI 参数解析。
- `prompts` 或 `@clack/prompts`：交互式问题。
- `fs-extra`：复制模板。
- `execa`：运行安装命令。
- `kleur` 或 `picocolors`：终端颜色。
- `zod`：配置校验。

CLI 基本流程：

```text
parse args
load defaults
ask prompts
validate input
copy template
render env/config files
optionally install dependencies
print next steps
```

模板复制时需要忽略：

```text
node_modules
dist
.env
.astro
.wrangler
.DS_Store
```

## 10. 测试计划

CLI 测试：

- 创建默认 Astro storefront 成功。
- 已存在非空目录时报错。
- CLI 参数可跳过交互。
- `.env` 正确生成。
- secret 不出现在日志中。

模板测试：

- `npm install` 成功。
- `npm run check` 成功。
- `npm run build` 成功。
- 缺失 EMS 配置时显示明确错误。
- 支付配置只从 EMS config API 读取。
- Stripe/PayPal secret 不存在于前端源码和浏览器 public env。

部署脚本测试：

- 缺失 VPS host 报错。
- SSH key path 不存在时报错。
- dry-run 模式输出部署计划。
- PM2 app name 和 deploy dir 可配置。
- 部署失败时返回非 0 exit code。

## 11. v1 验收标准

v1 完成时应满足：

- 用户可以运行 `npm create carto@latest` 创建项目。
- 创建出的项目可以 `npm run dev` 本地运行。
- 创建出的项目可以 `npm run build`。
- 用户可以通过 `.env` 接入 EMS site。
- Checkout 从 EMS 获取支付公开配置。
- 不需要在 Carto 中填写 PayPal/Stripe secret。
- VPS 部署脚本可以在用户本地通过 SSH 部署到自己的服务器。
- README 清楚说明自托管边界和部署步骤。

## 12. 默认假设

- v1 只维护一个官方 Astro 模板。
- v1 默认 SSR，因为 checkout 和 server token 管理更直接。
- static 模式作为后续增强，必须走 public API + checkout session token。
- v1 不做 EMS 后台远程 SSH 部署。
- v1 不做模板市场。
- v1 不做多框架模板，Next/Nuxt 等后续再评估。
- 支付 secret 留在 EMS 后台，不进入 Carto。
