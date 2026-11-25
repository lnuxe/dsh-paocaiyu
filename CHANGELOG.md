# Changelog

本项目的所有重要变更都记录在这里。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.8.0] - 2026-11-25

四条并行分支各占一个 worktree 开发、主 agent 逐条合并：面板排版、上游键盘热力图、音标清洗与展示、缺口审计。
测试 846 → 995 条，`client.js` 373,947 → 396,157 字节。

### Fixed · 面板上「跟打」标题出现两遍

- 面板头部（`.qat-panel-title`）和面板内嵌的跟打卡片（`.qat-title`）各画了一次 `t('title')`，
  顶部竖着两行「跟打」
- 卡片头部那一格改成 `.qat-headtag`：面板里显示「第 N 章」/「复练 N 词」，跟打条仍是原标题；
  分隔符与指标顺序不变，标题在面板页面只出现一次

### Fixed · 错词本行、结算页错词胶囊把音标丢了（N23）

- `lookup()` 早就带回音标，这两处只画了「单词 + 释义 + 次数」，是纯展示遗漏
- 补 `.qat-wrongipa` / `.qat-mistake-ipa`，跟着 `settings.accent` 走，没音标的词不占位

### Changed · 释义按词条分行（面板），词性单独淡色小字

- 上游 `trans[]` 是 `join('；')` 的一整串，面板上挤成一坨读不动
- 新增纯函数 `splitSense` / `splitSenses` / `sensesOf`：剥词性（`n.` `vt. & vi.` `adj.` …、
  尾部括号 `(n.)`、中段 `… 文件 vt. 列队`），一条释义一行，最多三条，多的收成「+N」
- 面板音标比释义小一号、更淡；跟打条仍是单行拼接（`nowrap` + 省略号），不换行
- 老 IndexedDB 缓存没有 `senses` 字段时按 `zh` 现拆（`LOOKUP_MEMO` 一词只拆一次）

### Added · 上游 Analysis 页的键盘热力图，用纯 SVG 重画

- 上游是 `keyboard.ts` 的 26 键 GeoJSON + echarts geo-map/bar 双视图，我们不引图表库：
  `keyLayout()` 给出真实键盘的三行偏移（`q` 行 0 格、`a` 行 5 格、`z` 行 10 格，键宽 10 / 间距 1），
  一个 `<svg>` 里 26 个 `<rect>`，颜色按打错次数分 4 档，键上小字写次数
- 键盘 / 次数排行两个视图可切（对齐上游 toolbox 互切），排行取 top 10 横向条形，带空态
- 键帽底色按 `FINGER_COLORS` 淡染手指分区，有打错的键按错误色深浅覆盖

### Added · 音标真的洗干净了，口音前缀分开画

- 上游 `public/dicts` 里 11.75%（69,229 / 589,221）的音标字段是脏的：外层 `/` 15,072、
  方括号 36,884、空串 9,204、多音 `;` 7,944、一支两音 `bɑ:θ/bæθ` 39
- `cleanPhone()` 统一剥壳、全角转半角、压空格，渲染层只套一层 `[ ]`；`bracketPhone` 兜旧数据
- `phoneticOf()` 的 `text` 只放音标体，`label` 单独给 `AmE` / `BrE`；两支都缺退回合并 `ipa` 时
  label 为空（`route` 这种实际英音不会被标成 `AmE`）；非英文词库不加前缀

### Added · 缺口复审与音标缺口两份审计

- `docs/parity-scan.md` 加 §2.8（上游 22 个设置 atom 逐个对照）与 §5：已实现 25 / 部分 10 / 缺 16 /
  明确不做 10。推翻 v0.7.0「清零」的结论 —— 那轮是拿清单对答案
- `docs/phonetic-gaps.md` + `scripts/audit-phonetic.mjs`：371 库 414,289 条，音标覆盖 69.94%
  （289,774），两支都有 277,093 / 只美音 5,538 / 只英音 7,143 / 都没有 124,515 / 只有假名 33,143；
  英语 303 库里 82 个整库 0%（上游 JSON 连 `usphone` 键都没有）
- `scripts/scan-phone-shapes.mjs`：脏音标形态分布，需 `--upstream` 或 `QAT_UPSTREAM`，仓库不留本机路径

## [0.7.1] - 2026-11-25

0.7.0 合并之后的收尾：把合并暴露的三处问题修掉，并给「插件装配」补了一道以前没有的闸门。

