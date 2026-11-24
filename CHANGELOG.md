# Changelog

本项目的所有重要变更都记录在这里。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

无

## [0.4.0] - 2026-11-24

自定义词表从「粘贴文本」扩展到「文件进出」，并修掉两个会让导入静默失效的解析限制。
自动化测试 **362 条全绿**（`npm run verify`）。

### Added · 自定义词表的文件导入 / 导出

- **三种文件格式**：`.txt`（一行一个词，沿用原解析器）、`.csv`（`word,meaning,ipa`，识别中英文表头、支持双引号包裹与 `""` 转义、全角逗号）、`.json`（数组 / `{words:[]}` / `{单词:释义}` 三种形状，兼容 `name|word|text` 与 `trans|meaning|zh` 字段名）
- **导入面板加了选文件**：选中后自动填进文本框并提示「解析出 N 个词」，名字留空就用文件名
- **导出**：自定义词库那一行右侧一个 `⤓`，导出成 `.txt`（`word 中文 /音标/`，可直接改完再导回来）
- **修了两个旧限制**：`normalizeWord` 现在认 `ipa` 字段（原来只认 `ukphone/usphone`），自定义词表允许**只给单词不给释义**（内置与网络词库仍要求有中文）

## [0.3.0] - 2026-11-24

词库来源从「内置 371 个」扩展到「内置 + 用户自己的词表」，并把练习产生的错误数据变成看得见的图。
自动化测试 **328 条全绿**（`npm run verify`）。

### Added · 键盘热力图 / 词库缓存管理

- **键盘热力图**：`keyboardHeat` 把已错的字母铺到 QWERTY 三行（10/9/7 键），按「本次最多的键」分 0–4 档上色，统计浮层里配合易错字母 chip 一起显示；大小写输入都归位
- **词库缓存管理**：设置页新增「词库缓存」一行，显示已缓存词库数与近似占用（`cacheStats` 读 IndexedDB `dicts` store），一键清理（`clearDictCache` 同时清内存缓存）；记录、设置、自定义词表都不动

### Added · 自定义词表

- **粘贴即用**：词库选择器底部「＋ 导入自定义词表」，一行一个词，支持 `word` / `word 中文` / `word,中文,/音标/` / Tab 分隔；`#` 与 `//` 开头的行当注释跳过，大小写去重，单表上限 2000 条
- **自成一类**：存 `qwerty-autotype:custom-dicts`，以 `custom:<名字>` 进目录、分类显示「自定义」，不需要网络，`loadDictWords` 直接命中本地
- **保存即开始**：导入成功后自动切到新词表；重名覆盖、`removeCustomDict` 可删
- **随备份迁移**：`customDicts` 进导出/导入，跨设备可带走（含音标，脏条目逐条丢弃）

## [0.2.0] - 2026-11-24

把 qwerty-learner 的完整单词与模块功能迁进来：全量词库、章节、记录、错词本、统计、备份、默写、快捷键与无障碍。
自动化测试 **279 条全绿**（`npm run verify`）。

### Added

- **全量词库**：内联 371 个词库的元数据索引（`dicts.index.json`，62KB，414,485 词），词条按需拉取并缓存
  - 加载链：内存 → 内置 7 库 → IndexedDB（`qwerty-autotype` / store `dicts`）→ jsDelivr → raw.githubusercontent
  - 归一化 `normalizeWord`：`ukphone` 优先、多音取第一支、`'` → `ˈ`、`trans[]` 合并清洗；`code` 词库不生成音标；日语假名保留
- **章节模型**：`CHAPTER_LENGTH = 20`、`chapterCount`、`wordsOfChapter`，面板可选章（`1 / 131`）
- **词库选择器**：面板内二级页 —— 搜索框 + 10 个分类 chip + 最近使用 + 词库列表（名称/词数/章数）
- 跟打条的词库下拉改为全量目录（按分类分组 + 最近使用分组），切换时异步加载并重新抽 20 词

### Added · 练习记录与统计

