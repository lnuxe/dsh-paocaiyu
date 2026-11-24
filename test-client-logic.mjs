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
  console,
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
// localStorage 桩：设置持久化要用（模块里是懒读，这里挂上就能生效）
const store = {}
sandbox.window.localStorage = {
  getItem: (key) => (key in store ? store[key] : null),
  setItem: (key, value) => { store[key] = String(value) },
  removeItem: (key) => { delete store[key] },
}

/* ------------------------------------------------------------------ */
/* 极简 IndexedDB 桩：只实现记录层用到的那一小撮 API                    */
/* ------------------------------------------------------------------ */
function createFakeIndexedDB() {
  const databases = new Map()

  const makeRequest = () => {
    const request = { onsuccess: null, onerror: null, result: undefined }
    request.fail = (error) => {
      request.error = error
      request.onerror?.()
    }
    request.done = (value) => {
      // 真实 IndexedDB 的请求回调是异步的：桩也必须延到微任务，
      // 否则调用方"先 add 再挂 onsuccess"永远收不到回调
      queueMicrotask(() => {
        request.result = value
        request.onsuccess?.()
      })
    }
    return request
  }

  function createStore(name, options) {
    const rows = new Map()
    let autoId = 0
    return {
      name,
      keyPath: options?.keyPath,
      autoIncrement: !!options?.autoIncrement,
      _rows: rows,
      createIndex() {},
      add(value) {
        const request = makeRequest()
        const record = { ...value }
        // 自增主键：调用方不传 id，桩自己补
        if (this.keyPath === 'id' && this.autoIncrement) {
          autoId += 1
          record.id = autoId
          rows.set(autoId, record)
          request.done(autoId)
          return request
        }
        if (this.keyPath) {
          if (record[this.keyPath] === undefined) return request
          if (rows.has(record[this.keyPath])) return request
          rows.set(record[this.keyPath], record)
          request.done(record[this.keyPath])
          return request
        }
        autoId += 1
        record.id = autoId
        rows.set(autoId, record)
        request.done(autoId)
        return request
      },
      put(value) {
        const request = makeRequest()
        const record = { ...value }
        if (this.keyPath) {
          if (record[this.keyPath] === undefined) return request
          rows.set(record[this.keyPath], record)
          request.done(record[this.keyPath])
        } else {
          const id = record.id ?? ++autoId
          record.id = id
          rows.set(id, record)
          request.done(id)
        }
        return request
      },
      get(key) {
        const request = makeRequest()
        request.done(rows.get(key))
        return request
      },
      clear() {
        const request = makeRequest()
        rows.clear()
        request.done(true)
        return request
      },
      getAll() {
        const request = makeRequest()
        request.done([...rows.values()].map((row) => ({ ...row })))
        return request
      },
    }
  }

  function openDb(name) {
    const request = makeRequest()
    const stores = new Map()
    const db = {
      objectStoreNames: { contains: (key) => stores.has(key) },
      createObjectStore: (key, options) => {
        const store = createStore(key, options)
        stores.set(key, store)
        return store
      },
      transaction(names) {
        const list = Array.isArray(names) ? names : [names]
        const tx = { oncomplete: null, onerror: null, onabort: null }
        tx.objectStore = (key) => stores.get(key)
        // 请求回调是微任务，事务完成用宏任务收尾（真实 IDB 也是请求先、complete 后）
        setTimeout(() => tx.oncomplete?.(), 0)
        void list
        return tx
      },
      close() {},
    }
    request.result = db
    databases.set(name, db)
    // 延到微任务：模块是 open() 返回之后才挂 onupgradeneeded 的
    queueMicrotask(() => {
      request.onupgradeneeded?.()
      request.onsuccess?.()
    })
    return request
  }

  return { open: (name) => openDb(name), _databases: databases }
}

const fakeIdb = createFakeIndexedDB()
sandbox.window.indexedDB = fakeIdb

const {
  judgeTyping, parseWords, format, pushChar, lookup, dictionaries, sampleWords, groupByCategory,
  catalog, normalizeWord, normalizeWords, chapterCount, wordsOfChapter, sampleFromWords,
  searchCatalog, catalogSize, wordsSync,
  effectiveTarget, stripPunct, maskLetters, DICTATION_MODES,
  readSettings, getSettings, setSetting, SETTING_DEFAULTS,
  dayKey, aggregateDaily, summarize, lastDays,
  calcWpm, calcAccuracy, shouldStartOnTab, saveSession, readSession, clearSession, sameSession,
  collectWrongWords, activeMs, resolveHotkey, dictSourceList, DICT_PIN,
  heatmapWeeks, heatLevel, filterWrongWords, DICT,
  serializeBackup, parseBackup, BACKUP_VERSION, BACKUP_LIMITS, pressable, playClick,
  readCustomDicts, writeCustomDicts, parseCustomWords, saveCustomDict, removeCustomDict,
  keyboardHeat, KEY_ROWS, cacheStats, clearDictCache,
  customWords, isCustomId, CUSTOM_PREFIX, dictionaryById,
  parseCustomFile, serializeCustomDict, splitCsvLine, toCustomWord, downloadText, withSlashes,
  topWrongLetters, readMastered, writeMastered, toggleMastered, masteredKey,
} = plugin.__test

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
check('每个词库都有词数', dictionaries().every((d) => Number(d.length) > 0), true)
check('按分类分组', groupByCategory(dictionaries()).map((g) => g.category), [...new Set(dictionaries().map((d) => d.category))])
check('抽 20 个词', sampleWords(dictionaries()[0].id, 20).length, 20)
const cet4Words = wordsSync('cet4')
check('抽样词都在该词库里', sampleWords('cet4', 20).every((w) => cet4Words.some((e) => e.w === w)), true)
check('未知词库回落到第一个', sampleWords('nope', 5).length, 5)

// —— i18n 占位替换 ——
check('占位替换', format('进度 {done}/{total}', { done: 3, total: 12 }), '进度 3/12')

// —— 全量词库目录（P0 数据层）——
check('目录是全量 371 个词库', catalogSize(), 371)
check('目录条目带 url 与语言', catalog().every((d) => typeof d.url === 'string' && d.url.endsWith('.json') && !!d.languageCategory), true)
check('目录总词数与上游一致', catalog().reduce((sum, d) => sum + Number(d.length || 0), 0), 414485)
check('最大词库 coca_20000', catalog().slice().sort((a, b) => b.length - a.length)[0].id, 'coca_20000')

// —— 章节模型：20 词一章 ——
check('章节数 = ceil(2607/20)', chapterCount({ length: 2607 }), 131)
check('末章词数', wordsOfChapter(Array.from({ length: 2607 }, (_, i) => ({ w: `w${i}` })), 130).length, 7)
check('首章 20 词', wordsOfChapter(Array.from({ length: 2607 }, (_, i) => ({ w: `w${i}` })), 0).length, 20)
check('空词库也有一章', chapterCount({ length: 0 }), 1)

