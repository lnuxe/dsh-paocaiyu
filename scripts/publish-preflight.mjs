#!/usr/bin/env node
/**
 * 发布前自检：插件市场（DSH bundle）要的东西是不是都齐了。
 *
 * 只读本地文件，不联网、不发布。任一项不过就退出码 1，
 * 让 `npm publish` 的 prepublishOnly 之类直接拦住。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const exists = (rel) => fs.existsSync(path.join(root, rel))
const pkg = JSON.parse(read('package.json'))

const rows = []
const add = (name, ok, detail) => rows.push({ name, ok, detail })

// 1) 必填元信息
for (const field of ['name', 'version', 'description', 'license', 'author', 'repository', 'homepage']) {
  const value = pkg[field]
  add(`package.json ${field}`, Boolean(value), typeof value === 'string' ? value : value?.url ?? '')
}
add('不是 private（否则发布不出去）', pkg.private !== true, `private=${String(pkg.private)}`)
add('版本号是发布态（非 0.x 也行，但不能缺）', /^\d+\.\d+\.\d+/.test(pkg.version), pkg.version)
add('GPL 衍生声明（词库来自 qwerty-learner）', pkg.license === 'GPL-3.0-only', pkg.license)
add('有 LICENSE 文件', exists('LICENSE'), 'LICENSE')
add('有 NOTICE（上游署名）', exists('NOTICE'), 'NOTICE')

// 2) bundle 入口
add('dsh.bundle.patch 指向存在文件', Boolean(pkg.dsh?.bundle?.patch) && exists(pkg.dsh.bundle.patch), pkg.dsh?.bundle?.patch ?? '')
add('dsh.client.platform = web', pkg.dsh?.client?.platform === 'web', pkg.dsh?.client?.platform ?? '')
add('dsh.client.inject 声明了宿主 UI 包',
  Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.length > 0,
  (pkg.dsh?.client?.inject ?? []).join(', '))
add('cordis.patch.yml 里的 name 和包名一致',
  read('cordis.patch.yml').includes(pkg.name), pkg.name)

// 2b) 包名三处一致（boot roster 用包名当 row id，注册名对不上就挂不上）
add('client.js 的模块 id 等于包名',
  read('client.js').includes(`id: '${pkg.name}'`),
  `期望 id: '${pkg.name}'`)
add('index.js 的 plugin name 是包名末段',
  read('index.js').includes(`export const name = '${pkg.name.split('/').pop()}'`),
  pkg.name.split('/').pop())

// 3) 市场卡片：标题/描述/图标
add('导出 ./package.json（字段回退要用）', pkg.exports?.['./package.json'] === './package.json', pkg.exports?.['./package.json'] ?? '')
add('导出 ./locale/*.json', pkg.exports?.['./locale/*.json'] === './locale/*.json', pkg.exports?.['./locale/*.json'] ?? '')
add('清单里有 icon 字段（卡片插画）', typeof pkg.icon === 'string' && exists(pkg.icon), pkg.icon ?? '')
add('导出 ./icon', pkg.exports?.['./icon'] === pkg.icon, pkg.exports?.['./icon'] ?? '')
for (const lang of ['en', 'zh']) {
  const rel = `locale/${lang}.json`
  if (!exists(rel)) {
    add(`locale/${lang}.json`, false, '缺失')
    continue
  }
  let meta = null
  try {
    meta = JSON.parse(read(rel)).meta ?? null
  } catch (err) {
    add(`${rel} 是合法 JSON`, false, String(err.message))
    continue
  }
  add(`${rel} 有 meta.title`, typeof meta?.title === 'string' && meta.title.trim().length > 0, meta?.title ?? '')
  add(`${rel} 有 meta.description`, typeof meta?.description === 'string' && meta.description.trim().length > 0, (meta?.description ?? '').slice(0, 40))
}

// 4) files 覆盖：发布包里必须有这些
const files = Array.isArray(pkg.files) ? pkg.files : []
const need = [
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'dicts.index.json',
  'dicts.generated.json',
  'icon.svg',
  'locale/*.json',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'NOTICE',
]
for (const item of need) {
  add(`files 含 ${item}`, files.includes(item), files.includes(item) ? '' : '漏了会被 .npmignore 挡掉')
}

// 5) 图标体积限制（DSH 卡片图 <= 256 KiB，SVG/PNG/JPG/WebP）
if (exists(pkg.icon ?? '')) {
  const size = fs.statSync(path.join(root, pkg.icon)).size
  add('icon <= 256 KiB', size <= 256 * 1024, `${Math.round(size / 1024)} KiB`)
  add('icon 是受支持格式', /\.(svg|png|jpe?g|webp)$/i.test(pkg.icon), pkg.icon)
}

// 6) 客户端体积（宿主会整包注入，太大拖启动）
const clientSize = fs.statSync(path.join(root, 'client.js')).size
add('client.js 未超硬线', clientSize < 480_000, `${clientSize} 字节`)

const failed = rows.filter((row) => !row.ok)
for (const row of rows) {
  console.log(`${row.ok ? '  OK  ' : ' FAIL '} ${row.name}${row.detail ? `  — ${row.detail}` : ''}`)
}
console.log(`\n${failed.length === 0 ? 'PREFLIGHT OK' : 'PREFLIGHT FAILED'} — ${rows.length} 项，${failed.length} 项失败`)
process.exit(failed.length === 0 ? 0 : 1)