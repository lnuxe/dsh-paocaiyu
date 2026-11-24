/**
 * client.js 的纯逻辑测试：不碰浏览器、不模拟 DOM。
 * 覆盖"打中 → 通过进下一个词"和"打错 → 标红清空重打"这两条判定。
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const file = path.join(import.meta.dirname, 'client.js')
const source = fs.readFileSync(file, 'utf8')

let factory
const sandbox = {
  window: {
    __ModuleLoader__: {
      load({ id, factory: fn }) {
        if (id !== '@local/qwerty-autotype-ui') throw new Error(`unexpected id: ${id}`)
        factory = fn
      },
    },
  },
}
vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

const requireStub = (name) => {
  if (name === 'react') {
    // 只用到属性引用，纯逻辑测试不需要真的 React
    return { createElement: () => null, useCallback: (f) => f, useMemo: (f) => f(), useRef: (v) => ({ current: v }), useState: (v) => [v, () => {}], useEffect: () => {}, useSyncExternalStore: () => 0 }
  }
  throw new Error(`unexpected require: ${name}`)
}

const plugin = factory(requireStub)
if (!plugin || typeof plugin.apply !== 'function') throw new Error('factory returned no apply()')
const { judgeTyping, parseWords, format, pushChar, lookup, dictionaries, sampleWords, groupByCategory } = plugin.__test

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    failures += 1
    console.log(`FAIL ${label}\n  actual   ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`)
  } else {
    console.log(`ok   ${label} → ${JSON.stringify(actual)}`)
  }
}

// —— 打对：逐字变绿，整词打对才通过 ——
check('前缀正确但仍未完成', judgeTyping('cancel', 'can').state, 'ok')
check('整词打对 → 通过', judgeTyping('cancel', 'cancel').state, 'done')
check('空输入不算错', judgeTyping('cancel', '').state, 'ok')

// —— 打错：定位到第一个错字母，必须整词重打 ——
check('第一个字母就打错', judgeTyping('cancel', 'x'), { state: 'bad', badIndex: 0 })
check('中间打错', judgeTyping('cancel', 'cax'), { state: 'bad', badIndex: 2 })
check('打对一半后打错', judgeTyping('cancel', 'canceL'), { state: 'bad', badIndex: 5 })

// —— 打超长忽略 ——
check('超出词长被忽略', judgeTyping('govern', 'governx').state, 'over')

// —— 带空格的目标词（qwerty 里空格显示成 ␣） ——
check('带空格逐字判定', judgeTyping('a b', 'a ').state, 'ok')
check('带空格打对', judgeTyping('a b', 'a b').state, 'done')

// —— pushChar：键盘/自动打共用的"吃一个字符" ——
check('吃对第一个字母', pushChar('cancel', '', 'c'), { typed: 'c', result: 'ok' })
check('吃对前三个字母', pushChar('cancel', 'ca', 'n'), { typed: 'can', result: 'ok' })
check('吃下最后一个字母→通过', pushChar('cancel', 'cance', 'l'), { typed: 'cancel', result: 'done' })
check('第二位置吃错→重打', pushChar('cancel', 'c', 'x'), { typed: 'cx', result: 'bad' })
check('首位就吃错→重打', pushChar('govern', '', 'z'), { typed: 'z', result: 'bad' })
check('打满后继续吃→忽略', pushChar('govern', 'govern', 'x'), { typed: 'govern', result: 'over' })
check('空目标→忽略', pushChar('', '', 'a'), { typed: '', result: 'over' })

// —— 命令参数解析 ——
check('默认词表长度', parseWords('').length, 12)
check('自定义单词', parseWords('  cancel  explosive govern '), ['cancel', 'explosive', 'govern'])
check('过滤非法字符', parseWords('cancel 123 ok! good'), ['cancel', 'good'])

// —— 词库：音标 + 中文 ——
check('查得到音标', /^\/.+\/$/.test(lookup('cancel').ipa), true)
check('查得到中文', lookup('cancel').zh.includes('取消'), true)
check('大小写不敏感', lookup('CANCEL').zh, lookup('cancel').zh)
check('词表外返回 undefined', lookup('zzzz'), undefined)
check('内置词表都有音标和中文', ['cancel', 'humble'].every((w) => lookup(w).ipa && lookup(w).zh), true)

// —— 内联词库（qwerty-learner 生成） ——
check('词库数量', dictionaries().length >= 7, true)
check('词库都有 id/name/category', dictionaries().every((d) => d.id && d.name && d.category), true)
check('每个词库都有词', dictionaries().every((d) => Array.isArray(d.words) && d.words.length > 0), true)
check('按分类分组', groupByCategory(dictionaries()).map((g) => g.category), [...new Set(dictionaries().map((d) => d.category))])
check('抽 20 个词', sampleWords(dictionaries()[0].id, 20).length, 20)
check('抽样词都在该词库里', sampleWords('cet4', 20).every((w) => dictionaries().find((d) => d.id === 'cet4').words.some((e) => e.w === w)), true)
check('未知词库回落到第一个', sampleWords('nope', 5).length, 5)

// —— i18n 占位替换 ——
check('占位替换', format('进度 {done}/{total}', { done: 3, total: 12 }), '进度 3/12')

// —— 渲染冒烟：用一次性 React 桩真的调一遍组件，抓 ReferenceError / undefined ——
const reactForRender = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
  useEffect: () => {},
  useLayoutEffect: () => {},
  useCallback: (fn) => fn,
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  Fragment: 'Fragment',
}
/** 给 factory 用的 require 桩：只认 react，其它模块直接报错 */
const requireForRender = (name) => {
  if (name === 'react') return reactForRender
  throw new Error(`unexpected require: ${name}`)
}
const renderPlugin = factory(requireForRender)
const renderTest = renderPlugin.__test
const ctxStub = { locale: { bind: () => (key) => key, register: () => {}, subscribe: () => () => {} } }