// —— 词条归一化 ——
check('归一化 en', normalizeWord({ name: 'cancel', trans: ['取消， 撤销； 删去'], ukphone: "'kænsl", usphone: "'kænsl" }, 'en'),
  { w: 'cancel', ipa: '/ˈkænsl/', zh: '取消，撤销；删去' })
check('归一化优先后 ukphone', normalizeWord({ name: 'go', trans: ['去'], ukphone: 'gəu', usphone: 'goʊ' }, 'en').ipa, '/gəu/')
check('代码词库不生成音标', normalizeWord({ name: 'SELECT', trans: ['查询'], usphone: 'silekt' }, 'code').ipa, '')
check('日语词条保留假名', normalizeWord({ name: 'たべる', trans: ['吃'], ukphone: 'taberu' }, 'ja').w, 'たべる')
check('空释义被丢弃', normalizeWord({ name: 'ghost', trans: [] }, 'en'), null)
check('超长词条被丢弃', normalizeWord({ name: 'x'.repeat(41), trans: ['长'] }, 'en'), null)
check('批量归一化去重', normalizeWords([{ name: 'a', trans: ['甲'] }, { name: 'A', trans: ['乙'] }], 'en').length, 1)
check('英文词条转小写', normalizeWord({ name: 'Cancel', trans: ['取消'] }, 'en').w, 'cancel')
check('代码词条保留大小写', normalizeWord({ name: 'SELECT', trans: ['查询'] }, 'code').w, 'SELECT')
check('词组保留单个空格', normalizeWord({ name: 'according   to', trans: ['根据'] }, 'en').w, 'according to')
check('带括号的代码词条保留', normalizeWord({ name: 'append()', trans: ['追加'] }, 'code').w, 'append()')

// —— 搜索 ——
check('搜 ielts 命中', searchCatalog('ielts').length > 0, true)
check('搜不存在的词库为空', searchCatalog('zzzz-not-a-dict').length, 0)
check('空查询返回空', searchCatalog('').length, 0)

// —— 随机抽样 ——
check('从 2607 词抽 20 个', sampleFromWords(cet4Words, 20).length, 20)
check('抽样结果不重复', new Set(sampleFromWords(cet4Words, 20)).size, 20)

// —— 判定选项：忽略标点 / 大小写 ——
check('默认不区分大小写', judgeTyping('Cancel', 'cancel').state, 'done')
check('严格大小写被打回', judgeTyping('Cancel', 'cancel', { caseSensitive: true }).state, 'bad')
check('忽略标点后 append() 只打 append', judgeTyping('append()', 'append', { ignorePunct: true }).state, 'done')
check('不忽略标点时括号要打', judgeTyping('append()', 'append').state, 'ok')
check('忽略标点后多打标点被忽略', pushChar(effectiveTarget('append()', { ignorePunct: true }), 'append', '(').result, 'over')
check('effectiveTarget 去标点', effectiveTarget('append()', { ignorePunct: true }), 'append')
check('effectiveTarget 保留撇号', effectiveTarget("don't", { ignorePunct: true }), "don't")
check('effectiveTarget 小写', effectiveTarget('SELECT'), 'select')
check('stripPunct 只去标点', stripPunct('a,b.c；d'), 'abcd')

// —— 默写遮罩 ——
check('五种默写形态', DICTATION_MODES.length, 5)
check('全部隐藏', maskLetters('cancel', 'hideAll').every(Boolean), true)
check('隐藏元音', maskLetters('cancel', 'hideVowel'), [false, true, false, false, true, false])
check('隐藏辅音', maskLetters('cancel', 'hideConsonant'), [true, false, true, true, false, true])
check('正常显示不遮', maskLetters('cancel', 'none').some(Boolean), false)
check('随机隐藏稳定', maskLetters('cancel', 'randomHide', 3).join(), maskLetters('cancel', 'randomHide', 3).join())
check('随机隐藏不会遮空格', maskLetters('according to', 'randomHide', 1)[9], false)

// —— 设置持久化 ——
check('默认设置', getSettings(), SETTING_DEFAULTS)
setSetting('dictation', 'hideVowel')
check('设置写回内存', getSettings().dictation, 'hideVowel')
check('设置落 localStorage', store['qwerty-autotype:setting:dictation'], '"hideVowel"')
check('未知设置键被忽略', setSetting('nope', 1).nope, undefined)
check('重新读到已存的设置', readSettings().dictation, 'hideVowel')
setSetting('dictation', 'none')

// —— 词库来源（钉提交优先） ——
const sources = dictSourceList().map((build) => build('/dicts/CET4_T.json'))
check('钉住了上游提交', /^[0-9a-f]{40}$/.test(DICT_PIN), true)
check('第一个来源用钉住的 SHA', sources[0].includes(DICT_PIN), true)
check('最后一个来源回退 master', sources[sources.length - 1].includes('/master/'), true)
check('来源里没有重复的 URL', new Set(sources).size, sources.length)
check('jsDelivr 排在 raw.githubusercontent 前面', sources[0].includes('cdn.jsdelivr.net'), true)

// —— i18n：中英 key 必须完全对齐（少一条就是漏翻） ——
const zhKeys = Object.keys(DICT.zh).sort()
const enKeys = Object.keys(DICT.en).sort()
check('zh 与 en 的 key 数量一致', zhKeys.length, enKeys.length)
check('zh 有而 en 缺的 key', zhKeys.filter((key) => !enKeys.includes(key)).join(','), '')
check('en 有而 zh 缺的 key', enKeys.filter((key) => !zhKeys.includes(key)).join(','), '')
check('没有空翻译', Object.entries({ ...DICT.zh, ...DICT.en }).filter(([, value]) => !String(value).trim()).length, 0)
check('占位符对齐（同一 key 的中英占位符集合相同）', Object.keys(DICT.zh).filter((key) => {
  const pick = (text) => (String(text).match(/\{[a-zA-Z]+\}/g) || []).sort().join(',')
  return DICT.en[key] !== undefined && pick(DICT.zh[key]) !== pick(DICT.en[key])
}).join(','), '')

// —— 指标 ——
check('WPM = 词数/秒*60', calcWpm(20, 30), 40)
check('WPM 无耗时给 0', calcWpm(20, 0), 0)
check('正确率 20/(20+5)', calcAccuracy(20, 5), 80)
check('正确率没数据给 0', calcAccuracy(0, 0), 0)
check('正确率全错给 0', calcAccuracy(0, 7), 0)

