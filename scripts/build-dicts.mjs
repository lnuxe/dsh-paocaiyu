#!/usr/bin/env node
/**
 * build-dicts.mjs
 *
 * 从本地 qwerty-learner 仓库抽取 7 个代表性词库，每个均匀采样 80 条，
 * 生成紧凑 JSON：../dicts.generated.json（UTF-8，无 BOM）。
 *
 * 只读 qwerty-learner，不写入该仓库任何文件。
 *
 * 用法：
 *   node scripts/build-dicts.mjs
 *   node scripts/build-dicts.mjs --repo /path/to/qwerty-learner --out ./dicts.generated.json
 */

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const HERE = path.dirname(url.fileURLToPath(import.meta.url))
const DEFAULT_REPO = path.resolve(HERE, '../../qwerty-learner')
const DEFAULT_OUT = path.resolve(HERE, '../dicts.generated.json')

function parseArgs(argv) {
  const out = { repo: DEFAULT_REPO, out: DEFAULT_OUT, perDict: 80 }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--repo') out.repo = path.resolve(argv[++i])
    else if (a === '--out') out.out = path.resolve(argv[++i])
    else if (a === '--per-dict') out.perDict = Number(argv[++i])
  }
  return out
}

const ARGS = parseArgs(process.argv)

/** 选中的词库 id（来自 src/resources/dictionary.ts 的真实 id），覆盖不同分类 */
const TARGET_IDS = ['cet4', 'cet6', 'kaoyan', 'toefl', 'ielts', 'bec2', 'coder']

/**
 * category 取仓库里的真实分类名，中文优先：
 * 默认用 tags[0]（若为中文），否则回落到 category 字段。
 * 个别 tag 太泛（如 coder 的 tag 是 "通用"）时按词库真实 category 覆盖。
 */
const CATEGORY_OVERRIDE = {
  coder: '代码练习',
}