- **IndexedDB v2**：新增 `wordRecords` / `chapterRecords` / `progress` 三个 store（`qwerty-autotype` 库，`dicts` 缓存不动）
  - `recordWord` 每词一条（`word / dictId / chapter / at / wrongCount / timing`）
  - `recordChapter` 每章一条（`seconds / wordCount / wrongCount`），整章打完才写
  - `saveProgress` / `readProgress` 按 `${dictId}:${chapter}` 存进度与 `done`
- **纯聚合函数**：`dayKey`（本地自然日）、`aggregateDaily`、`summarize`、`lastDays`（补零到 N 天），给统计页与今日指标直接用
- **面板**：章节下拉对已完成的章标 `✓`；顶栏显示「今日 N 词 · 正确率 X% · Y WPM」
- **默写形态**：`none / hideAll / hideVowel / hideConsonant / randomHide`（`maskLetters`，打对后逐字现身）
- **发音**：单词旁 🔊（`speechSynthesis`，en-US / ja-JP 自动切）
- **判定选项**：`caseSensitive`（默认关）、`ignorePunct`（默认关，代码词库 `append()` 只打 `append`）
- **设置存储**：`qwerty-autotype:setting:*` + `useSyncExternalStore` 订阅，面板与跟打条实时同步

### Added · 错词本 / 统计 / 会话保持

- **会话存档**：`qwerty-autotype:session` 记住进行到第几个词（词库 + 章节 + 词表三项都一致才恢复），切面板/切会话回来接着打；打完或重开清空
- **实时指标**：卡片头显示 `WPM n` / `正确率 n%`，结果页显示 `WPM / 正确率 / 用时`
- **错词本**：面板「错词本」浮层，`collectWrongWords` 按 `(dictId, word)` 合并 `wrongCount`，按错次数降序；可「重练前 20」
- **统计**：面板「统计」浮层，近 14 天柱状（纯 div，不引图表库）+ 汇总 词数/章数/正确率/WPM
- **Tab 裁决抽成纯函数** `shouldStartOnTab`（空草稿 + 焦点在 composer + 无修饰键才接管），修掉了之前「草稿非空也抢 Tab」的旧条件

### Added · 暂停 / 快捷键 / 钉提交

- **暂停与失焦**：`activeMs` 累计有效练习时长；窗口失焦、切标签页、手动 ⏸ 都不计时，回来 `▶` 继续（手动暂停不会被焦点事件解除）
- **上一词 / 跳过 / 循环**：面板与跟打条都支持 `⏮ ⏭ 🔁`；循环模式原地重复当前词，不写进度
- **快捷键**（焦点在输入框时生效，其余键一律还给宿主）：
  - `Esc` 关闭 ｜ `Ctrl/⌘+←` 上一个 ｜ `Ctrl/⌘+→` 跳过 ｜ `Ctrl/⌘+J` 循环 ｜ `Ctrl/⌘+P` 暂停
  - `resolveHotkey` 是纯函数，修饰键不匹配就返回空串
- **词库来源钉提交**：上游没有 release tag，`build-index.mjs --pin <sha>` 把 commit 写进索引，客户端优先按 SHA 拉、失败回退 `master`；`--inline` 一步写回 `client.js`

### Added · 热力图 / 错词筛选 / 设置页

- **12 周热力图**：`heatmapWeeks` 生成列×7 天网格，`heatLevel` 按当日词数分 4 档，本周还没到的日子留空
- **错词本筛选**：关键词（单词或释义都搜）、按词库 chip 过滤、按错误次数 / 最近出错排序
- **结果页**：列出本轮打错的词，可「重练这些词」；章节练习打完还有「下一章」
- **设置页**：注册 `settings.section`（order 25），提供区分大小写 / 忽略标点 / 发音开关 / 默认默写形态四项，改完面板与跟打条实时生效

### Added · 备份 / 键音 / 键盘可操作

- **备份三件套**：设置页「数据」提供导出（下载 `qwerty-autotype-backup-YYYY-MM-DD.json`）、导入（文件选择 + 校验）、清空（点两次确认）
- **备份格式**：`{ kind, version, exportedAt, settings, wordRecords, chapterRecords, progress }`；`parseBackup` 校验 kind/version，逐条丢弃脏数据，不因一条坏记录整份失败
- **localStorage 降级**：IndexedDB 不可用或写入失败时，记录落 `qwerty-autotype:records-mirror`（上限 300 条），读取按 IndexedDB → 镜像回退
- **键音**：WebAudio 短音，打对 880Hz/50ms、打错 220Hz/120ms，设置页可关；无 WebAudio 环境静默返回
- **键盘可操作**：`pressable()` 统一给 span 按钮加 `role=button` + `tabIndex=0` + Enter/Space 触发，练习卡片与跟打条共 24 处；设置页列出全部快捷键