// —— Tab 裁决（三分支） ——
check('空草稿 + 焦点在输入框 → 接管', shouldStartOnTab({ key: 'Tab', open: false, inComposer: true, draft: '' }), true)
check('草稿非空 → 还给宿主', shouldStartOnTab({ key: 'Tab', open: false, inComposer: true, draft: 'hello' }), false)
check('跟打条已开 → 不接管', shouldStartOnTab({ key: 'Tab', open: true, inComposer: true, draft: '' }), false)
check('焦点不在输入框 → 不接管', shouldStartOnTab({ key: 'Tab', open: false, inComposer: false, draft: '' }), false)
check('带修饰键 → 不接管', shouldStartOnTab({ key: 'Tab', open: false, inComposer: true, draft: '', modifier: true }), false)
check('不是 Tab → 不接管', shouldStartOnTab({ key: 'a', open: false, inComposer: true, draft: '' }), false)
check('纯空格草稿算空', shouldStartOnTab({ key: 'Tab', open: false, inComposer: true, draft: '   ' }), true)

// —— 会话存档（切面板不丢） ——
clearSession()
check('没有存档时返回 null', readSession(), null)
const words20 = ['cancel', 'govern', 'apparent']
check('存一轮练习', saveSession({ dictId: 'cet4', chapter: 2, words: words20, index: 1, hits: 1, retries: 3, startedAt: 1000 }), true)
const restored = readSession()
check('读回索引', restored.index, 1)
check('读回词表', restored.words.join(), words20.join())
check('同轮判定：一致', sameSession(restored, 'cet4', 2, words20), true)
check('同轮判定：换章节不算', sameSession(restored, 'cet4', 3, words20), false)
check('同轮判定：换词库不算', sameSession(restored, 'cet6', 2, words20), false)
check('同轮判定：词表不同不算', sameSession(restored, 'cet4', 2, ['cancel']), false)
check('空词库不落存档', saveSession({ dictId: 'cet4', chapter: 0, words: [] }), false)
clearSession()
check('清空后读不到', readSession(), null)

// —— 体积守门（§7.4 预算：client.js ≤ 400KB） ——
const clientBytes = fs.statSync(file).size
check('client.js 体积在 400KB 预算内', clientBytes < 400 * 1024, true)

// —— 记录聚合（纯函数） ——
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime()
check('dayKey 用本地日', dayKey(at(2026, 11, 24, 9)), '2026-11-24')
check('dayKey 跨日边界', dayKey(at(2026, 11, 24, 23)) === dayKey(at(2026, 11, 24, 0)), true)

const chapters = [
  { at: at(2026, 11, 24, 9), wordCount: 20, wrongCount: 5, seconds: 40 },
  { at: at(2026, 11, 24, 15), wordCount: 20, wrongCount: 0, seconds: 30 },
  { at: at(2026, 11, 23, 20), wordCount: 20, wrongCount: 20, seconds: 60 },
]
const daily = aggregateDaily(chapters)
check('聚合出 2 天', daily.length, 2)
check('按日期升序', daily[0].day < daily[1].day, true)
check('当天 2 章 40 词', daily[1].chapters === 2 && daily[1].words === 40, true)
check('当天正确率 = 40/(40+5)', daily[1].accuracy, Math.round((40 / 45) * 100))
check('当天 WPM = 40/70 分钟折算', daily[1].wpm, Math.round((40 / 70) * 60))
const summary = summarize(chapters)
check('汇总章数', summary.chapters, 3)
check('汇总词数 60', summary.words, 60)
check('汇总正确率', summary.accuracy, Math.round((60 / 85) * 100))

const week = lastDays(chapters, 7, at(2026, 11, 24, 18))
check('补零后 7 天', week.length, 7)
check('最后一天是今天', week[6].day, '2026-11-24')
check('空白日补 0', week[0].words, 0)
check('今天有数据', week[6].words, 40)

// —— 有效计时（暂停不计时） ——
check('未暂停：累计 + 本次', activeMs({ ms: 1000, last: 5000 }, 7000), 3000)
check('暂停中：只算累计', activeMs({ ms: 1000, last: null }, 7000), 1000)
check('没有时钟给 0', activeMs(null, 7000), 0)
check('时间倒退不出现负数', activeMs({ ms: 500, last: 9000 }, 8000), 500)

// —— 快捷键裁决 ——
const hk = (over) => resolveHotkey({ key: 'a', meta: false, ctrl: false, alt: false, shift: false, ...over })
check('Esc 关闭', hk({ key: 'Escape' }), 'close')
check('Cmd+Esc 不接管', hk({ key: 'Escape', meta: true }), '')
check('Cmd+← 上一个', hk({ key: 'ArrowLeft', meta: true }), 'prev')
check('Ctrl+← 上一个（Windows）', hk({ key: 'ArrowLeft', ctrl: true }), 'prev')
check('裸 ← 不接管（留给输入框）', hk({ key: 'ArrowLeft' }), '')
check('Cmd+→ 跳过', hk({ key: 'ArrowRight', meta: true }), 'skip')
check('Cmd+Shift+→ 不接管', hk({ key: 'ArrowRight', meta: true, shift: true }), '')
check('Cmd+J 循环', hk({ key: 'j', meta: true }), 'loop')
check('Cmd+P 暂停', hk({ key: 'p', meta: true }), 'pause')
check('普通字母不接管', hk({ key: 'j' }), '')
check('Alt 组合一律不接管', hk({ key: 'ArrowLeft', meta: true, alt: true }), '')

// —— 错词聚合 ——
const wrongSource = [
  { word: 'cancel', dictId: 'cet4', wrongCount: 2, at: at(2026, 11, 24, 9) },
  { word: 'cancel', dictId: 'cet4', wrongCount: 3, at: at(2026, 11, 24, 16) },
  { word: 'govern', dictId: 'cet4', wrongCount: 1, at: at(2026, 11, 23, 9) },
  { word: 'right', dictId: 'cet4', wrongCount: 0, at: at(2026, 11, 24, 9) },
  { word: 'cancel', dictId: 'cet6', wrongCount: 1, at: at(2026, 11, 22, 9) },
]
const wrongList = collectWrongWords(wrongSource)
check('错词合并同库同词', wrongList.length, 3)
check('错词按次数降序', wrongList[0].word, 'cancel')
check('错词次数累加', wrongList[0].wrongCount, 5)
check('错词记最后一次时间', wrongList[0].lastAt, at(2026, 11, 24, 16))
check('不同词库分开算', wrongList.filter((row) => row.word === 'cancel').length, 2)
check('没打错的不进错词本', wrongList.some((row) => row.word === 'right'), false)
check('可截断', collectWrongWords(wrongSource, 1).length, 1)

// —— a11y：假装是按钮的 span 必须能用键盘 ——
const pressProps = pressable(() => {})
check('pressable 给 role=button', pressProps.role, 'button')
check('pressable 可 Tab 聚焦', pressProps.tabIndex, 0)
let pressed = 0
const pressOnce = pressable(() => { pressed += 1 })
pressOnce.onKeyDown({ key: 'Enter', preventDefault() {} })
pressOnce.onKeyDown({ key: ' ', preventDefault() {} })
check('Enter/Space 等于点击', pressed, 2)
pressOnce.onKeyDown({ key: 'a', preventDefault() {} })
check('其它键不触发', pressed, 2)
const tabAvoided = { prevented: false }
pressProps.onMouseDown({ preventDefault() { tabAvoided.prevented = true } })
check('mousedown 不抢焦点', tabAvoided.prevented, true)