### Fixed · 长句的 CSS 不再跟 `fitWordStyle` 抢字号

- d1 给长句加了 `.qat-word[data-long="true"]{font-size:22px}` / `18px`，d2 的 `fitWordStyle` 把字号算好写成
  inline style —— inline 赢，所以那两条 `font-size` 一直是死的；但同一行里的 `flex-wrap:wrap` 活着，
  而多行容器是 `flex-direction:column`，一 wrap 就把三行排成三列
- 现在长句规则只留 `line-height` / `letter-spacing` / `gap` / `text-align`，字号与断行全归 `fitWordStyle`

### Fixed · 目录条数按真实词条校正（414,485 → 414,469）

- 上游 `dictionary.ts` 的 `length` 是手写的，8 个日语库虚高（去重前计数）：`japanese006` 3477→3473、
  `japanese005` 1836→1834、`japanese003` 635→634、`japanese002` 670→669，各带一份 `-zh`，合计多算 16 条
- 章节数 `ceil(length/20)`、进度分母、面板「N 词」都挂这个字段，所以末章会少算、进度条末端永远差一点
- `build-index.mjs` 加 `--count`：读 `public/dicts` 的真实条数覆盖声明值并逐库打印差异；
  `npm run index:inline` 默认带上它，避免下次重新生成又退回手写值

### Changed · 清掉合并遗留的死代码（client.js 374,896 → 373,947 字节）

- `FALLBACK_DICT`（兜底早改成 `builtinDicts()` / `LEXICON`）、跟打条里的 `chooseDict`
  （条上没有词库选择器）、`chaptersOf`（章节信息现算），以及两处 `const chars = target.split('')`
  （渲染被 `WordLetters` 接手后无用）

### Added · `npm run smoke`：装配冒烟

- `scripts/smoke-apply.mjs` 把 `client.js` 过一遍 `__ModuleLoader__`、用 React 桩调 `apply(ctx)`，
  核对注册的 **5 个 slot**（`sidebar.panellist` / `main` / `conversation.input.dock` / `settings.section` /
  `conversation.chat.commandview`）、2 份 i18n（zh/en 各 140 key）、`locale/change` 监听，
  并要求每个 slot 的 `render` 都给出非空节点
- 纯逻辑测试抓不到「apply 里少写一个 slot」——那种错在浏览器里是「按钮不见了」，在测试里却全绿
- `npm run verify` 串上 smoke：`check → test(846) → smoke`
- 断言 840 → 846（长句 CSS 回归 5 条 + 日语库 length 校正 1 条）

### Docs

- 新增 `docs/multi-agent-flow.md`：worktree 开工、给子 agent 的 brief 六要素、交接必须带的偏差说明、
  冲突按并集之后要复查的三类坏法、发版验证门槛、分支与工作树收尾、同仓库双 session 的风险
- README 开发段补 `npm run audit` / `npm run smoke`，断言条数 677 → 846

## [0.7.0] - 2026-11-25

四个子 agent 各开一个开发分支（`feat/d0-noauto`、`feat/d1-data`、`feat/d2-barwrap2`、`feat/d3-dicticon`），
主 agent 逐个合并，冲突一律按并集并修掉合并暴露出的真问题。这一版把「迁移得对不对」从感觉变成数字：
丢词率 **0.415% → 0.043%**，每个词库有徽标、每支音标按口音显示，雅思整句不再挤出条外，面板不再有「自动打」。

### Data · 词库与单词完整迁移（丢词率 0.415% → 0.043%）

- **词条长度上限 40 → 200**（`MAX_WORD_LENGTH`）。上游最长的一条词是 177 字符的雅思口语句子
  （`I'm taking the IELTS test because I want to study overseas.`），旧上限把 **`IELTS-oral-900` 900 条砍掉 891 条**；
  `word_roots1`（3–4 个词连写，如 `abyss achromatic anhydrous`）丢 22 条、`archVocabulary` 丢 6 条，一并回来
- **假名词库整库入库**：`JapaneseHiragana` / `JapaneseKatakana` 的词条形如
  `{"name":"aiueo","trans":[],"notation":"あいうえお"}`——没有中文释义但有假名。旧逻辑「无中文即丢弃」
  把两库 **各 280 条全砍**。现在 `zh || notation` 有一即可入库，假名当副行显示在单词上方（对齐上游 `Notation`）
