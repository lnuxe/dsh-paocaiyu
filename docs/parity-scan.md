# 与上游 qwerty-learner 的功能对照扫描

> 更新：2026-11-25 · 审计写于 `v0.7.2`，随 `v0.8.0` 一起发布 · 对照上游 `qwerty-learner@master`
> v0.6.0 记：G1–G6 全部落地，缺/部分两栏清零。
> v0.7.0 记：数据完整性（G7）与三处体验（G8–G10）落地，词库丢词率 0.415% → 0.043%。
> v0.7.2 记：**逐文件读代码复审**（不再拿上一轮的列表对答案）——推翻「缺/部分全清零」，
> 清出 **缺 16 条 + 部分 11 行**，全部记在 §5。本轮只出审计，不动 `client.js`；
> `v0.8.0` 已先修掉其中的 N23（错词本/结算页音标不显示）。
> 方法：逐个核对上游 `src/pages/Typing/components/*`、`src/components/*` 与插件 `client.js` 的实现/导出，
> 再用纯函数测试钉住结论。判定口径：**已实现**＝有代码且有测试；**部分**＝有入口但缺关键能力；**缺**＝没有。

## 1. 结论

v0.7.2 换口径：**按「上游一个可点的交互 / 一个能改的设置项」拆行**，不看上一轮清单。
所以数字不能和 v0.7.0 相减——v0.7.0 是**按组件**数（32 项，其中 G1–G6 是我们自研，上游没有对应行），
v0.7.2 是**按能力**数：§2.1–2.5 共 34 行 + §2.6 十行「不做」+ §2.7 六项历史待办，
另 §2.8 是 22 个上游设置项的单独对照。

| 状态 | v0.7.0（按组件） | **v0.7.2（按能力）** |
| --- | --- | --- |
| 已实现 | 32 | **25**（表内 19 行 + §2.7 六个 G） |
| 部分实现 | 0 | **11 行 / 10 条** |
| 缺失 | 0 | **16 条** |
| 明确不做 | 6 | **10** |
| 另一分支在做 | — | 1（键盘错误次数排行） |
| 改判出表 | — | 1（`TipAlert`：上游同名组件不是这回事） |

怎么读这四栏（**不是一个集合，别相加**）：

- **§2.1–2.5 的 34 行** = 19 已实现 + 11 部分 + 2 缺（`N11` 插件冲突告警、`N14`+`N15` 发音音量/循环）
  + 1 另一分支 + 1 改判；
- **部分 11 行 / 10 条**：`N3`（快捷键集合）同时在「StartButton」和「快捷键说明」两行出现，
  所以行数比条数多 1；
- **缺 16 条** = `N11`–`N26`，逐条在 §5.2；其中只有 2 条落在 §2.1–2.5，其余是**设置项或组件内部行为**
  （§2.8 里标 `❌` 的那几行），这也是上一轮按清单核对时最容易漏的一类。

复审判定：**「有代码」不等于「点得出来」**。v0.7.0 判「已实现」的行里，有 11 行读完全部上游文件后
被降级——入口在，关键能力不在；还有 1 行（`TipAlert`）是**同名不同物**，我们一直以为自己实现了它。

## 2. 逐项对照

### 2.1 打字与判定（ENGINE）

| 上游 | 状态 | 我们这边 |
| --- | --- | --- |
| `Word` 逐字判定、打错标红抖动 | 已实现 | `judgeTyping` / `pushChar`，`state.flash` + `data-flash` |
| `WordPanel` 大字 + 音标 + 中文 | 已实现 | `.qat-word` / `.qat-ipa` / `.qat-gloss-zh` |
| `WordDictationSwitcher` 默写模式（隐词/隐字母） | 已实现 | `DICTATION_MODES` + `maskLetters` |
| `PrevAndNextWord` 上一词/下一词 | **部分（v0.7.2 改判，见 N4）** | `←` / `→` 能跳，`stepIndex(±1)`；但上游是「上一个/下一个单词**预览区**」（词 + 释义 + 点击跳转 + `isShowPrevAndNextWord` 开关），我们没有预览 |
| `LoopWordSwitcher` 循环单词 | **部分（v0.7.2 改判，见 N2）** | `J` 只能开关循环，没有上游的 1 / 3 / 5 / 8 / 无限 次数选择 |
| `StartButton` / `Progress` | **部分（v0.7.2 改判，见 N3 / N19 / N25）** | 整本词库连续打，进度 `1/2607`；缺 Enter 快捷键、缺中途 Restart、缺可视化进度条 |
| 大小写 / 标点宽容 | 已实现 | `caseSensitive` / `ignorePunct` |
| 暂停（失焦/切页自动暂停） | 已实现 | `P` + `visibilitychange` |