function collectClasses(node, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  // 函数组件就地展开（桩里没有真正的 React 协调器）
  if (typeof node.type === 'function') {
    collectClasses(node.type(node.props ?? {}), out)
    return out
  }
  const className = node.props?.className
  if (typeof className === 'string') out.push(className)
  for (const child of node.children ?? []) collectClasses(child, out)
  if (node.props?.children !== undefined) collectClasses(node.props.children, out)
  return out
}

/** 展开函数组件后找 data-variant="panel" 的卡片 */
function findPanelCard(node) {
  if (node === null || node === undefined || typeof node !== 'object') return false
  if (typeof node.type === 'function') return findPanelCard(node.type(node.props ?? {}))
  if (node.props?.['data-variant'] === 'panel') return true
  return (node.children ?? []).some((child) => findPanelCard(child))
    || findPanelCard(node.props?.children)
}

function render(label, fn) {
  try {
    const tree = fn()
    check(label, tree !== null && tree !== undefined, true)
    return tree
  } catch (error) {
    failures += 1
    console.log(`FAIL ${label}\n  threw    ${error && error.message}`)
    return null
  }
}

const glyph = render('渲染：侧栏图标', () => renderTest.components.PanelGlyph({ size: 16, active: true }))
check('侧栏图标内容', glyph?.children?.[0], '⌨')

const panel = render('渲染：跟打面板', () => renderTest.components.PracticePanel({ ctx: ctxStub }))
const panelClasses = collectClasses(panel).join(' ')
check('面板含词库下拉', panelClasses.includes('qat-select'), true)
check('面板含跟打卡片', panelClasses.includes('qat-card'), true)
check('面板卡片是 panel 变体', findPanelCard(panel), true)

const trainer = render('渲染：卡片（带音标中文）', () => renderTest.components.Trainer({ words: ['cancel'], variant: 'panel', showMeta: true, ctx: ctxStub }))
const trainerClasses = collectClasses(trainer).join(' ')
check('卡片含音标行', trainerClasses.includes('qat-gloss-ipa'), true)
check('卡片含中文行', trainerClasses.includes('qat-gloss-zh'), true)

renderTest.setOpen(true)
const bar = render('渲染：输入框上方跟打条', () => renderTest.components.ComposerTrainer({ useInput: () => '', inputActions: {}, ctx: ctxStub }))
const barClasses = collectClasses(bar).join(' ')
check('跟打条含词库下拉', barClasses.includes('qat-select'), true)
check('跟打条含单词', barClasses.includes('qat-word'), true)
check('跟打条含音标', barClasses.includes('qat-ipa'), true)
renderTest.setOpen(false)

if (failures > 0) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nALL PASS')