- 词条形状扩为 `{ w, ipa, us, uk, zh, notation? }`，`lookup()` 原样带出 `us` / `uk` / `notation`；
  老的 IndexedDB 缓存只有 `ipa`，三个字段为 `undefined`，不失效、不报错，自动退回 `ipa`
- 归一化拆成 `inspectWord(raw, lang, opt) → { ok, reason, word }`（`normalizeWord` 变成它的薄壳），
  丢弃原因分为 `empty / tooLong / badChars / noZh` 四桶，可按桶统计
- 新增 `scripts/audit-dicts.mjs`（`npm run audit`）：拿 `dicts.index.json` 的 371 个库、414,469 条原始词条，
  用**插件自己的归一化逻辑**跑一遍，逐库列出原始/保留/丢弃与四种丢因、音标覆盖率。纯函数部分 `auditRows`
  等也进了测试，口径本身有断言钉住
- 复盘：剩下的 180 条（0.043%）是 `empty` 3 条（上游 name 缺失或只有空格，如 `{"trans":["v. 拒绝"]}`）
  + `noZh` 177 条（既无释义也无假名，如 `TOEIC` 47、`Oxford5000` 41）
- **目录条数校正**：上游 `dictionary.ts` 手写的 `length` 有 8 个日语库虚高（`japanese006` 声明 3477、实际 3473，
  `japanese002` 670/669，`japanese003` 635/634，`japanese005` 1836/1834，加各自 `-zh` 一份），
  合计比真实条数多 16。`build-index.mjs` 加 `--count`：直接数 `public/dicts` 的真实条数并覆盖声明值，
  现在目录总数 **414,469** 与实际逐条数出来的完全一致（章节数、进度、总词数都挂在这个字段上）
- 详见 [`docs/dict-audit.md`](docs/dict-audit.md)

### Feat · 音标按口音分美音 / 英音

- 上游 `Word` 是 `{ usphone, ukphone }` 两个字段，`Phonetic` 按设置显示 `AmE: [...]` 或 `BrE: [...]`；
  插件以前把两者合并成一个 `ipa`（`ukphone || usphone`），**口音开关只换音频、显示的音标从来不变**
- 新增纯函数 `phoneticOf(word, accent) → { text, label }`：`accent = uk` 取 `uk`、缺了退 `us`；
  `accent = us` 取 `us`、缺了退 `uk`；两支都缺才退回合并的 `ipa`（此时**不加** `AmE:` / `BrE:` 前缀，
  避免给 `route /ruːt/` 这种实为英音的词打上假的美音标签）
- 面板的 `judgeOptions` 补上 `accent`，改设置立刻重渲染；跟打条同样按 `settings.accent` 取

### Feat · 371 个词库每个都有矢量徽标

- 新增纯函数 `dictBadge(meta) → { text, tone, title }`，零映射表、零图片、零 base64，`text` 恒为 1–2 字符：
  字母+数字（`CET-4`→`C4`、`GRE3000`→`G3`）→ 名字末尾 1–2 字母独立字段（`RAZ 分级阅读 AA`→`AA`）→
  两字以上中文片段（`考研`→`考研`、`平假名`→`平假`）→ ASCII 缩写（`IELTS`→`IE`、`jsObject`→`JO`）→ 中文首字
- `tone` 只认 `en` / `ja` / `zh` / `code` / `other`（`de`/`kk`/`id` 归 `other`），五套色相全走主题变量 +
  `color-mix`；**371 个库实测 0 条落到 `?`**
- 新组件 `DictBadge({ meta, size, label })`（`size` 只认 20 / 28，CSS 定尺寸不写 inline style），
  接进词库选择器每一行（28）与面板头部词库按钮（20），分类标题不加

### Feat · 长句在跟打条里缩字号 + 断行

- 跟打条是 composer 上方一条横带、字号固定 52px 且不换行，177 字符的雅思句子直接溢出被裁
- 新增 `wrapWord(text, maxChars)`：按空格断行、**不切词**，空格跟着前一个词，断行拼回去与原串逐字一致；
  单个超长无空格串才按字符硬断
- 新增 `fitWordStyle(text, width, { maxLines })`：八档字号 `[52,44,36,30,25,21,18,16]` 逐档下探，
  每档按 `0.62 × 字号` 估算每行容得下几个等宽字符，放得进 `maxLines` 就停；最小字号仍放不下也不截断
