# 泡菜鱼 · Paocaiyu

[![npm](https://img.shields.io/npm/v/@lnuxe/paocaiyu?label=npm&color=cb3837)](https://www.npmjs.com/package/@lnuxe/paocaiyu)
[![license](https://img.shields.io/badge/license-GPL--3.0--only-blue)](./LICENSE)
[![CI](https://github.com/lnuxe/dsh-paocaiyu/actions/workflows/verify.yml/badge.svg)](https://github.com/lnuxe/dsh-paocaiyu/actions/workflows/verify.yml)

中文 · [English](./README.en.md)

DSH 插件。输入框上方蹦出一个英文单词，你照着它打一遍 —— 这就是「跟打」。

![跟打演示](./assets/demo.gif)

## 装

```bash
pnpm --dir ~/.dsh/profiles/web add @lnuxe/paocaiyu
```

装完刷新页面，侧栏左上角就有图标。不想走 npm 也行：

```bash
pnpm --dir ~/.dsh/profiles/web add github:lnuxe/dsh-paocaiyu
```

## 用

点侧栏图标，或者输入框空着的时候按 `Tab`。上面出来一个词，带音标；输入框里是它的中文意思。

照着打就完了：对的字母变绿，整词打完自动下一个。打错了变红、抖一下、清空，这个词从头来。

`Esc` 收起。关了再开，还接着上次那个词。

想练默写（只给中文，你回忆英文），去设置里把「默写形态」改成隐藏字母：藏全部、只藏元音、只藏辅音、或者随机藏。

| 键 | 干啥的 |
| --- | --- |
| `⌘←` / `Ctrl←` | 上一个词 |
| `⌘→` / `Ctrl→` | 跳过 |
| `⌘J` / `CtrlJ` | 再来一遍 |
| `⌘P` / `CtrlP` | 暂停 / 继续 |
| `Esc` | 收起 |
| `?` | 忘记快捷键了就按它 |
| `⌘/Ctrl+Alt+Q` | 急停，任何状态都能按 |

不想记快捷键也行，单词左右各贴着两颗按钮：「上一个 / 重开」「下一个 / 关闭」。

## 词库

内置 371 本、41 万词，四六级考研托福雅思商务代码日语都有。选哪本才下哪本，断网也有 7 本小的兜底。

想练自己的词表：词库列表最底下「＋ 导入」，粘贴 `word 中文` 一行一个就行，txt / csv / json 也吃。

## 记录

全在浏览器本地，不上传。

20 个词算一章，打完有结算页：速度、正确率、耗时、这章打错了哪些词，可以重练也能直接下一章。

错词自动进错词本，能单独重练。统计里有近 14 天柱状图、12 周热力图，还有你最容易打错哪个字母。

同一个词错 3、4、5 次，会依次给提示 —— 先给首字母，最后直接给答案。

## 设置

`设置 → 跟打`。除了上面说的默写形态，还有：区分大小写、忽略标点、显示中文、显示音标、发音、口音、按键音、自动下一章、读释义、指法键盘，以及导出导入备份、清空记录。

## 一个好事

回车不会发消息，你敲的字也不会留在草稿里。所以可以放心在任何一个对话里练，不会污染聊天记录。

## 开发

```bash
npm run verify             # 语法 + 1525 条测试 + 冒烟 + 体积
npm test                   # 只跑测试，不用开浏览器
npm run prepublish-check   # 发版前自检 40 项
```

主要就两个文件：`client.js`（全部功能，单文件无构建）和 `test-client-logic.mjs`。

`client.js` 有硬线：不许超过 480,000 字节（现在 452,145，94.2%）。

## 致谢

没有它们就没有泡菜鱼：

- [Qwerty Learner](https://github.com/RealKai42/qwerty-learner) —— 「跟打」这个玩法的源头，**371 本词库、41 万词的音标和中文释义全部来自它**（GPL-3.0）
- [DSH / DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) —— 宿主，slot、输入框、主题、插件运行时都是它给的
- [React](https://react.dev) —— 界面全用 `createElement` 手写，MIT
- [Iconify](https://iconify.design) 那套图标（tabler / heroicons / ic / bxs）—— 条上和面板里的 SVG 就是它们
- [jsDelivr](https://www.jsdelivr.com) 和 raw.githubusercontent —— 按需把词库送到你浏览器

词库的派生关系写在 [NOTICE](./NOTICE)，改动记录在 [CHANGELOG.md](./CHANGELOG.md)。

## 许可证

[GPL-3.0-only](./LICENSE) © 2026 lnuxe。因为分了 Qwerty Learner 的词库数据，整个项目跟着 GPL-3.0 走。