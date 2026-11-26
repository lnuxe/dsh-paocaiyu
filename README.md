# 泡菜鱼 · Paocaiyu

[![npm](https://img.shields.io/npm/v/@lnuxe/paocaiyu?label=npm&color=cb3837)](https://www.npmjs.com/package/@lnuxe/paocaiyu)
[![license](https://img.shields.io/badge/license-GPL--3.0--only-blue)](./LICENSE)
[![platform](https://img.shields.io/badge/platform-DSH%20Web-6366f1)](https://github.com/deepseek-ai/deepseek-harness)
[![CI](https://github.com/lnuxe/dsh-paocaiyu/actions/workflows/verify.yml/badge.svg)](https://github.com/lnuxe/dsh-paocaiyu/actions/workflows/verify.yml)
[![tests](https://img.shields.io/badge/tests-1525%20passing-3fb950)](./test-client-logic.mjs)

> DSH 插件：在对话输入框里练英文打字。**输入框上方给一个英文单词，你照着它打一遍**——就是「跟打」。

![跟打演示](./assets/demo.gif)

- 包名 `@lnuxe/paocaiyu` · 指令 `/qwerty-autotype` · 许可证 GPL-3.0-only
- 371 本词库 / 41 万词（四六级、考研、托福、雅思、商务、代码、日语……），选哪本才下哪本

## 目录

- [安全](#安全)
- [背景](#背景)
- [安装](#安装)
- [用法](#用法)
  - [快捷键](#快捷键)
  - [词库](#词库)
  - [练习记录](#练习记录)
  - [设置](#设置)
- [开发](#开发)
- [维护者](#维护者)
- [致谢](#致谢)
- [参与贡献](#参与贡献)
- [许可证](#许可证)

## 安全

- **不发送任何东西**：跟打时回车不会发消息，你敲的字不进草稿、不进聊天记录
- **不出本机**：练习记录、错词本、设置全部存在浏览器 `localStorage`，没有账号、没有上传、没有统计上报
- **唯一的网络请求**：按需从 jsDelivr / raw.githubusercontent 拉你选中的那本词库 JSON（内置 7 本词库时完全不联网）

## 背景

[DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 是一个可插拔的 AI 工作台，输入框是它的核心交互区。
[Qwerty Learner](https://github.com/RealKai42/qwerty-learner) 用「跟打」练英文——单词在上、你在下照着敲。这个插件把那条练习线搬进 DSH 的**真实输入框**：不弹独立页面、不另开窗口，单词条就长在 compose 栈里，键盘焦点始终在原生编辑器上。

名字叫**泡菜鱼**：一条在输入框里陪你敲单词的小鱼。

## 安装

以 DSH bundle 形式安装，不额外起服务：

```bash
# 从 npm 装（@lnuxe/paocaiyu）
pnpm --dir ~/.dsh/profiles/web add @lnuxe/paocaiyu

# 或者直接从仓库装，不经过 registry
pnpm --dir ~/.dsh/profiles/web add github:lnuxe/dsh-paocaiyu

# 或者装某个 release 的打包产物
pnpm --dir ~/.dsh/profiles/web add \
  https://github.com/lnuxe/dsh-paocaiyu/releases/download/v1.0.1/lnuxe-paocaiyu-1.0.1.tgz
```

装好后刷新页面：侧栏左上角出现图标；输入框为空时按 `Tab` 也能起条。

## 用法

1. 点侧栏左上角的图标，或者在输入框为空时按 `Tab`
2. 输入框上方出现一个英文单词（下面带音标），输入框里显示它的中文意思当提示；
   单词左右各贴着两颗按钮——左边「上一个 / 重开」、右边「下一个 / 关闭」，不用记快捷键
3. 在输入框里把上面那个单词**照着打一遍**：打对的字母变绿，整词打完自动跳下一个
4. 打错就变红、抖动、清空，这个词从头重打
5. `Esc` 收起。关了再打开，接着上次那个词，不会从头来

想练**默写**（只给中文，凭记忆写英文），去设置的「默写形态」里改隐藏字母：隐藏全部、只藏元音、只藏辅音、随机藏。

### 快捷键

| 键 | 作用 |
| --- | --- |
| `⌘←` / `Ctrl←` | 上一个词 |
| `⌘→` / `Ctrl→` | 跳过这个词 |
| `⌘J` / `CtrlJ` | 循环当前词 |
| `⌘P` / `CtrlP` | 暂停 / 继续 |
| `Esc` | 收起 |
| `?` | 看快捷键提示 |
| `⌘/Ctrl+Alt+Q` | 一键急停（panic，任何状态下都能用） |

单词条两侧的按钮和这些键是同一套动作，鼠标点也行：左边 `上一个 / 重开`，右边 `下一个 / 关闭`。

### 词库

- 内置 **371 本词库、41 万词**，选哪本才下哪本
- 断网也能用：自带 7 本小词库兜底
- 想用自己的词表：词库列表底部「＋ 导入」，粘贴 `word 中文` 一行一个，或者导入 txt / csv / json

### 练习记录

- 每打一个词、每打完一章都会记下来，全部存在浏览器本地
- **章**：20 个词一章。打完出结算页：速度、正确率、耗时、这一章打错的词，可重练或直接下一章
- **错词本**：错过的词自动收集，可以单独重练
- **统计**：近 14 天柱状图、12 周热力图、哪个字母最容易打错
- 同一个词错 3、4、5 次，会依次给提示（先给首字母，最后直接给答案）

### 设置

`设置 → 跟打`：默写形态（默认显示字母=跟打，改成隐藏字母=默写）、区分大小写、忽略标点、显示中文、显示音标、发音、口音、按键音、自动下一章、读释义、指法键盘，还能导出/导入备份、清空记录。

## 开发

```bash
npm run verify             # 语法检查 + 1525 条测试 + bundle 冒烟 + 体积
npm test                   # 只跑测试（不需要浏览器，用桩把组件真渲染一遍）
npm run prepublish-check   # 发布到插件市场前的元信息自检（40 项）
npm run index              # 重新生成词库目录（371 本）
```

代码就两个主体：`client.js`（全部功能，单文件、无构建步骤）和 `test-client-logic.mjs`（测试）。
词库目录在 `dicts.index.json`，归一化后的词条在 `dicts.generated.json`，都由 `scripts/` 里的脚本从上游生成。

体积有硬线：`client.js` 不得超过 480,000 字节（当前 452,145，94.2%），`npm run size` 会拦。

## 维护者

[@lnuxe](https://github.com/lnuxe)

## 致谢

没有这些项目就不会有泡菜鱼：

| 项目 | 作用 | 许可证 |
| --- | --- | --- |
| [Qwerty Learner](https://github.com/RealKai42/qwerty-learner)（KaiyiWing / RealKai42） | 「跟打」这套练习形态的源头；**全部词库数据**（371 本、41 万词、音标与中文释义）派生自它 | GPL-3.0 |
| [DSH / DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | 宿主平台：slot 体系、composer、主题 token、插件运行时 | 见上游仓库 |
| [React](https://react.dev) | 卡片与单词条全部用 `createElement` 手写，无 JSX、无构建 | MIT |
| [Iconify](https://iconify.design) 图标集（tabler / heroicons / ic / bxs） | 单词条与面板里内联的 SVG path 取自上游使用的那套图标 | 各自上游（Tabler MIT、Heroicons MIT、Boxicons CC-BY-4.0、ic 归 Iconify） |
| [jsDelivr](https://www.jsdelivr.com) / [raw.githubusercontent](https://raw.githubusercontent.com) | 按需分发词库 JSON 的 CDN | 服务方条款 |

词库派生关系与再分发声明见 [NOTICE](./NOTICE)；改动记录见 [CHANGELOG.md](./CHANGELOG.md)。

## 参与贡献

欢迎 issue 与 PR。提交前跑一遍 `npm run verify`，它会做语法检查、跑全部测试、校验 bundle 能不能挂上、拦住体积超线。改词库相关的代码请顺便跑 `npm run audit` 看丢词率。

## 许可证

[GPL-3.0-only](./LICENSE) © 2026 lnuxe。

因为分发派生自 Qwerty Learner 的词库数据，本项目整体按 GPL-3.0（仅此版本）发布。