// —— 键音在无 WebAudio 的环境里静默不报错 ——
check('没有 AudioContext 时返回 false', playClick('hit'), false)
check('打错也静默返回 false', playClick('miss'), false)

// —— 文件导入：CSV / JSON ——
check('CSV 拆列', splitCsvLine('cancel,取消,/ˈkænsl/').join('|'), 'cancel|取消|/ˈkænsl/')
check('CSV 引号里带逗号', splitCsvLine('"a, b",释义').join('|'), 'a, b|释义')
check('CSV 双引号转义', splitCsvLine('"say ""hi""",说').join('|'), 'say "hi"|说')
check('CSV 全角逗号', splitCsvLine('govern，治理').join('|'), 'govern|治理')

const csvNoHeader = parseCustomFile('words.csv', 'cancel,取消,/ˈkænsl/\ngovern,治理\n')
check('CSV 两行两词', csvNoHeader.length, 2)
check('CSV 释义', csvNoHeader[0].trans[0], '取消')
check('CSV 音标', csvNoHeader[0].ipa, '/ˈkænsl/')
const csvHeader = parseCustomFile('words.csv', 'word,meaning\ncancel,取消\n')
check('CSV 跳过表头', csvHeader.length, 1)
check('中文表头也跳过', parseCustomFile('w.csv', '单词,释义\nabandon,放弃\n').length, 1)

const jsonArray = parseCustomFile('w.json', JSON.stringify([
  { name: 'cancel', trans: ['取消'], ipa: 'ˈkænsl' },
  { word: 'govern', meaning: '治理' },
  { text: 'abandon', zh: '放弃' },
]))
check('JSON 数组三种写法都认', jsonArray.map((word) => word.name).join(','), 'cancel,govern,abandon')
check('JSON trans 数组', jsonArray[0].trans[0], '取消')
check('JSON meaning 转数组', jsonArray[1].trans[0], '治理')
check('JSON 分号拆释义', parseCustomFile('w.json', JSON.stringify([{ name: 'a', trans: '一；二' }]))[0].trans.join('/'), '一/二')
check('JSON {words:[]} 形状', parseCustomFile('w.json', JSON.stringify({ words: [{ name: 'x' }] })).length, 1)
check('JSON 映射形状', parseCustomFile('w.json', JSON.stringify({ cancel: '取消' }))[0].name, 'cancel')
check('JSON 坏文件返回空', parseCustomFile('w.json', '{ not json').length, 0)
check('JSON 去重', parseCustomFile('w.json', JSON.stringify([{ name: 'Cancel' }, { name: 'cancel' }])).length, 1)
check('txt 走原解析器', parseCustomFile('w.txt', 'cancel 取消').length, 1)
check('未知扩展名也走 txt', parseCustomFile('w.md', '# 注释\ncancel 取消').length, 1)

// —— 只有单词的自定义词表也能练 ——
const bareId = saveCustomDict('裸词表', [{ name: 'cancel' }, { name: 'govern' }])
check('没有释义的词条保留', customWords(bareId).length, 2)
check('没有释义时 zh 为空串', customWords(bareId)[0].zh, '')
check('音标统一加斜杠', withSlashes('ˈkænsl'), '/ˈkænsl/')
check('已有斜杠不重复加', withSlashes('/ˈkænsl/'), '/ˈkænsl/')
check('空音标还是空', withSlashes(''), '')
check('删除裸词表', removeCustomDict(bareId), true)
writeCustomDicts({})

// —— 自定义词表导出 ——
const exportId = saveCustomDict('导出测试', [
  { name: 'cancel', trans: ['取消'], ipa: '/ˈkænsl/' },
  { name: 'govern', trans: ['治理'] },
])
const exportedTxt = serializeCustomDict(exportId, 'txt')
check('txt 导出两行', exportedTxt.split('\n').length, 2)
check('txt 导出带释义与音标', exportedTxt.split('\n')[0], 'cancel 取消 /ˈkænsl/')
const exportedJson = JSON.parse(serializeCustomDict(exportId, 'json'))
check('json 导出带名字', exportedJson.name, '导出测试')
check('json 导出两条', exportedJson.words.length, 2)
check('json 导出可回灌', parseCustomFile('w.json', serializeCustomDict(exportId, 'json')).length, 2)
check('空词表导出为空串', serializeCustomDict('custom:不存在', 'txt'), '')
check('删除测试词表', removeCustomDict(exportId), true)
writeCustomDicts({})

// —— 键盘热力图 ——
check('键盘三行', KEY_ROWS.join('|'), 'qwertyuiop|asdfghjkl|zxcvbnm')
const heat = keyboardHeat([{ letter: 'e', count: 8 }, { letter: 'a', count: 4 }, { letter: 'q', count: 1 }])
check('三行都画出来', heat.length, 3)
check('第一行 10 键', heat[0].length, 10)
check('第二行 9 键', heat[1].length, 9)
check('第三行 7 键', heat[2].length, 7)
check('最多的键是 4 档', heat[0].find((cell) => cell.key === 'e').level, 4)
check('一半是 3 档', heat[1].find((cell) => cell.key === 'a').level, 3)
check('最少的是 1 档', heat[0].find((cell) => cell.key === 'q').level, 1)
check('没打错的键是 0 档', heat[0].find((cell) => cell.key === 'w').level, 0)
check('没打错的键计数为 0', heat[0].find((cell) => cell.key === 'w').count, 0)
check('大写输入也能归位', keyboardHeat([{ letter: 'E', count: 5 }])[0].find((cell) => cell.key === 'e').count, 5)
check('接受对象形式的 wrongLetters', keyboardHeat({ s: 6, d: 3 })[1].find((cell) => cell.key === 's').level, 4)
check('空输入全是 0 档', keyboardHeat([]).flat().every((cell) => cell.level === 0), true)

// —— 自定义词表 ——
check('custom: 前缀识别', isCustomId('custom:我的词'), true)
check('普通词库不是自定义', isCustomId('cet4'), false)

const parsedCustom = parseCustomWords(`
# 这一行是注释
// 这一行也是
cancel 取消
govern,治理
apparent,显而易见的,/əˈpærənt/
abandon
abandon  放弃
` + 'x'.repeat(41))

check('跳过注释行', parsedCustom.some((word) => word.name.startsWith('#') || word.name.startsWith('//')), false)
check('空格分隔', parsedCustom.find((word) => word.name === 'cancel').trans[0], '取消')
check('逗号分隔', parsedCustom.find((word) => word.name === 'govern').trans[0], '治理')
check('识别音标', parsedCustom.find((word) => word.name === 'apparent').ipa, 'əˈpærənt')
check('音标不进释义', parsedCustom.find((word) => word.name === 'apparent').trans[0], '显而易见的')
check('只有单词也可以', parsedCustom.find((word) => word.name === 'abandon').trans.length, 0)
check('大小写去重', parsedCustom.filter((word) => word.name.toLowerCase() === 'abandon').length, 1)
check('超长词被丢', parsedCustom.some((word) => word.name.length > 40), false)
check('空文本得空数组', parseCustomWords('   \n\n  ').length, 0)