- 新组件 `WordLetters` 统一三处渲染：单行仍是原来的 `.qat-word`，多行时每行一个 `.qat-word-line`，
  **字母索引跨行连续**，`data-state` / `data-mask` 语义与逐字判定完全不变
- 跟打条按实际条宽排（扣掉左右进度/速度/关闭按钮），面板按卡片估宽 700，两处都允许三行

### Removed · 面板的「自动打」按钮

- 面板工具行原来有「自动打 / 重开」两个按钮。自动打每 120ms 替人顶一个字，既不是上游行为，
  也容易让人以为插件在自己打字、练不了手速。现在工具行只留「重开」
- 连带清掉自动打的 120ms 定时器、`auto` 状态、`restart` 里的 `setAuto(false)`，以及两份字典的
  `auto` / `autoStop` 死键；跟打条里同一套从没有入口的死代码一并删除

### Perf · 查词、词库目录、样式表

- **`lookup()` 建索引**：以前每个词线性扫词表。缓存 `coca_20000`（17,633 词）后画一章 20 个词要
  1.5ms（未命中全扫 4.2ms），全砸在渲染里。改成按词表建 `WeakMap` 索引（同词只留第一条，和 `find` 语义一致）
  + 512 条结果缓存，词库加载/清缓存时失效：同场景 **1.54ms → 0.008ms**，未命中 **4.15ms → 0.006ms**
- **词库目录缓存**：371 个词库每次重建、面板一次渲染要问 5 遍（最近用过 / 分类 / 过滤列表）。
  现在按自定义词表指纹缓存 `catalog()`，并把一次渲染里的 5 次取用合成 1 次；`groupByCategory`
  的 `groups.find` 换成 `Map`（371 本 = 371×分类数次比较）
- **自定义词表解析缓存**：`readCustomDicts()` 每次调用都 `JSON.parse` 一遍 localStorage（实测 0.09ms/次），
  改成读内存、`writeCustomDicts` 回填，`clearData` 清空
- 面板一次渲染 **0.62ms → 0.14ms**（8 个自定义词表 + 371 本目录）
- **样式表只注入一次**：21.2KB CSS 以前每个卡片各渲一份 `<style>`，跟打条一收一开就卸载重挂、
  重新解析一遍；卡片 + 面板 + 指令卡片同时在场时 DOM 里躺着 4 份。改成插件装上时往 `document.head`
  注入一次（`ensureStyles`，幂等），`Styles` 组件保留为空壳兼容旧调用点

### Docs · README 按实际代码重写

- 130 行 → 104 行：入口表、判定语义、连续跟打与存档、词库链路、记录与统计、11 个设置项、
  开发脚本、性能坑位、版本与许可；删掉过期的测试条数（45/184）、旧图标描述（emoji `⌨`）、
  三条图标已不再使用的 slot 说明
- 加演示 GIF：`assets/demo.gif`（1280×340 · 12fps · 1.5 倍速 · 1.4MB，SSIM 0.96）

### Fixed · 打完之后 Esc 关掉、再打开又回到第一个词

- **跟打条首帧就接存档**：以前 `state.index` 初值是 0，要等 `loadDictWords` 异步回来才 `setState` 到存档位置——期间会闪一下第一个词；词库加载失败（走内置兜底）时更是永远停在 0。现在 `useState` 初始化函数里直接 `resumeIndex(readBarProgress(), …)`，`catch` 分支也补了同样的夹取
- **面板：打完的那章不再重打**：新增纯函数 `resumeChapterSmart(progress, saved, dictId, total, hasSession)`——存档章已经 `done` 且没有中途存档时，跳到后面第一个没打完的章（末章绕回，整本打完留在原章）；章内有存档则原地上次那个词。挂载后只校正一次，不跟用户手动选章抢

### 测试

- **655 → 840 条**（+185）。重点新增：177/200/201 长度边界、假名入库与副行渲染、
  `phoneticOf` 六种情形与面板按 `accent` 切换的端到端渲染、`dictBadge` 对 371 个真实库的全量覆盖、
  `wrapWord` 断行还原 / 硬断 / 中英混排、`fitWordStyle` 字号单调与窄条不丢字、字母跨行索引连续

## [0.6.0] - 2026-11-25

上游 `qwerty-learner` 对照表里最后 6 个缺口（G1–G6）一次补齐，外加三处真 bug。
做法：六个子 agent 各开一个开发分支并行做，主 agent 逐个合并（冲突按并集处理）。

