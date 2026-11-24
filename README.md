# @local/qwerty-autotype-ui

Qwerty 跟打的**对话界面**（Client 半边）。Host 半边在 `../qwerty-autotype/`。

## 它做了什么

| Slot | 注册 | 作用 |
| --- | --- | --- |
| `sidebar.panellist` | id `qwerty-autotype`（order 5） | **侧栏左上角「⌨ 跟打」面板图标**，和「插件」面板同一排；点击切到跟打面板 |
| `main` | key `qwerty-autotype` | **跟打面板**：词库下拉（按分类分组）+ 56px 大字 + 音标 + 中文 + 自带输入框的跟打卡片 |
| `conversation.input.dock` | id `qwerty-autotype`（order 10） | **输入框正上方的跟打条**（无边框无背景、宽度按 composer 正文实测宽度居中，所以和输入框左右对齐）：词库下拉 + 34px 单词 + 下面一行音标 + `3/12 · ✓2 · ↻1` + 三个图标（▶/⏸ 自动、↻ 重开、× 收起），没有标题和说明文字 |
| `conversation.chat.commandview` | key `qwerty-autotype` | `/qwerty-autotype` 那一行也渲染同一张卡片（指令入口，可选） |

三个入口共用同一个 `Trainer` 组件，判定逻辑只有一份。

### 打字发生在哪里

- **对话里**（`conversation.input.dock`）：打字发生在**真正的 composer 输入框**里 —— 捕获阶段接管 `[data-composer-input]` 的 keydown，不另开假输入框。中文释义直接写进 composer 草稿，所以显示在输入框里（空输入框的占位提示被顶掉）。
- **面板里**（`main`）：面板自带一个真输入框，不用抢 composer 的焦点。

练习期间输入框区域的回车 / 制表符（含 `Cmd+Enter`）和那一排按钮的点击全部被吃掉，草稿里那句中文发不出去；收起时自动把中文撤掉。

### Tab 快速启动

对话里、输入框为空时按 <kbd>Tab</kbd> 直接开跟打条（输入框已有内容时 Tab 仍然正常切焦点）。

### 词库

`dicts.generated.json` 由 `scripts/build-dicts.mjs` 从 [qwerty-learner](https://github.com/RealKai42/qwerty-learner) 生成后内联进 `client.js`，7 个词库共 560 词：

| id | 名称 | 分类 | 词数 |
| --- | --- | --- | --- |
| `cet4` | CET-4 | 大学英语 | 80 |
| `cet6` | CET-6 | 大学英语 | 80 |
| `kaoyan` | 考研 | 考研 | 80 |
| `toefl` | TOEFL | 国际考试 | 80 |
| `ielts` | IELTS | 国际考试 | 80 |
| `bec2` | 商务英语 | 国际考试 | 80 |
| `coder` | Coder Dict | 代码练习 | 80（源数据无音标） |

每个词条 `{ w, ipa, zh }`：音标优先英式、其次美式，`'` 统一成 `ˈ`；代码词库源数据没有音标字段，所以不显示音标行。选择结果存在 `localStorage['qwerty-autotype:dict']`。

宿主侧的指令由 `@local/qwerty-autotype` 注册（`ctx.commands.register`）；本 bundle 的 Host 半边是空 `apply()`，
因为界面完全靠 Slot 渲染，不需要任何 Host Service。

## 判定语义（和 qwerty-learner 一致）

- 打对的字母 → 绿色（`--dsw-alias-state-success-primary`）
- 打错 → 红色 + 抖动，输入框清空，**整词重打**
- 整词打对 → 进下一个词，`命中 +1`
- 打超长 → 忽略
- 回车不发送消息，不会调用模型

## 测试

```bash
node test-client-logic.mjs   # 45 条用例：判定 / pushChar / 词库 / 渲染冒烟（一次性 React 桩真的调一遍组件），不需要浏览器
```

## 安装

```bash
# 已在 ~/.dsh/profiles/web 里 link 好；重装：
dsh plugin install <本仓库目录>
```

## 版本与仓库

- 包名 `@local/qwerty-autotype-ui`，当前 `0.1.0`，许可证 MIT。
- 变更记录见 [CHANGELOG.md](./CHANGELOG.md)（Keep a Changelog 格式）。

### 语义化版本约定

| 变更类型 | 版本位 | 例子 |
| --- | --- | --- |
| `feat`（新增 Slot / 新增入口 / 新增词表字段 / 新增交互） | **minor** `0.1.0 → 0.2.0` | 新增一个 `conversation.*.dock` 注册点 |
| `fix`（判定错误、焦点守卫漏拦、文案/音标错、样式错位） | **patch** `0.1.0 → 0.1.1` | 修复 `Cmd+Enter` 漏吞 |
| 破坏性变更（改 Slot id / 改 `exports` 路径 / 改 `dsh` 配置字段 / 改 `Trainer` props） | **major** `0.1.0 → 1.0.0`（`0.x` 阶段先 bump minor 并在 CHANGELOG 标 **BREAKING**） | 重命名 `client.js` 导出 |

### 发布检查清单

```bash
# 1. 语法与测试必须全绿（45 条）
node --check client.js && node test-client-logic.mjs

# 2. 按改动类型升版本，并让 CHANGELOG 与之一致
npm version patch          # fix
npm version minor          # feat
npm version major          # 破坏性变更

# 3. 打带注释的 tag（注解里写这一版的要点）
git tag -a v0.1.1 -m "qwerty-autotype-ui 0.1.1: <一句话要点>"

# 4. 推分支与 tag
git push -u origin main
git push origin --tags
```

- 版本号三处必须一致：`package.json` 的 `version`、CHANGELOG 的 `## [x.y.z]`、tag 名 `vX.Y.Z`。
- 每次发布前确认 `package.json` 的 `files` 仍然覆盖实际产物（`index.js`、`client.js`、`locale/`、`icon.svg`、`cordis.patch.yml`、`README.md`、`LICENSE`）。
- 仓库：https://github.com/lnuxe/qwerty-autotype-ui