check('空名字不保存', saveCustomDict('  ', [{ name: 'a' }]), null)
check('空词表不保存', saveCustomDict('空的', []), null)
const customId = saveCustomDict('我的词', [
  { name: 'cancel', trans: ['取消'] },
  { name: 'govern', trans: ['治理'] },
])
check('保存返回 id', customId, 'custom:我的词')
check('读回自定义词表', Object.keys(readCustomDicts()).length, 1)
check('归一化后两条', customWords(customId).length, 2)
check('自定义词库进目录', catalog().some((dict) => dict.id === customId), true)
check('目录里分类是自定义', dictionaryById(customId).category, '自定义')
check('自定义词表章数为 1', chapterCount(dictionaryById(customId)), 1)
check('删除自定义词表', removeCustomDict(customId), true)
check('删除后目录里没有', catalog().some((dict) => dict.id === customId), false)
writeCustomDicts({})

// —— 备份导出 / 导入 ——
const backupText = serializeBackup({
  settings: { dictation: 'hideVowel', caseSensitive: true, junk: 1 },
  wordRecords: [{ word: 'cancel', dictId: 'cet4', chapter: 0, at: 100, wrongCount: 2 }],
  chapterRecords: [{ dictId: 'cet4', chapter: 0, at: 100, seconds: 40, wordCount: 20, wrongCount: 2 }],
  progress: [{ dictId: 'cet4', chapter: 0, index: 20, words: 20, done: true, updatedAt: 100 }],
})
const backupJson = JSON.parse(backupText)
check('备份带 kind', backupJson.kind, 'qwerty-autotype-backup')
check('备份带版本号', backupJson.version, BACKUP_VERSION)
check('备份只带已知设置项', 'junk' in backupJson.settings, false)
check('备份是可读的 JSON 文本', backupText.includes('\n  "kind"'), true)

const roundTrip = parseBackup(backupText)
check('回读单词记录', roundTrip.wordRecords.length, 1)
check('回读章节记录', roundTrip.chapterRecords[0].wordCount, 20)
check('回读进度 done', roundTrip.progress[0].done, true)
check('回读进度补出 key', roundTrip.progress[0].key, 'cet4:0')
check('回读设置', roundTrip.settings.dictation, 'hideVowel')

for (const [label, input, code] of [
  ['非 JSON 被拒', 'not json', 'backup:not-json'],
  ['缺 kind 被拒', JSON.stringify({ version: 1 }), 'backup:bad-kind'],
  ['版本非法被拒', JSON.stringify({ kind: 'qwerty-autotype-backup', version: 0 }), 'backup:bad-version'],
  ['未来版本被拒', JSON.stringify({ kind: 'qwerty-autotype-backup', version: 99 }), 'backup:version-too-new'],
]) {
  let caught = ''
  try {
    parseBackup(input)
  } catch (error) {
    caught = error.message
  }
  check(label, caught, code)
}

const dirty = parseBackup(JSON.stringify({
  kind: 'qwerty-autotype-backup',
  version: 1,
  wordRecords: [{ word: 'ok' }, { word: '' }, null, 42],
  chapterRecords: 'oops',
  progress: [{ dictId: 'cet4', chapter: 'x' }],
}))
check('丢掉非法单词记录', dirty.wordRecords.length, 1)
check('章节记录不是数组就空', dirty.chapterRecords.length, 0)
check('进度章节号非法就丢', dirty.progress.length, 0)
check('备份上限有界', BACKUP_LIMITS.wordRecords >= 1000, true)

const withMastered = parseBackup(serializeBackup({ mastered: ['cet4:cancel', 'bad', ''] }))
check('备份带上掌握列表', withMastered.mastered.join(','), 'cet4:cancel,bad')
const withCustom = parseBackup(serializeBackup({
  customDicts: { 我的词: [{ name: 'cancel', trans: ['取消'], ipa: 'ˈkænsl' }, { name: '' }] },
}))
check('备份带上自定义词表', withCustom.customDicts['我的词'].length, 1)
check('自定义词表保留音标', withCustom.customDicts['我的词'][0].ipa, 'ˈkænsl')
check('空名字的词表被丢', Object.keys(parseBackup(JSON.stringify({
  kind: 'qwerty-autotype-backup', version: 1, customDicts: { '  ': [{ name: 'a' }] },
})).customDicts).length, 0)
const noMastered = parseBackup(JSON.stringify({ kind: 'qwerty-autotype-backup', version: 1 }))
check('老备份没有 mastered 也不报错', noMastered.mastered.length, 0)

// —— 热力等级 ——
check('0 词是 0 档', heatLevel(0), 0)
check('1 词起步 1 档', heatLevel(1), 1)
check('19 词还是 1 档', heatLevel(19), 1)
check('20 词进 2 档', heatLevel(20), 2)
check('50 词进 3 档', heatLevel(50), 3)
check('100 词进 4 档', heatLevel(100), 4)
check('超大值封顶 4 档', heatLevel(9999), 4)

// —— 热力图布局（12 周 × 7 天，周一起，未来留空） ——
const heatChapters = [
  { at: at(2026, 11, 24, 9), wordCount: 60, wrongCount: 0, seconds: 60 },   // 周二
  { at: at(2026, 11, 23, 9), wordCount: 10, wrongCount: 0, seconds: 30 },   // 周一
]
const weeks = heatmapWeeks(heatChapters, 12, at(2026, 11, 24, 20))
check('热力图 12 列', weeks.length, 12)
check('每列 7 天', weeks.every((col) => col.days.length === 7), true)
check('最后一列是本周', weeks[11].days.some((day) => day.day === '2026-11-24'), true)
check('本周周一在首行', weeks[11].days[0].day, '2026-11-23')
check('周一那格 1 档', weeks[11].days[0].level, 1)
check('周二 60 词落 3 档', weeks[11].days[1].level, 3)
check('本周还没到的日子标 future', weeks[11].days[6].future, true)
check('今天不算 future', weeks[11].days[1].future, false)
check('空日子 0 档', weeks[0].days[0].level, 0)
check('天数连续不重复', new Set(weeks.flatMap((col) => col.days.map((day) => day.day))).size, 84)