### 2.2 发音与音效

| 上游 | 状态 | 我们这边 |
| --- | --- | --- |
| `usePronunciation` 有道词典音频 | **部分（v0.7.2 改判，见 N10）** | `pronunciationSrc` 只有 `us` / `uk` / `ja` / `zh`；`de` / `id` / `kk` / 罗马字四种没有（假名词库会把罗马字当英文发 `type=2`） |
| 换词自动发音 | 已实现 | `speak` + `settings.voice` |
| `PronunciationSwitcher` 美音/英音切换 | **已实现（v0.5.0）** | `settings.accent` + `resolveAccent` |
| `SoundSwitcher` 键音 | **部分（v0.7.2 改判，见 N1）** | `playClick` + `settings.sound`：一套合成音，没有上游的 3 套音效资源、没有音量、没有对/错提示音的独立开关 |
| 译义朗读（`isTransRead`） | **已实现（v0.6.0）** | `speakMeaning` / `shouldReadMeaning` / `meaningLang`，默认关，`settings.readMeaning` |
| `WordPronunciationIcon` 手动点读 | 已实现 | 面板 `qat-speak` 按钮 + `Ctrl/⌘+J` 重读；跟打条只保留自动发音 |
| `PronunciationSwitcher` 循环发音 / 音量 / 倍速 | **缺（v0.7.2 新增，见 N14 / N15）** | `isLoop` / `volume` / `transVolume` / `rate` 四个上游设置项一个都没有 |

### 2.3 记录与统计（DATA）

| 上游 | 状态 | 我们这边 |
| --- | --- | --- |
| `db`（Dexie）记录 | 已实现 | IndexedDB v2：`wordRecords` / `chapterRecords` / `progress` |
| `ErrorBook` 错词本 | **部分（v0.7.2 改判，见 N8）** | `WrongBookPanel` + `collectWrongWords`：有搜索 / 排序 / 词典筛选 / 掌握标记；缺单条删除、行详情弹窗（平均用时 / 练习次数 / 正确次数 / 词间翻页）、分页、`.xlsx`/`.csv` 导出 |
| `Analysis` 统计页 | **部分（v0.7.2 改判，见 N7）** | `StatsPanel`：近 14 天柱 / 周热力 / 易错字母 / 键盘热力；缺「过去一年练习次数热力图」「练习词数热力图」「WPM 趋势折线」「正确率趋势折线」 |
| `KeyboardWithBarCharts` 键盘错误次数排行 | **另一分支在做** | 上游 `src/pages/Analysis/components/keyboard.ts`；本表不计入四栏，避免重复做 |
| 已掌握标记 | 已实现（上游没有） | `toggleMastered` |
| `ResultScreen` 结算页 | **部分（v0.7.2 改判，见 N6 / N22）** | `ResultScreen`：成绩 + 本轮错词胶囊 + 重练错词 + 继续下一章（末章绕回）+ 重开；缺「默写本章节」（Shift+Enter）、缺 `ConclusionBar` 分档结语、缺撒花、缺复习模式的「练习其他章节」出口；导出成绩仍不做 |
| `Speed` 实时速度 | **部分（v0.7.2 改判，见 N5）** | `calcLiveWpm` / `pushSpeedSample` / `windowedWpm`，8 秒窗口 + 1 秒心跳；但上游那 5 格里 **「时间 mm:ss」我们没有**（`activeMs` 一直在算，只是没画出来） |
| `WordList` 词表抽屉 | **部分（v0.7.2 改判，见 N9 / N20）** | `WordListPanel` + `wordListRows`：本章 20 词、状态、点行跳词；缺「点行发音」，假名不是逐字 `<ruby>` 注音 |

### 2.4 输入与提示

