# 词库与单词的迁移审计

> 日期：2026-11-25 · 上游 `/Users/v_ldjnlin/Desktop/04-GitHub-Repos/github/qwerty-learner`
> 方法：把上游 `public/dicts/*.json` 全量读进来，用插件里的**同一套归一化逻辑**跑一遍，逐库统计丢词原因。

## 1. 词库数量

| 项 | 数字 |
| --- | --- |
| 上游 `dictionary.ts` 声明的词库 | 374 |
| 上游 `public/dicts/*.json` 文件 | 380（含 `index.json` 等元数据） |
| 插件 `dicts.index.json` 收录 | **371** |
| 未收录的 3 个 | `zhtest`、`jptest`（上游自测用）、`PTE_WFDgaopinci.json`（上游 id 里带了扩展名，是上游自己的笔误） |

结论：**371 个正式词库一个不少**。插件不额外收录上游的自测库与那个畸形 id。

## 2. 单词条数

| 项 | 数字 |
| --- | --- |
| 上游原始词条（371 库合计） | 414,469 |
| 插件归一化后保留 | 412,749 |
| 丢弃 | 1,720（**0.415%**） |

## 3. 丢弃原因（v0.6.1 之前的口径）

| 原因 | 条数 | 典型词库 |
| --- | --- | --- |
| `w.length > 40`（长度上限） | 930 | **`IELTS-oral-900` 900 条丢 891 条**（雅思口语句子，最长 177 字符）、`word_roots1` 22 条（3–4 个词连写）、`archVocabulary` 6 条 |
| 无中文释义 | 786 | **`JapaneseHiragana` / `JapaneseKatakana` 各 280 条全丢**（词条形如 `{"name":"aiueo","trans":[],"notation":"あいうえお"}`）、`Oxford5000` 41 条、`TOEIC` 47 条 |
| 非法字符（控制字符等） | 4 | 少量脏数据 |

## 4. 音标覆盖

| 项 | 数字 |
| --- | --- |
| 有音标（`usphone` / `ukphone`） | 289,774（70.2%） |
| 没有音标 | 122,975（**29.8%**） |

没有音标的库基本是中文、日语、代码类，上游本身也不显示（`Phonetic` 里 `usphone.length > 1` 才渲染），
插件沿用同一口径：**没有音标就不画音标行**，不凭空生成。

## 5. 上游的音标是「美音 / 英音」两个字段

上游 `Word` 是 `{ name, usphone, ukphone, trans[] }`，`Phonetic` 组件按设置显示 `AmE: [...]` 或 `BrE: [...]`。
插件早期版本把两者合并成一个 `ipa`（`ukphone || usphone`），**口音开关只影响音频、不影响显示的音标** ——
这是本轮要补的缺口。

## 6. 复跑方式

```bash
node scripts/audit-dicts.mjs --upstream /path/to/qwerty-learner/public/dicts
```