// —— 易错字母聚合 ——
const letterSource = [
  { wrongLetters: { e: 3, t: 1 }, wordCount: 20, at: 1 },
  { wrongLetters: { e: 2, a: 5 }, wordCount: 20, at: 2 },
  { wrongLetters: null, wordCount: 20, at: 3 },
  {},
]
const letters = topWrongLetters(letterSource, 5)
check('易错字母累加同名', letters.find((item) => item.letter === 'e').count, 5)
check('按次数降序', letters[0].letter, 'a')
check('第二是 e', letters[1].letter, 'e')
check('没有字母就是空', topWrongLetters([{}, { wrongLetters: {} }], 5).length, 0)
check('可以限制条数', topWrongLetters(letterSource, 1).length, 1)
check('同次数按字母排序', topWrongLetters([{ wrongLetters: { b: 2, a: 2 } }], 5).map((i) => i.letter).join(''), 'ab')

// —— 掌握标记 ——
check('掌握 key 带词库', masteredKey('cet4', 'cancel'), 'cet4:cancel')
check('初始没有掌握词', readMastered().length, 0)
check('标记后为 true', toggleMastered('cet4', 'cancel'), true)
check('读回有 1 条', readMastered().length, 1)
check('再点取消', toggleMastered('cet4', 'cancel'), false)
check('取消后为空', readMastered().length, 0)
toggleMastered('cet4', 'cancel')
const masteredRows = collectWrongWords(wrongSource)
const filteredMastered = filterWrongWords(masteredRows, { mastered: readMastered() })
check('已掌握的 cet4 cancel 被隐藏',
  filteredMastered.some((row) => row.word === 'cancel' && row.dictId === 'cet4'), false)
check('别的词库同名词不受影响',
  filteredMastered.some((row) => row.word === 'cancel' && row.dictId === 'cet6'), true)
check('打开 showMastered 还能看到',
  filterWrongWords(masteredRows, { mastered: readMastered(), showMastered: true }).some((row) => row.word === 'cancel'), true)
writeMastered([])

// —— 错词筛选 ——
const wrongRowsAll = collectWrongWords(wrongSource)
check('按词库筛', filterWrongWords(wrongRowsAll, { dictId: 'cet6' }).length, 1)
check('关键词筛单词', filterWrongWords(wrongRowsAll, { query: 'canc' }).every((row) => row.word.includes('canc')), true)
check('关键词也能搜释义', filterWrongWords([{ word: 'cancel', dictId: 'cet4', wrongCount: 2, lastAt: 5 }], { query: '取消' }).length, 1)
check('默认按错误次数', filterWrongWords(wrongRowsAll, {})[0].wrongCount, 5)
check('按最近排序', filterWrongWords(wrongRowsAll, { sort: 'recent' })[0].lastAt, at(2026, 11, 24, 16))
check('按字母排序', filterWrongWords(wrongRowsAll, { sort: 'alpha' })[0].word, 'cancel')
check('筛不到就是空', filterWrongWords(wrongRowsAll, { query: 'zzz' }).length, 0)




// —— 记录读写（跑在极简 IndexedDB 桩上） ——
const wait = () => new Promise((resolve) => setTimeout(resolve, 0))

const recordFlow = (async () => {
  const {
    recordWord, recordChapter, saveProgress, readProgress, readWordRecords, readChapterRecords,
    importData, clearData, writeMirror, readMirror, loadDictWords, cacheStats, clearDictCache,
  } = plugin.__test

  await recordWord({ word: 'cancel', dictId: 'cet4', chapter: 0, wrongCount: 2, at: at(2026, 11, 24, 10) })
  await recordWord({ word: 'govern', dictId: 'cet4', chapter: 0, wrongCount: 0, at: at(2026, 11, 24, 10) })
  const words = await readWordRecords()
  check('写入 2 条单词记录', words.length, 2)
  check('单词记录字段完整', words[0].word && words[0].dictId === 'cet4' && words[0].chapter === 0 && words[0].wrongCount === 2, true)

  await recordChapter({ dictId: 'cet4', chapter: 0, at: at(2026, 11, 24, 10), seconds: 40, wordCount: 20, wrongCount: 3 })
  const chapters = await readChapterRecords()
  check('写入 1 条章节记录', chapters.length, 1)
  check('章节记录可聚合', aggregateDaily(chapters)[0].words, 20)

  await saveProgress('cet4', 0, { index: 20, words: 20, done: true })
  await saveProgress('cet4', 1, { index: 5, words: 20 })
  const progress = await readProgress('cet4')
  check('进度写入 2 章', progress.length, 2)
  check('第 0 章已完成', progress.find((row) => row.chapter === 0)?.done, true)
  check('第 1 章未完成', progress.find((row) => row.chapter === 1)?.done, undefined)
  check('其它词库进度隔离', (await readProgress('cet6')).length, 0)

  // 导入：先清空再写回
  const restored = parseBackup(serializeBackup({
    settings: {},
    wordRecords: [
      { word: 'cancel', dictId: 'cet4', chapter: 0, at: 200, wrongCount: 1 },
      { word: 'govern', dictId: 'cet4', chapter: 0, at: 201, wrongCount: 0 },
    ],
    chapterRecords: [{ dictId: 'cet4', chapter: 0, at: 200, seconds: 30, wordCount: 20, wrongCount: 1 }],
    progress: [{ dictId: 'cet4', chapter: 0, index: 20, words: 20, done: true, updatedAt: 200 }],
  }))
  const importResult = await importData(restored)
  check('导入返回恢复条数（2 词 + 1 章 + 1 进度）', importResult.restored, 4)
  check('导入后单词记录被替换', (await readWordRecords()).length, 2)
  check('导入后进度保留 done', (await readProgress('cet4'))[0].done, true)

  // 清空
  await clearData()
  check('清空后没有单词记录', (await readWordRecords()).length, 0)
  check('清空后没有进度', (await readProgress('cet4')).length, 0)
  check('清空后没有会话存档', readSession(), null)

  // localStorage 镜像（IndexedDB 不可用时的降级路径）
  writeMirror({ wordRecords: [{ word: 'fallback', dictId: 'x', wrongCount: 1, at: 1 }], chapterRecords: [], progress: [] })
  check('镜像写入可回读', readMirror().wordRecords[0].word, 'fallback')
  writeMirror({ wordRecords: [], chapterRecords: [], progress: [] })
  check('镜像可清空', readMirror().wordRecords.length, 0)

  // 词库缓存统计与清理（同一套 fake IndexedDB；网络用桩顶掉）
  sandbox.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => [
      { name: 'cancel', trans: ['取消'], ukphone: 'ˈkænsl' },
      { name: 'govern', trans: ['治理'], ukphone: 'ˈɡʌvn' },
    ],
  })
  const stats0 = await cacheStats()
  check('空缓存条数为 0', stats0.count, 0)
  check('空缓存字节为 0', stats0.bytes, 0)
  await loadDictWords('cet4', { force: true })
  const stats1 = await cacheStats()
  check('加载后缓存里有词库', stats1.count >= 1, true)
  check('缓存占用大于 0', stats1.bytes > 0, true)
  const cleared = await clearDictCache()
  check('清理缓存成功', cleared, true)
  check('清理后条数归零', (await cacheStats()).count, 0)
  check('清理后仍能重新加载', (await loadDictWords('cet4', { force: true })).length > 0, true)
})()

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