| 上游 | 状态 | 我们这边 |
| --- | --- | --- |
| `TipAlert` 打错后的提示（首字母） | **改判：上游没有这个功能（v0.7.2，见 §5 附注 B）** | `tipState` / `tipKey` / `nextWrongCount` 是我们**自研**的首字母提示（3 次首字母、4 次两字母、5 次留最后一个），不算 parity。上游同名组件 `TipAlert` 是**插件冲突告警**，见下一行 |
| `Word/TipAlert.tsx` 插件冲突告警 | **缺（v0.7.2 新增，见 N11）** | 上游在「第 1 章第 1 个词打错 ≥3 次」时弹「插件冲突！请关闭相关插件或换浏览器」；我们什么也不提示 |
| `HandPositionIllustration` 指法图示 | **已实现，形态不同（v0.7.2 复核，见 §5 附注 A）** | 我们：自绘 `FingerHint` 常驻 26 键 SVG + 八指分区配色 + 高亮下一个键，`settings.showFinger` 默认关。上游：工具栏按钮 → 弹窗看 `standard_typing_hand_position.png` 标准指法大图。**能力等价，形态不同** |
| 快捷键说明 | **部分（v0.7.2 改判，见 N3）** | 设置页 `hotkeysList` 有说明，但键位集合和上游差 4 个（Enter / Ctrl+V / Ctrl+Shift+V / 按住 Tab） |
| 真实 composer 输入 | 已实现（上游是隐藏 textarea） | 捕获阶段拦 keydown，不调 `submit()` |
| 输入法兼容 | 已实现 | `shouldStartOnTab` 的 `ownDraft`；不写任何编辑器属性 |

### 2.5 词库

| 上游 | 状态 | 我们这边 |
| --- | --- | --- |
| 371 词库 / 414,469 词 | 已实现 | `dicts.index.json` + 按需拉取 |
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
| `Switcher` 深色模式按钮（`Ctrl+D`） | 同因：宿主有主题开关，重复造会两边打架 |
| 结算页「导出本章成绩」`.xlsx`（`ResultScreen/exportWords`） | 宿主里下载没有落点，且 `xlsx` 是一个 2MB 级依赖，为一张表不值得 |
| 埋点 `mixpanel` / `trackEvent` | 宿主没有埋点通道，也不该把练习数据往外发 |
| `Mobile` 竖屏版 | 宿主是桌面 Web |
| 站点外壳 `Header` / `Footer` / `Layout` / `Loading` / `InfoPanel` / `EnhancedPromotionModal` | 宿主 chrome；重复造会和宿主容器抢层级 |
| 云同步 / 账号进度 | 上游也没有账号体系，全靠本地 |

### 2.7 数据与体验（v0.7.0）

| 项 | 状态 | 分支 / 结论 |
| --- | --- | --- |
| G7 词库与单词完整迁移 | 已实现 | `feat/d1-data`：长度上限 40→200、`zh \| notation` 有一即可入库、`inspectWord` 四桶丢因、`npm run audit`。371 库 414,469 条 → 保留 414,289 条（丢 0.043%），IELTS-oral-900 900/900、平假名/片假名各 280/280 |
| G8 音标按口音分美音/英音 | 已实现 | `feat/d1-data`：`phoneticOf(word, accent)`，面板与跟打条都跟 `settings.accent` 走；两支都缺才退回合音标且不加 `AmE:`/`BrE:` 前缀 |
| G9 词库徽标 | 已实现 | `feat/d3-dicticon`：`dictBadge(meta)` 纯函数 + `DictBadge` 组件（20/28 两档），371 个库 0 条落到 `?`，零图片零 base64 |
| G10 长句跟打排版 | 已实现 | `feat/d2-barwrap2`：`wrapWord` + `fitWordStyle` + `WordLetters`，八档缩字号、最多三行、字母索引跨行连续 |
| 面板「自动打」按钮 | 已移除 | `feat/d0-noauto`：不是上游行为，且让人以为插件替自己打字；定时器与死键一并清掉 |

### 2.8 设置项对照（v0.7.2 新增）

上游把「用户能改的东西」全放进了 `src/store/index.ts` 的 atom，所以这张表就是**最完整的
用户可感知能力清单**——比按组件对更不容易漏，也是这轮能清出 16 条缺的主因。

