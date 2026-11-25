#!/usr/bin/env node
/**
 * smoke-apply.mjs
 *
 * 把 client.js 真的「装一遍」：过 __ModuleLoader__、拿 React 桩调 factory、再调 apply(ctx)，
 * 看它注册了哪几个 slot。纯逻辑测试只调纯函数和组件，抓不到「apply 里少写/写错 slot」这类问题
 * —— 那种错误在浏览器里表现为「按钮不见了」，在测试里却是全绿。
 *
 * 用法：node scripts/smoke-apply.mjs
 * 退出码非 0 表示注册结果与预期不符。
 */

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import vm from 'node:vm'

const HERE = path.dirname(url.fileURLToPath(import.meta.url))
const CLIENT = path.resolve(HERE, '../client.js')

/** 插件应该在宿主上挂的位置：少一个就是功能丢了，多一个说明有人偷偷加了入口 */
export const EXPECTED_SLOTS = [
  'sidebar.panellist',
  'main',
  'conversation.input.dock',
  'settings.section',
  'conversation.chat.commandview',
]

/** 一次性 React 桩：只满足「属性引用 + 组件能被当函数调」这两件事 */
export function reactStub() {
  return {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, () => {}],
    useEffect: () => {},
    useLayoutEffect: () => {},
    useSyncExternalStore: () => 0,
    Fragment: 'Fragment',
    memo: (fn) => fn,
  }
}

/**
 * 装一遍插件，返回 { slots, locales, listeners, errors }
 * 全程不碰 DOM：样式注入走 ensureStyles 的 document 兜底，没有 document 就静默跳过。
 */
export function loadPlugin(file = CLIENT) {
  const source = fs.readFileSync(file, 'utf8')
  let factory
  const sandbox = {
    console,
    window: { __ModuleLoader__: { load({ factory: fn }) { factory = fn } } },
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: file })

  const store = new Map()
  sandbox.window.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  }

  const requireStub = (name) => {
    if (name === 'react') return reactStub()
    throw new Error(`unexpected require: ${name}`)
  }
  const plugin = factory(requireStub)

  const slots = []
  const locales = []
  const listeners = []
  const disposers = []
  const ctx = {
    slots: {
      register: (meta, render) => {
        slots.push({ name: meta?.name, id: meta?.id ?? meta?.key ?? '', render })
        return { dispose() {} }
      },
      inject: (name, fn) => {
        fn()
        return { dispose() {} }
      },
      update: () => {},
    },
    locale: {
      register: (ns, lang, dict) => {
        locales.push(`${ns}/${lang}:${Object.keys(dict ?? {}).length}`)
        return { dispose() {} }
      },
      bind: () => (key) => key,
      subscribe: () => () => {},
    },
    on: (event, handler) => {
      listeners.push(event)
      return () => {}
    },
    effect: (fn) => {
      const result = fn()
      if (typeof result === 'function') disposers.push(result)
      return () => {}
    },
    service: () => ({}),
    emit: () => {},
  }

  plugin.apply(ctx)
  return { plugin, slots, locales, listeners, ctx }
}

function main() {
  const { slots, locales, listeners, plugin } = loadPlugin()
  const names = slots.map((slot) => slot.name)
  const problems = []

  if (typeof plugin.apply !== 'function') problems.push('plugin 上没有 apply()')
  for (const want of EXPECTED_SLOTS) {
    if (!names.includes(want)) problems.push(`少了 slot: ${want}`)
  }
  for (const name of names) {
    if (!EXPECTED_SLOTS.includes(name)) problems.push(`多了没登记的 slot: ${name}`)
  }
  // 每个 slot 都必须能渲染出东西（拿到 null 等于装了个空壳）
  for (const slot of slots) {
    let tree = null
    try {
      tree = slot.render({})
    } catch (error) {
      problems.push(`slot ${slot.name} 渲染抛错: ${error && error.message}`)
      continue
    }
    if (tree === null || tree === undefined) problems.push(`slot ${slot.name} 渲染出空节点`)
  }
  if (locales.length !== 2) problems.push(`i18n 应该注册 zh/en 两份，实际 ${locales.length} 份`)
  if (!listeners.includes('locale/change')) problems.push('没监听 locale/change')

  console.log('slot:', names.join(' / '))
  console.log('i18n:', locales.join(' / '))
  console.log('事件:', listeners.join(' / '))
  if (problems.length) {
    for (const item of problems) console.log('✗', item)
    process.exit(1)
  }
  console.log('\nSMOKE OK — 5 个 slot、2 份 i18n、locale/change 监听都在')
}

if (process.argv[1] && process.argv[1].endsWith('smoke-apply.mjs')) main()