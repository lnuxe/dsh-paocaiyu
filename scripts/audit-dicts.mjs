#!/usr/bin/env node
/**
 * audit-dicts.mjs
 *
 * 词库审计：直接读上游 qwerty-learner 的 `public/dicts/*.json` 全量数据，
 * 用 **client.js 里同一套归一化函数**（`__test.normalizeWord` / `__test.inspectWord`）
 * 跑一遍，输出「每个词库：原始条数 / 保留条数 / 丢的原因分布 / 有音标比例」，
 * 最后给总计与丢词率。
 *
 * 词库清单取 `dicts.index.json`（插件运行时加载的就是它，371 个库），
 * 所以口径和真机完全一致；上游目录里没被清单引用的 json 只统计、不参与总计。
 *
 * 用法：
 *   node scripts/audit-dicts.mjs
 *   node scripts/audit-dicts.mjs --upstream /path/to/qwerty-learner/public/dicts
 *   QAT_UPSTREAM_DICTS=/path/to/dicts node scripts/audit-dicts.mjs
 *   node scripts/audit-dicts.mjs --top 20        # 只打印丢得最多的 20 个库
 *
 * 上游目录不存在时：打印提示并以 **退出码 0** 结束（不要让 CI 挂）。
 *
 * 纯函数（auditRows / mergeStats / formatReport …）单独导出，测试直接 import。
 */

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import vm from 'node:vm'

