#!/usr/bin/env node
/**
 * audit-phonetic.mjs
 *
 * 音标缺口审计：还是读上游 `public/dicts/*.json` 全量数据、还是用 **client.js 里同一套
 * 归一化函数**（`__test.normalizeWord` / `__test.phoneticOf`），但只回答一个问题：
 * **哪些词没有音标，为什么没有。**
 *
 * 和 `audit-dicts.mjs` 的分工：
 * - `audit-dicts.mjs` 回答「丢了多少词、丢因分布、有音标比例」——它是**入库口径**审计；
 * - 本脚本回答「音标缺口在哪个库、哪一支缺、是不是我们自己的 bug」——它是**展示口径**审计。
 * 两个脚本都跑同一批 json，但统计维度不重叠，所以 `npm run audit` 的输出格式一个字都没动。
 *
 * 四种情形（`usphone` / `ukphone` 两支）：
 *   both     两支都有
 *   usOnly   只有美音
 *   ukOnly   只有英音
 *   neither  两支都没有
 *
 * 另外单列两类「不是缺、但看起来像缺」的：
 *   notationOnly      只有假名（`notation`）没有音标——日文假名词库的正常形态
 *   noPhoneticConcept 语言本身没有音标概念（代码库）
 *
 * 最重要的一列是 `hidden`（有字段却没显示）：原始 json 里 `usphone` / `ukphone` 非空，
 * 但归一化之后 `us` / `uk` / `ipa` 全空——也就是数据在那儿、界面上一个字都不显示。
 * 这一列 > 0 就是真 bug，不是数据缺失。
 *
 * 用法：
 *   node scripts/audit-phonetic.mjs
 *   node scripts/audit-phonetic.mjs --upstream /path/to/qwerty-learner/public/dicts
 *   node scripts/audit-phonetic.mjs --top 50 --json
 *   QAT_UPSTREAM_DICTS=/path/to/dicts node scripts/audit-phonetic.mjs
 *
 * 上游目录不存在时：打印提示并以 **退出码 0** 结束（和 audit-dicts 一致，不让 CI 挂）。
 *
 * 纯函数（phoneticRows / mergePhonetic / bucketOf / classifyCategory / formatPhoneticReport …）
 * 单独导出，测试直接 import。
 */

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { loadPlugin, dictFilePath, ratio, formatPct, DEFAULT_UPSTREAM, INDEX_FILE } from './audit-dicts.mjs'

const HERE = path.dirname(url.fileURLToPath(import.meta.url))
/** 插件根（本脚本在 scripts/ 下） */
export const PLUGIN_ROOT = path.resolve(HERE, '..')

/** 四种音标情形，顺序即报表顺序 */
export const PHONETIC_BUCKETS = ['both', 'usOnly', 'ukOnly', 'neither']

/** 语言本身没有「音标」这个概念：代码库练的是符号，不是读音 */
export const NO_PHONETIC_CATEGORIES = ['code']

/** 用假名（notation）代替音标的语言：日文罗马字 / 平假名 / 片假名 */
export const NOTATION_CATEGORIES = ['ja']

/** 拉丁字母语言里「本来该有 IPA」的那些（其余按「非拉丁字母」处理） */
export const LATIN_CATEGORIES = ['en', 'de', 'id']

/* ------------------------------------------------------------------ */
/* 纯函数：统计与排版（测试直接断言这一层）                             */
/* ------------------------------------------------------------------ */

/** 空统计桶 */
export function emptyPhoneticStats() {
  return {
    /** 词库文件名（报表主键） */
    name: '',
    /** 清单里的 languageCategory（en / code / ja / de / kk / id） */
    category: 'en',
    /** 上游原始条数 */
    raw: 0,
    /** 归一化后保留条数（= 界面真能练到的条数，覆盖率的分母） */
    kept: 0,
    both: 0,
    usOnly: 0,
    ukOnly: 0,
    neither: 0,
    /** 只有 notation、没有音标（且没有被记进 neither 之外的桶） */
    notationOnly: 0,
    /** 原始 json 里 usphone / ukphone 至少一支非空的条数 */
    rawPhone: 0,
    /** 有字段却没显示：rawPhone 有值，但归一化后 us / uk / ipa 全空 */
    hidden: 0,
    /** 原始有 usphone 但归一化后 us 空（且 uk 也空 → 才会进 hidden） */
    lostUs: 0,
    /** 原始有 ukphone 但归一化后 uk 空 */
    lostUk: 0,
    /** hidden 的词条样例（最多 5 个，报表里点名用） */
    hiddenSamples: [],
  }
}

