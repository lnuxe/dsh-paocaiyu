# Changelog

本项目的所有重要变更都记录在这里。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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

[Unreleased]: https://github.com/lnuxe/qwerty-autotype-ui/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/lnuxe/qwerty-autotype-ui/releases/tag/v0.1.0