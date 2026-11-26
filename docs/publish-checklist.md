# 发布到 DSH 插件市场 · 泡菜鱼

这份清单只列**发布本身**要做的事；功能改动一律走 `CHANGELOG.md`。

## 0. 先跑一遍自检

```bash
npm run verify              # 语法 + 1525 条测试 + bundle 冒烟 + 体积
npm run prepublish-check    # 市场元信息自检（38 项）
```

两条都绿再往下走。

## 1. 名字怎么定

名字分三层，互不影响：

| 层 | 在哪 | 现在是什么 | 能否改 |
| --- | --- | --- | --- |
| 市场卡片标题 | `locale/zh.json` 的 `meta.title` | **泡菜鱼** | 随便改，只是文案 |
| 市场卡片描述 | `locale/{zh,en}.json` 的 `meta.description` | 一句话介绍 | 随便改 |
| 包 id | `package.json` 的 `name` + `cordis.patch.yml` 的 `name` + `client.js` 的 `__ModuleLoader__.load({ id })` | `@lnuxe/paocaiyu` | **三处必须一致**：boot roster 用包名当 row id，注册名对不上就挂不上 |

`@local/*` 只是本地开发用的 scope，**发不到公共 registry**。要发公共包，第 2 步必须换名字。

## 2. 换成本地可发 / 公共可发的包名（二选一）

### A. 只做自托管（不经过 registry）

包名保持 `@lnuxe/paocaiyu`，从仓库直装，不走 registry：

```bash
pnpm --dir ~/.dsh/profiles/web add github:lnuxe/dsh-paocaiyu
```

这条路**不用发 npm**，`git push` 完就能装最新代码。

### B. 发到公共 registry（`@lnuxe/paocaiyu`）

名字已经改好，一条命令走完「自检 → 查登录 → 发布 → 回读 registry 验证」：

```bash
npm login            # 或 export NODE_AUTH_TOKEN=<granular access token>
npm run publish:npm
```

`scripts/publish-npm.mjs` 做四件事：跑 `prepublish-check`（51 项）→ `npm whoami` 确认凭据 →
`npm publish --access public` → 轮询 `npm view` 直到 registry 真的报出这个版本号。
没登录时它直接以退出码 2 停下，并打印建令牌的位置与 scope 要求，不会把半个包推上去。

只想看包内容不发布：

```bash
npm run publish:npm -- --dry
npm pack --dry-run
```

> 改包名时 `package.json` 的 `name`、`cordis.patch.yml` 的 `name`、`client.js` 的
> `__ModuleLoader__.load({ id })` **三处必须一致**；漏掉第三处，页面加载 bundle 时会报
> `loaded without registering "<包名>"`。

## 3. 发布前必须成立的几件事（`prepublish-check` 全查）

- `private` 已去掉，`version` 是发布态
- `icon.svg` 存在且 <= 256 KiB（市场卡片插画）；`package.json` 顶层有 `icon` 字段
- `exports` 里有 `./package.json`、`./locale/*.json`、`./icon`（字段回退与图标都靠它）
- `locale/en.json` 必须有（发现入口），`meta.title` / `meta.description` 非空
- `files` 覆盖 `index.js`、`client.js`、`cordis.patch.yml`、`dicts.index.json`、`dicts.generated.json`、`icon.svg`、`locale/*.json`、`README.md`、`LICENSE`、`CHANGELOG.md`、`NOTICE`
- `dsh.bundle.patch` 指向 `cordis.patch.yml`；`dsh.client.platform=web` 且 `inject` 声明了宿主 UI 包
- `cordis.patch.yml` 里的 `name` 和 `package.json` 的 `name` 一致
- `client.js` 体积仍在硬线内（宿主整包注入，太大拖启动）

## 4. 发布后自查

1. `pnpm --dir ~/.dsh/profiles/web add <包名>`，刷新 DSH 页面
2. 设置 → 插件：卡片标题显示**泡菜鱼**、插画是 `icon.svg`、描述是一句话介绍；切英文应显示 `Paocaiyu`
3. 侧栏图标点开能起条；`/qwerty-autotype cancel govern` 能在对话里起卡片
4. 输入框里打字：字母变绿、打错变红清空重打、回车**发不出消息**
5. `⌘/Ctrl+Alt+Q` 能一键停

## 5. 回滚

```bash
npm deprecate <包名>@<坏版本> "0.x 有回归，请升到 <好版本>"
# 或者直接发一个补丁版：npm version patch && npm publish
```

本地装坏了的兜底：删掉 `~/.dsh/profiles/web/node_modules/@local/<包名>` 这个软链，重新 `add` 上一版。