/**
 * 一个词条属于哪一支。
 * 判定只看归一化后的 `us` / `uk`——也就是界面真的能拿到的两支；
 * 不做「有 ipa 就算有音标」的宽松判定，那是 audit-dicts 的口径。
 * @param {{ us?: string, uk?: string }} word
 * @returns {'both'|'usOnly'|'ukOnly'|'neither'}
 */
export function bucketOf(word) {
  const us = String(word?.us ?? '')
  const uk = String(word?.uk ?? '')
  if (us && uk) return 'both'
  if (us) return 'usOnly'
  if (uk) return 'ukOnly'
  return 'neither'
}

/** 词库里有没有「音标」这个概念上的前提（false = 数据缺失不该算 bug） */
export function classifyCategory(category) {
  const key = String(category ?? 'en')
  if (NO_PHONETIC_CATEGORIES.includes(key)) return 'noPhoneticConcept'
  if (NOTATION_CATEGORIES.includes(key)) return 'notationInstead'
  return 'expectsIpa'
}

/** 原始词条里 phone 字段的实际情况（trim 后非空才算有） */
function rawPhoneOf(raw) {
  const us = String(raw?.usphone ?? '').trim()
  const uk = String(raw?.ukphone ?? '').trim()
  return { us, uk, any: Boolean(us || uk) }
}

/**
 * 统计一个词库的音标分布。
 * @param {Array} rows 上游裸词条（{ name, trans[], usphone, ukphone, notation? }）
 * @param {string} category 清单里的 languageCategory
 * @param {(raw: object, category: string) => object|null} normalize 插件里的 normalizeWord
 * @param {{ name?: string }} [meta] 词库名（报表里显示）
 * @returns {ReturnType<typeof emptyPhoneticStats>}
 */
export function phoneticRows(rows, category, normalize, meta) {
  const stats = emptyPhoneticStats()
  stats.name = String(meta?.name ?? '')
  stats.category = String(category ?? 'en')
  const list = Array.isArray(rows) ? rows : []
  for (const raw of list) {
    stats.raw += 1
    const word = normalize ? normalize(raw, category) : null
    if (!word) continue
    stats.kept += 1
    const bucket = bucketOf(word)
    stats[bucket] += 1
    if (bucket === 'neither' && String(word.notation ?? '')) stats.notationOnly += 1

    const phone = rawPhoneOf(raw)
    if (!phone.any) continue
    stats.rawPhone += 1
    if (phone.us && !String(word.us ?? '')) stats.lostUs += 1
    if (phone.uk && !String(word.uk ?? '')) stats.lostUk += 1
    // 有字段却没显示：三支全空，界面一个字都出不来
    const shown = String(word.us ?? '') || String(word.uk ?? '') || String(word.ipa ?? '')
    if (!shown) {
      stats.hidden += 1
      if (stats.hiddenSamples.length < 5) {
        stats.hiddenSamples.push({
          word: String(word.w ?? ''),
          usphone: phone.us,
          ukphone: phone.uk,
        })
      }
    }
  }
  return stats
}

/** 把多个词库的音标统计并成一个总计 */
export function mergePhonetic(list) {
  const total = emptyPhoneticStats()
  total.name = '__total__'
  for (const stats of list || []) {
    total.raw += stats.raw
    total.kept += stats.kept
    for (const bucket of PHONETIC_BUCKETS) total[bucket] += stats[bucket] || 0
    total.notationOnly += stats.notationOnly || 0
    total.rawPhone += stats.rawPhone || 0
    total.hidden += stats.hidden || 0
    total.lostUs += stats.lostUs || 0
    total.lostUk += stats.lostUk || 0
  }
  return total
}

/** 音标覆盖率：有三支中至少一支的条数 / 保留条数（notation 不算音标） */
export function phoneticCoverage(stats) {
  const kept = Number(stats?.kept) || 0
  const hit = (Number(stats?.both) || 0) + (Number(stats?.usOnly) || 0) + (Number(stats?.ukOnly) || 0)
  return ratio(hit, kept)
}

