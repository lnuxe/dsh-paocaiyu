/**
 * 一次性统计：上游 public/dicts/*.json 里 usphone / ukphone 的脏形态分类计数。
 * 口径与 client.js 的 cleanPhone 对齐（剥外层 / [ ]、压空格、全角→半角、占位值归空）。
 *
 *   node scripts/scan-phone-shapes.mjs --upstream <上游仓库根>   # 或用 QAT_UPSTREAM
 *
 * 只读上游词库，不写任何文件。分类互斥，按「先命中先归类」的固定顺序计数：
 *   empty       空串
 *   placeholder '-' / 'null' 之类
 *   wrapped      外层带 / 或 [ ]（含两者叠加 /[...]/）
 *   fullwidth    含全角斜杠或全角空格
 *   spaces       前后有空格 / 中间连续空格
 *   dual         一个字段里用 / 塞了两支（bɑ:θ/bæθ）
 *   semicolon    多音，用 ; 分隔
 *   clean        以上都不是
 */
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const upstreamArg = args.indexOf('--upstream')
// 上游仓库路径必须显式传（不把任何本机路径写进仓库）
const upstream = upstreamArg >= 0 && args[upstreamArg + 1]
  ? args[upstreamArg + 1]
  : (process.env.QAT_UPSTREAM ?? '')
if (!upstream) {
  console.error('用法：node scripts/scan-phone-shapes.mjs --upstream <上游仓库根>（或设 QAT_UPSTREAM）')
  process.exit(2)
}
const dir = path.join(upstream, 'public', 'dicts')
const FIELDS = ['usphone', 'ukphone', 'ipa']
const PLACEHOLDER = /^(?:[-–—−_~?]+|null|undefined|none|n\/?a|无|空)$/i

const buckets = { total: 0, empty: 0, placeholder: 0, wrapped: 0, fullwidth: 0, spaces: 0, dual: 0, semicolon: 0, clean: 0 }
const shapes = { slashWrap: 0, bracket: 0, fullwidthSlash: 0, fullwidthSpace: 0, fullwidthBracket: 0, spaces: 0, empty: 0, placeholder: 0 }
const samples = new Map()

function classify(raw) {
  const text = String(raw)
  if (!text.trim()) return 'empty'
  if (PLACEHOLDER.test(text.replace(/^[\s/[\]]+|[\s/[\]]+$/g, ''))) return 'placeholder'
  if (/[／［］\u3000]/.test(text)) return 'fullwidth'
  const body = text.replace(/^[\s/[\]]+/, '').replace(/[\s/[\]]+$/, '')
  if (body.includes('/')) return 'dual'
  if (body !== text.trim()) return 'wrapped'
  if (/\s{2,}|^\s|\s$/.test(text)) return 'spaces'
  if (/;/.test(text)) return 'semicolon'
  return 'clean'
}

for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.json'))) {
  let rows
  try {
    rows = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
  } catch {
    continue
  }
  if (!Array.isArray(rows)) continue
  for (const row of rows) {
    for (const field of FIELDS) {
      const raw = row?.[field]
      if (raw === undefined || raw === null) {
        // 「没有这个字段」不算脏，只是缺
        continue
      }
      buckets.total += 1
      const kind = classify(raw)
      buckets[kind] += 1
      if (!samples.has(kind)) samples.set(kind, `${file} · ${row?.name ?? '?'} → ${JSON.stringify(raw)}`)

      // 第二组口径：形态可以叠加（`[/ˈæpl/]` 同时算「斜杠包裹」和「方括号」），
      // 这一组只回答「有多少条沾上了某种脏」，不互斥
      const text = String(raw).trim()
      if (/^\//.test(text) || /\/$/.test(text) || /\[\//.test(text) || /\/\]/.test(text)) shapes.slashWrap += 1
      if (/\[|\]/.test(text)) shapes.bracket += 1
      if (/／/.test(text)) shapes.fullwidthSlash += 1
      if (/\u3000/.test(text)) shapes.fullwidthSpace += 1
      if (/［|］/.test(text)) shapes.fullwidthBracket += 1
      if (/^\s|\s$|\s{2,}/.test(String(raw))) shapes.spaces += 1
      if (!text) shapes.empty += 1
      if (/^(?:[-–—−_~?]+|null|undefined|none|n\/?a|无|空)$/i.test(text)) shapes.placeholder += 1
    }
  }
}

const order = ['empty', 'placeholder', 'wrapped', 'fullwidth', 'spaces', 'semicolon', 'dual', 'clean']
console.log(`扫描 ${dir}`)
for (const key of ['total', ...order]) {
  const line = `${key.padEnd(12)} ${String(buckets[key]).padStart(8)}`
  console.log(samples.has(key) ? `${line}   例：${samples.get(key)}` : line)
}
const dirty = buckets.total - buckets.clean
console.log(`脏（需要清洗） ${dirty} / ${buckets.total} = ${(dirty / buckets.total * 100).toFixed(2)}%`)
console.log('\n叠加口径（一条可能同时命中多种）：')
for (const [key, value] of Object.entries(shapes)) console.log(`${key.padEnd(18)} ${String(value).padStart(8)}`)