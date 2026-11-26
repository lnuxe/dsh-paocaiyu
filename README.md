<p align="center">
  <img alt="泡菜鱼 Paocaiyu" width="120" src="./icon.svg" />
</p>

<p align="center">
  <a href="https://github.com/lnuxe/dsh-paocaiyu/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-GPL--3.0--only-blue" alt="License">
  </a>
  <a href="https://www.npmjs.com/package/@lnuxe/paocaiyu">
    <img src="https://img.shields.io/npm/v/@lnuxe/paocaiyu?color=cb3837" alt="Version">
  </a>
  <a href="https://github.com/lnuxe/dsh-paocaiyu/actions/workflows/verify.yml">
    <img src="https://github.com/lnuxe/dsh-paocaiyu/actions/workflows/verify.yml/badge.svg" alt="CI">
  </a>
</p>

[English](./README.en.md) | 简体中文

**泡菜鱼** 是 DSH 的英文打字练习插件。输入框上方给一个单词，你在同一个输入框里照着打出来——打对变绿、打错重打。单词、音标、中文释义、章节与统计都在对话界面里，不弹新页面，键盘焦点始终在原生输入框。

## 🎉 特性

- 跟打：上方给词，在真实输入框里照着敲，打对的字母实时变绿
- 默写：只给中文，可选隐藏全部字母、只藏元音、只藏辅音或随机藏
- 371 本词库、41 万词，选哪本才下哪本，断网有 7 本内置词库兜底
- 支持导入自己的词表（`word 中文` 一行一个，或 txt / csv / json）
- 20 词一章，打完出结算页；错词自动进错词本，可单独重练
- 统计：近 14 天柱状图、12 周热力图、最容易打错的字母
- 回车不会发消息，敲的字不进草稿，可在任意对话里练习
- 全部记录存在浏览器本地，不上传服务器

## 📱 预览

![跟打演示](./assets/demo.gif)

## 🚀 快速开始

已发布到 npm（[`@lnuxe/paocaiyu`](https://www.npmjs.com/package/@lnuxe/paocaiyu)，最新 1.0.7）。装进 DSH 的 web profile：

```bash
pnpm --dir ~/.dsh/profiles/web add @lnuxe/paocaiyu
```

三条备用通道，按需选：

| 想怎么装 | 命令 |
| --- | --- |
| 锁到某个版本 | `pnpm --dir ~/.dsh/profiles/web add @lnuxe/paocaiyu@1.0.7` |
| 直接从仓库装 | `pnpm --dir ~/.dsh/profiles/web add github:lnuxe/dsh-paocaiyu` |
| 从 release 的打包产物装 | `pnpm --dir ~/.dsh/profiles/web add https://github.com/lnuxe/dsh-paocaiyu/releases/download/v1.0.7/lnuxe-paocaiyu-1.0.7.tgz` |

刷新页面后，侧栏左上角出现图标。

> 想装最新版却拿到旧版本？pnpm 11 默认有 `minimumReleaseAge`，刚发布几十秒的新版本不会自动被选中，带版本号装或者等冷却期过去即可。

### 最小使用

点侧栏图标，或者在输入框为空时按 `Tab`：

1. 上方出现一个单词，带音标；输入框里是它的中文意思
2. 照着打，整词打完自动下一个
3. 打错就变红、抖动、清空，这个词从头重打
4. `Esc` 收起；再打开还接着上次那个词

## ⌨️ 快捷键

| 键 | 作用 |
| --- | --- |
| `⌘←` / `Ctrl←` | 上一个词 |
| `⌘→` / `Ctrl→` | 跳过这个词 |
| `⌘J` / `CtrlJ` | 循环当前词 |
| `⌘P` / `CtrlP` | 暂停 / 继续 |
| `Esc` | 收起 |
| `?` | 快捷键提示 |
| `⌘/Ctrl+Alt+Q` | 急停，任何状态都可用 |

不记快捷键也可以：单词左右各有一颗按钮，分别是「上一个 / 重开」与「下一个 / 关闭」。

## 📚 文档

- [发布到插件市场](./docs/publish-checklist.md)
- [词库迁移与归一化](./docs/qwerty-learner-migration.md)
- [词库审计](./docs/dict-audit.md)、[音标缺口](./docs/phonetic-gaps.md)、[对齐扫描](./docs/parity-scan.md)
- [改动记录](./CHANGELOG.md)

## 🛠 本地开发

```bash
npm run verify             # 语法检查 + 1525 条测试 + 装配冒烟 + 体积闸门
npm test                   # 只跑测试，不需要浏览器
npm run prepublish-check   # 发布前元信息自检（51 项）
npm run publish:npm        # 一条命令发布：自检 → 查登录 → 发布 → 回读 registry 验证
npm run index              # 重新生成词库目录
```

发布后别信本地 `+ @lnuxe/paocaiyu@x.y.z` 那行就算成了。registry 的读写副本有几分钟不同步，
期间 `npm view` 会 404、重发会撞 `E409 Cannot publish over previously staged version`。
判断标准只有一个：**匿名**读元数据与 tarball 直连都返 200。

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/@lnuxe%2Fpaocaiyu
curl -s -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/@lnuxe/paocaiyu/-/paocaiyu-<版本>.tgz
```

主体只有两个文件：`client.js`（全部功能，单文件、无构建）与 `test-client-logic.mjs`（用桩把组件真渲染一遍）。`client.js` 有硬线：不得超过 480,000 字节。

## 🤝 参与贡献

欢迎 issue 与 PR。提交前请跑一遍 `npm run verify`。改动词库相关逻辑时，顺手跑 `npm run audit` 看丢词率。

## 🙏 致谢

- [Qwerty Learner](https://github.com/RealKai42/qwerty-learner)——「跟打」形态的源头，本项目的词库数据（371 本、41 万词的音标与中文释义）派生自它
- [DSH / DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)——宿主平台，提供 slot 体系、输入框、主题与插件运行时

词库的派生与再分发声明见 [NOTICE](./NOTICE)。

## 📄 开源协议

泡菜鱼遵循 [GPL-3.0-only](./LICENSE)。因分发派生自 Qwerty Learner 的词库数据，整个项目按 GPL-3.0 发布。