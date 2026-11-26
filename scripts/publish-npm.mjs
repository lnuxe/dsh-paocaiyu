#!/usr/bin/env node
/**
 * 一条命令发到 npm（DSH 插件市场查的就是 npm registry）。
 *
 *   npm run publish:npm            # 自检 → 查登录 → 发布 → 回读验证
 *   npm run publish:npm -- --dry   # 只走前两步，不真发
 *
 * 需要先有一次凭据，二选一：
 *   npm login                      # 交互登录
 *   export NODE_AUTH_TOKEN=npm_xxx # 或直接用 granular access token
 *
 * 退出码：0 已发布 / 2 缺凭据（没登录）/ 1 其它失败。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const dry = process.argv.includes('--dry')
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })

const step = (n, text) => console.log(`\n[${n}/4] ${text}`)
const die = (msg, code = 1) => { console.error(`\n✗ ${msg}`); process.exit(code) }

// 1) 自检
step(1, '发布自检 prepublish-check')
try {
  const out = run('npm', ['run', '-s', 'prepublish-check'])
  console.log(out.trim().split('\n').slice(-1)[0])
} catch (error) {
  console.error((error.stdout ?? '') + (error.stderr ?? ''))
  die('自检没过，先修完再发')
}

// 2) 凭据
step(2, '检查 npm 凭据')
let who = ''
try {
  who = run('npm', ['whoami']).trim()
  console.log(`  已登录：${who}`)
} catch {
  die([
    'npm 没登录，registry 会以 401/404 拒绝 PUT，这一步只能由账号本人完成：',
    '',
    '  方法一（交互）：  npm login',
    '  方法二（CI/脚本）：export NODE_AUTH_TOKEN=<granular access token>',
    '    令牌可在 https://www.npmjs.com/settings/<你的用户名>/tokens 创建，',
    '    类型选 Granular Access Token，权限给 Read and write，',
    '    并在 Packages and scopes 里包含 @lnuxe 这个 scope。',
    '',
    '登录完再跑一次：npm run publish:npm',
  ].join('\n'), 2)
}

// 3) 发布
if (dry) {
  console.log('\n--dry：跳过发布，包内容用 npm pack --dry-run 查看')
  process.exit(0)
}
step(3, `发布 ${pkg.name}@${pkg.version} 到 npmjs`)
try {
  const out = run('npm', ['publish', '--access', 'public'])
  process.stdout.write(out)
} catch (error) {
  console.error((error.stdout ?? '') + (error.stderr ?? ''))
  die('发布失败，看上面 registry 的原话')
}

// 4) 回读验证：不信任本地 stdout，直接问 registry
step(4, '回读 registry 验证')
const expected = `${pkg.name}@${pkg.version}`
for (let i = 0; i < 12; i += 1) {
  try {
    const seen = run('npm', ['view', pkg.name, 'version', '--json']).trim()
    if (JSON.parse(seen) === pkg.version) {
      console.log(`  ✓ registry 上已是 ${expected}`)
      console.log(`  ✓ https://www.npmjs.com/package/${pkg.name}`)
      console.log(`\n装：pnpm --dir ~/.dsh/profiles/web add ${pkg.name}`)
      process.exit(0)
    }
  } catch {
    // registry 同步有延迟，重试
  }
  execFileSync('sleep', ['5'])
}
die(`发布了但 registry 还没回读成 ${expected}，稍后用 npm view ${pkg.name} version 确认`)