/** 缺音标的条数（= kept - 有音标） */
export function missingPhonetic(stats) {
  const kept = Number(stats?.kept) || 0
  return kept - ((Number(stats?.both) || 0) + (Number(stats?.usOnly) || 0) + (Number(stats?.ukOnly) || 0))
}

const NAME_WIDTH = 30

function pad(text, width) {
  const value = String(text ?? '')
  return value.length >= width ? value : value + ' '.repeat(width - value.length)
}

function padLeft(text, width) {
  const value = String(text ?? '')
  return value.length >= width ? value : ' '.repeat(width - value.length) + value
}

/** 表头：词库 / 类别 / 保留 / 覆盖率 / 两支都有 / 只美 / 只英 / 都无 / 仅假名 / 有字段却没显示 */
export function formatPhoneticHead() {
  return [
    pad('词库', NAME_WIDTH),
    pad('类别', 5),
    padLeft('保留', 7),
    padLeft('覆盖率', 8),
    padLeft('两支', 7),
    padLeft('只美', 7),
    padLeft('只英', 7),
    padLeft('都无', 7),
    padLeft('仅假名', 7),
    padLeft('没显示', 7),
  ].join(' ')
}

/** 一行的文本 */
export function formatPhoneticRow(row) {
  return [
    pad(row.name, NAME_WIDTH),
    pad(row.category, 5),
    padLeft(row.kept, 7),
    padLeft(formatPct(phoneticCoverage(row), 1), 8),
    padLeft(row.both, 7),
    padLeft(row.usOnly, 7),
    padLeft(row.ukOnly, 7),
    padLeft(row.neither, 7),
    padLeft(row.notationOnly, 7),
    padLeft(row.hidden, 7),
  ].join(' ')
}

/**
 * 按覆盖率升序（最差在前）；覆盖率相同按缺音标条数降序。
 * 只排「本该有音标」的库——代码库永远 0%，排在最前面没有信息量。
 * @param {Array<ReturnType<typeof emptyPhoneticStats>>} list
 * @param {{ includeNonIpa?: boolean }} [options]
 */
export function sortWorstPhonetic(list, options = {}) {
  const source = (list || []).filter((row) => options.includeNonIpa || classifyCategory(row.category) === 'expectsIpa')
  return source.slice().sort((a, b) => {
    const delta = phoneticCoverage(a) - phoneticCoverage(b)
    if (delta !== 0) return delta
    return missingPhonetic(b) - missingPhonetic(a) || a.name.localeCompare(b.name)
  })
}

/**
 * 整份报表文本（纯函数：给数据就出字符串，不碰文件系统）
 * @param {Array<ReturnType<typeof emptyPhoneticStats>>} rows 每个词库一行
 * @param {{ top?: number, extraFiles?: string[], missing?: string[] }} [options]
 */
