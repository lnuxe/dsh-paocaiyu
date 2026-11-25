# 与上游 qwerty-learner 的功能对照扫描

> 更新：2026-11-25 · 插件 `v0.7.0` · 对照上游 `qwerty-learner@master`
> v0.6.0 记：G1–G6 全部落地，缺/部分两栏清零。
> v0.7.0 记：数据完整性（G7）与三处体验（G8–G10）落地，词库丢词率 0.415% → 0.043%。
> 方法：逐个核对上游 `src/pages/Typing/components/*`、`src/components/*` 与插件 `client.js` 的实现/导出，
> 再用纯函数测试钉住结论。判定口径：**已实现**＝有代码且有测试；**部分**＝有入口但缺关键能力；**缺**＝没有。

## 1. 结论

| 状态 | 数量 |
| --- | --- |
| 已实现 | 32 |
| 部分实现 | 0 |
| 缺失 | 0 |
| 明确不做 | 6 |

## 2. 逐项对照

### 2.1 打字与判定（ENGINE）

| 上游 | 状态 | 我们这边 |
| --- | --- | --- |
| `Word` 逐字判定、打错标红抖动 | 已实现 | `judgeTyping` / `pushChar`，`state.flash` + `data-flash` |
| `WordPanel` 大字 + 音标 + 中文 | 已实现 | `.qat-word` / `.qat-ipa` / `.qat-gloss-zh` |
| `WordDictationSwitcher` 默写模式（隐词/隐字母） | 已实现 | `DICTATION_MODES` + `maskLetters` |
| `PrevAndNextWord` 上一词/下一词 | 已实现 | `←` / `→`，`stepIndex(±1)` |
| `LoopWordSwitcher` 循环单词 | 已实现 | `J` 循环当前词 |
| `StartButton` / `Progress` | 已实现 | 整本词库连续打，进度 `1/2607` |
| 大小写 / 标点宽容 | 已实现 | `caseSensitive` / `ignorePunct` |
| 暂停（失焦/切页自动暂停） | 已实现 | `P` + `visibilitychange` |

### 2.2 发音与音效

| 上游 | 状态 | 我们这边 |
| --- | --- | --- |
| `usePronunciation` 有道词典音频 | 已实现 | `pronunciationSrc`（`type=1/2`、`le=jap/zh`） |
| 换词自动发音 | 已实现 | `speak` + `settings.voice` |
| `PronunciationSwitcher` 美音/英音切换 | **已实现（v0.5.0）** | `settings.accent` + `resolveAccent` |
| `SoundSwitcher` 键音 | 已实现 | `playClick` + `settings.sound` |
| 译义朗读（`isTransRead`） | **已实现（v0.6.0）** | `speakMeaning` / `shouldReadMeaning` / `meaningLang`，默认关，`settings.readMeaning` |
| `WordPronunciationIcon` 手动点读 | 已实现 | 面板 `qat-speak` 按钮 + `Ctrl/⌘+J` 重读；跟打条只保留自动发音 |

### 2.3 记录与统计（DATA）

| 上游 | 状态 | 我们这边 |
| --- | --- | --- |
| `db`（Dexie）记录 | 已实现 | IndexedDB v2：`wordRecords` / `chapterRecords` / `progress` |
| `ErrorBook` 错词本 | 已实现 | `WrongBookPanel` + `collectWrongWords` |
| `Analysis` 统计页 | 已实现 | `StatsPanel`：日柱 / 周热力 / 易错字母 / 键盘热力图 |
| 已掌握标记 | 已实现（上游没有） | `toggleMastered` |
| `ResultScreen` 结算页 | **已实现（v0.6.0）** | `ResultScreen` 组件：成绩 + 本轮错词胶囊 + 重练错词 + 继续下一章（末章绕回）；导出成绩仍不做 |
| `Speed` 实时速度 | **已实现（v0.6.0）** | `calcLiveWpm` / `pushSpeedSample` / `windowedWpm`，8 秒窗口 + 1 秒心跳，面板与条上各一处 |
| `WordList` 词表抽屉 | **已实现（v0.6.0）** | `WordListPanel` + `wordListRows`：本章 20 词、状态（当前/已掌握/打错/打过）、点行跳词 |

### 2.4 输入与提示

| 上游 | 状态 | 我们这边 |
| --- | --- | --- |
| `TipAlert` 打错后的提示（首字母） | **已实现（v0.6.0）** | `tipState` / `tipKey` / `nextWrongCount`：3 次首字母、4 次两字母、5 次留最后一个 |
| `HandPositionIllustration` 指法图示 | **已实现（v0.6.0）** | 自绘 `FingerHint`：26 键纯 SVG + 八指分区配色 + 高亮下一个键（不迁上游 PNG），`settings.showFinger` 默认关 |
| 快捷键说明 | 已实现 | 设置页 `hotkeysList` |
| 真实 composer 输入 | 已实现（上游是隐藏 textarea） | 捕获阶段拦 keydown，不调 `submit()` |
| 输入法兼容 | 已实现 | `shouldStartOnTab` 的 `ownDraft`；不写任何编辑器属性 |