`✅` 有且等价 · `⚠` 有入口但缺关键能力（见 §5 编号）· `❌` 没有 · `—` 明确不做。

| 上游 atom | 默认值 | 我们 | 说明 |
| --- | --- | --- | --- |
| `currentDictId` / `currentChapter` | `cet4` / `0` | ✅ | `readDictId` / `writeChapterPos` |
| `phoneticConfig.isOpen` | `true` | ✅ | `settings.showIpa` |
| `phoneticConfig.type` | `us` | ✅ | `settings.accent`，`phoneticOf` 按它挑支 |
| `pronunciationConfig.isOpen` | `true` | ✅ | `settings.voice` |
| `pronunciationConfig.type` | `us` | ⚠ N10 | 只有 `us`/`uk`；`de`/`id`/`kk`/`romaji` 没有 |
| `pronunciationConfig.isTransRead` | `false` | ✅ | `settings.readMeaning` |
| `pronunciationConfig.isLoop` | `false` | ❌ N15 | 循环朗读当前词 |
| `pronunciationConfig.volume` / `transVolume` / `rate` | `1` / `1` / `1` | ❌ N14 | 发音/释义音量、播放倍速 |
| `keySoundsConfig.isOpen` | `true` | ✅ | `settings.sound` + `playClick` |
| `keySoundsConfig.isOpenClickSound` / `volume` / `resource` | `true` / `1` / 第 1 套 | ⚠ N1 | 无音量、无 3 套音效资源 |
| `hintSoundsConfig.*`（对/错提示音各一套） | 开 | ⚠ N1 | 有 `CLICK_TONES` 合成音，但只有总开关 |
| `fontSizeConfig.foreignFont` / `translateFont` | `48` / `18` | ❌ N13 | 字号写死在 CSS（`.qat-word` 52/64px） |
| `randomConfig.isOpen`（章节乱序） | `false` | ❌ N12 | 每章打乱顺序 |
| `isIgnoreCase` | `true` | ✅ | `settings.caseSensitive`（同义反写） |
| `isShowPrevAndNextWord` | `true` | ⚠ N4 | 有跳词按钮，无上下词预览区 |
| `isShowAnswerOnHover` | `true` | ❌ N16 | 默写时鼠标悬停显答案 |
| `isTextSelectable` | `false` | ❌ N17 | 单词允许选中复制 |
| `wordDictationConfig.isOpen` / `type` | `false` / `hideAll` | ✅ | `settings.dictation`：none / hideAll / hideVowel / hideConsonant / randomHide |
| `wordDictationConfig.openBy` | `auto` | ❌ N26 | `auto` 时打完自动关默写，我们关了还留着 |
| `loopWordConfig.times` | `1` | ⚠ N2 | 只有开关，无 1/3/5/8/∞ |
| `isOpenDarkMode` | 跟随系统 | — | 宿主有主题 |
| `isShowSkip` | 运行时 | 更好 | 上游要错 4 次才给 Skip，我们常显 |

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
流程（worktree 开工 / brief 六要素 / 冲突三类坏法 / 验证门槛 / 收尾）见 [`docs/multi-agent-flow.md`](multi-agent-flow.md)。

## 4. 验收

- 每条「已实现」都能在 `client.js` 找到导出，并在 `test-client-logic.mjs` 有断言。
- v0.7.0 新增：`inspectWord` / `phoneticOf`（82 条）、`dictBadge` / `badgeText` 等（46 条）、
  `wrapWord` / `fitWordStyle` / `wordLines`（29 条）、去自动打（5 条）、审计脚本纯函数（含在 82 条内）。
