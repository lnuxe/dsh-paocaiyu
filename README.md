# @local/qwerty-autotype-ui

Qwerty 跟打（打字练习）的**对话界面**半边：把 qwerty-learner 那套「看中文打英文」搬进 DSH 的聊天输入框。
Host 半边在 `../qwerty-autotype/`；本仓库只有 UI，`index.js` 是空 `apply()`。

![在输入框上方跟打：打对变绿，打错整词重打](./assets/demo.gif)

## 入口

| Slot | 注册 | 作用 |
| --- | --- | --- |
| `sidebar.panellist` | id `qwerty-autotype`（order 5） | 侧栏左上角图标，和「插件」同一排 |
| `main` | key `qwerty-autotype` | 跟打面板：工具栏 + 单词 + 音标 + 中文 + 自带输入框 |
| `conversation.input.dock` | id `qwerty-autotype`（order 10） | 输入框正上方的跟打条，宽度按 composer 实测宽度居中 |
| `conversation.chat.commandview` | key `qwerty-autotype` | `/qwerty-autotype` 指令行渲染同一张卡片 |
| `settings.section` | id `qwerty-autotype-settings`（order 25） | `设置 → 跟打` |

三个练习入口共用 `Trainer`，判定逻辑只有一份。

## 怎么打

- **对话里**：打字发生在**真的 composer 输入框**。捕获阶段接管 `[data-composer-input]` 的 keydown，中文释义写进草稿，所以显示在输入框里；练习期间回车 / 制表符 / 发送按钮全被吃掉，收起时把写进去的中文撤掉。
- **面板里**：自带真输入框，不抢 composer 焦点。
- **快捷启动**：输入框为空时按 <kbd>Tab</kbd> 直接开跟打条（有内容时 Tab 正常切焦点）。

判定（与 qwerty-learner 一致）：

| 情况 | 反应 |
| --- | --- |
| 字母打对 | 变绿 |
| 打错 | 变红 + 抖动 + 清空，**整词重打**（记一次 `retries`） |
| 整词打对 | 进下一个词，`hits +1` |
| 打超长 | 忽略 |
| 回车 | 不发送、不调模型 |

连续跟打：跟打条顺着**整本词库**往下打（到头绕回），不按 20 词分段；面板按 20 词一章、打完出结算页（本轮错词清单 + 重练 + 下一章）。
关掉再打开接着上次那个词 / 那一章：进度存 `localStorage`，打完的章不会被重打。

快捷键（条上只留一个 `×`，其余走键盘）：<kbd>⌘←</kbd> 上一个 · <kbd>⌘→</kbd> 跳过 · <kbd>⌘J</kbd> 循环 · <kbd>⌘P</kbd> 暂停 · <kbd>Esc</kbd> 收起 · <kbd>?</kbd> 帮助（Windows 上 `⌘` 即 `Ctrl`）。

## 词库

目录 **371 个词库 / 414,485 词 / 10 分类 / 6 语言**，由 `scripts/build-index.mjs` 从上游 `src/resources/dictionary.ts` 生成（`dicts.index.json`，内联进 `client.js` 只占 62KB 元数据）。

词条按需加载：**内存 → IndexedDB(`dicts`) → 钉住的 commit（jsDelivr → raw.githubusercontent）→ master → 内置兜底**。上游没有 release tag，所以钉 SHA，拿不到自动回退 `master`。

离线兜底 `dicts.generated.json`：7 个词库 × 80 词（`cet4` `cet6` `kaoyan` `toefl` `ielts` `bec2` `coder`），只在联网失败时用；`coder` 源数据无音标。

**自定义词表**：选择器底部粘贴 `word 中文`（也支持 `word,中文,/音标/`）或导入 `.txt` / `.csv` / `.json`，上限 2000 词，可导出 `.txt`，随备份一起走。

## 记录与统计

IndexedDB `qwerty-autotype`：`wordRecords`（逐词）、`chapterRecords`（逐章）、`progress`（章节完成态）、`dicts`（词库缓存）。
`localStorage`：`dict` / `recent` / `custom-dicts` / `mastered` / `session` / `bar-progress` / `last-chapter` / `setting:*` / `records-mirror`（无 IndexedDB 时的降级镜像）。

- **结算页**：WPM、准确率、耗时、本轮错词 + 重练 + 下一章
- **错词本**：`wrongCount > 0` 的词按错误次数聚合，可重练
- **统计浮层**：近 14 天柱状图、12 周热力图、QWERTY 易错字母热力（0–4 档）、总词数 / 正确率 / WPM
- **实时速度**：跟打时按最近 8 秒窗口算 WPM
- **打字提示**：同一个词打错 3 / 4 / 5 次逐档放水（首字母 → 两个字母 → 直接给答案）
- **默写形态**：`none` / `hideAll` / `hideVowel` / `hideConsonant` / `randomHide`
- **指法键盘**：纯 SVG 键位图（默认关闭）
- **发音**：单词走音频源（英/美音），释义走浏览器 TTS，都可关

## 设置

`设置 → 跟打` 共 11 项：默写形态、区分大小写、忽略标点、显示中文、显示音标、发音开关、口音、按键音、自动下一章、读释义、指法键盘，存 `qwerty-autotype:setting:*`；另有导出 / 导入 JSON 备份与清空记录。

## 开发

```bash
npm run check         # node --check client.js
npm test              # 677 条断言：判定 / 纯函数 / 渲染冒烟 / 存档 / 索引
npm run verify        # check + test
npm run index         # 只生成 dicts.index.json
npm run index:inline  # 同时写回 client.js 的 @dict-index 区间
node scripts/build-index.mjs --pin <sha> --inline client.js   # 钉上游提交
```

测试用一次性 React 桩在 `vm` 里真的把组件渲一遍，不需要浏览器。

```
client.js            # 全部实现（单文件，Cordis 客户端插件）
index.js             # Host 半边，空 apply
cordis.patch.yml     # bundle patch
dicts.index.json     # 371 词库元数据（内联来源）
dicts.generated.json # 7 个离线兜底词库
locale/{zh,en}.json  # 文案
scripts/             # build-index / build-dicts
test-client-logic.mjs
docs/                # 上游对照表、覆盖扫描
```

## 性能

单文件 353KB（含 62KB 词库元数据、21.2KB 样式），启动约 7ms。几条踩过的坑：

- **查词**：`lookup()` 以前每个词线性扫词表——缓存 `coca_20000`（17,633 词）后画一章 20 个词就要 1.5ms（未命中全扫 4.2ms），全砸在渲染里。现在按词表建 `WeakMap` 索引 + 512 条结果缓存，同场景 **0.006ms**。
- **词库目录**：371 个词库每次重建、一次渲染问 5 遍。现在按自定义词表指纹缓存，面板一次渲染只取一次目录（渲染 0.62ms → 0.14ms）。
- **样式表**：21.2KB CSS 以前每个卡片各渲一份 `<style>`，条子一收一开就重新解析。现在插件装上时往 `document.head` 注入一次。
- **存档写入**：每换一个词写一次 `localStorage`（约 2µs），不节流。

## 版本与许可

- 当前 `0.6.1`，**GPL-3.0-only**（见 [NOTICE](./NOTICE)：词库数据派生自同样以 GPL-3.0 发布的 qwerty-learner）
- 变更记录：[CHANGELOG.md](./CHANGELOG.md)（Keep a Changelog）
- 仓库：https://github.com/lnuxe/qwerty-autotype-ui