### Added · 易错字母 / 掌握标记

- **易错字母**：打错时记下「该打却没打对」的那个字母（`lettersRef`），章节结束写进 `chapterRecords.wrongLetters`；`topWrongLetters` 聚合出 Top5，统计浮层显示 `e ×5 · a ×3`
- **错词本掌握标记**：每行一个 ✓，切换存在 `qwerty-autotype:mastered`（`${dictId}:${word}` 集合）；已掌握的默认不出现，`showMastered` 可回看；不同词库同名词互不影响
- **备份覆盖掌握列表**：`mastered` 字段随导出走，导入恢复，清空时一起清；老备份缺这个字段也不报错

### Added · 读屏播报 / 焦点轮廓 / 卡片帮助

- **`aria-live` 播报**：卡片内一个 `.qat-sr` 的 `role="status"` 区域，只在打错（「请整词重打 cancel」）和完成（「本轮完成，共 20 个词」）时更新，不逐键朗读
- **`:focus-visible` 轮廓**：`.qat-btn` / `.qat-icon` / `.qat-chip` / `.qat-switch` 统一 2px 品牌色描边
- **卡片内 `?`**：展开/收起快捷键说明，带 `aria-expanded`
- 测试补 `collectCss` 助手，直接断言样式文本里真的有 `:focus-visible` 和 `.qat-sr`

### Changed

- 许可证 **MIT → GPL-3.0-only**（词库数据派生自 GPL-3.0 的 qwerty-learner），新增 `NOTICE`
- 测试 45 → **65 条**（新增目录完整性、章节、归一化、搜索、抽样）


## [0.1.0] - 2026-11-24

首个可用版本：侧栏左上角一个「⌨ 跟打」面板图标，对话里一条跟打条，判定语义对齐 qwerty-learner。

### Added

- 侧栏左上角面板图标（`sidebar.panellist`，order 5）：和「插件」面板同一排，点击切到跟打面板
- 跟打面板（`main` key `qwerty-autotype`）：词库下拉（按分类分组）+ 56px 大字 + 音标 + 中文 + 自带输入框
- 输入框正上方的跟打条（`conversation.input.dock`）：无边框无背景，宽度按 composer 正文实测宽度居中；词库下拉 + 34px 单词 + 音标 + `3/12 · ✓2 · ↻1` 与 ▶/⏸/↻/× 图标
- 在真实 composer 里打字：捕获阶段接管 `[data-composer-input]` 的 keydown，不另开假输入框
- 逐字母判定：打对变绿，打错变红 + 抖动并清空、整词重打；整词打对进下一个词；打超长忽略
- 音标与中文释义：中文写进 composer 草稿、显示在输入框里，收起时自动撤回；音标在单词下方
- 7 个词库共 560 词（CET-4 / CET-6 / 考研 / TOEFL / IELTS / 商务英语 / 代码练习），由 `scripts/build-dicts.mjs` 从 qwerty-learner 生成并内联，选择结果存 localStorage
- <kbd>Tab</kbd> 快速启动：输入框为空时在对话里按 Tab 直接开跟打条
- `/qwerty-autotype` 指令入口（`conversation.chat.commandview`）：指令行渲染同一张卡片；`/qwerty-autotype <自定义词>` 支持词表外的词
- 隐藏焦点守卫：练习期间输入框区域的回车 / 制表符 / `Cmd+Enter` 与发送按钮点击全部被吃掉，草稿发不出去
- 45 条测试（`test-client-logic.mjs`）：判定 / `pushChar` / 词库 / 渲染冒烟（一次性 React 桩真的调一遍组件），不需要浏览器

[Unreleased]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/lnuxe/qwerty-autotype-ui/releases/tag/v0.1.0