const HERE = path.dirname(url.fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(HERE, '..')

/** 上游全量词库目录（默认按兄弟仓库布局找） */
export const DEFAULT_UPSTREAM = path.resolve(PLUGIN_ROOT, '../../qwerty-learner/public/dicts')
/** 词库清单：审计按它跑，和插件运行时加载的是同一份 */
export const INDEX_FILE = path.resolve(PLUGIN_ROOT, 'dicts.index.json')
/** 插件本体：审计里的 normalize 就来自它 */
export const CLIENT_FILE = path.resolve(PLUGIN_ROOT, 'client.js')

/** 丢弃原因桶，和 client.js 的 DROP_REASONS 一一对应（other 兜底） */
export const REASON_KEYS = ['empty', 'tooLong', 'badChars', 'noZh', 'other']

/* ------------------------------------------------------------------ */
/* 纯函数：统计与排版（测试直接断言这一层）                             */
/* ------------------------------------------------------------------ */

/** 空统计桶 */
export function emptyStats() {
  const reasons = {}
  for (const key of REASON_KEYS) reasons[key] = 0
  return { raw: 0, kept: 0, dropped: 0, withIpa: 0, withZh: 0, withNotation: 0, reasons }
}

/**
 * 统计一批裸词条。
 * @param {Array} rows 上游裸词条（{ name, trans[], usphone, ukphone, notation? }）
 * @param {(raw: object) => object|null} normalize 归一化函数（插件里的 normalizeWord）
 * @param {(raw: object) => { ok: boolean, reason: string }} [inspect] 体检函数（插件里的 inspectWord）
 *   —— 只对「被丢弃」的条目调用；不给就把所有丢弃都记成 other
 * @returns {{ raw: number, kept: number, dropped: number, withIpa: number,
 *   withZh: number, withNotation: number, reasons: Record<string, number> }}
 */
export function auditRows(rows, normalize, inspect) {
  const stats = emptyStats()
  for (const raw of rows || []) {
    stats.raw += 1
    const word = normalize ? normalize(raw) : null
    if (!word) {
      stats.dropped += 1
      const reason = inspect ? (inspect(raw)?.reason || 'other') : 'other'
      const key = Object.prototype.hasOwnProperty.call(stats.reasons, reason) ? reason : 'other'
      stats.reasons[key] += 1
      continue
    }
    stats.kept += 1
    // 「有音标」按保留词条算：只要 us / uk / ipa 有一支就算
    if (word.ipa || word.us || word.uk) stats.withIpa += 1
    if (word.zh) stats.withZh += 1
    if (word.notation) stats.withNotation += 1
  }
  return stats
}

/** 把多个词库的统计并成一个总计 */
export function mergeStats(list) {
  const total = emptyStats()
  for (const stats of list || []) {
    total.raw += stats.raw
    total.kept += stats.kept
    total.dropped += stats.dropped
    total.withIpa += stats.withIpa
    total.withZh += stats.withZh
    total.withNotation += stats.withNotation
    for (const key of REASON_KEYS) total.reasons[key] += stats.reasons?.[key] || 0
  }
  return total
}

/** part / whole，whole 为 0 时给 0（避免 NaN 污染报表） */
export function ratio(part, whole) {
  const base = Number(whole) || 0
  if (!base) return 0
  return (Number(part) || 0) / base
}

/** 百分比文本：0.00426 → '0.426%' */
export function formatPct(value, digits = 1) {
  return `${((Number(value) || 0) * 100).toFixed(digits)}%`
}

const NAME_WIDTH = 34

function pad(text, width) {
  const value = String(text ?? '')
  return value.length >= width ? value : value + ' '.repeat(width - value.length)
}

function padLeft(text, width) {
  const value = String(text ?? '')
  return value.length >= width ? value : ' '.repeat(width - value.length) + value
}

/**
 * 一行的文本（词库名 + 六列数字 + 音标比例）
 * @param {{ name: string } & ReturnType<typeof emptyStats>} row
 */
export function formatRow(row) {
  return [
    pad(row.name, NAME_WIDTH),
    padLeft(row.raw, 7),
    padLeft(row.kept, 7),
    padLeft(row.dropped, 7),
    padLeft(row.reasons.empty, 6),
    padLeft(row.reasons.tooLong, 8),
    padLeft(row.reasons.badChars, 8),
    padLeft(row.reasons.noZh, 6),
    padLeft(formatPct(ratio(row.withIpa, row.kept)), 7),
  ].join(' ')
}

/** 表头 */
export function formatHead() {
  return [
    pad('词库', NAME_WIDTH),
    padLeft('原始', 7),
    padLeft('保留', 7),
    padLeft('丢弃', 7),
    padLeft('empty', 6),
    padLeft('tooLong', 8),
    padLeft('badChars', 8),
    padLeft('noZh', 6),
    padLeft('有音标', 7),
  ].join(' ')
}

/**
 * 整份报表文本（纯函数：给数据就出字符串，不碰文件系统）
 * @param {Array<{name: string} & ReturnType<typeof emptyStats>>} rows 每个词库一行
 * @param {{ top?: number, extraFiles?: string[], missing?: string[] }} [options]
 *   top：只打印丢词最多的前 N 个库（0/不传 = 全打）
 * @returns {string}
 */
export function formatReport(rows, options = {}) {
  const list = (rows || []).slice().sort((a, b) => b.dropped - a.dropped || a.name.localeCompare(b.name))
  const top = Number(options.top) || 0
  const shown = top > 0 ? list.slice(0, top) : list
  const lines = []

  lines.push('词库审计（口径 = client.js 的 normalizeWord / inspectWord）')
  lines.push(`词库数 ${list.length} 个${top > 0 ? `（下面只显示丢词最多的 ${shown.length} 个）` : ''}`)
  lines.push('')
  lines.push(formatHead())
  lines.push('-'.repeat(NAME_WIDTH + 7 * 4 + 6 + 8 + 8 + 7 + 8))
  for (const row of shown) lines.push(formatRow(row))

  const total = mergeStats(list)
  lines.push('')
  lines.push('—— 总计 ——')
  lines.push(
    `原始 ${total.raw} 条 → 保留 ${total.kept} 条，丢弃 ${total.dropped} 条（丢词率 ${formatPct(ratio(total.dropped, total.raw), 3)}）`,
  )
  lines.push(
    `丢因：empty ${total.reasons.empty} / tooLong ${total.reasons.tooLong} / badChars ${total.reasons.badChars} / noZh ${total.reasons.noZh}${total.reasons.other ? ` / other ${total.reasons.other}` : ''}`,
  )
  lines.push(
    `保留词条里有音标 ${total.withIpa} 条（${formatPct(ratio(total.withIpa, total.kept))}），有释义 ${total.withZh} 条，有假名 notation ${total.withNotation} 条`,
  )

  if (options.missing?.length) {
    lines.push('')
    lines.push(`⚠ 清单里有 ${options.missing.length} 个库找不到对应 json：${options.missing.slice(0, 8).join(', ')}${options.missing.length > 8 ? ' …' : ''}`)
  }
  if (options.extraFiles?.length) {
    lines.push(
      `ℹ 上游目录另有 ${options.extraFiles.length} 个 json 不在 dicts.index.json 里（不计入总计）：${options.extraFiles.slice(0, 6).join(', ')}${options.extraFiles.length > 6 ? ' …' : ''}`,
    )
  }
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* 取插件里的归一化函数                                                 */
/* ------------------------------------------------------------------ */

/**
 * 在 vm 沙箱里加载 client.js，拿到 `__test`（只用到纯函数，不碰 DOM）。
 * 测试脚本用的是同一招：__ModuleLoader__.load 收工厂，再喂一个 react 桩。
 */
export function loadPlugin(file = CLIENT_FILE) {
  const source = fs.readFileSync(file, 'utf8')
  let factory
  const sandbox = {
    console,
    window: {
      __ModuleLoader__: {
        load({ id, factory: fn }) {
          if (id !== '@lnuxe/paocaiyu') throw new Error(`unexpected id: ${id}`)
          factory = fn
        },
      },
    },
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'client.js' })
  const requireStub = (name) => {
    if (name !== 'react') throw new Error(`unexpected require: ${name}`)
    return {
      createElement: () => null,
      useCallback: (f) => f,
      useMemo: (f) => f(),
      useRef: (value) => ({ current: value }),
      useState: (value) => [value, () => {}],
      useEffect: () => {},
      useSyncExternalStore: () => 0,
    }
  }
  return factory(requireStub).__test
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

/** 参数解析（--upstream / --index / --top / --help） */
export function parseArgs(argv) {
  const out = {
    upstream: process.env.QAT_UPSTREAM_DICTS ? path.resolve(process.env.QAT_UPSTREAM_DICTS) : DEFAULT_UPSTREAM,
    index: INDEX_FILE,
    top: 0,
    help: false,
  }
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--upstream') out.upstream = path.resolve(argv[++i])
    else if (flag === '--index') out.index = path.resolve(argv[++i])
    else if (flag === '--top') out.top = Number(argv[++i]) || 0
    else if (flag === '--help' || flag === '-h') out.help = true
  }
  return out
}

/** `/dicts/CET4_T.json` / `./dicts/x.json` → 磁盘上的绝对路径 */
export function dictFilePath(upstreamDir, dictUrl) {
  const rel = String(dictUrl ?? '').replace(/^\.?\/?dicts\//, '').replace(/^\/+/, '')
  return path.join(upstreamDir, rel)
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
  const args = parseArgs(process.argv)
  if (args.help) {
    console.log('node scripts/audit-dicts.mjs [--upstream <dicts 目录>] [--index <dicts.index.json>] [--top N]')
    console.log(`默认上游目录：${DEFAULT_UPSTREAM}`)
    return 0
  }

  if (!fs.existsSync(args.upstream)) {
    console.log('[skip] 找不到上游词库目录，跳过审计（不算失败）：')
    console.log(`       ${args.upstream}`)
    console.log('       用 --upstream <dir> 或环境变量 QAT_UPSTREAM_DICTS=<dir> 指到 qwerty-learner/public/dicts')
    return 0
  }

  let dicts = []
  try {
    const index = JSON.parse(fs.readFileSync(args.index, 'utf8'))
    dicts = Array.isArray(index?.dicts) ? index.dicts : []
  } catch {
    console.log(`[skip] 读不到词库清单 ${args.index}，跳过审计`)
    return 0
  }

  const { normalizeWord, inspectWord } = loadPlugin()
  const rows = []
  const missing = []
  const used = new Set()

  for (const dict of dicts) {
    const file = dictFilePath(args.upstream, dict.url)
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
    // 语言分类取自清单，和运行时 loadDictWords 用的是同一个字段
    const category = dict.languageCategory || 'en'
    const stats = auditRows(raw, (row) => normalizeWord(row, category), (row) => inspectWord(row, category))
    rows.push({ name: path.basename(file), ...stats })
  }

  const extraFiles = fs
    .readdirSync(args.upstream)
    .filter((name) => name.endsWith('.json') && !used.has(name))

  console.log(formatReport(rows, { top: args.top, extraFiles, missing }))
  return 0
}

// 被 import 时只给纯函数，不动文件系统。
// 用 realpath 比：macOS 上 /tmp 是 /private/tmp 的软链，直接比字符串在别的 cwd 下会判错
const invoked = (() => {
  if (!process.argv[1]) return false
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(url.fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()
if (invoked) process.exit(main())