### Added · 上游有、我们没有的六件事

- **结算页（G1）**：新增 `ResultScreen` 组件。打完一章除了 WPM/准确率/耗时，还列出**本轮打错过的词**
  （词 + 打错次数 + 中文），可「重练这些词」直接起一轮；另有「下一章」按钮，末章绕回第 1 章。
  `wordsOfRound` / `nextChapterIndex` 两个纯函数兜住映射与绕回。
- **实时速度（G2）**：打字过程中显示实时 WPM。`calcLiveWpm`（正确字符 ÷ 5 ÷ 分钟，上限 400）、
  `pushSpeedSample`（8 秒滑动窗口 + 暂停采样丢弃）、`windowedWpm`。1 秒心跳，面板工具行与跟打条各一处，
  暂停归 0、打完切成结算值。
- **词表抽屉（G3）**：面板头部新增词表按钮，展开本章 20 词，显示序号/单词/音标/中文与状态
  （当前 / 已掌握 / 打错过 / 打过 / 没碰），点一行直接跳到那个词。`wordListRows` 定优先级
  current > mastered > wrong > done > idle。
- **首字母提示（G4）**：同一个词打错 3 次给首字母、4 次给前两个、5 次起留最后一个字母，
  打对即归零重攒；另加一档更轻的提示音。`tipState` 保证永不显示整词、1–2 字母词不越界。
- **指法图示（G5）**：自绘 26 键纯 SVG 键盘 + 八指分区配色，高亮「下一个要按的键」并标出该用哪根手指。
  没有迁移上游那张 100KB PNG。默认关闭，设置里 `showFinger` 打开。
- **译义朗读（G6）**：打完一个词后用 `speechSynthesis` 读释义（含假名走 `ja-JP`），
  默认关闭，`settings.readMeaning`。`shouldReadMeaning` 把「刚打完 + 有释义 + 不是同一个词」钉死。

### Fixed · 新会话一进来就听到一个单词

跟打卡片的自动发音效果没有 `isOpen` 门禁，而卡片跟着 `conversation.input.dock` 挂载 ——
每开一个新会话就重挂一次，于是把上一个词读了出来。加 `isOpen` + `getOpen()` 双门禁。

### Fixed · 面板里那个多余的输入框

面板卡片原本有一个可见输入框，跟官方 Typing 页不一致（上游没有框，键盘由隐藏的 `InputHandler` 吃）。
改成 1px 视觉隐藏但可聚焦的输入目标，键入与输入法照旧；面板挂载即聚焦、点卡片也聚焦。

### Fixed · 卡片按「上一个 / ⌘←」整块掉白

`Trainer.goPrev` 用了 `wordsRef.current.length`，而 `wordsRef` 只在 `ComposerTrainer` 里声明 ——
面板卡片和 `/qwerty-autotype` 指令卡片按「上一个」就是 `ReferenceError`。改读 `props.words`。

### Fixed · 进度存档是死代码

`readBarProgress` / `writeBarProgress` / `resumeIndex`、`readChapterPos` / `writeChapterPos` / `resumeChapter`
六个函数与导出早就在，但**一个调用点都没有**，所以 Esc 关掉跟打条再打开总是回到第一个词。
现在换词即存、换词库重置、章节位置随章落盘、首次挂载恢复（`round > 0` 的「重来」仍回第一个词）。

### Changed · 面板排版对齐官方

- 单词改等宽字体：面板 64px、跟打条 52px，行高 1.1（上游 `font-mono` + `fontSizeConfig.foreignFont`）
- 音标 15px 次要色、中文 16px 且限宽 34em（上游 `text-lg` 观感）
- 面板骨架改成「顶部一行工具 / 中间单词居中 / 底部一行按钮 + 一行提示」，`min-height: 380px`
- 去掉输入框后同步改文案：`placeholder` 降级成 `aria-label` 语义，`hint` 不再说「输入框清空」

### Test

`456 → 644` 条，全绿。六个分支各自带断言，合并后统一跑 `npm run verify`。

## [0.5.1] - 2026-11-25

### Changed · 插件图标换回矢量

`icon.svg`（插件管理页里显示的那个）之前内嵌了 25KB 的 base64 位图，跟 `client.js` 里被删掉的水墨图是同一张。

