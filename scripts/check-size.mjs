#!/usr/bin/env node
/**
 * client.js 体积闸门。
 *
 * 400KB 是 v0.3 时代拍的软目标，不是宿主限制：宿主把每个插件的 client.js 拼成一个
 * combo 脚本挂在 `/plugins/??<id>/client.js&rev=...`（packages/client/modules），
 * 响应就是普通 200 + `cache-control: immutable`，唯一的大小检查是 3KB 的 **URL** 上限
 * （`MAX_COMBO_URL_BYTES`，管的是插件 id 列表长度）。同一 profile 里 dsh-purge 的
 * client.js 就是 498,880 字节。
 *
 * 所以这里的数字是**我们自己的纪律线**，不是能力边界：
 *   WARN 470,000 —— 该考虑拆包了（先看 CHANGELOG 里的三条拆法）
 *   FAIL 480,000 —— 与生态里现有最大插件齐平，不给自己更高的例外
 *
 * 用法：node scripts/check-size.mjs [--warn N] [--fail N]
 */
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WARN_DEFAULT = 470_000
const FAIL_DEFAULT = 480_000

/** 对外暴露的现行限制（测试与闸门共用同一份，避免两处口径漂移）。 */
export const SIZE_LIMITS = Object.freeze({ warn: WARN_DEFAULT, fail: FAIL_DEFAULT })

export function parseSizeArgs(argv = []) {
  const out = { warn: WARN_DEFAULT, fail: FAIL_DEFAULT, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--warn' || arg === '--fail') {
      const raw = argv[i + 1]
      const value = Number(raw)
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${arg} 需要一个正整数，收到 ${JSON.stringify(raw)}`)
      }
      if (arg === '--warn') out.warn = Math.floor(value)
      else out.fail = Math.floor(value)
      i += 1
    } else {
      throw new Error(`未知参数 ${arg}（只认 --warn / --fail / --help）`)
    }
  }
  if (out.warn >= out.fail) throw new Error('--warn 必须小于 --fail')
  return out
}

/** 三档判定：ok / warn / fail；fail 优先。 */
export function judgeSize(bytes, limits = { warn: WARN_DEFAULT, fail: FAIL_DEFAULT }) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'fail'
  if (bytes > limits.fail) return 'fail'
  if (bytes > limits.warn) return 'warn'
  return 'ok'
}

export function formatSizeLine(bytes, limits = { warn: WARN_DEFAULT, fail: FAIL_DEFAULT }) {
  const state = judgeSize(bytes, limits)
  const mark = state === 'ok' ? 'OK  ' : state === 'warn' ? 'WARN' : 'FAIL'
  const pct = ((bytes / limits.fail) * 100).toFixed(1)
  return `${mark} client.js ${bytes.toLocaleString('en-US')} 字节 / 硬线 ${limits.fail.toLocaleString('en-US')}（${pct}%），提醒线 ${limits.warn.toLocaleString('en-US')}`
}

function main() {
  const limits = parseSizeArgs(process.argv.slice(2))
  if (limits.help) {
    console.log('用法：node scripts/check-size.mjs [--warn N] [--fail N]')
    return 0
  }
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const target = join(root, 'client.js')
  const bytes = statSync(target).size
  // 读一遍确认文件可解析（体积统计不该在坏文件上给出 OK）
  readFileSync(target, 'utf8')
  const line = formatSizeLine(bytes, limits)
  console.log(line)
  if (judgeSize(bytes, limits) === 'fail') {
    console.error('client.js 超过纪律线：按 CHANGELOG 里的三条拆法收一个（CSS 外提 / 索引按需 / 纯函数拆 chunk）')
    return 1
  }
  if (judgeSize(bytes, limits) === 'warn') {
    console.warn('接近纪律线：下一批功能要么先拆包，要么先减冗余（CSS 重复规则、注释）')
  }
  return 0
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exit(main())
  } catch (error) {
    console.error(String(error?.message ?? error))
    process.exit(1)
  }
}