- 测试总数：655 → **840**（四个分支合入，冲突按并集并修掉合并暴露的两个实例串用问题）。
- v0.7.2 复审（本轮，**只加审计，不改 `client.js`**）：
  - `node --check client.js` 通过；
  - `node test-client-logic.mjs` → **ALL PASS — 860 条**（840 + 新增 14 条音标审计断言）；
  - `node scripts/audit-dicts.mjs --upstream <dicts> --top 6` 输出格式与断言不变；
  - 新增 `node scripts/audit-phonetic.mjs`（四情形 / 覆盖率 / 「有字段却没显示」）与
    [`docs/phonetic-gaps.md`](phonetic-gaps.md)；
  - 复审方法：读上游 `src/pages/Typing/**`（含 `components/Word/*`、`Setting/*`、`ResultScreen/*`）、
    `src/pages/Analysis/**`、`src/pages/ErrorBook/**`、`src/components/**`、`src/hooks/**`、
    `src/utils/**`、`src/store/index.ts`（atom 全表），再回 `client.js` 逐个找对应实现。
    **判定只问一句「用户点得到吗」**，不看 v0.7.0 的清单——那一轮是拿清单对答案，所以漏了 16 条。

## 5. v0.7.2 复审

### 5.0 这轮为什么能清出东西

v0.7.0 的「缺/部分全清零」是**按上一轮的待办清单核对**得出的：清单里写了 G1–G6，这六项都合入了，
于是结论写「清零」。这轮改成**按上游文件树逐个读**，问的是「这个文件里的交互，用户在我们这儿点得到吗」，
于是：

1. 上游 `src/store/index.ts` 里 22 个配置 atom，我们只对上了 11 个 → 一次暴露 8 条缺；
2. 上游同名组件 `TipAlert` 是**插件冲突告警**，被我们误当成「首字母提示」→ 一条**同名不同物**的假实现；
3. 组件级判定会把「有入口」当成「有功能」（有 `←`/`→` 就算有上下词预览、有开关就算有循环次数）→ 11 行降级；
4. 反过来的漏判：上游 `Word/Notation.tsx` 的 `<ruby>` 逐字注音、`ErrorBook` 的「点击行开详情」，
   都是组件内部行为，清单里根本不会出现。

### 5.1 部分（11 行 / 10 条：入口在，关键能力不在）

| # | 上游文件 | 能力 | 我们的现状 | 建议做法 | 工作量 |
| --- | --- | --- | --- | --- | --- |
| N1 | `hooks/useKeySounds.ts`、`Setting/SoundSetting.tsx`、`assets/sounds/*` | 键音 3 套资源 + 音量 + 对/错提示音独立开关 | 一套 `CLICK_TONES` 合成音（hit/miss/hint），只有总开关 `settings.sound` | 合成音不动，补 `settings.clickVolume` + 对/错各自开关；「3 套资源」用合成音做 3 组参数即可，不迁 mp3 | M |
| N2 | `LoopWordSwitcher/index.tsx` | 循环次数 1 / 3 / 5 / 8 / ∞ | `J` 只能开关，`loop` 是布尔 | `settings.loopTimes`（1/3/5/8/0=∞），`goLoop` 计数到上限自动前进；纯函数 `nextLoopCount` | S |
| N3 | `hooks/useHotkeys.ts`、`Typing/index.tsx` | 快捷键：Enter 开始/暂停、`Ctrl+V` 默写、`Ctrl+Shift+V` 释义、`Ctrl/⌘+Shift+←/→` 跳词、按住 Tab 偷看 | 只有 `Esc` / `⌘←` / `⌘→` / `⌘J` / `⌘P` | 扩 `resolveHotkey` 的 action 表（`toggleDictation` / `toggleZh` / `prevWord`）；Tab 见 N18 | S |
| N4 | `Typing/components/PrevAndNextWord/*` | 上一个/下一个单词预览区（词 + 释义 + 点击跳转 + 开关 `isShowPrevAndNextWord`） | 只有上一词/跳过两个按钮 | 面板头部加两格 `preview`，数据直接从 `words[index±1]` 取（不查库），开关进设置 | S |
| N5 | `Typing/components/Speed/index.tsx` | 实时格里的「时间 mm:ss」（与 WPM/输入数/正确数/正确率并列） | `activeMs` 一直在算（`clock.current.ms`），只有结算时用 | 条上 `qat-bar-time` 复用 `activeMs`，1 秒心跳已经在跑 | S |
| N6 | `ResultScreen/index.tsx`、`ConclusionBar`、`hooks/useConfetti.ts` | 「默写本章节」（Shift+Enter）、按错词数分档的结语、撒花 | 有 重练错词 / 重开 / 下一章；`dictation` 是设置项，结算页不提供「带着默写重打」 | `onRestart` 加一个 `dictation` 参数；结语按 `mistakes/words` 分 3 档纯文本；撒花用 CSS 动画（无 canvas），`prefers-reduced-motion` 关掉 | M |
| N7 | `Analysis/components/HeatmapCharts`、`LineCharts`、`hooks/useWordStats.ts` | 过去一年「练习次数」热力图 + 「练习词数」热力图 + WPM 趋势 + 正确率趋势 | `StatsPanel` 只有近 14 天柱 / 周热力 / 易错字母 / 键盘热力 | 热力两档复用现有 `dayKey` 聚合（`chapterRecords` 已有 `date`/`wpm`/`accuracy`），折线用 SVG path；先做 WPM 折线（数据已有） | M |
| N8 | `pages/ErrorBook/**`（`RowDetail` / `RowPagination` / `DropdownExport`） | 单条删除、点击行开详情（平均用时 / 练习次数 / 正确次数 / 错误次数 / 词间翻页）、分页、`.xlsx`/`.csv` 导出 | 有搜索 / 排序（次数·最近）/ 词典筛选 / 掌握标记；列表一次全渲染 | 删除 + 详情已有全部数据（`wordRecords` 的 `mistakeCount`/`rightCount`/`time`），做弹窗即可；导出走 csv（`xlsx` 属「明确不做」） | L |
| N9 | `Typing/components/Word/Notation.tsx` | 假名/哈拼按 `汉字(かんじ)` 拆成 `<ruby><rt>` 逐字注音 | 纯文本副行（`.qat-gloss-notation`） | 只在 `notation` 里出现 `(...)` 时切 ruby，纯假名原样输出；纯函数 `notationParts(text)` 可测 | S |
| N10 | `hooks/usePronunciation.ts`、`utils/kana.ts` | 8 种语言的发音（`de` / `id` / `kk`→`le=ru` 兜底 / 罗马字→平假名 `le=jap`） | `pronunciationSrc` 只有 `us`/`uk`/`ja`/`zh`；假名词库的罗马字被当英文发 | 纯函数 `romajiToHiragana`（五十音表 + 拗音，可测）+ `pronunciationSrc` 补 `de`/`id`/`kk`/`romaji` 分支 | M |