- 改成纯矢量：深色圆角底 + 键盘（同一套 iconify path）+ 右下角绿色对勾，**823 B**
- `package.json` 的 `files` 去掉已经没人用的 `assets/panel-icon.png`

## [0.5.0] - 2026-11-25

### Fixed · 侧栏「跟打」图标是空白

`PanelGlyph` 用 CSS 遮罩画图：`mask-image: var(--qat-ink)`，而定义 `--qat-ink` 的 `.qat-glyph` 样式
只挂在面板/跟打条里（`h(Styles)`），**侧栏只有图标本身、没有样式**，遮罩变量为空 → 20×20 的透明方块。

- 图标改成**内联 SVG**（直接用 path，`fill="currentColor"`），不依赖任何 CSS、不依赖图片加载
- `.qat-glyph` 去掉 `mask-image` / `background-color: currentColor`，只留 `display/color/flex`
- 顺手删掉内联的 25KB base64 PNG（水墨图），`client.js` 从 324,567 B 降到 295,816 B

### Added · 图标资源全部迁移自上游

上游用的是 `~icons/*`（iconify：tabler / heroicons / ic / bxs）。现在把这些图标的 **path data 原样内联**
进 `ICONS`（22 个），名字用我们自己的短名：

`prev / next / loop / loopOff / check / close / list / lang / langOff / caret / stats / gear /
download / again / play / pause / speak / eye / eyeOff / keyboard / book / help`

`Icon({ name, size })` 自动按图标类型选 `fill` 或 `stroke`，默认 24 格。

### Changed · 面板排版对齐上游

头部原来是一个塞了 10 个元素、会换行的 flex；现在拆成两行，跟上游 Typing 页的节奏一致：

```
跟打   CET-4 ▾   CET-4 · 2607 词 · 131 章            [错词本] [统计] [重来]
[1 / 131 ▾]  [默写 ▾]                        今日 120 词 · 98% · 62 WPM
```

- 右上三个入口改成 26×26 的图标按钮（`qat-iconbtn`，带 `aria-label`，`data-on` 表示当前页）
- 章节 / 默写选择器挪到第二行工具区（`qat-tools`），今日数据靠右
- 图标全部用上面迁移来的 `book` / `stats` / `again`

### Added · 发音口音可切（上游 `PronunciationSwitcher`）

- 设置页新增「发音口音」：美音 / 英音，写入 `settings.accent`
- `resolveAccent(word, { accent })`：中日文仍按文字判定（`le=jap` / `le=zh`），英文才吃设置；非法值回退美音
- 7 条断言（默认值、两档、英音、非法值、假名与汉字不受影响）

### Docs · 新增 `docs/parity-scan.md`

对着上游 `src/pages/Typing/components/*` 与 `src/components/*` 逐项核了一遍：

- 已实现 24 / 部分 4 / 缺 4 / 明确不做 6
- 缺口：结算页错词清单（G1）、实时 WPM（G2）、词表抽屉（G3）、首字母提示（G4）、指法图示（G5）、译义朗读（G6）

测试：438 → **456** 条。

## [0.4.6] - 2026-11-25

### Fixed · Esc 退出跟打后输入框打不了字（根因）

上一轮的「关条时把中文撤掉」写成了无条件清空：

```js
const wrote = wroteDraftRef.current
wroteDraftRef.current = ''
if (wrote && draft !== wrote) return    // wrote 已经是 ''，这一行永远不生效（旧值被清前读了，但后续每次 draft 变化时 wrote 都空）
inputActions.setDraft('')
```

`wrote` 一旦被清成空串，后面**每一次** `draft` 变化都会走到 `setDraft('')`——用户关掉跟打后敲一个字，就被抹掉一个字；
换成新输入框也一样，因为草稿是同一份共享 store。这就是「Esc 之后打不了字」。

- 抽出纯函数 `shouldClearDraft({ open, draft, wrote })`：只有**我们写过**且**草稿仍是那一句**才清
- 效果里 `wrote` 为空直接返回，用户自己打的字一个字都不动
- 7 条真值表断言钉死这个行为（含 `wrote` 为空、用户改过、草稿已空、`undefined` 入参）

### Added · 训练中挡住「发送」