export function formatPhoneticReport(rows, options = {}) {
  const list = Array.isArray(rows) ? rows : []
  const total = mergePhonetic(list)

  const expects = list.filter((row) => classifyCategory(row.category) === 'expectsIpa')
  const noConcept = list.filter((row) => classifyCategory(row.category) === 'noPhoneticConcept')
  const notation = list.filter((row) => classifyCategory(row.category) === 'notationInstead')

  const covered = total.both + total.usOnly + total.ukOnly
  const lines = []

  lines.push('音标缺口审计（口径 = client.js 的 normalizeWord / phoneticOf）')
  lines.push(`词库 ${list.length} 个 · 词条 ${total.kept} 条（原始 ${total.raw} 条）`)
  lines.push('')
  lines.push('—— 全局 ——')
  lines.push(
    `有音标 ${covered} 条（覆盖 ${formatPct(phoneticCoverage(total), 2)}）· 无音标 ${missingPhonetic(total)} 条`,
  )
  lines.push(
    `两支都有 ${total.both} · 只有美音 ${total.usOnly} · 只有英音 ${total.ukOnly} · 两支都没有 ${total.neither}`,
  )
  lines.push(`只有假名 notation、没有音标 ${total.notationOnly} 条`)
  lines.push('')
  lines.push('—— 按「音标概念」分类 ——')
  lines.push(
    `该有音标的库 ${expects.length} 个：${mergePhonetic(expects).kept} 条，覆盖 ${formatPct(phoneticCoverage(mergePhonetic(expects)), 2)}`,
  )
  lines.push(
    `语言本身没有音标概念的库 ${noConcept.length} 个：${mergePhonetic(noConcept).kept} 条（代码库，0% 是正常的）`,
  )
  lines.push(
    `用假名代替音标的库 ${notation.length} 个：${mergePhonetic(notation).kept} 条（日文，假名不算音标）`,
  )

  const top = Number(options.top) || 0
  const worst = sortWorstPhonetic(list)
  const shown = top > 0 ? worst.slice(0, top) : worst
  lines.push('')
  lines.push(`—— 最差 ${shown.length} 个库（按覆盖率升序，只含该有音标的库） ——`)
  lines.push(formatPhoneticHead())
  lines.push('-'.repeat(NAME_WIDTH + 5 + 7 * 8))
  for (const row of shown) lines.push(formatPhoneticRow(row))

  lines.push('')
  lines.push('—— 有字段却没显示（真 bug 候选） ——')
  lines.push(
    `原始数据有 usphone / ukphone 的 ${total.rawPhone} 条中，归一化后一个字都显示不出来的 ${total.hidden} 条`,
  )
  lines.push(`（其中原始有 usphone 但 us 空 ${total.lostUs} 条，原始有 ukphone 但 uk 空 ${total.lostUk} 条）`)
  const buggy = list.filter((row) => row.hidden > 0).sort((a, b) => b.hidden - a.hidden)
  if (buggy.length === 0) {
    lines.push('没有发现：数据里有字段的，界面都显示出来了。')
  } else {
    lines.push(`涉及 ${buggy.length} 个库：`)
    for (const row of buggy.slice(0, 10)) {
      const sample = row.hiddenSamples?.[0]
      const detail = sample ? `，例：${sample.word} us=${sample.usphone || '-'} uk=${sample.ukphone || '-'}` : ''
      lines.push(`  ${row.name} ${row.hidden} 条${detail}`)
    }
  }

  if (options.missing?.length) {
    lines.push('')
    lines.push(`⚠ 清单里有 ${options.missing.length} 个库找不到对应 json：${options.missing.slice(0, 8).join(', ')}`)
  }
  if (options.extraFiles?.length) {
    lines.push(
      `ℹ 上游目录另有 ${options.extraFiles.length} 个 json 不在 dicts.index.json 里（不计入总计）`,
    )
  }
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

/** 参数解析（--upstream / --index / --top / --json / --help） */
export function parsePhoneticArgs(argv) {
  const out = {
    // 空串 = 让 main 去猜（worktree 里 ../../qwerty-learner 指错地方）
    upstream: process.env.QAT_UPSTREAM_DICTS ? path.resolve(process.env.QAT_UPSTREAM_DICTS) : '',
    index: INDEX_FILE,
    top: 30,
    json: false,
    help: false,
  }
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--upstream') out.upstream = path.resolve(argv[++i])
    else if (flag === '--index') out.index = path.resolve(argv[++i])
    else if (flag === '--top') out.top = Number(argv[++i]) || 0
    else if (flag === '--json') out.json = true
    else if (flag === '--help' || flag === '-h') out.help = true
  }
  return out
}

/**
 * 找不到上游目录时的兜底：从 `.git` 反推「主仓库在哪」，再用主仓库旁的 qwerty-learner。
 * 这个脚本经常在 `git worktree` 里跑（/tmp/qat-wt/xxx），`../../qwerty-learner` 会指到 /tmp 里去，
 * 但主仓库目录旁边就有上游仓库——所以裸跑也能出数据，不用每次手输 --upstream。
 * @param {string} start 起点目录（插件根）
 * @param {string} fallback audit-dicts 同款默认路径
 * @returns {string[]} 候选目录，按优先级
 */