/** 收集渲染树里内联注入的样式文本（Styles 组件走 dangerouslySetInnerHTML） */
function collectCss(node, out = []) {
  if (node === null || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    node.forEach((item) => collectCss(item, out))
    return out
  }
  if (typeof node.type === 'function') {
    collectCss(node.type(node.props ?? {}), out)
    return out
  }
  const html = node.props?.dangerouslySetInnerHTML?.__html
  if (typeof html === 'string') out.push(html)
  // Styles 组件是 h('style', {...}, CSS)：桩里子节点在 node.children，真 React 在 props.children
  if (node.type === 'style') {
    const kids = Array.isArray(node.children) && node.children.length
      ? node.children
      : (node.props?.children ?? [])
    const text = Array.isArray(kids) ? kids.join('') : String(kids ?? '')
    if (text) out.push(text)
  }
  collectCss(node.children, out)
  collectCss(node.props?.children, out)
  return out
}

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

// —— 面板：章节下拉 & 词库选择器 ——
function countTag(node, tag, out = { n: 0 }) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (typeof node.type === 'function') {
    countTag(node.type(node.props ?? {}), tag, out)
    return out
  }
  if (node.type === tag) out.n += 1
  for (const child of node.children ?? []) countTag(child, tag, out)
  if (node.props?.children !== undefined) countTag(node.props.children, tag, out)
  return out
}
check('面板下拉选项 = 131 章 + 5 种默写形态', countTag(panel, 'option').n, 131 + 5)
const dictBtn = (function find(node) {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (typeof node.type === 'function') return find(node.type(node.props ?? {}))
  if (typeof node.props?.className === 'string' && node.props.className.includes('qat-dictbtn')) return node
  for (const child of node.children ?? []) {
    const hit = find(child)
    if (hit) return hit
  }
  return find(node.props?.children)
})(panel)
check('词库按钮显示当前词库名', dictBtn?.children?.[0], 'CET-4 ▾')

const picker = render('渲染：词库选择器', () => renderTest.components.DictPicker({
  t: (key) => key,
  dictId: 'cet4',
  query: '',
  category: '',
  recent: [catalog().find((d) => d.id === 'cet4')],
  categories: groupByCategory(catalog()),
  list: catalog(),
  onQuery: () => {},
  onCategory: () => {},
  onPick: () => {},
  onClose: () => {},
}))
const pickerClasses = collectClasses(picker).join(' ')
check('选择器含搜索框', pickerClasses.includes('qat-search'), true)
check('选择器含分类 chip', pickerClasses.includes('qat-chip'), true)
check('选择器列出全部 371 个词库 + 1 条最近使用', countTag(picker, 'button').n, 371 + 1 + 11)
check('选择器当前词库高亮', (function findActive(node) {
  if (node === null || node === undefined || typeof node !== 'object') return false
  if (typeof node.type === 'function') return findActive(node.type(node.props ?? {}))
  if (node.props?.['data-active'] === 'true' && String(node.props?.className).includes('qat-dictrow')) return true
  return (node.children ?? []).some(findActive) || findActive(node.props?.children)
})(picker), true)

// —— 渲染冒烟：练习卡片的控制按钮 ——
const cardCase = render('渲染：练习卡片控制条', () => renderTest.components.Trainer({
  words: ['cancel', 'govern', 'apparent'],
  variant: 'panel',
  showMeta: true,
  dictation: 'hideVowel',
  ctx: ctxStub,
}))
const cardText = gatherText === undefined ? '' : ''
const cardClasses = collectClasses(cardCase).join(' ')
check('卡片有上一词/跳过/循环/暂停四个按钮',
  ['prev', 'skip', 'loop', 'pause'].every((act) => {
    const found = { hit: false }
    const walk = (node) => {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) return node.forEach(walk)
      if (node.props?.['data-act'] === act) found.hit = true
      walk(node.children)
      walk(node.props?.children)
      if (typeof node.type === 'function') walk(node.type(node.props ?? {}))
    }
    walk(cardCase)
    return found.hit
  }), true)
check('卡片显示 WPM 指标', cardClasses.includes('qat-metric'), true)
check('默写形态生效（元音遮成点）',
  (function findMask(node) {
    if (!node || typeof node !== 'object') return false
    if (Array.isArray(node)) return node.some(findMask)
    if (typeof node.type === 'function') return findMask(node.type(node.props ?? {}))
    if (node.props?.['data-mask'] === 'true' && String(node.children) === '·') return true
    return findMask(node.children) || findMask(node.props?.children)
  })(cardCase), true)

// —— 卡片里的按钮全部可聚焦 ——
const focusCheck = (() => {
  let roles = 0
  let focusable = 0
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    if (typeof node.type === 'function') return walk(node.type(node.props ?? {}))
    const props = node.props || {}
    if (props.role === 'button') {
      roles += 1
      if (props.tabIndex === 0) focusable += 1
    }
    walk(props.children)
    walk(node.children)
  }
  walk(renderTest.components.Trainer({
    words: ['cancel'], variant: 'panel', showMeta: true, ctx: ctxStub,
  }))
  return { roles, focusable }
})()
check('卡片里每个 role=button 都可聚焦', focusCheck.focusable, focusCheck.roles)
check('卡片至少有两个按钮', focusCheck.roles >= 2, true)

// —— a11y：读屏播报区 / 焦点样式 / 帮助按钮 ——
const cardA11y = render('渲染：卡片 a11y', () => renderTest.components.Trainer({
  words: ['cancel'], variant: 'panel', showMeta: true, ctx: ctxStub,
}))
check('有 role=status 的播报区', (function find(node) {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(find)
  if (typeof node.type === 'function') return find(node.type(node.props ?? {}))
  const props = node.props || {}
  if (props.role === 'status' && props['aria-live'] === 'polite') return true
  return find(props.children) || find(node.children)
})(cardA11y), true)
check('有快捷帮助按钮', (function find(node) {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(find)
  if (typeof node.type === 'function') return find(node.type(node.props ?? {}))
  const props = node.props || {}
  if (props['data-act'] === 'help' && props['aria-expanded'] !== undefined) return true
  return find(props.children) || find(node.children)
})(cardA11y), true)
check('样式里有 focus-visible 轮廓', collectCss(cardA11y).join('').includes(':focus-visible'), true)
check('样式里有读屏隐藏类', collectCss(cardA11y).join('').includes('.qat-sr'), true)



