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
| 包 id | `package.json` 的 `name` + `cordis.patch.yml` 的 `name` | `@local/qwerty-autotype-ui` | 改了两处必须同时改，且本机 `~/.dsh/profiles/web` 里的安装也要跟着换 |

`@local/*` 只是本地开发用的 scope，**发不到公共 registry**。要发公共包，第 2 步必须换名字。

## 2. 换成本地可发 / 公共可发的包名（二选一）

### A. 只做自托管（不经过 registry）

保持 `@local/qwerty-autotype-ui` 不变，把仓库目录直接给 DSH 当本地 bundle：

```bash
# 本机 profile 里已经有软链，改完 client.js 刷新页面即可
ls -l ~/.dsh/profiles/web/node_modules/@local/qwerty-autotype-ui
```

这条路**不用发版**，改动即生效；适合自己用。

### B. 发到公共 registry（真·插件市场）

换一个能上 registry 的名字，一次改两处 + 一次安装：

```bash
# 1) 换名（示例：@lnuxe/paocaiyu）
npm pkg set name='@lnuxe/paocaiyu'
sed -i '' "s#@local/qwerty-autotype-ui#@lnuxe/paocaiyu#g" cordis.patch.yml

# 2) 自检 + 打包看看里面有什么
npm run prepublish-check
npm pack --dry-run

# 3) 发布
npm publish --access public
```

装的时候：

```bash
pnpm --dir ~/.dsh/profiles/web add @lnuxe/paocaiyu
```

> 换了包名，旧的 `@local/qwerty-autotype-ui` 软链要删掉，否则 DSH 会同时看到两份。

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