export function upstreamCandidates(start, fallback) {
  const out = []
  const push = (dir) => {
    if (dir && !out.includes(dir)) out.push(dir)
  }
  push(fallback)
  /** 仓库根旁边 / 里面都可能放上游仓库，两个都试 */
  const pushRepoRoot = (repoRoot) => {
    if (!repoRoot) return
    const parent = path.dirname(repoRoot)
    push(path.join(parent, 'qwerty-learner', 'public', 'dicts'))
    push(path.join(repoRoot, 'qwerty-learner', 'public', 'dicts'))
  }
  let dir = path.resolve(start)
  for (let i = 0; i < 6; i += 1) {
    const gitPath = path.join(dir, '.git')
    try {
      const stat = fs.statSync(gitPath)
      if (stat.isFile()) {
        // worktree：.git 是文本文件，内容是「gitdir: <主仓库>/.git/worktrees/<名字>」
        const text = fs.readFileSync(gitPath, 'utf8')
        const match = text.match(/gitdir:\s*(.+)/)
        if (match) {
          const gitdir = path.resolve(dir, match[1].trim())
          // 依次上溯到仓库根：.../.git/worktrees/x → .../.git → ...
          let cursor = gitdir
          for (let depth = 0; depth < 4; depth += 1) {
            cursor = path.dirname(cursor)
            if (path.basename(cursor) === '.git') {
              pushRepoRoot(path.dirname(cursor))
              break
            }
          }
        }
        break
      }
      if (stat.isDirectory()) {
        pushRepoRoot(dir)
        break
      }
    } catch {
      /* 没 .git 就继续往上找 */
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return out
}

/** 从候选里挑第一个真实存在的目录；都不存在就返回第一个（交给上层打 skip） */
export function pickUpstream(candidates) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : []
  for (const dir of list) {
    try {
      if (fs.existsSync(dir)) return dir
    } catch {
      /* 权限之类，跳过 */
    }
  }
  return list[0] ?? ''
}

/** 读一份词库 json；坏了就返回 null（不炸整个审计） */
function readDictFile(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (Array.isArray(data)) return data
    const first = data && typeof data === 'object' ? Object.values(data)[0] : null
    return Array.isArray(first) ? first : null
  } catch {
    return null
  }
}

function main() {
  const args = parsePhoneticArgs(process.argv)
  if (args.help) {
    console.log('node scripts/audit-phonetic.mjs [--upstream <dicts 目录>] [--index <dicts.index.json>] [--top N] [--json]')
    console.log(`默认上游目录：${DEFAULT_UPSTREAM}`)
    return 0
  }

  const upstream = args.upstream || pickUpstream(upstreamCandidates(PLUGIN_ROOT, DEFAULT_UPSTREAM))
  args.upstream = upstream

  if (!fs.existsSync(upstream)) {
    console.log('[skip] 找不到上游词库目录，跳过音标审计（不算失败）：')
    console.log(`       ${upstream}`)
    console.log('       用 --upstream <dir> 或环境变量 QAT_UPSTREAM_DICTS=<dir> 指到 qwerty-learner/public/dicts')
    return 0
  }

  let dicts = []
  try {
    const index = JSON.parse(fs.readFileSync(args.index, 'utf8'))
    dicts = Array.isArray(index?.dicts) ? index.dicts : []
  } catch {
    console.log(`[skip] 读不到词库清单 ${args.index}，跳过音标审计`)
    return 0
  }

  const { normalizeWord } = loadPlugin()
  const rows = []
  const missing = []
  const used = new Set()

  for (const dict of dicts) {
    const file = dictFilePath(upstream, dict.url)
    used.add(path.basename(file))
    if (!fs.existsSync(file)) {
      missing.push(dict.id || path.basename(file))
      continue
    }
    const raw = readDictFile(file)
    if (!raw) {
      missing.push(dict.id || path.basename(file))
      continue
    }
    const category = dict.languageCategory || 'en'
    rows.push(phoneticRows(raw, category, (row, cat) => normalizeWord(row, cat), { name: path.basename(file) }))
  }

  const extraFiles = fs.readdirSync(upstream).filter((name) => name.endsWith('.json') && !used.has(name))

  if (args.json) {
    console.log(JSON.stringify({ total: mergePhonetic(rows), rows, missing, extraFiles }, null, 2))
    return 0
  }
  console.log(formatPhoneticReport(rows, { top: args.top, extraFiles, missing }))
  return 0
}

// 被 import 时只给纯函数，不动文件系统（realpath 比：macOS 上 /tmp 是 /private/tmp 的软链）
const invoked = (() => {
  if (!process.argv[1]) return false
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(url.fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()
if (invoked) process.exit(main())