- 之前只拦 Enter，点发送按钮会把输入框里的中文提示语当消息发出去
- 现在捕获阶段拦 `click` / `pointerdown`：`shouldBlockSend(label)` 命中 `发送消息` / `Send message` / `加入队列` / `Queue` / `Steer` 就吞掉；
  **`停止` / `Stop` 永远放行**（那是逃生口），我们自己的按钮（`[data-qat]`）也不受影响

### Added · 逃生热键 `⌘/Ctrl + Alt + Q`

不管卡在什么状态，按下就：强制关条 → 擦掉可能残留的输入法属性 → 清掉我们写过的提示语。不用刷新页面。

## [0.4.5] - 2026-11-25

### Fixed · 关掉跟打后输入框还是打不进字

v0.4.1 在 composer 上写死过 `inputmode="latin"` / `data-qat-ime` / `ime-mode:inactive`，
还原路径又有 bug，属性就永久留在 DOM 上——**关掉跟打也恢复不了**，只能刷新页面。

- 新增 `releaseStuckComposer()`：扫 `[data-composer-input]`，有 `data-qat-ime` 就按存档还原、
  没有就直接删掉 `inputmode="latin"` 与 `ime-mode:inactive`。**插件载入时先跑一遍**，
  老页面不用手动修；每次关闭跟打再跑一遍
- 关跟打时的 `Esc` 提到所有门禁之前：条卡在「加载中」占位态时 `liveBarRef` 为 false、
  按键全被放行，Esc 也就失效了——现在 Esc 无条件能关，并顺手执行自愈
- `beforeinput` / `compositionend` 加双门禁（`liveBarRef` **且** `getOpen() === true`），
  任何一边不满足都不拦输入

测试：419 → **425 条**（自愈三例：inputmode / 标记 / ime-mode 全清）。

## [0.4.4] - 2026-11-25

### Fixed · 跟打条「打不开 / 按了没反应」

三个原因叠加，全都出在上一轮加的门禁上：

1. **空词库把条自己关掉了**：`if (isOpen && words.length === 0) setOpen(false)`。词库是异步加载的，
   自定义词库或没缓存的网络词库首帧就是空数组——条刚打开就被自己关回去，看起来就是「按 Tab 没反应」
2. **Tab 只在输入框绝对为空时才生效**：`shouldStartOnTab` 要求 `draft` 为空。之前一次没清干净的提示语
   （或被冻结态拒绝改写）会让 Tab 永久失效。现在 `ownDraft` 判定：残留的若正是我们自己写的那句，当作空处理
3. **空词库时还去改用户草稿**：没有词可提示时 `desired === ''`，会把用户刚写的消息抹掉。现在没有提示语就不动草稿

另外：`isOpen && 词库为空` 不再静默返回 `null`，而是画一条「词库加载中…」的占位条（带 ×），
按了有反应、随时能关。`liveBarRef` 改为渲染期同步计算 `isOpen && total > 0 && current`，
只有真有当前词时才接管键盘。

测试：407 → **419 条**（`shouldStartOnTab` 九种情形 + 空词库仍渲染 + 空词库给出提示）。

## [0.4.3] - 2026-11-25

### Fixed · 输入框打不进字了（v0.4.1 的输入法改动导致）

- 根因：给 `[data-composer-input]` 加了 `inputmode="latin"`。contenteditable 一旦被标成 latin 模式，
  Chromium 会直接把中文输入法关掉，输入框就「打不进字」；还原时还会 `setAttribute('style', 旧值)`，
  把编辑器自己的内联样式一起盖掉
- 处理：**彻底不再改 composer 的任何属性**（`inputmode` / `lang` / `spellcheck` / `style` / `ime-mode` 全删），
  改为只拦事件——捕获阶段 `beforeinput` + `compositionend`，拼音和候选字落不进输入框，但输入法本身照常工作
- 另加一道门禁：新增 `liveBarRef`，**只有跟打条真的渲染出来了才接管键盘**。之前只要 `open` 为真、
  哪怕条因为没词没画出来，捕获阶段的 `preventDefault` 依然会吞掉所有按键，看起来就是「输入框死了」；
  现在 `open && 词为空` 会自己关掉，且非 live 状态一律不 `preventDefault`
- 测试：390 → **407 条**，新增源码级回归断言（禁止再出现 `setAttribute('inputmode'` / `style.imeMode` / `data-qat-ime`，
  必须有 `liveBarRef.current` 与 `beforeinput` 拦截）；测试脚本现在输出总条数

## [0.4.2] - 2026-11-25

### Fixed · 中文输入法上屏的拼音留在输入框里

