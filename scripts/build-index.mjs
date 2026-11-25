#!/usr/bin/env node
/**
 * build-index.mjs
 *
 * 从本地 qwerty-learner 仓库生成**全量词库元数据索引**（只含元数据，不含词条）：
 * ../dicts.index.json —— 373 条 { id, name, category, tags, length, url, languageCategory }
 *
 * 词条数据（74MB）不内联，运行时按需拉取，见 docs/qwerty-learner-migration.md §2。
 *
 * 只读 qwerty-learner，不写入该仓库任何文件。
 *
 * 用法：
 *   node scripts/build-index.mjs
 *   node scripts/build-index.mjs --repo /path/to/qwerty-learner --out ./dicts.index.json
 */

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const HERE = path.dirname(url.fileURLToPath(import.meta.url))
const DEFAULT_REPO = path.resolve(HERE, '../../qwerty-learner')
const DEFAULT_OUT = path.resolve(HERE, '../dicts.index.json')
const DEFAULT_CLIENT = path.resolve(HERE, '../client.js')

function parseArgs(argv) {
  const out = { repo: DEFAULT_REPO, out: DEFAULT_OUT, pin: '', inline: '', count: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--repo') out.repo = path.resolve(argv[++i])
    else if (a === '--out') out.out = path.resolve(argv[++i])
    else if (a === '--pin') out.pin = (argv[++i] || '').trim()
    else if (a.startsWith('--pin=')) out.pin = a.slice('--pin='.length).trim()
    else if (a === '--inline') out.inline = path.resolve(argv[++i] || DEFAULT_CLIENT)
    else if (a === '--inline=') out.inline = path.resolve(a.slice('--inline='.length))
    // --count：不信上游 dictionary.ts 里手写的 length，直接数 public/dicts 的真实条数
    else if (a === '--count') out.count = true
  }
  return out
}

const ARGS = parseArgs(process.argv)

/** 解析 src/resources/dictionary.ts：词库元数据是纯字面量，用正则逐块取字段 */
function loadMeta(repo) {
  const file = path.join(repo, 'src/resources/dictionary.ts')
  const src = fs.readFileSync(file, 'utf8')
  const blocks = [...src.matchAll(/\{\s*id: '([^']*)',([\s\S]*?)\n  \},/g)]
  const list = []
  for (const b of blocks) {
    const id = b[1]
    const body = b[2]
    const str = (k) => {
      const m = body.match(new RegExp(`${k}: '([^']*)'`))
      return m ? m[1] : ''
    }
    const tagsRaw = (body.match(/tags: \[([^\]]*)\]/) || [, ''])[1]
    const tags = [...tagsRaw.matchAll(/'([^']*)'/g)].map((m) => m[1])
    const lengthM = body.match(/length: (\d+)/)
    const url = str('url')
    if (!id || !url) continue
    list.push({
      id,
      name: str('name') || id,
      category: str('category') || '其它',
      tags,
      length: lengthM ? Number(lengthM[1]) : 0,
      url,
      languageCategory: str('languageCategory') || 'en',
    })
  }
  return { file, list }
}

function inlineClient(file, payload) {
  const source = fs.readFileSync(file, 'utf8')
  const startTag = source.indexOf('@dict-index:start')
  const endTag = source.indexOf('@dict-index:end')
  if (startTag < 0 || endTag < 0) throw new Error('client.js 里没找到 @dict-index:start / @dict-index:end 标记')
  const from = source.lastIndexOf('/*', startTag)
  const startCommentEnd = source.indexOf('*/', startTag) + 2
  const to = source.indexOf('*/', endTag) + 2
  if (from < 0 || to <= startCommentEnd) throw new Error('标记注释结构不对，检查 client.js')

  const meta = {
    source: payload.source,
    ...(payload.pinned ? { pinned: payload.pinned } : {}),
    generatedAt: payload.generatedAt,
    chapterLength: payload.chapterLength,
    dicts: payload.dicts,
  }
  const head = source.slice(from, startCommentEnd)
  const block = `${head} const DICT_INDEX = ${JSON.stringify(meta)} /* @dict-index:end */`
  const next = source.slice(0, from) + block + source.slice(to)
  fs.writeFileSync(file, next, 'utf8')
  console.log('已内联到:', file, `(${(fs.statSync(file).size / 1024).toFixed(1)} KB)`)
}

/**
 * 上游 dictionary.ts 的 `length` 是手写的，实测有 8 个库跟真实条数差 1–2 条。
 * 章节数、进度、"总词数" 全挂在这个字段上，所以按 --count 直接数一遍 JSON。
 * 数不到（文件不在本地）就沿用声明值，并单独报出来。
 */
function recount(repo, dicts) {
  const dir = path.join(repo, 'public/dicts')
  const diffs = []
  let missing = 0
  for (const dict of dicts) {
    const file = path.join(dir, path.basename(dict.url))
    let rows = null
    try {
      rows = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      missing += 1
      continue
    }
    if (!Array.isArray(rows)) {
      missing += 1
      continue
    }
    if (rows.length !== dict.length) {
      diffs.push({ id: dict.id, declared: dict.length, real: rows.length })
      dict.length = rows.length
    }
  }
  return { diffs, missing }
}

function main() {
  const { file, list } = loadMeta(ARGS.repo)
  if (!list.length) throw new Error('没解析出任何词库，检查 dictionary.ts 格式')

  // 去重：上游 dictionary.ts 有 373 条记录，其中 2 个 id 重复
  const seen = new Set()
  const dicts = []
  for (const item of list) {
    if (seen.has(item.id)) {
      console.warn(`[warn] 重复 id: ${item.id}，保留第一条`)
      continue
    }
    seen.add(item.id)
    dicts.push(item)
  }

  if (ARGS.count) {
    const { diffs, missing } = recount(ARGS.repo, dicts)
    console.log('校对条数：修正', diffs.length, '个库', missing ? `/ ${missing} 个库文件不在本地，沿用声明值` : '')
    for (const item of diffs) {
      console.log(`  ${item.id}: 声明 ${item.declared} → 实际 ${item.real}（差 ${item.real - item.declared}）`)
    }
  }

  const payload = {
    source: 'qwerty-learner',
    // 上游没有 release tag：钉 commit SHA，客户端优先按 SHA 拉，失败再回退 master
    ...(ARGS.pin ? { pinned: ARGS.pin } : {}),
    generatedAt: new Date().toISOString().slice(0, 10),
    // 章节长度，对齐上游 src/constants/index.ts:3
    chapterLength: 20,
    dicts,
  }

  fs.mkdirSync(path.dirname(ARGS.out), { recursive: true })
  fs.writeFileSync(ARGS.out, JSON.stringify(payload), 'utf8')

  const bytes = fs.statSync(ARGS.out).size
  const totalWords = dicts.reduce((sum, d) => sum + d.length, 0)
  const byCat = {}
  for (const d of dicts) byCat[d.category] = (byCat[d.category] || 0) + 1
  const byLang = {}
  for (const d of dicts) byLang[d.languageCategory] = (byLang[d.languageCategory] || 0) + 1

  console.log('---')
  console.log('写入:', ARGS.out)
  console.log('字节:', bytes, `(${(bytes / 1024).toFixed(1)} KB)`)
  console.log('词库:', dicts.length, '总词条:', totalWords)
  console.log('分类:', Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(' / '))
  console.log('语言:', Object.entries(byLang).map(([c, n]) => `${c} ${n}`).join(' / '))
  console.log('源文件:', file)
  if (ARGS.pin) console.log('钉住提交:', ARGS.pin)
  if (ARGS.inline) inlineClient(ARGS.inline, payload)
}

main()