### 5.2 缺（16 条：上游能点，我们完全没有）

| # | 上游文件 | 能力 | 我们的现状 | 建议做法 | 工作量 |
| --- | --- | --- | --- | --- | --- |
| N11 | `Typing/components/Word/TipAlert.tsx` | 第 1 章第 1 个词错 ≥3 次 →「插件冲突！请关闭相关插件或换浏览器」 | 无任何提示（用户会以为是自己不会打） | 复用现有 wrongCount，条件 `chapter===0 && index===0 && wrong>=3`；一条 `qat-tip` 文案即可 | S |
| N12 | `Setting/AdvancedSetting.tsx`（`randomConfig`） | 章节乱序（每章打乱） | 只有内置采样用的 `shuffle`，用户不可选 | `settings.shuffle` → 章节载入时 `shuffle(words)`（用种子 = 章号，保证重进一致） | S |
| N13 | `Setting/ViewSetting.tsx`（`fontSizeConfig`） | 外语字号 20–96、中文 14–60、一键重置 | 写死在 CSS（`.qat-word` 52px / panel 64px） | 面板与条上单词尺寸改 CSS 变量 `--qat-foreign`，设置页两个 range + 重置 | M |
| N14 | `Setting/SoundSetting.tsx` | 发音音量、释义音量、播放倍速 | 全默认（`new Audio()` 不设 volume/rate） | `speak()` / `speakMeaning()` 加 `{volume, rate}` 参数；3 个 range | M |
| N15 | `PronunciationSwitcher/index.tsx`（`isLoop`） | 循环朗读当前词 | 无（只有 `⌘J` 手动重读） | `settings.pronLoop` + `audio.loop`，换词时停 | S |
| N16 | `Setting/AdvancedSetting.tsx`（`isShowAnswerOnHover`） | 默写时鼠标悬停显示答案 | 无（只能按 Tab 档位提示） | 词上 `onMouseEnter` → 临时 `revealed`，移开还原；与默写模式联动 | S |
| N17 | `Setting/AdvancedSetting.tsx`（`isTextSelectable`） | 单词允许选中复制 | `.qat-word` 所在区域不可选（默认 `user-select` 被按钮样式带成 none） | `settings.selectable` → `user-select:text` | S |
| N18 | `Typing/components/Word/Translation.tsx` | 按住 Tab 偷看释义/答案 | 无 | `keydown/keyup` Tab 在 composer 内（`shouldStartOnTab` 已处理 Tab 起手，需先让位） | S |
| N19 | `StartButton/index.tsx`（hover Restart） | 中途重开本章 | 只有暂停/继续，重开只在结算页 | 条上加 `data-act="restart"`，复用结算页那条重置路径 | S |
| N20 | `WordList/components/WordCard.tsx` | 词表点卡片播放发音 | 点行只跳词 | 行内加 `qat-speak`，事件 `stopPropagation` | S |
| N21 | `ResultScreen/components/WordChip.tsx` | 结算页错词胶囊点一下听发音 | 胶囊只显示词 + 次数 | 同 N20 | S |
| N22 | `ResultScreen/index.tsx`（复习模式出口） | 从复习（`review`）进来时给「练习其他章节」 | 只有「下一章」，复习模式下会跳错地方 | `ResultScreen` 加 `onBackToDict`，仅 `review` 模式显示 | S |
| N23 | `pages/ErrorBook/RowDetail`、`ResultScreen/WordChip` | 错词本行 / 结算页胶囊显示音标 | **数据里有、界面不显示**（见 [`docs/phonetic-gaps.md`](phonetic-gaps.md) §4.1） | 两处都改成 `phoneticOf(lookup(word), settings.accent).text`，与面板同一函数 | S |
| N24 | `hooks/usePronunciation.ts`（`usePrefetchPronunciationSound`） | 下一词发音预取 | 无（换词才发请求） | 词变换时 `new Audio(src).preload='auto'`，失败静默 | S |
| N25 | `Typing/components/Progress/index.tsx` | 可视化章节进度条（百分比 + 三档配色） | 只有 `1/2607` 文本 | 现有 `state.index / words.length` 画一条 2px 进度条 | S |
| N26 | `wordDictationConfig.openBy === 'auto'` | 打完自动关默写（下一章恢复显示） | 默写开关跨章保留，用户常忘了关 | `settings.dictation` 加 `openBy`，章节切换时按它复位 | S |