- `inputmode=latin` 只是提示，用户输入法若仍是中文，拼音会在 `compositionend` 后落进 composer
- 现在监听捕获阶段的 `compositionend`，把上屏内容抹回我们自己写的那句中文提示（`wroteDraftRef`），跟打条关闭前输入框始终只有那一句

## [0.4.1] - 2026-11-25

跟打条从「抽 20 个词重开」改成「一本词库一直往下打」，条上控件砍到只剩一个 ×；
补齐居中测量、发音和输入法提示。自动化测试 **390 条全绿**。

### Added · 自动发音（对齐上游 usePronunciation）

- 换词自动读一遍：优先 **有道词典音频**（`dict.youdao.com/dictvoice?audio=WORD&type=2`，跟上游 `generateWordSoundSrc` 一致），按词自动选型（假名→`le=jap`、汉字→`le=zh`、其余美音）
- 音频拉不到时退回浏览器 `speechSynthesis`
- 上一轮把条上的 🔊 摘掉后就没声了，所以改成「自动发音」；设置页那一项文案同步改成「自动发音」

### Added · 打开跟打时把输入法调成英文

- `setComposerIme(on)`：给 `[data-composer-input]` 加 `inputmode=latin` / `lang=en` / `autocapitalize=off` / `spellcheck=false` 与 `ime-mode:inactive`，关闭时按保存的旧值还原
- 浏览器无法强制切换操作系统输入法（系统级设置），`inputmode=latin` 是可行范围内最接近的效果

### Fixed · 跟打条不居中

- `setBarWidth` 从来没被调用（宽度一直是 `null`），条既没对齐 composer 也没居中。补上测量：读 `[data-composer-input]` 的实测宽度、`ResizeObserver` 跟随窗口与输入框变化，落成 `width + marginInline:auto`
- 结构改成「中间一层真正居中」：`.qat-bar` 自身 `position:relative` + `justify-content:center`，单词/音标/释义放进 `.qat-bar-center`，进度与 × 用 `position:absolute` 贴两侧，不参与居中计算
- 顺手修掉一个连带问题：上一轮把「打完就停」的语义误改到了面板 `Trainer` 上，导致侧栏练完 20 个不出结果页、不写章节记录。现在拆成两个纯函数——面板用 `isRoundDone(index,total)`，跟打条用 `stepIndex`（绕圈），互不影响

### Fixed · 条上重复的中文 / Esc 后草稿残留

- 中文释义由 composer 输入框承担，条上那份 `.qat-bar-gloss` 撤掉（同一句话不显示两遍）
- Esc / 点 × 收起后，输入框里那句自己写进去的中文会清掉：`wroteDraftRef` 记住写过什么，只撤自己写的、用户改过就不动（原来的判断靠 `LEXICON` 反查，词库词命不中就一直留着）

### Changed · 跟打条改成「一本词库一直往下打」+ 条上去掉按钮

- **不再抽 20 个词**：跟打条加载整本词库（CET-4 就是 2,607 个），顺序往下走，打完最后一个绕回开头接着打，没有「结束 → 重开」这一环
- **进度按整本算**：左侧 `1/2607` 淡色小字，替代原来的 `0/20 · ✓3 · ↻1` 三段指标
- **条上只剩一个 ×**：删掉词库下拉、🔊、⏮、⏭、🔁、↻、▶ 共 8 个控件；中文释义以淡色小字跟在单词右边；上一词/跳过/循环/暂停/关闭全部走快捷键（←/→/J/P/Esc），快捷键表在设置页与卡片内 `?`
- **面板打完自动接下一章**：新增设置「自动继续」（默认开），20 个打完 1.2 秒后自动进下一章，到最后一章绕回第一章；关掉就还是停在结果页
- 逻辑抽成纯函数 `stepIndex(index, length, delta)`（到头绕回、倒退也绕），有测试兜底

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

- **全量词库**：内联 371 个词库的元数据索引（`dicts.index.json`，62KB，414,485 词 —— 上游手写 `length` 之和，
  实际条目 414,469，见 0.7.0 的条数校正），词条按需拉取并缓存
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

[Unreleased]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.7.1...HEAD
[0.7.1]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.4.6...v0.5.0
[0.4.6]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.4.5...v0.4.6
[0.4.5]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/lnuxe/qwerty-autotype-ui/releases/tag/v0.1.0