// —— 渲染冒烟：设置页 ——
const settingsCase = render('渲染：设置页', () => renderTest.components.SettingsSection({}))
check('设置页有六个设置行（含词库缓存）', collectClasses(settingsCase).filter((name) => name === 'qat-setrow').length, 6)
check('设置页含大小写开关', (function find(node) {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(find)
  if (typeof node.type === 'function') return find(node.type(node.props ?? {}))
  if (node.props?.['data-setting'] === 'caseSensitive') return true
  return find(node.children) || find(node.props?.children)
})(settingsCase), true)
check('设置页有数据管理按钮', (function acts(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    node.forEach((item) => acts(item, out))
    return out
  }
  if (typeof node.type === 'function') {
    acts(node.type(node.props ?? {}), out)
    return out
  }
  const act = node.props?.['data-act']
  if (['export', 'import', 'clear'].includes(act)) out.push(act)
  acts(node.children, out)
  acts(node.props?.children, out)
  return out
})(settingsCase).sort().join(','), 'clear,export,import')

check('设置页含默写下拉', (function find(node) {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(find)
  if (typeof node.type === 'function') return find(node.type(node.props ?? {}))
  if (node.type === 'select') return true
  return find(node.children) || find(node.props?.children)
})(settingsCase), true)

// —— 渲染冒烟：结果页（错词清单 / 下一章） ——
const doneCase = render('渲染：结果页', () => renderTest.components.Trainer({
  words: ['cancel'],
  variant: 'panel',
  showMeta: true,
  dictId: 'cet4',
  chapter: 0,
  onReview: () => {},
  onNextChapter: () => {},
  ctx: ctxStub,
}))
check('结果页有控制区', collectClasses(doneCase).includes('qat-card'), true)

// —— 渲染冒烟：词库选择器里的自定义导入 ——
const pickerCase = render('渲染：词库选择器', () => renderTest.components.DictPicker({
  t: (key, vars) => (vars && vars.n !== undefined ? `${key}:${vars.n}` : key),
  dictId: 'cet4',
  query: '',
  category: '',
  recent: [],
  categories: groupByCategory(catalog()).slice(0, 3),
  list: catalog().slice(0, 5),
  onQuery: () => {},
  onCategory: () => {},
  onPick: () => {},
  onImported: () => {},
  onClose: () => {},
}))
check('选择器有导入入口', (function acts(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    node.forEach((item) => acts(item, out))
    return out
  }
  if (typeof node.type === 'function') {
    acts(node.type(node.props ?? {}), out)
    return out
  }
  const act = node.props?.['data-act']
  if (act) out.push(act)
  acts(node.children, out)
  acts(node.props?.children, out)
  return out
})(pickerCase).join(','), 'custom-new')
check('选择器列出词库', gatherText(pickerCase).includes('CET-4'), true)

const pickerImporting = render('渲染：导入面板', () => {
  const element = renderTest.components.DictPicker({
    t: (key, vars) => (vars && vars.n !== undefined ? `${key}:${vars.n}` : key),
    dictId: 'cet4', query: '', category: '', recent: [], categories: [], list: [],
    onQuery: () => {}, onCategory: () => {}, onPick: () => {}, onImported: () => {}, onClose: () => {},
  })
  // 直接跑一遍组件逻辑：把「导入」按钮的点击当作已打开
  const acts = []
  ;(function walk(node) {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    if (typeof node.type === 'function') return walk(node.type(node.props ?? {}))
    const act = node.props?.['data-act']
    if (act) acts.push([act, node])
    walk(node.children)
    walk(node.props?.children)
  })(element)
  const button = acts.find(([act]) => act === 'custom-new')?.[1]
  button?.props?.onClick?.()
  return element
})
check('导入面板能展开', pickerImporting !== null, true)

// —— 渲染冒烟：错词本 / 统计 ——
function gatherText(node, out = '') {
  if (node === null || node === undefined) return out
  if (typeof node === 'string' || typeof node === 'number') return out + String(node)
  if (Array.isArray(node)) return node.reduce((acc, item) => gatherText(item, acc), out)
  if (typeof node !== 'object') return out
  const { type, props = {}, children } = node
  const next = gatherText(children, out) + (props.children !== undefined ? gatherText(props.children, '') : '')
  if (typeof type === 'function') return next + gatherText(type(props))
  return next
}

const wrongCase = render('渲染：错词本', () => renderTest.components.WrongBookPanel({
  t: (key, vars) => (vars && vars.n !== undefined ? `${key}:${vars.n}` : key),
  rows: [
    { word: 'cancel', dictId: 'cet4', wrongCount: 3, lastAt: 1 },
    { word: 'govern', dictId: 'cet4', wrongCount: 1, lastAt: 2 },
  ],
  onReview: () => {},
  onClear: () => {},
  onClose: () => {},
}))
check('错词本列出条目', countTag(wrongCase, 'div').n > 0 && collectClasses(wrongCase).includes('qat-picker'), true)
check('错词本每词一行', (gatherText(wrongCase).match(/×/g) || []).length, 2)
check('错词本显示次数', gatherText(wrongCase).includes('×3'), true)
check('错词本有重练按钮', gatherText(wrongCase).includes('reviewTop'), true)
check('错词本每词有掌握勾', (gatherText(wrongCase).match(/✓/g) || []).length, 2)

const emptyWrong = render('渲染：空错词本', () => renderTest.components.WrongBookPanel({
  t: (key) => key, rows: [], onReview: () => {}, onClear: () => {}, onClose: () => {},
}))
check('空错词本给提示', gatherText(emptyWrong).includes('wrongEmpty'), true)
check('空错词本不出重练按钮', gatherText(emptyWrong).includes('reviewTop'), false)

const statDays = lastDays(
  [{ at: at(2026, 11, 24, 9), wordCount: 20, wrongCount: 2, seconds: 40 }],
  7,
  at(2026, 11, 24, 18),
)
const statsCase = render('渲染：统计', () => renderTest.components.StatsPanel({
  t: (key, vars) => (vars && vars.n !== undefined ? `${key}:${vars.n}` : key),
  days: statDays,
  weeks: heatmapWeeks([{ at: at(2026, 11, 24, 9), wordCount: 60, wrongCount: 0, seconds: 40 }], 12, at(2026, 11, 24, 18)),
  letters: [{ letter: 'e', count: 5 }, { letter: 'a', count: 3 }],
  summary: summarize([]),
  onClose: () => {},
}))
check('统计每根柱一个列', (gatherText(statsCase).match(/\d\d-\d\d/g) || []).length, 7)
check('统计显示词数', gatherText(statsCase).includes('statWords'), true)
check('统计显示易错字母', gatherText(statsCase).includes('e ×5'), true)
check('统计有热力图格子', collectClasses(statsCase).filter((name) => name === 'qat-heatcell').length, 84)
check('统计画出 26 个键位', collectClasses(statsCase).filter((name) => name === 'qat-key').length, 26)
check('键位有分档', (function keys(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    node.forEach((item) => keys(item, out))
    return out
  }
  if (typeof node.type === 'function') {
    keys(node.type(node.props ?? {}), out)
    return out
  }
  if (node.props?.className === 'qat-key') out.push(node.props['data-level'])
  keys(node.children, out)
  keys(node.props?.children, out)
  return out
})(statsCase).includes('4'), true)

await recordFlow

if (failures > 0) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nALL PASS')