### 5.3 附注

**A. 指法图示：不是缺口，是形态差异。**
上游 `HandPositionIllustration` 是「工具栏按钮 → 弹窗看 `standard_typing_hand_position.png`」；
我们是自绘 26 键 SVG 常驻（`settings.showFinger` 默认关）+ 高亮下一个键。
我们要的能力（哪根手指按哪个键）更直接，且不依赖 PNG 资源。若要贴齐形态，加一个弹窗壳即可（S），
**不列为缺口**。

**B. `TipAlert` 同名不同物——这条要先纠正文档，再决定做不做。**
上游 `Word/TipAlert.tsx` 只在「第 1 章第 1 个词、错 ≥3 次」时告警，内容是**插件冲突**提示，
不是提示首字母。我们的 `tipState` 三档首字母提示是**自研**（上游没有），所以：
- 我们的首字母提示 → 从 parity 表里摘出，记作「我们多做的」；
- 上游的插件冲突告警 → 变成 N11（缺）。

**C. 键盘错误次数排行（`KeyboardWithBarCharts` + `Analysis/components/keyboard.ts`）另一分支在做**，
本轮只标注、不重复实现；我们现有 `keyboardHeat` 是「按键热力」，缺的是「按错误次数排序的横向条形榜」。

### 5.4 下一步先做哪三件

1. **N23 + N5 + N25 + N11**（四个 S，一天内能全做完）：错词本音标、章节计时、进度条、插件冲突告警——
   都是「数据已经在手，只差一行渲染」；
2. **N13 字号 + N14 音量/倍速**（两个 M）：设置页最容易被用户先找的两项，也是「字太小/声音太大」的实际投诉点；
3. **N7 WPM 趋势折线**（M 的前半）：`chapterRecords` 里 `wpm`/`accuracy` 早就存着，画一条 SVG path 就有，
   比年热力图省一半事。