const CJK = /[\u3400-\u9fff]/
const WORD_RE = /^[a-z]+(?:['-][a-z]+)*$/

/* ------------------------------------------------------------------ */
/* 1. 解析 src/resources/dictionary.ts，拿到 id/name/category/tags/url */
/* ------------------------------------------------------------------ */
function loadDictionaryMeta(repo) {
  const file = path.join(repo, 'src/resources/dictionary.ts')
  const src = fs.readFileSync(file, 'utf8')
  const blocks = [...src.matchAll(/\{\s*id: '([^']*)',([\s\S]*?)\n  \},/g)]
  const meta = new Map()
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
    meta.set(id, {
      id,
      name: str('name'),
      description: str('description'),
      category: str('category'),
      tags,
      url: str('url'),
      length: lengthM ? Number(lengthM[1]) : 0,
    })
  }
  return { file, meta }
}

/* ------------------------------------------------------------------ */
/* 2. 文本清洗                                                        */
/* ------------------------------------------------------------------ */
function cleanZh(trans) {
  if (!trans) return ''
  const list = Array.isArray(trans) ? trans : [String(trans)]
  return list
    .map((t) =>
      String(t)
        .replace(/\r?\n/g, ' ') // 去换行
        .replace(/[\u3000\t]+/g, ' ') // 全角空格 / tab
        .replace(/\s+/g, ' ')
        .replace(/\s*([，。；：、！？（）「」])\s*/g, '$1') // 中文标点两侧不留空格
        .replace(/^[\s;；,，]+|[\s;；,，]+$/g, '')
        .trim(),
    )
    .filter(Boolean)
    .join('；')
    .replace(/\s+/g, ' ')
    .trim()
}

/** ukphone 优先，其次 usphone；多音变体用 ; 分隔时取第一个；统一包成 /.../ */
function buildIpa(entry) {
  const raw = (entry.ukphone || entry.usphone || '').toString().trim()
  if (!raw) return ''
  let first = raw.split(/[;；]/)[0].trim()
  first = first.replace(/^[/[\].,，、\s]+/, '').replace(/[/[\]\s]+$/, '')
  if (!first) return ''
  // qwerty-learner 用 ' 表示重音，转成标准 IPA 重音符
  first = first.replace(/'/g, 'ˈ').replace(/\s+/g, '')
  return `/${first}/`
}

/* ------------------------------------------------------------------ */
/* 3. 读词条 + 过滤 + 均匀采样                                         */
/* ------------------------------------------------------------------ */
function loadWords(repo, meta) {
  const jsonPath = path.join(repo, 'public', meta.url.replace(/^\//, ''))
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  const arr = Array.isArray(data) ? data : data[Object.keys(data)[0]]
  if (!Array.isArray(arr)) throw new Error(`词库不是数组: ${jsonPath}`)

  // 整库都没有音标字段时（如代码词库）不强制音标，ipa 留空串
  const dictHasPhone = arr.some((e) => (e.ukphone || '').trim() || (e.usphone || '').trim())

  const seen = new Set()
  const valid = []
  for (const e of arr) {
    const w = (e.name || '').toString().trim()
    if (!WORD_RE.test(w)) continue // 只允许小写字母 + - 和 '
    if (seen.has(w)) continue
    const zh = cleanZh(e.trans)
    if (!zh || !CJK.test(zh)) continue // 必须有中文释义
    const ipa = buildIpa(e)
    if (dictHasPhone && !ipa) continue // 有音标体系的库，缺音标的跳过
    seen.add(w)
    valid.push({ w, ipa, zh })
  }
  return { jsonPath, total: arr.length, valid }
}

/** 均匀采样：在有效词条上按等间距取索引，不扎堆在开头 */
function sampleUniform(valid, n) {
  if (valid.length <= n) return valid.slice()
  const picked = []
  const used = new Set()
  for (let i = 0; i < n; i++) {
    let idx = Math.floor((i * valid.length) / n)
    while (used.has(idx) && idx < valid.length - 1) idx++
    if (used.has(idx)) continue
    used.add(idx)
    picked.push(valid[idx])
  }
  return picked
}

/* ------------------------------------------------------------------ */
/* 4. 主流程                                                          */
/* ------------------------------------------------------------------ */
function main() {
  const { file: dictFile, meta } = loadDictionaryMeta(ARGS.repo)
  const usedSources = [dictFile]
  const dicts = []

  for (const id of TARGET_IDS) {
    const m = meta.get(id)
    if (!m) throw new Error(`dictionary.ts 里找不到 id=${id}`)
    const { jsonPath, total, valid } = loadWords(ARGS.repo, m)
    usedSources.push(jsonPath)

    const words = sampleUniform(valid, ARGS.perDict)
    if (words.length < ARGS.perDict) {
      console.warn(`[warn] ${id} 只采到 ${words.length} 条（有效词条 ${valid.length}）`)
    }

    const category =
      CATEGORY_OVERRIDE[id] ||
      (m.tags[0] && CJK.test(m.tags[0]) ? m.tags[0] : m.category)

    dicts.push({ id, name: m.name, category, words })
    console.log(
      `[ok] ${id.padEnd(8)} 总词条 ${String(total).padStart(5)} 有效 ${String(valid.length).padStart(5)} 采样 ${words.length}`,
    )
  }

  const payload = {
    source: 'qwerty-learner',
    generatedAt: new Date().toISOString().slice(0, 10),
    dicts,
  }

  fs.mkdirSync(path.dirname(ARGS.out), { recursive: true })
  fs.writeFileSync(ARGS.out, JSON.stringify(payload), 'utf8')

  const bytes = fs.statSync(ARGS.out).size
  console.log('---')
  console.log('写入:', ARGS.out)
  console.log('字节:', bytes, `(${(bytes / 1024).toFixed(1)} KB)`)
  console.log('源文件:')
  for (const s of usedSources) console.log('  -', s)
}

main()