### 2.5 词库

| 上游 | 状态 | 我们这边 |
| --- | --- | --- |
| 371 词库 / 414,485 词 | 已实现 | `dicts.index.json` + 按需拉取 |
| 词库缓存 | 已实现 | IndexedDB `dicts` + 设置页清理 |
| 搜索 / 分类 / 最近使用 | 已实现 | `searchCatalog` / `readRecent` |
| `DictChapterButton` 章节 | 已实现 | 20 词一章，`chapterCount` |
| 自定义词表 | 已实现（上游没有） | `custom:`, CSV/JSON/TXT 导入导出 |

### 2.6 明确不做

| 上游功能 | 为什么不做 |
| --- | --- |
| `ShareButton` 成绩出图 | 依赖 canvas 拼图 + 站点图床，宿主内无意义 |
| `Gallery` / `Gallery-N` 词库展示页 | 纯站点运营页 |
| `FriendLinks` / `DonateCard` / `StarCard` | 站点运营与募捐 |
| `Switcher` 主题/语言 | 宿主已有主题与语言设置 |
| `Mobile` 竖屏版 | 宿主是桌面 Web |
| 云同步 / 账号进度 | 上游也没有账号体系，全靠本地 |

### 2.7 数据与体验（v0.7.0）

| 项 | 状态 | 分支 / 结论 |
| --- | --- | --- |
| G7 词库与单词完整迁移 | 已实现 | `feat/d1-data`：长度上限 40→200、`zh \| notation` 有一即可入库、`inspectWord` 四桶丢因、`npm run audit`。371 库 414,469 条 → 保留 414,289 条（丢 0.043%），IELTS-oral-900 900/900、平假名/片假名各 280/280 |
| G8 音标按口音分美音/英音 | 已实现 | `feat/d1-data`：`phoneticOf(word, accent)`，面板与跟打条都跟 `settings.accent` 走；两支都缺才退回合音标且不加 `AmE:`/`BrE:` 前缀 |
| G9 词库徽标 | 已实现 | `feat/d3-dicticon`：`dictBadge(meta)` 纯函数 + `DictBadge` 组件（20/28 两档），371 个库 0 条落到 `?`，零图片零 base64 |
| G10 长句跟打排版 | 已实现 | `feat/d2-barwrap2`：`wrapWord` + `fitWordStyle` + `WordLetters`，八档缩字号、最多三行、字母索引跨行连续 |
| 面板「自动打」按钮 | 已移除 | `feat/d0-noauto`：不是上游行为，且让人以为插件替自己打字；定时器与死键一并清掉 |

## 3. 待办（按性价比排）

| # | 项 | 状态 | 分支 | 断言 |
| --- | --- | --- | --- | --- |
| G1 | 结算页「本轮错词清单」+「继续下一章」 | 已合入 | `feat/g1-result` | `wordsOfRound` / `nextChapterIndex` / `ResultScreen`（29） |
| G2 | 实时速度（打字中显示 WPM） | 已合入 | `feat/g2-speed` | `calcLiveWpm` / `windowedWpm` / `pushSpeedSample`（19） |
| G3 | 词表抽屉（本章 20 词 + 跳转） | 已合入 | `feat/g3-wordlist` | `wordListRows` / `WordListPanel`（24） |
| G4 | 首字母提示（打错第 3 次起逐档） | 已合入 | `feat/g4-tip` | `tipState` / `tipKey` / `nextWrongCount`（43） |
| G5 | 指法图示（纯 SVG 键盘） | 已合入 | `feat/g5-finger` | `fingerOf` / `keyHighlight` / `fingerKeyboardNode`（44） |
| G6 | 译义朗读 | 已合入 | `feat/g6-readzh` | `shouldReadMeaning` / `meaningLang` / `speakMeaning`（17） |

做法：六个子 agent 各开一个开发分支并行开发，主 agent 逐个合并（冲突按并集处理），合并后统一跑测试。

## 4. 验收

- 每条「已实现」都能在 `client.js` 找到导出，并在 `test-client-logic.mjs` 有断言。
- v0.7.0 新增：`inspectWord` / `phoneticOf`（82 条）、`dictBadge` / `badgeText` 等（46 条）、
  `wrapWord` / `fitWordStyle` / `wordLines`（29 条）、去自动打（5 条）、审计脚本纯函数（含在 82 条内）。
- 测试总数：655 → **840**（四个分支合入，冲突按并集并修掉合并暴露的两个实例串用问题）。
