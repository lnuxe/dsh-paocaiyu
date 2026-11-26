<p align="center">
  <img alt="Paocaiyu" width="120" src="./icon.svg" />
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

English | [简体中文](./README.md)

**Paocaiyu** is a typing-practice plugin for DSH. A word appears above your composer and you type it out in that same composer — right letters turn green, a wrong one makes you start the word over. Words, phonetics, meanings, chapters and stats all live in the chat UI: no popup page, keyboard focus never leaves the real input.

## 🎉 Features

- Type-along: the word sits above, you type it in the real composer, correct letters turn green live
- Dictation: meaning only, with letters hidden entirely, vowels only, consonants only, or random
- 371 dictionaries, ~410k words — only the one you pick gets downloaded, 7 ship inside for offline
- Bring your own list (`word 中文`, one per line, or txt / csv / json)
- Chapters of 20 words with a summary screen; missed words collect into a drill list
- Stats: 14-day bar chart, 12-week heatmap, the letter you fumble most
- Enter never sends and nothing lands in the draft — practise inside any conversation
- Everything is stored locally in the browser; nothing is uploaded

## 📱 Preview

![demo](./assets/demo.gif)

## 🚀 Quick Start

Install into your DSH web profile. No extra server:

```bash
pnpm --dir ~/.dsh/profiles/web add @lnuxe/paocaiyu
```

Not into npm? Install straight from the repo or a release tarball:

```bash
pnpm --dir ~/.dsh/profiles/web add github:lnuxe/dsh-paocaiyu
```

Refresh the page and the icon shows up at the top-left of the sidebar.

> The npm package ships via `npm run publish:npm` (preflight → auth check → publish → read back from the registry, 51 checks up front).

### Minimal Usage

Click that icon, or press `Tab` while the composer is empty:

1. A word appears above with its phonetics; the composer shows the Chinese meaning
2. Type it — finishing the word moves you on
3. One wrong letter: red, shake, clear, start that word over
4. `Esc` closes it; reopen and you continue on the same word

## ⌨️ Shortcuts

| Key | Does |
| --- | --- |
| `⌘←` / `Ctrl←` | previous word |
| `⌘→` / `Ctrl→` | skip |
| `⌘J` / `CtrlJ` | repeat this word |
| `⌘P` / `CtrlP` | pause / resume |
| `Esc` | close |
| `?` | shortcut hints |
| `⌘/Ctrl+Alt+Q` | panic stop, works from any state |

No shortcut person? There's a button on each side of the word: previous / restart and next / close.

## 📚 Documentation

- [Publishing to the plugin marketplace](./docs/publish-checklist.md)
- [Dictionary migration and normalization](./docs/qwerty-learner-migration.md)
- [Dictionary audit](./docs/dict-audit.md), [phonetic gaps](./docs/phonetic-gaps.md), [parity scan](./docs/parity-scan.md)
- [Changelog](./CHANGELOG.md)

## 🛠 Development

```bash
npm run verify             # syntax + 1525 tests + assembly smoke + size gate
npm test                   # tests only, no browser needed
npm run prepublish-check   # 45 pre-release metadata checks
npm run index              # rebuild the dictionary index
```

Two files do the work: `client.js` (everything, single file, no build step) and `test-client-logic.mjs` (renders the components for real with stubs). `client.js` has a hard ceiling of 480,000 bytes.

## 🤝 Contributing

Issues and PRs are welcome. Run `npm run verify` before submitting. Touching dictionary logic? Run `npm run audit` to check the drop rate.

## 🙏 Acknowledgements

- [Qwerty Learner](https://github.com/RealKai42/qwerty-learner) — where the type-along idea comes from; this project's dictionary data (371 books, ~410k words with phonetics and Chinese meanings) derives from it
- [DSH / DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — the host: slot system, composer, theme, plugin runtime

How the dictionary data derives and redistributes is documented in [NOTICE](./NOTICE).

## 📄 License

Paocaiyu is licensed under [GPL-3.0-only](./LICENSE). It ships dictionary data derived from Qwerty Learner, so the whole project follows GPL-3.0.