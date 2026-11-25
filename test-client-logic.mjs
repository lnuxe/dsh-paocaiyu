/**
 * client.js 的纯逻辑测试：不碰浏览器、不模拟 DOM。
 * 覆盖"打中 → 通过进下一个词"和"打错 → 标红清空重打"这两条判定。
 */
import fs from 'node:fs'
import { judgeSize, SIZE_LIMITS } from './scripts/check-size.mjs'
import path from 'node:path'
import vm from 'node:vm'
// 审计脚本的纯函数部分（不碰文件系统）：统计口径也要有断言
import {
  auditRows, mergeStats, emptyStats, ratio, formatPct, formatRow, formatHead, formatReport,
  parseArgs, dictFilePath, REASON_KEYS,
} from './scripts/audit-dicts.mjs'
// 音标缺口审计的纯函数：四桶口径 / 覆盖率 / 「有字段却没显示」的判定
import {
  PHONETIC_BUCKETS, NO_PHONETIC_CATEGORIES, NOTATION_CATEGORIES,
  emptyPhoneticStats, bucketOf, classifyCategory, phoneticRows, mergePhonetic,
  phoneticCoverage, missingPhonetic, sortWorstPhonetic, formatPhoneticReport,
  formatPhoneticRow, parsePhoneticArgs, upstreamCandidates, pickUpstream,
} from './scripts/audit-phonetic.mjs'

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
  effectiveTarget, stripPunct, maskLetters, answersRevealed, selectStyle, DICTATION_MODES,
  readSettings, getSettings, setSetting, SETTING_DEFAULTS,
  dayKey, aggregateDaily, summarize, lastDays,
  calcWpm, calcAccuracy, shouldStartOnTab, saveSession, readSession, clearSession, sameSession,
  collectWrongWords, activeMs, resolveHotkey, peekKey, hotkeyAction, neighborWords,
  toggleDictationMode, nextDictationMode, dictSourceList, DICT_PIN,
  heatmapWeeks, heatLevel, filterWrongWords, DICT,
  serializeBackup, parseBackup, BACKUP_VERSION, BACKUP_LIMITS, pressable, playClick,
  readCustomDicts, writeCustomDicts, parseCustomWords, saveCustomDict, removeCustomDict,
  keyboardHeat, KEY_ROWS, cacheStats, clearDictCache,
  keyLayout, KEYBOARD_GEOM, KEYBOARD_VIEW, heatBars, KEY_BARS_TOP,
  fingerOf, keyHighlight, keyPosition, keyGeom, fingerKeyboardNode,
  FINGER_MAP, FINGER_IDS, FINGER_LABELS, FINGER_COLORS, FINGER_KEY,
  customWords, isCustomId, CUSTOM_PREFIX, dictionaryById,
  parseCustomFile, serializeCustomDict, splitCsvLine, toCustomWord, downloadText, withSlashes,
  stepIndex, toWordList, isRoundDone, wordsOfRound, nextChapterIndex, pronunciationSrc, pronunciationType,
  writeDictId, releaseStuckComposer, shouldBlockSend, shouldClearDraft,
  topWrongLetters, readMastered, writeMastered, toggleMastered, masteredKey,
  tipState, tipKey, nextWrongCount, TIP_THRESHOLDS, TIP_MASK, CLICK_TONES,
  shouldReadMeaning, meaningLang, speakMeaning, cancelMeaning, MEANING_DELAY_MS,
  readBarProgress, writeBarProgress, resumeIndex, readChapterPos, writeChapterPos, resumeChapter, resumeChapterSmart, BAR_KEY, CHAPTER_KEY,
} = plugin.__test

// 实时速度（G2）单独解构：上面那一大段是多个子任务共用的，能不动就不动
const {
  calcLiveWpm, windowedWpm, pushSpeedSample,
  LIVE_WINDOW_MS, LIVE_HEARTBEAT_MS, LIVE_WPM_CAP, CHARS_PER_WORD,
} = plugin.__test

let failures = 0
let passed = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    failures += 1
    console.log(`FAIL ${label}\n  actual   ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`)
  } else {
    passed += 1
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
// 414,469 = 371 个库里真实条数之和。上游 dictionary.ts 手写的 length 有 8 个日语库虚高
// （japanese002…006 去重前计数），`build-index.mjs --count` 已按 public/dicts 实数校正
check('目录总词数与上游一致', catalog().reduce((sum, d) => sum + Number(d.length || 0), 0), 414469)
check('日语库的 length 已按真实条数校正', [
  dictionaryById('japanese006').length, dictionaryById('japanese002').length,
], [3473, 669])
check('最大词库 coca_20000', catalog().slice().sort((a, b) => b.length - a.length)[0].id, 'coca_20000')

// —— 章节模型：20 词一章 ——
check('章节数 = ceil(2607/20)', chapterCount({ length: 2607 }), 131)
check('末章词数', wordsOfChapter(Array.from({ length: 2607 }, (_, i) => ({ w: `w${i}` })), 130).length, 7)
check('首章 20 词', wordsOfChapter(Array.from({ length: 2607 }, (_, i) => ({ w: `w${i}` })), 0).length, 20)
check('空词库也有一章', chapterCount({ length: 0 }), 1)

// —— 词条归一化 ——
// 形状变了：`ipa` 之外还多了 `us` / `uk`（音标按口音分开存），ipa 是「默认展示」那一支
check('归一化 en', normalizeWord({ name: 'cancel', trans: ['取消， 撤销； 删去'], ukphone: "'kænsl", usphone: "'kænsl" }, 'en'),
  // en: true = 这份词库有英/美口音之分（日语罗马字 / 拼音不加 AmE 前缀）
  { w: 'cancel', ipa: '/ˈkænsl/', us: '/ˈkænsl/', uk: '/ˈkænsl/', zh: '取消，撤销；删去', en: true })
check('ipa 取默认口音（us）那一支', normalizeWord({ name: 'go', trans: ['去'], ukphone: 'gəu', usphone: 'goʊ' }, 'en').ipa, '/goʊ/')
check('代码词库不生成音标', normalizeWord({ name: 'SELECT', trans: ['查询'], usphone: 'silekt' }, 'code').ipa, '')
check('日语词条保留假名', normalizeWord({ name: 'たべる', trans: ['吃'], ukphone: 'taberu' }, 'ja').w, 'たべる')
check('空释义被丢弃', normalizeWord({ name: 'ghost', trans: [] }, 'en'), null)
check('超长词条被丢弃（>200 字符）', normalizeWord({ name: 'x'.repeat(201), trans: ['长'] }, 'en'), null)
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

// —— 新增三项（字号 / 发音倍速 / 按键音音量）：老存档缺 key 时回落默认，且不弄丢别的项 ——
check('设置键总数 19（原 11 + 字号/倍速/音量 + 悬停/选中 + 乱序/默写来源 + 前后词预览）', Object.keys(SETTING_DEFAULTS).length, 19)
check('新设置项默认值',
  [SETTING_DEFAULTS.wordScale, SETTING_DEFAULTS.voiceRate, SETTING_DEFAULTS.clickVolume], ['auto', 1, 100])
check('显示类两项默认值（悬停开 / 选中关）',
  [SETTING_DEFAULTS.answerOnHover, SETTING_DEFAULTS.textSelectable], [true, false])
check('老存档没有显示类 key 时回落默认', (function () {
  store['qwerty-autotype:setting:showZh'] = 'false'
  delete store['qwerty-autotype:setting:answerOnHover']
  delete store['qwerty-autotype:setting:textSelectable']
  const merged = readSettings()
  const out = [merged.answerOnHover, merged.textSelectable, merged.showZh]
  store['qwerty-autotype:setting:showZh'] = 'true'
  return out
})(), [true, false, false])
check('老存档没有新 key 时回落默认', (function () {
  store['qwerty-autotype:setting:showZh'] = 'false'
  delete store['qwerty-autotype:setting:wordScale']
  delete store['qwerty-autotype:setting:voiceRate']
  delete store['qwerty-autotype:setting:clickVolume']
  const merged = readSettings()
  const out = [merged.wordScale, merged.voiceRate, merged.clickVolume, merged.showZh]
  store['qwerty-autotype:setting:showZh'] = 'true'
  return out
})(), ['auto', 1, 100, false])
check('脏存档收敛回合法档', (function () {
  store['qwerty-autotype:setting:wordScale'] = '"giant"'
  store['qwerty-autotype:setting:voiceRate'] = '"fast"'
  store['qwerty-autotype:setting:clickVolume'] = '777'
  const merged = readSettings()
  delete store['qwerty-autotype:setting:wordScale']
  delete store['qwerty-autotype:setting:voiceRate']
  delete store['qwerty-autotype:setting:clickVolume']
  return [merged.wordScale, merged.voiceRate, merged.clickVolume]
})(), ['auto', 1, 100])

// —— 译义朗读：开关默认关、只在刚打完时读、同一个词不重复读 ——
check('译义朗读默认关闭', SETTING_DEFAULTS.readMeaning, false)
check('刚打完 + 开着 + 有释义才读',
  shouldReadMeaning({ enabled: true, done: true, zh: '取消，撤销', lastWord: '', word: 'cancel' }), true)
check('没打完不读',
  shouldReadMeaning({ enabled: true, done: false, zh: '取消，撤销', lastWord: '', word: 'cancel' }), false)
check('开关关着不读',
  shouldReadMeaning({ enabled: false, done: true, zh: '取消，撤销', lastWord: '', word: 'cancel' }), false)
check('同一个词不重复读',
  shouldReadMeaning({ enabled: true, done: true, zh: '取消', lastWord: 'cancel', word: 'cancel' }), false)
check('空释义不读',
  shouldReadMeaning({ enabled: true, done: true, zh: '  ', lastWord: '', word: 'cancel' }), false)
check('下一个词可以读',
  shouldReadMeaning({ enabled: true, done: true, zh: '明显的', lastWord: 'cancel', word: 'apparent' }), true)
check('中文释义走 zh-CN', meaningLang('取消，撤销'), 'zh-CN')
check('日语释义走 ja-JP', meaningLang('キャンセルする'), 'ja-JP')
check('汉字混合假名按日语', meaningLang('取り消す'), 'ja-JP')
check('空释义默认中文', meaningLang(''), 'zh-CN')
check('释义延迟常量是正数', MEANING_DELAY_MS > 0, true)
check('没有 speechSynthesis 时静默失败', speakMeaning('取消，撤销', { delay: 0 }), false)
check('排延迟朗读也不抛错', speakMeaning('取消，撤销', { delay: 30 }), false)
check('空释义不开口', speakMeaning('   ', { delay: 0 }), false)
check('撤掉空排期不抛错', cancelMeaning(), false)

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
check('实时速度有中英文案', [DICT.zh.liveSpeed, DICT.en.liveSpeed].join('|'), '实时 {wpm} WPM|Live {wpm} WPM')
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

// —— 体积守门（§7.4：纪律线 480KB，470KB 报警；口径与 npm run size 同源） ——
const clientBytes = fs.statSync(file).size
check('client.js 体积在纪律线内（judgeSize 与 scripts/check-size.mjs 同源）', judgeSize(clientBytes), 'ok')
check('体积纪律线是 480,000 字节（不是 400KB 的旧口径）', SIZE_LIMITS.fail, 480_000)
check('体积提醒线是 470,000 字节', SIZE_LIMITS.warn, 470_000)

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

// —— 实时速度（G2）：5 字符 = 1 词，取最近窗口 ——
const win = (t, chars) => ({ t, chars })
check('实时速度：空样本返回 0', windowedWpm([], 60000), 0)
check('实时速度：单样本算不出速度', windowedWpm([win(59000, 300)], 60000), 0)
check('实时速度：正常窗口 80 字符 / 8 秒 = 120 WPM', windowedWpm([win(52000, 250), win(60000, 330)], 60000), 120)
check('实时速度：窗口外的老样本被丢弃', windowedWpm([win(0, 0), win(55000, 100), win(60000, 130)], 60000), 72)
check('实时速度：字符没涨（停手）给 0', windowedWpm([win(58000, 50), win(60000, 50)], 60000), 0)
check('实时速度：暂停的采样不进样本', pushSpeedSample([win(1000, 5)], { t: 2000, chars: 9, paused: true }, 8000), [win(1000, 5)])
check('实时速度：暂停后窗口里只剩一条 → 0', windowedWpm(pushSpeedSample([win(1000, 5)], { t: 2000, chars: 9, paused: true }, 8000), 2000), 0)
const speedPool = [win(1000, 5), win(90000, 400)]
const pruned = pushSpeedSample(speedPool, win(95000, 420), 8000)
check('实时速度：追加时剪掉窗口外样本', pruned.length, 2)
check('实时速度：剪枝留下的是最近的', pruned.map((item) => item.t).join(','), '90000,95000')
check('实时速度：追加不改入参数组', speedPool.length, 2)
check('实时速度：折算 = 300 字符 / 60 秒 = 60 WPM', calcLiveWpm({ chars: 300, ms: 60000 }), 60)
check('实时速度：四舍五入取整（10.5 → 11）', calcLiveWpm({ chars: 7, ms: 8000 }), 11)
check('实时速度：荒谬值压在上限', calcLiveWpm({ chars: 1000, ms: 100 }), LIVE_WPM_CAP)
check('实时速度：没字符 / 没耗时都给 0', [calcLiveWpm({}), calcLiveWpm({ chars: 0, ms: 1000 }), calcLiveWpm({ chars: 10, ms: 0 }), calcLiveWpm(null)].join(','), '0,0,0,0')
check('实时速度：负数按 0 处理', calcLiveWpm({ chars: -5, ms: 1000 }), 0)
check('实时速度：采样窗口 8 秒、心跳 1 秒、5 字符 1 词', [LIVE_WINDOW_MS, LIVE_HEARTBEAT_MS, CHARS_PER_WORD].join(','), '8000,1000,5')

// —— 快捷键裁决 ——
const hk = (over) => resolveHotkey({ key: 'a', meta: false, ctrl: false, alt: false, shift: false, ...over })
check('Esc 关闭', hk({ key: 'Escape' }), 'close')
check('Cmd+Esc 不接管', hk({ key: 'Escape', meta: true }), '')
check('Cmd+← 上一个', hk({ key: 'ArrowLeft', meta: true }), 'prev')
check('Ctrl+← 上一个（Windows）', hk({ key: 'ArrowLeft', ctrl: true }), 'prev')
check('裸 ← 不接管（留给输入框）', hk({ key: 'ArrowLeft' }), '')
check('Cmd+→ 跳过', hk({ key: 'ArrowRight', meta: true }), 'skip')
check('Cmd+Shift+→ 跳到下一个词（上游 WordPanel）', hk({ key: 'ArrowRight', meta: true, shift: true }), 'next-word')
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

// —— 跟打条连续往下打 ——
check('中间前进一格', stepIndex(0, 10), 1)
check('到末尾绕回开头', stepIndex(9, 10), 0)
check('倒退到开头', stepIndex(0, 10, -1), 9)
check('倒退一格', stepIndex(5, 10, -1), 4)
check('空词库不炸', stepIndex(3, 0), 0)
check('大步跨也能绕', stepIndex(8, 10, 5), 3)
check('整本 CET-4 能走完一圈', stepIndex(2606, 2607), 0)
check('词条转字符串', toWordList([{ w: 'cancel' }, 'govern', { w: '' }, null]).join(','), 'cancel,govern')

// —— 发音：有道教音频 + TTS 兜底 ——
check('美音地址', pronunciationSrc('cancel', 'us'), 'https://dict.youdao.com/dictvoice?audio=cancel&type=2')
check('英音地址', pronunciationSrc('cancel', 'uk'), 'https://dict.youdao.com/dictvoice?audio=cancel&type=1')
check('日语走 le=jap', pronunciationSrc('りんご', 'ja'), 'https://dict.youdao.com/dictvoice?audio=%E3%82%8A%E3%82%93%E3%81%94&le=jap')
check('空词没有地址', pronunciationSrc('  ', 'us'), '')
check('英文按美音', pronunciationType('cancel'), 'us')
check('假名按日语', pronunciationType('りんご'), 'ja')
check('汉字按中文', pronunciationType('苹果'), 'zh')
// N10：de / id / kk / romaji 四档（kk 上游用俄语兜底，romaji 先转假名）
check('德语走 le=de', pronunciationSrc('Haus', 'de'), 'https://dict.youdao.com/dictvoice?audio=Haus&le=de')
check('印尼语走 le=id', pronunciationSrc('rumah', 'id'), 'https://dict.youdao.com/dictvoice?audio=rumah&le=id')
check('哈萨克语用俄语兜底 le=ru', pronunciationSrc('кітап', 'kk'), `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent('кітап')}&le=ru`)
check('罗马字先转假名再走 le=jap', pronunciationSrc('shinjuku', 'romaji'),
  'https://dict.youdao.com/dictvoice?audio=%E3%81%97%E3%82%93%E3%81%98%E3%82%85%E3%81%8F&le=jap')
check('未知 type 仍回落美音', pronunciationSrc('cancel', 'fr'), 'https://dict.youdao.com/dictvoice?audio=cancel&type=2')
check('有 Audio 时用有道教音频', (function () {
  const calls = []
  sandbox.window.Audio = function (src) {
    calls.push(src)
    return { play: () => Promise.resolve(), pause() {}, volume: 1, playbackRate: 1 }
  }
  const ok = plugin.__test.speak('cancel')
  const used = calls[calls.length - 1] ?? ''
  delete sandbox.window.Audio
  return ok === true && used.includes('dict.youdao.com/dictvoice?audio=cancel')
})(), true)
check('没有 Audio 时退回 TTS', (function () {
  let spoken = ''
  sandbox.window.speechSynthesis = {
    cancel() {},
    speak(u) { spoken = u.text },
  }
  sandbox.window.SpeechSynthesisUtterance = function (text) { this.text = text }
  const ok = plugin.__test.speak('govern')
  delete sandbox.window.speechSynthesis
  delete sandbox.window.SpeechSynthesisUtterance
  return ok === true && spoken === 'govern'
})(), true)

// —— 回归：绝不再改 composer 的属性（上次 inputmode=latin 直接把输入法搞哑） ——
const CLIENT_SRC = source
check('不再给 composer 设 inputmode', CLIENT_SRC.includes("setAttribute('inputmode'"), false)
check('不再给 composer 设 ime-mode', CLIENT_SRC.includes("style.imeMode = 'inactive'"), false)
check('仍然会清掉残留的 ime-mode', CLIENT_SRC.includes("style.imeMode === 'inactive'"), true)
check('不再写 data-qat-ime', CLIENT_SRC.includes('dataset.qatIme ='), false)
check('载入时会清掉旧的 data-qat-ime', CLIENT_SRC.includes('releaseStuckComposer'), true)
check('键盘接管有 liveBarRef 门禁', CLIENT_SRC.includes('liveBarRef.current'), true)
check('上屏拦截用 beforeinput', CLIENT_SRC.includes("addEventListener('beforeinput'"), true)

// —— Tab 启动的判定（含「残留的是自己写的提示语」） ——
const tabBase = { key: 'Tab', open: false, inComposer: true, modifier: false }
check('空的输入框按 Tab 能开', shouldStartOnTab({ ...tabBase, draft: '' }), true)
check('只有空白也算空', shouldStartOnTab({ ...tabBase, draft: '   ' }), true)
check('有用户文字不开', shouldStartOnTab({ ...tabBase, draft: '帮我看下这个' }), false)
check('残留自己的提示语能开', shouldStartOnTab({ ...tabBase, draft: '取消', ownDraft: '取消' }), true)
check('不是自己写的就不开', shouldStartOnTab({ ...tabBase, draft: '取消', ownDraft: '放弃' }), false)
check('已打开不重复开', shouldStartOnTab({ ...tabBase, open: true, draft: '' }), false)
check('不在输入框里不拦', shouldStartOnTab({ ...tabBase, inComposer: false, draft: '' }), false)
check('带修饰键不拦', shouldStartOnTab({ ...tabBase, modifier: true, draft: '' }), false)
check('别的键不管', shouldStartOnTab({ ...tabBase, key: 'Enter', draft: '' }), false)

// —— 自愈：旧版本写死在 composer 上的属性必须被清掉 ——
const stuckCase = (function () {
  const attrs = new Map([
    ['data-composer-input', ''],
    ['contenteditable', 'true'],
    ['inputmode', 'latin'],
    ['data-qat-ime', JSON.stringify({ inputmode: null, lang: null, style: null })],
  ])
  const style = { imeMode: 'inactive' }
  const node = {
    style,
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
    setAttribute: (name, value) => attrs.set(name, String(value)),
    removeAttribute: (name) => attrs.delete(name),
  }
  const prevDoc = sandbox.document
  sandbox.document = { querySelectorAll: (selector) => (selector.includes('data-composer-input') ? [node] : []) }
  releaseStuckComposer()
  const after = {
    inputmode: node.getAttribute('inputmode'),
    marker: node.getAttribute('data-qat-ime'),
    ime: style.imeMode,
  }
  sandbox.document = prevDoc
  return after
})()
check('清掉残留 inputmode', stuckCase.inputmode, null)
check('清掉残留标记', stuckCase.marker, null)
check('清掉残留 ime-mode', stuckCase.ime, '')
check('清掉残留 ime-mode', stuckCase.ime, '')

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

// —— 键盘形状：真键盘偏移（SVG 键帽坐标全从 keyLayout 来） ——
const layout = keyLayout()
check('键位布局三行', layout.length, 3)
check('键位布局 26 键', layout.flat().length, 26)
check('三行 10 / 9 / 7 键', layout.map((row) => row.length).join('/'), '10/9/7')
check('q 行起点 0 偏移', layout[0][0].x, 0)
check('a 行右移半格', layout[1][0].x > layout[0][0].x, true)
check('z 行再右移一格', layout[2][0].x > layout[1][0].x, true)
check('行距逐行下移', layout.map((row) => row[0].y).join(','), '0,11,22')
check('键宽 / 键高统一走常量',
  layout.flat().every((cell) => cell.w === KEYBOARD_GEOM.w && cell.h === KEYBOARD_GEOM.h), true)
check('同行相邻键不重叠',
  layout.every((row) => row.every((cell, index) => index === 0 || row[index - 1].x + row[index - 1].w < cell.x)), true)
check('三行纵向不重叠',
  layout[0].every((cell) => cell.y + cell.h <= layout[1][0].y) && layout[1].every((cell) => cell.y + cell.h <= layout[2][0].y), true)
check('所有键都在 viewBox 内',
  layout.flat().every((cell) => cell.x >= 0 && cell.x + cell.w <= KEYBOARD_VIEW.width && cell.y + cell.h <= KEYBOARD_VIEW.height), true)
check('viewBox 由常量算出', `${KEYBOARD_VIEW.width}x${KEYBOARD_VIEW.height}`, '109x32')
check('布局里的键正好是 26 个字母', layout.flat().map((cell) => cell.key).join(''), KEY_ROWS.join(''))

// —— 键盘排行：热力图 ⇄ 条形图切换用的数据（0 次键不出现，ratio 归一到 0..1） ——
const barRows = heatBars([{ letter: 'e', count: 9 }, { letter: 'a', count: 6 }, { letter: 'q', count: 1 }], 10)
check('排行按次数从多到少', barRows.map((row) => row.key).join(''), 'eaq')
check('排行首位 ratio 为 1', barRows[0].ratio, 1)
check('排行按最大键归一', barRows[1].ratio, 0.6666666666666666)
check('排行 ratio 都在 0..1', barRows.every((row) => row.ratio > 0 && row.ratio <= 1), true)
check('排行只取 topN', heatBars([{ letter: 'e', count: 9 }, { letter: 'a', count: 6 }, { letter: 'q', count: 1 }], 2).length, 2)
check('0 次的键不进排行', barRows.every((row) => row.count > 0), true)
check('排行每项结构固定', Object.keys(barRows[0]), ['key', 'count', 'ratio'])
check('空输入 → 空排行', heatBars([]), [])
check('全 0 输入 → 空排行', heatBars({ w: 0, e: 0 }), [])
check('对象形式入参也认', heatBars({ s: 4 })[0].key, 's')
check('默认 top 10', KEY_BARS_TOP, 10)
check('超过 10 个键也只留 10 条', heatBars(KEY_ROWS.join('').split('').map((letter, index) => ({ letter, count: index + 1 }))).length, 10)

// —— 指法图示：字母 → 手指（标准指法，f / j 是基准键） ——
check('左小/无名/中/食：a s d f',
  ['a', 's', 'd', 'f'].map(fingerOf).join(','),
  'leftPinky,leftRing,leftMiddle,leftIndex')
check('右食/中/无名/小：j k l ;',
  ['j', 'k', 'l', ';'].map(fingerOf).join(','),
  'rightIndex,rightMiddle,rightRing,rightPinky')
check('最外两列归小指', [fingerOf('q'), fingerOf('p')].join(','), 'leftPinky,rightPinky')
check('中间两列归中指', [fingerOf('e'), fingerOf('i')].join(','), 'leftMiddle,rightMiddle')
check('食指负责 f / j 基准键列', [fingerOf('f'), fingerOf('j')].join(','), 'leftIndex,rightIndex')
check('大写字母也认', fingerOf('F'), 'leftIndex')
check('空格没有手指', fingerOf(' '), null)
check('连字符没有手指', fingerOf('-'), null)
check('空值没有手指', [fingerOf(''), fingerOf(null)].join(','), ',')
check('八根手指顺序从左到右', FINGER_IDS.join(','),
  'leftPinky,leftRing,leftMiddle,leftIndex,rightIndex,rightMiddle,rightRing,rightPinky')
check('八根手指都有名字与配色',
  FINGER_IDS.every((id) => Boolean(FINGER_LABELS[id]) && Boolean(FINGER_COLORS[id])), true)

// —— 指法图示：下一个待打键 ——
check('词首高亮第一个字母', keyHighlight({ word: 'cancel', typed: '' }),
  { letter: 'c', finger: 'leftMiddle', row: 2, col: 2 })
check('中途高亮下一个待打字母', keyHighlight({ word: 'cancel', typed: 'ca' }),
  { letter: 'n', finger: 'rightIndex', row: 2, col: 5 })
check('全部打完返回 null', keyHighlight({ word: 'cancel', typed: 'cancel' }), null)
check('typed 超出词长返回 null', keyHighlight({ word: 'go', typed: 'govern' }), null)
check('空词返回 null', keyHighlight({ word: '', typed: '' }), null)
check('没传参数返回 null', keyHighlight(), null)
check('标点不画高亮', keyHighlight({ word: 'it-s', typed: 'it' }), null)
check('大写单词照常归位', keyHighlight({ word: 'Cancel', typed: 'c' }).letter, 'a')
check('行号列号与三行布局一致',
  [keyHighlight({ word: 'top', typed: 't' }).row, keyHighlight({ word: 'top', typed: 'to' }).col].join(','),
  '0,9')

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
renderTest.saveSession = renderPlugin.__test.saveSession
renderTest.clearSession = renderPlugin.__test.clearSession
renderTest.readSession = renderPlugin.__test.readSession
const ctxStub = { locale: { bind: () => (key) => key, register: () => {}, subscribe: () => () => {} } }

/** 收集渲染树里内联注入的样式文本（Styles 组件走 dangerouslySetInnerHTML） */
function collectCss(node, out = []) {
  // v0.6.1 起样式表只往 document.head 塞一份，树里没有 <style> 了，统一从导出的 CSS 取
  if (out.length === 0 && typeof node !== 'string' && typeof renderTest?.CSS === 'string') return [renderTest.CSS]
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

/** className 里是否含某个 class（一个节点可能挂多个，如 "qat-btn qat-btn-next"） */
function hasClass(classes, name) {
  return classes.some((item) => String(item).split(/\s+/).includes(name))
}

/** 展开函数组件后按 data-act 找那个节点（点按钮断言用） */
function findByAct(node, act) {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findByAct(item, act)
      if (hit) return hit
    }
    return null
  }
  if (typeof node.type === 'function') return findByAct(node.type(node.props ?? {}), act)
  if (node.props?.['data-act'] === act) return node
  return findByAct(node.children, act) ?? findByAct(node.props?.children, act)
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

// —— 图标：全部内联 SVG（path data 取自上游同名 iconify 图标），不用图片、不依赖 CSS 遮罩 ——
const glyph = render('渲染：侧栏图标', () => renderTest.components.PanelGlyph({ size: 16, active: true }))
check('侧栏图标是 svg', glyph?.type, 'svg')
check('侧栏图标走 currentColor', glyph?.props?.fill, 'currentColor')
check('侧栏图标可调尺寸', [glyph?.props?.width, glyph?.props?.height].join('x'), '16x16')
check('侧栏图标有 path', (glyph?.children ?? glyph?.props?.children ?? []).length > 0, true)
check('侧栏图标不用 base64 图片', String(glyph?.props?.style?.['--qat-ink'] ?? ''), '')
check('侧栏图标不再用 emoji 键盘', gatherText(glyph).includes('⌨'), false)
check('侧栏图标样式不再依赖 mask', /\.qat-glyph\{[^}]*mask-image/.test(source), false)
check('侧栏图标样式保留激活色', /\.qat-glyph\[data-active="true"\]/.test(source), true)

check('激活状态写到 data-active', glyph?.props?.['data-active'], 'true')

check('图标集覆盖所有控制项', Object.keys(renderTest.ICONS).sort().join(','),
  'again,book,caret,check,close,download,eye,eyeOff,gear,help,keyboard,lang,langOff,list,loop,loopOff,next,pause,play,prev,speak,stats')
check('每个图标都有 path', Object.values(renderTest.ICONS).every((icon) => Array.isArray(icon.d) && icon.d.every((d) => d.length > 4)), true)
check('实心图标用 fill', (() => {
  const node = renderTest.Icon({ name: 'speak' })
  return node.props.fill === 'currentColor' && node.props.stroke === 'none'
})(), true)
check('play 是线性播放键', (() => {
  const node = renderTest.Icon({ name: 'play' })
  return node.props.stroke === 'currentColor' && node.props.fill === 'none'
})(), true)
check('描边图标用 currentColor', (() => {
  const node = renderTest.Icon({ name: 'check' })
  return node.props.stroke === 'currentColor' && node.props.fill === 'none'
})(), true)
check('图标尺寸可调', renderTest.Icon({ name: 'close', size: 13 }).props.width, 13)
check('未知图标返回空', renderTest.Icon({ name: 'nope' }), null)
check('图标默认 24 格', renderTest.Icon({ name: 'loop' }).props.viewBox, '0 0 24 24')
check('包里不再有 base64 图片', /data:image\/png;base64,/.test(source), false)

const panel = render('渲染：跟打面板', () => renderTest.components.PracticePanel({ ctx: ctxStub }))
const panelClasses = collectClasses(panel).join(' ')
check('面板含词库下拉', panelClasses.includes('qat-select'), true)
check('面板含跟打卡片', panelClasses.includes('qat-card'), true)
check('面板在今日数据那一带显示实时速度', panelClasses.includes('qat-live-speed'), true)
check('面板卡片是 panel 变体', findPanelCard(panel), true)

// —— 面板排版：头部一行、工具行一行、按钮用迁移过来的图标 ——
check('面板头部存在', panelClasses.includes('qat-panel-head'), true)
check('面板有工具行', panelClasses.includes('qat-tools'), true)
check('词表/错词/统计/重来都是图标按钮', (panelClasses.match(/qat-iconbtn/g) || []).length, 4)
check('图标按钮都带 aria-label', (function walk(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) { node.forEach((item) => walk(item, out)); return out }
  if (node.props?.className === 'qat-iconbtn') out.push(Boolean(node.props['aria-label']))
  walk(node.children, out); walk(node.props?.children, out)
  return out
})(panel).every(Boolean), true)
check('工具行的选择器仍在', (panelClasses.match(/qat-select/g) || []).length >= 2, true)

const trainer = render('渲染：卡片（带音标中文）', () => renderTest.components.Trainer({ words: ['cancel'], variant: 'panel', showMeta: true, ctx: ctxStub }))
const trainerClasses = collectClasses(trainer).join(' ')
check('卡片含音标行', trainerClasses.includes('qat-gloss-ipa'), true)
check('卡片含中文行', trainerClasses.includes('qat-gloss-zh'), true)

renderTest.setOpen(true)
const bar = render('渲染：输入框上方跟打条', () => renderTest.components.ComposerTrainer({ useInput: () => '', inputActions: {}, ctx: ctxStub }))
const barClasses = collectClasses(bar).join(' ')
check('跟打条含单词', barClasses.includes('qat-word'), true)
check('跟打条含音标', barClasses.includes('qat-ipa'), true)
// 中文释义在 composer 输入框里，条上不再重复一遍
check('跟打条不重复显示中文释义', barClasses.includes('qat-bar-gloss'), false)
check('跟打条显示整本进度', barClasses.includes('qat-bar-count'), true)
check('跟打条显示实时速度', barClasses.includes('qat-bar-speed'), true)
check('跟打条中间块单独一层（好居中）', barClasses.includes('qat-bar-center'), true)
check('进度和关闭绝对定位在两侧', renderTest.CSS.includes('.qat-bar{position:relative'), true)
// 条上只留一个按钮（×），其余操作走快捷键
check('跟打条只有一个关闭按钮', collectClasses(bar).filter((name) => name.includes('qat-bar-close')).length, 1)
// 跟打条的重开：常驻小按钮（不是 hover 浮出），和关闭按钮分开摆
check('跟打条有重开按钮', findByAct(bar, 'restart') !== null, true)
check('跟打条不再有图标工具条', barClasses.includes('qat-acts'), false)
check('跟打条不再有词库下拉', barClasses.includes('qat-select'), false)
renderTest.setOpen(false)

// —— 关掉跟打之后绝不清用户草稿（这是「输入框打不了字」的根因） ——
const draftCase = (function () {
  const writes = []
  const actions = { setDraft: (text) => writes.push(text) }
  // 模拟：条从来没写过提示语（wrote 为空），关闭状态下用户开始打字
  renderTest.setOpen(false)
  renderTest.components.ComposerTrainer({
    useInput: () => 'hell',
    inputActions: actions,
    ctx: ctxStub,
  })
  return writes
})()
check('关条时不去清用户草稿', draftCase.length, 0)

// —— 关条时清草稿的判定（真值表，防「关条后打不了字」复发） ——
check('打开时不清', shouldClearDraft({ open: true, draft: '取消', wrote: '取消' }), false)
check('我们写的能清掉', shouldClearDraft({ open: false, draft: '取消', wrote: '取消' }), true)
check('没写过就绝不清（用户自己打的字）', shouldClearDraft({ open: false, draft: '你好', wrote: '' }), false)
check('用户改过就保留', shouldClearDraft({ open: false, draft: '取消一下', wrote: '取消' }), false)
check('草稿已空不用清', shouldClearDraft({ open: false, draft: '', wrote: '取消' }), false)
check('wrote 为空草稿也空', shouldClearDraft({ open: false, draft: '', wrote: '' }), false)
check('undefined 输入不炸', shouldClearDraft(), false)

// —— 发送按钮要在训练中挡住 ——
check('挡住发送消息', shouldBlockSend('发送消息'), true)
check('挡住 Send message', shouldBlockSend('Send message'), true)
check('挡住加入队列', shouldBlockSend('加入队列'), true)
check('停止/打断永远放行', shouldBlockSend('停止生成'), false)
check('空标签不管', shouldBlockSend(''), false)


// —— 口音设置：美音 type=2 / 英音 type=1，中日文按文字判定 ——
check('默认是美音', renderTest.SETTING_DEFAULTS.accent, 'us')
check('口音有六档', renderTest.ACCENTS.join(','), 'us,uk,de,id,kk,romaji')
check('英文按设置吃英音', renderTest.resolveAccent('cancel', { accent: 'uk' }), 'uk')
check('英文默认美音', renderTest.resolveAccent('cancel', { accent: 'us' }), 'us')
check('设置坏了回退美音', renderTest.resolveAccent('cancel', { accent: 'fr' }), 'us')
check('假名不听设置', renderTest.resolveAccent('りんご', { accent: 'uk' }), 'ja')
check('汉字不听设置', renderTest.resolveAccent('苹果', { accent: 'uk' }), 'zh')

// —— 打开路径：空词库也要看得见 ——
const emptyBar = (function () {
  renderTest.setOpen(true)
  renderTest.writeCustomDicts({ 'custom:空': [] })
  writeDictId('custom:空')
  const out = render('渲染：空词库的跟打条', () => renderTest.components.ComposerTrainer({
    useInput: () => '',
    inputActions: {},
    ctx: ctxStub,
  }))
  writeDictId('cet4')
  renderTest.writeCustomDicts({})   // 清掉临时词库，别污染后面的目录断言
  renderTest.setOpen(false)
  return out
})()
check('空词库时条仍然渲染', collectClasses(emptyBar).includes('qat-bar'), true)
check('空词库时给出加载提示', gatherText(emptyBar).includes('loading') || collectClasses(emptyBar).includes('qat-bar-empty'), true)


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
check('词库按钮显示当前词库名', dictBtn?.children?.[1], 'CET-4')
check('词库按钮前面挂 20 号徽标',
  [dictBtn?.children?.[0]?.type?.name, dictBtn?.children?.[0]?.props?.size,
    dictBtn?.children?.[0]?.props?.meta?.id], ['DictBadge', 20, 'cet4'])
check('词库按钮的下拉箭头是图标不是字符', (function find(node) {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(find)
  if (typeof node.type === 'function') return find(node.type(node.props ?? {}))
  if (node.type === 'svg' && node.props?.className === 'qat-svg qat-svg-caret') return true
  return find(node.children) || find(node.props?.children)
})(dictBtn), true)

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
check('设置页有十七个设置行（+ 悬停提示 / 允许选中文本 / 章内乱序 / 前后词预览）', collectClasses(settingsCase).filter((name) => name === 'qat-setrow').length, 17)
check('设置页含章内乱序开关', (function find(node) {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(find)
  if (typeof node.type === 'function') return find(node.type(node.props ?? {}))
  if (node.props?.['data-setting'] === 'shuffle') return true
  return find(node.children) || find(node.props?.children)
})(settingsCase), true)
check('设置页有字号/倍速/音量三个新控件', ['wordScale', 'voiceRate', 'clickVolume'].map((key) => {
  const hit = (function find(node) {
    if (!node || typeof node !== 'object') return null
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = find(item)
        if (found) return found
      }
      return null
    }
    if (typeof node.type === 'function') return find(node.type(node.props ?? {}))
    if (node.props?.['data-setting'] === key) return node
    return find(node.children) ?? find(node.props?.children)
  })(settingsCase)
  return hit ? hit.type : null
}).join(','), 'select,select,select')
const settingNode = (key) => (function find(node) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = find(item)
      if (found) return found
    }
    return null
  }
  if (typeof node.type === 'function') return find(node.type(node.props ?? {}))
  if (node.props?.['data-setting'] === key) return node
  return find(node.children) ?? find(node.props?.children)
})(settingsCase)
const optionValues = (key) => {
  const node = settingNode(key)
  const kids = node?.children ?? node?.props?.children ?? []
  return kids.map((option) => option.props.value).join(',')
}
check('字号下拉四档', optionValues('wordScale'), 'auto,small,medium,large')
check('发音倍速下拉五档', optionValues('voiceRate'), '0.6,0.8,1,1.2,1.5')
check('按键音音量下拉五档', optionValues('clickVolume'), '0,40,60,80,100')
check('中英都有新设置文案',
  ['settingWordScale', 'settingVoiceRate', 'settingClickVolume', 'wordScale_auto', 'wordScale_small', 'wordScale_medium', 'wordScale_large']
    .every((key) => DICT.zh[key] && DICT.en[key]), true)
check('中英都有新设置文案',
  ['settingWordScale', 'settingVoiceRate', 'settingClickVolume', 'wordScale_auto', 'wordScale_small', 'wordScale_medium', 'wordScale_large']
    .every((key) => DICT.zh[key] && DICT.en[key]), true)
check('设置页含大小写开关', (function find(node) {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(find)
  if (typeof node.type === 'function') return find(node.type(node.props ?? {}))
  if (node.props?.['data-setting'] === 'caseSensitive') return true
  return find(node.children) || find(node.props?.children)
})(settingsCase), true)
check('设置页含译义朗读开关', (function find(node) {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(find)
  if (typeof node.type === 'function') return find(node.type(node.props ?? {}))
  if (node.props?.['data-setting'] === 'readMeaning') return true
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

// —— 指法图示：纯 SVG 键盘（26 键，320×110 内，不内联位图） ——
function collectVnodes(node, type, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    node.forEach((item) => collectVnodes(item, type, out))
    return out
  }
  if (node.type === type) out.push(node)
  for (const child of node.children ?? []) collectVnodes(child, type, out)
  if (node.props?.children !== undefined) collectVnodes(node.props.children, type, out)
  return out
}

const kbd = renderTest.fingerKeyboardNode({ active: 'f', label: '指法：左食指 按 F' })
check('指法键盘是 svg', kbd?.type, 'svg')
check('键帽数量 = 26', collectVnodes(kbd, 'rect').length, 26)
check('字母数量 = 26', collectVnodes(kbd, 'text').length, 26)
check('键盘宽度不超过 320', kbd?.props?.width <= 320, true)
check('键盘高度不超过 110', kbd?.props?.height <= 110, true)
check('键盘只有三行键', new Set(collectVnodes(kbd, 'rect').map((rect) => rect.props.y)).size, 3)
check('键帽不越界', collectVnodes(kbd, 'rect').every((rect) => rect.props.width + rect.props.x <= 320), true)
const litKeys = (kbd?.children ?? []).filter((node) => node?.props?.['data-on'] === 'true')
check('只点亮一个键', litKeys.length, 1)
check('点亮的是 f', litKeys[0]?.props?.['data-finger'], 'leftIndex')
check('点亮键用该手指的色块', litKeys[0]?.children?.[0]?.props?.style?.fill, renderTest.FINGER_COLORS.leftIndex)
check('没点亮的键不带内联色块',
  (kbd?.children ?? []).filter((node) => node?.props?.['data-on'] === 'false')
    .every((node) => node.children[0].props.style === undefined), true)
check('f / j 基准键有小点', collectVnodes(kbd, 'circle').length, 2)
check('不传 active 时不点亮任何键',
  (renderTest.fingerKeyboardNode({}).children ?? []).filter((node) => node?.props?.['data-on'] === 'true').length, 0)
check('键盘不再用位图（不内联 png）', /data:image\/png;base64,/.test(source), false)

const ctxZh = { locale: { bind: () => (key) => DICT.zh[key] ?? key, register: () => {}, subscribe: () => () => {} } }
const fingerHint = renderTest.components.FingerHint({ word: 'cancel', typed: '', ctx: ctxZh })
check('提示条画了键盘', collectVnodes(fingerHint, 'rect').length, 26)
const fingerHintText = gatherText(fingerHint)
check('提示条写明该用哪根手指', fingerHintText.includes('左中指'), true)
check('提示条写「用 …」', fingerHintText.includes('用 左中指'), true)
check('提示条色块用该手指配色',
  (function find(node) {
    if (!node || typeof node !== 'object') return undefined
    if (Array.isArray(node)) return node.map(find).find((hit) => hit !== undefined)
    if (node.type === 'function') return find(node.type(node.props ?? {}))
    if (node.props?.className === 'qat-fingerdot') return node.props.style?.background
    return find(node.children) || find(node.props?.children)
  })(fingerHint), renderTest.FINGER_COLORS.leftMiddle)
const idleHint = renderTest.components.FingerHint({ word: 'cancel', typed: 'cancel', ctx: ctxZh })
check('词打完时提示条不点亮键',
  collectVnodes(idleHint, 'rect').length === 26
  && (idleHint.children ?? []).every((node) => node?.props?.['data-on'] !== 'true'), true)

check('showFinger 默认关闭', renderTest.SETTING_DEFAULTS.showFinger, false)
check('默认渲染不显示指法图示', collectClasses(renderTest.components.Trainer({
  words: ['cancel'], variant: 'panel', showMeta: true, ctx: ctxStub,
})).includes('qat-finger'), false)
renderTest.setSetting('showFinger', true)
check('打开设置后面板显示指法图示', collectClasses(renderTest.components.Trainer({
  words: ['cancel'], variant: 'panel', showMeta: true, ctx: ctxStub,
})).includes('qat-finger'), true)
check('跟打条（非 panel）不显示指法图示', collectClasses(renderTest.components.Trainer({
  words: ['cancel'], variant: 'dock', showMeta: true, ctx: ctxStub,
})).includes('qat-finger'), false)
check('样式表里有指法键盘样式', collectCss(renderTest.components.Trainer({
  words: ['cancel'], variant: 'panel', showMeta: true, ctx: ctxStub,
})).join('').includes('.qat-fingerkbd'), true)
renderTest.setSetting('showFinger', false)

// —— 渲染冒烟：结果页（错词清单 / 下一章） ——
renderTest.saveSession({
  dictId: 'cet4',
  chapter: 0,
  words: ['cancel'],
  index: 1,
  hits: 1,
  retries: 0,
  startedAt: Date.now() - 5000,
  activeMs: 5000,
})
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
// 面板的「打完」语义抽成纯函数守门（跟打条走 stepIndex，两者不能混）
check('0/1 没打完', isRoundDone(0, 1), false)
check('1/1 打完了', isRoundDone(1, 1), true)
check('0/0 不算打完', isRoundDone(0, 0), false)
check('20/20 打完', isRoundDone(20, 20), true)
check('跟打条绕回后不算打完', isRoundDone(0, 2607), false)

// —— 结算页的两个纯函数：本轮错词清单 + 下一章（末章绕回第 1 章） ——
check('错词清单给出「词 + 打错次数」，顺序跟本轮词表一致', wordsOfRound(
  [{ word: 'govern', wrongCount: 1 }, { word: 'cancel', wrongCount: 2 }, { word: 'cancel', wrongCount: 1 }],
  ['cancel', 'govern', 'arrow'],
), [{ word: 'cancel', wrongCount: 3 }, { word: 'govern', wrongCount: 1 }])
check('错词清单接受纯字符串（早期只存词）', wordsOfRound(['cancel'], ['cancel']), [{ word: 'cancel', wrongCount: 1 }])
check('错词清单能对上词条对象（{w, zh}）', wordsOfRound(
  [{ word: 'cancel', wrongCount: 2 }],
  [{ w: 'cancel', zh: '取消' }],
), [{ word: 'cancel', wrongCount: 2 }])
check('没打错就不出清单', wordsOfRound([], ['cancel', 'govern']), [])
check('没有 mistakes 也不炸', wordsOfRound(), [])
check('词表外的错词按出现顺序补在后面', wordsOfRound(
  [{ word: 'arrow', wrongCount: 1 }, { word: 'cancel', wrongCount: 2 }],
  ['cancel'],
), [{ word: 'cancel', wrongCount: 2 }, { word: 'arrow', wrongCount: 1 }])

check('下一章：往后挪一章', nextChapterIndex(0, 3), 1)
check('下一章：末章绕回第 1 章', nextChapterIndex(2, 3), 0)
check('下一章：只有一章时原地', nextChapterIndex(0, 1), 0)
check('下一章：章数为 0 时回到第 1 章', nextChapterIndex(4, 0), 0)
check('下一章：越界也收敛到合法章', nextChapterIndex(7, 3), 2)

// —— 结算页本体：错词清单 + 重练这些词 + 下一章三条出路都在 ——
const retriedWords = []
const resultScreen = render('渲染：结算页（含错词清单）', () => renderTest.components.ResultScreen({
  t: (key, vars) => (vars && vars.n !== undefined ? `${key}:${vars.n}` : key),
  total: 20,
  elapsed: 42,
  hits: 20,
  retries: 3,
  mistakes: [{ word: 'cancel', wrongCount: 2 }, { word: 'govern', wrongCount: 1 }],
  words: ['cancel', 'govern', 'arrow'],
  onRestart: () => {},
  onRetryWrong: (words) => retriedWords.push(words),
  onNextChapter: () => {},
}))
const resultClasses = collectClasses(resultScreen)
check('错词清单每个词一条', resultClasses.filter((name) => name === 'qat-mistake').length, 2)
check('错词带打错次数', gatherText(resultScreen).includes('cancel ×2'), true)
check('错词带中文释义', resultClasses.includes('qat-mistake-zh'), true)
check('结算页保留「再来一轮」', gatherText(resultScreen).includes('again'), true)
check('结算页有「重练这些词」按钮', hasClass(resultClasses, 'qat-btn-retry'), true)
check('结算页有「下一章」按钮', hasClass(resultClasses, 'qat-btn-next'), true)
check('重练按钮把这批错词交回上层', (function () {
  const node = findByAct(resultScreen, 'retry-wrong')
  node?.props?.onClick?.()
  return retriedWords
})(), [['cancel', 'govern']])

const cleanScreen = render('渲染：结算页（全打对）', () => renderTest.components.ResultScreen({
  t: (key, vars) => (vars && vars.n !== undefined ? `${key}:${vars.n}` : key),
  total: 20,
  elapsed: 30,
  hits: 20,
  retries: 0,
  mistakes: [],
  words: ['cancel'],
  onRestart: () => {},
  onRetryWrong: () => {},
  onNextChapter: () => {},
}))
const cleanClasses = collectClasses(cleanScreen)
check('全打对：不出错词清单', hasClass(cleanClasses, 'qat-mistakes'), false)
check('全打对：不出重练按钮', hasClass(cleanClasses, 'qat-btn-retry'), false)
check('全打对：仍有下一章', hasClass(cleanClasses, 'qat-btn-next'), true)

// 结算页真的接在 Trainer 的 done 分支上：桩里 useEffect 不跑、存档恢复不会发生，
// 所以把 useState 的初值改写成「已经打完」，逼它渲染结算页
const doneReact = {
  ...reactForRender,
  useState: (value) => {
    const initial = typeof value === 'function' ? value() : value
    if (initial && typeof initial === 'object' && 'index' in initial) {
      return [{ ...initial, index: 99, hits: 20 }, () => {}]
    }
    return [initial, () => {}]
  },
}
const donePlugin = factory((name) => {
  if (name === 'react') return doneReact
  throw new Error(`unexpected require: ${name}`)
})
const finished = render('渲染：打完一章的结算页', () => donePlugin.__test.components.Trainer({
  words: ['cancel', 'govern'],
  variant: 'panel',
  showMeta: true,
  dictId: 'cet4',
  chapter: 0,
  chapterTotal: 1,
  onReview: () => {},
  onRetryWrong: () => {},
  onNextChapter: () => {},
  ctx: ctxStub,
}))
const finishedClasses = collectClasses(finished)
check('打完一章 → 进结算页', hasClass(finishedClasses, 'qat-done'), true)
check('结算页接上「下一章」按钮', hasClass(finishedClasses, 'qat-btn-next'), true)
check('末章按钮文案改成回到第 1 章', gatherText(finished).includes('resultNextChapterLast'), true)
check('没有错词就不出错词清单', hasClass(finishedClasses, 'qat-mistakes'), false)
// 样式表里得真有这几条规则，不然新按钮是裸的
check('新按钮与新词条在样式表里有规则',
  ['\\.qat-btn-next\\{', '\\.qat-btn-retry\\{', '\\.qat-mistake\\{', '\\.qat-mistake-zh\\{'].every((re) => new RegExp(re).test(source)), true)

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
check('错词本每词有掌握勾', (collectClasses(wrongCase).filter((name) => name.includes('qat-svg-check')).length), 2)

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
const statWeeks = heatmapWeeks([{ at: at(2026, 11, 24, 9), wordCount: 60, wrongCount: 0, seconds: 40 }], 12, at(2026, 11, 24, 18))
/** 统计面板的公共入参：热力 / 排行两个视图吃同一份数据，只差 defaultView */
const statsProps = {
  t: (key, vars) => (vars && vars.n !== undefined ? `${key}:${vars.n}` : key),
  days: statDays,
  weeks: statWeeks,
  letters: [{ letter: 'e', count: 5 }, { letter: 'a', count: 3 }],
  summary: summarize([]),
  onClose: () => {},
}
/** 按 class 抓「节点本身」：collectClasses 只回收 class 名，数子节点还得有 node */
function findNodesByClass(node, className, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    node.forEach((item) => findNodesByClass(item, className, out))
    return out
  }
  if (typeof node.type === 'function') {
    findNodesByClass(node.type(node.props ?? {}), className, out)
    return out
  }
  if (String(node.props?.className ?? '').split(/\s+/).includes(className)) out.push(node)
  findNodesByClass(node.children, className, out)
  findNodesByClass(node.props?.children, className, out)
  return out
}
/** 按标签名抓节点（svg / rect / title 这些没有 class 的要看标签） */
function findNodesByTag(node, tag, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    node.forEach((item) => findNodesByTag(item, tag, out))
    return out
  }
  if (typeof node.type === 'function') {
    findNodesByTag(node.type(node.props ?? {}), tag, out)
    return out
  }
  if (node.type === tag) out.push(node)
  findNodesByTag(node.children, tag, out)
  findNodesByTag(node.props?.children, tag, out)
  return out
}
const statsCase = render('渲染：统计', () => renderTest.components.StatsPanel(statsProps))
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

// —— 键盘热力图：一个 svg 里 26 个 rect（形状来自 keyLayout，不用 26 个 div 拼） ——
const kbdWrap = findNodesByClass(statsCase, 'qat-kbd')
check('键盘热力区只有一个容器', kbdWrap.length, 1)
const kbdSvg = findNodesByTag(kbdWrap[0], 'svg')
check('键盘区里正好一个 svg', kbdSvg.length, 1)
const kbdRects = findNodesByTag(kbdSvg[0], 'rect')
check('一个 svg 里 26 个键帽 rect', kbdRects.length, 26)
check('键帽坐标与键宽来自 keyLayout', kbdRects[0].props.x === 0 && kbdRects[0].props.width === KEYBOARD_GEOM.w, true)
const kbdTitles = findNodesByTag(kbdSvg[0], 'title').map((node) => node.children[0])
check('每个键都有悬停 title', kbdTitles.length, 26)
check('悬停文案是「键 ×次数」', kbdTitles.find((text) => text.startsWith('e ')), 'e ×5')
check('键上小字写次数（0 次不写）',
  findNodesByTag(kbdSvg[0], 'text').filter((node) => String(node.props.className).includes('qat-keynum')).length, 2)
check('图例说明颜色越深打错越多', gatherText(statsCase).includes('kbdLegend'), true)
check('指法分区写到 data-finger 上',
  findNodesByClass(statsCase, 'qat-key').every((node) => !!node.props['data-finger']), true)
check('视图切换按钮两个', findNodesByClass(statsCase, 'qat-kbdtab').length, 2)
check('默认停在键盘视图', findNodesByClass(statsCase, 'qat-kbdwrap')[0].props['data-view'], 'heat')
const kbdCss = collectCss(statsCase).join('\n')
check('CSS 有 SVG 键盘样式', kbdCss.includes('.qat-kbdsvg{'), true)
check('CSS 按 level 递进加深', [1, 2, 3, 4].every((n) => kbdCss.includes(`.qat-key[data-level="${n}"] .qat-keycap`)), true)
check('CSS 给每根手指一条淡染规则',
  FINGER_IDS.every((id) => kbdCss.includes(`.qat-key[data-finger="${id}"]`)), true)
check('键盘样式不写死黑白', /#000|#fff/.test(kbdCss.slice(kbdCss.indexOf('.qat-kbdwrap{'), kbdCss.indexOf('.qat-heat{'))), false)

// —— 视图切换：排行视图（defaultView 只是本地 state 的初值，桩里 useState 不回写） ——
const statsBarsCase = render('渲染：统计 · 键盘排行', () => renderTest.components.StatsPanel({ ...statsProps, defaultView: 'bars' }))
check('排行视图不再画键盘 svg', findNodesByTag(findNodesByClass(statsBarsCase, 'qat-kbd'), 'svg').length, 0)
check('排行视图换成 .qat-keybars', findNodesByClass(statsBarsCase, 'qat-keybars').length, 1)
const kbdBarNodes = findNodesByClass(statsBarsCase, 'qat-keybar')
check('排行条数 ≤ 10 且非空', kbdBarNodes.length > 0 && kbdBarNodes.length <= 10, true)
check('排行按次数从多到少', kbdBarNodes.map((node) => node.props.title).join(','), 'e ×5,a ×3')
check('视图标记切到 bars', findNodesByClass(statsBarsCase, 'qat-kbdwrap')[0].props['data-view'], 'bars')

const statsNoLetters = render('渲染：统计 · 没有易错字母', () => renderTest.components.StatsPanel({ ...statsProps, letters: [] }))
check('没有 letters 不渲染键盘区',
  findNodesByClass(statsNoLetters, 'qat-kbd').length + findNodesByClass(statsNoLetters, 'qat-keybars').length, 0)
const emptyBars = render('渲染：排行空态', () => renderTest.components.KeyboardBars({ letters: [], t: statsProps.t }))
check('空排行挂 data-empty', findNodesByClass(emptyBars, 'qat-keybars')[0].props['data-empty'], 'true')
check('空排行给文案', gatherText(emptyBars).includes('kbdBarsEmpty'), true)

// —— 词表抽屉（G3）：本章 20 词、状态优先级、点一行跳过去 ——
/** 按 className 抓节点 props（词表行要看 data-* 属性） */
function nodesByClass(node, className, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (typeof node.type === 'function') {
    nodesByClass(node.type(node.props ?? {}), className, out)
    return out
  }
  if (node.props?.className === className) out.push(node.props)
  for (const child of node.children ?? []) nodesByClass(child, className, out)
  if (node.props?.children !== undefined) nodesByClass(node.props.children, className, out)
  return out
}

const wlWords = ['cancel', 'govern', 'alpha']
const wlState = (extra) => (renderTest.wordListRows({
  words: wlWords, index: 0, records: [], mastered: [], ...extra,
})[Number(extra?.at ?? 0)] || {}).state

check('词表一次最多 20 行', renderTest.WORDLIST_LIMIT, 20)
check('词表状态优先级固定', renderTest.WORDLIST_STATES.join('>'), 'current>mastered>wrong>done>idle')
check('空词表 → 没有行', renderTest.wordListRows({ words: [] }), [])
check('词表行结构固定', Object.keys(renderTest.wordListRows({ words: ['cancel'] })[0]), ['index', 'word', 'ipa', 'zh', 'state'])
check('没碰过的词是 idle', wlState({ words: wlWords, index: 1 }), 'idle')
check('当前词压过 mastered 与 wrong', wlState({
  words: wlWords,
  index: 0,
  dictId: 'cet4',
  records: [{ word: 'cancel', dictId: 'cet4', wrongCount: 3 }],
  mastered: ['cet4:cancel'],
}), 'current')
check('mastered 覆盖 wrong', wlState({
  words: wlWords,
  at: 1,
  index: 2,
  dictId: 'cet4',
  records: [{ word: 'govern', dictId: 'cet4', wrongCount: 2 }],
  mastered: ['cet4:govern'],
}), 'mastered')
check('打错过是 wrong', wlState({
  words: wlWords,
  at: 1,
  index: 2,
  dictId: 'cet4',
  records: [{ word: 'govern', dictId: 'cet4', wrongCount: 1 }],
}), 'wrong')
check('打过（没错过）是 done', wlState({
  words: wlWords,
  index: 2,
  dictId: 'cet4',
  records: [{ word: 'cancel', dictId: 'cet4', wrongCount: 0 }],
}), 'done')
check('别的词库的记录不算本章', wlState({
  words: wlWords,
  index: 2,
  dictId: 'cet4',
  records: [{ word: 'cancel', dictId: 'cet6', wrongCount: 2 }],
}), 'idle')
check('词条对象自带音标中文就照抄', (() => {
  const [row] = renderTest.wordListRows({ words: [{ w: 'cancel', ipa: '/ˈkænsl/', zh: '取消' }] })
  return [row.ipa, row.zh]
})(), ['/ˈkænsl/', '取消'])
check('本章 30 个词只出 20 行', renderTest.wordListRows({
  words: Array.from({ length: 30 }, (_, i) => `w${i + 1}`),
}).length, 20)

const wlDrawer = render('渲染：词表抽屉', () => renderTest.components.WordListPanel({
  t: (key, vars) => (vars && vars.n !== undefined ? `${key}:${vars.n}` : key),
  rows: renderTest.wordListRows({
    words: Array.from({ length: 30 }, (_, i) => `w${i + 1}`),
    index: 2,
    records: [{ word: 'w1', dictId: '', wrongCount: 1 }],
  }),
  hint: 'wordListHint',
  onPick: () => {},
  onClose: () => {},
}))
check('抽屉最多画出 20 行', nodesByClass(wlDrawer, 'qat-wordlist-row').length, 20)
check('抽屉序号从 1 开始', nodesByClass(wlDrawer, 'qat-wordlist-row').map((props) => props['data-no']).slice(0, 3), ['1', '2', '3'])
check('抽屉当前词高亮', nodesByClass(wlDrawer, 'qat-wordlist-row').map((props) => props['data-state']), [
  'wrong', 'idle', 'current',
  ...Array.from({ length: 17 }, () => 'idle'),
])
check('抽屉显示状态名', gatherText(wlDrawer).includes('wordStateCurrent'), true)
check('抽屉标题带词数', gatherText(wlDrawer).includes('wordListTitle:20'), true)

const wlEmpty = render('渲染：空词表抽屉', () => renderTest.components.WordListPanel({
  t: (key, vars) => (vars && vars.n !== undefined ? `${key}:${vars.n}` : key),
  rows: [], onPick: () => {}, onClose: () => {},
}))
check('空词表给提示', gatherText(wlEmpty).includes('wordListEmpty'), true)
check('空词表不画行', nodesByClass(wlEmpty, 'qat-wordlist-row').length, 0)
check('空词表标题写 0 个', gatherText(wlEmpty).includes('wordListTitle:0'), true)

// —— 面板头部多了词表入口（同一排图标按钮） ——
check('面板头部有词表按钮', (function walk(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) { node.forEach((item) => walk(item, out)); return out }
  if (node.props?.['data-act'] === 'wordlist') out.push(node.props.className)
  walk(node.children, out); walk(node.props?.children, out)
  return out
})(panel), ['qat-iconbtn'])
check('词表按钮用 list 图标', collectClasses(panel).filter((name) => name.includes('qat-svg-list')).length, 1)

// —— G4：打错 N 次给提示（对齐上游 TipAlert 的逐档揭示） ——
const tip = (wrongCount, word, typed) => tipState({ wrongCount, word, typed })
check('阈值常量是 3/4/5', TIP_THRESHOLDS, [3, 4, 5])
check('遮罩字符是下划线', TIP_MASK, '_')
check('打错 0 次不提示', tip(0, 'cancel'), { level: 0, reveal: 0, prefix: '', text: '', key: '' })
check('打错 1 次不提示', tip(1, 'cancel').level, 0)
check('打错 2 次不提示', tip(2, 'cancel').level, 0)
check('第 3 次给首字母', tip(3, 'cancel'), { level: 1, reveal: 1, prefix: 'c', text: 'c_____', key: 'tipFirstLetter' })
check('第 4 次给前两个字母', tip(4, 'cancel'), { level: 2, reveal: 2, prefix: 'ca', text: 'ca____', key: 'tipTwoLetters' })
check('第 5 次起给到只剩最后一个字母', tip(5, 'cancel'), { level: 3, reveal: 5, prefix: 'cance', text: 'cance_', key: 'tipReveal' })
check('第 5 次以后档位稳定', [6, 7, 9, 20].map((n) => tip(n, 'cancel').level), [3, 3, 3, 3])
check('第 5 次以后揭示内容稳定', [6, 7, 9, 20].map((n) => tip(n, 'cancel').text), ['cance_', 'cance_', 'cance_', 'cance_'])
check('档位到文案 key 的映射', [0, 1, 2, 3, 7].map(tipKey), ['', 'tipFirstLetter', 'tipTwoLetters', 'tipReveal', 'tipReveal'])
check('打错一次计数加一', nextWrongCount(2, 'miss'), 3)
check('打对一次计数归零', nextWrongCount(4, 'hit'), 0)
check('其他结果不改计数', nextWrongCount(4, 'ok'), 4)
check('打对归零后提示也归零', (() => {
  let n = 0
  n = nextWrongCount(n, 'miss')
  n = nextWrongCount(n, 'miss')
  n = nextWrongCount(n, 'hit')
  return [n, tip(n, 'cancel').level]
})(), [0, 0])
check('归零后重新打错 3 次重新给首字母', (() => {
  let n = 3
  n = nextWrongCount(n, 'hit')
  for (let i = 0; i < 3; i += 1) n = nextWrongCount(n, 'miss')
  return [n, tip(n, 'cancel').text]
})(), [3, 'c_____'])
check('已打对的前缀算进提示', tip(3, 'cancel', 'ca').text, 'ca____')
check('打错的前缀不冒充揭示', tip(3, 'cancel', 'cx').reveal, 1)
check('阈值可配', tipState({ wrongCount: 2, word: 'cancel', thresholds: [1, 2, 3] }).level, 2)
check('只给一档阈值也不越界', tipState({ wrongCount: 5, word: 'go', thresholds: [3] }).text, 'g_')
const tipWords = ['a', 'go', 'cancel', 'govern', 'according to', 'x'.repeat(20)]
check('reveal 不超过词长', tipWords.every((word) => [0, 1, 2, 3, 4, 5, 9, 30].every((n) => {
  const state = tip(n, word)
  if (state.reveal < 0 || state.reveal > word.length) return false
  return state.level === 0 ? state.text === '' : state.text.length === word.length
})), true)
check('永远不会显示整词', tipWords.every((word) => [3, 4, 5, 9, 30].every((n) => {
  const state = tip(n, word)
  if (!state.text) return true
  return state.text !== word && (word.length < 2 || state.text.includes(TIP_MASK))
})), true)
check('1 字母词不越界', tip(9, 'a'), { level: 3, reveal: 0, prefix: '', text: '_', key: 'tipReveal' })
check('2 字母词第 3 次只给首字母', tip(3, 'go').text, 'g_')
check('2 字母词最后一档也不整词', tip(9, 'go').text, 'g_')
check('带空格的词长度不变', tip(5, 'according to').text.length, 'according to'.length)
check('空词不崩', tipState({ wrongCount: 5, word: '' }), { level: 0, reveal: 0, prefix: '', text: '', key: '' })
check('没传参数不崩', tipState(), { level: 0, reveal: 0, prefix: '', text: '', key: '' })
check('提示音有 hit/hint/miss 三档', Object.keys(CLICK_TONES).sort(), ['hint', 'hit', 'miss'])
check('提示音比打对音更轻', CLICK_TONES.hint.peak < CLICK_TONES.hit.peak, true)

// —— 提示行 UI：小字次要色、带 data-tip-level、不遮单词 ——
const tipUi = render('渲染：打错提示行', () => renderTest.components.TipLine({
  tip: tip(3, 'cancel'),
  t: (key, vars) => `${key}:${vars?.pattern ?? ''}`,
}))
check('提示行带 data-tip-level', (function find(node) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = find(item)
      if (hit !== null) return hit
    }
    return null
  }
  if (typeof node.type === 'function') return find(node.type(node.props ?? {}))
  const props = node.props || {}
  if (props['data-tip-level'] !== undefined) return props['data-tip-level']
  const inProps = find(props.children)
  return inProps !== null ? inProps : find(node.children)
})(tipUi), '1')
check('提示行是次要色小字', collectClasses(tipUi).includes('qat-tip'), true)
check('提示行文案带遮罩', gatherText(tipUi).includes('c_____'), true)
check('提示行不显示整词', gatherText(tipUi).includes('cancel'), false)
check('高一级档位带自己的 data-tip-level', (function find(node) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = find(item)
      if (hit !== null) return hit
    }
    return null
  }
  if (typeof node.type === 'function') return find(node.type(node.props ?? {}))
  const props = node.props || {}
  if (props['data-tip-level'] !== undefined) return props['data-tip-level']
  const inProps = find(props.children)
  return inProps !== null ? inProps : find(node.children)
})(renderTest.components.TipLine({ tip: tip(5, 'cancel'), t: (key) => key })), '3')
check('不到档位时整行不渲染', renderTest.components.TipLine({ tip: tip(2, 'cancel'), t: (key) => key }), null)
check('样式里有打错提示类', collectCss(cardCase).join('').includes('.qat-tip'), true)
check('样式里有档位选择器', collectCss(cardCase).join('').includes('data-tip-level'), true)
check('样式里跟打条提示不抢布局', /\.qat-bar-tip\{[^}]*pointer-events:none/.test(source), true)
check('样式里提示行不接收鼠标', /\.qat-tip\{[^}]*pointer-events:none/.test(source), true)
check('两份字典都有提示文案', ['tipFirstLetter', 'tipTwoLetters', 'tipReveal'].every((key) => DICT.zh[key] && DICT.en[key]), true)
check('三种提示文案都带 pattern 占位', ['tipFirstLetter', 'tipTwoLetters', 'tipReveal'].every((key) => DICT.zh[key].includes('{pattern}') && DICT.en[key].includes('{pattern}')), true)

// —— 接着上次练：打过的那章不要重打 ——
check('没存档 → 第 0 章', resumeChapterSmart({}, null, 'cet4', 131, false), 0)
check('存档章没打完 → 原地接着',
  resumeChapterSmart({}, { dictId: 'cet4', chapter: 5 }, 'cet4', 131, false), 5)
check('存档章已打完 → 跳到下一章',
  resumeChapterSmart({ 5: { done: true } }, { dictId: 'cet4', chapter: 5 }, 'cet4', 131, false), 6)
check('后面几章也打完 → 跳到第一个没打的',
  resumeChapterSmart({ 5: { done: true }, 6: { done: true }, 7: { done: true } },
    { dictId: 'cet4', chapter: 5 }, 'cet4', 131, false), 8)
check('末章打完 → 绕回第 0 章',
  resumeChapterSmart({ 130: { done: true } }, { dictId: 'cet4', chapter: 130 }, 'cet4', 131, false), 0)
check('章内还有中途存档 → 不跳章',
  resumeChapterSmart({ 5: { done: true } }, { dictId: 'cet4', chapter: 5 }, 'cet4', 131, true), 5)
check('整本都打完 → 留在原章',
  resumeChapterSmart({ 0: { done: true }, 1: { done: true } }, { dictId: 'cet4', chapter: 0 }, 'cet4', 2, false), 0)
check('不是同一个词库 → 第 0 章',
  resumeChapterSmart({}, { dictId: 'cet6', chapter: 9 }, 'cet4', 131, false), 0)
check('词库还没算好 → 第 0 章', resumeChapterSmart({}, { dictId: 'cet4', chapter: 3 }, 'cet4', 0, false), 0)

// —— 面板工具行：只剩「重开」，不再有「自动打」 ——
{
  const bar = render('渲染：面板工具行', () => renderTest.components.Trainer({
    words: ['alpha', 'beta'], variant: 'panel', showMeta: true, ctx: ctxStub,
  }))
  const classes = collectClasses(bar)
  const rowBtns = classes.filter((item) => String(item).split(/\s+/).includes('qat-btn'))
  // ctxStub 的 t 原样返回 key，所以文案断言看 key（Styles 的 CSS 里也有 "auto"，不能整串搜）
  // 上一词 / 跳过 / 循环 / 暂停 四个控制按钮 + 工具行的「重开」，就这五个
  check('卡片按钮数量 = 四个控制 + 重开', rowBtns.length, 5)
  check('工具行里没有带 data-active 的自动打开关', (function walk(node) {
    if (!node || typeof node !== 'object') return false
    if (Array.isArray(node)) return node.some((item) => walk(item))
    const cls = String(node.props?.className ?? '')
    if (cls.split(/\s+/).includes('qat-btn') && node.props?.['data-active'] !== undefined) return true
    return walk(node.children) || walk(node.props?.children)
  })(bar), false)
  check('两份字典都删掉了 auto / autoStop 死键', ['auto', 'autoStop'].every((key) => !DICT.zh[key] && !DICT.en[key]), true)
  check('代码里没有残留的 auto 开关状态', /setAuto\(/.test(source), false)
  check('也没有残留的自动打定时器', /自动打：/.test(source), false)
}

// —— 音量 / 倍速（N14）：只调档与增益，不加音频文件、不引依赖 ——
check('倍速档位表', renderTest.VOICE_RATES.join(','), '0.6,0.8,1,1.2,1.5')
check('合法倍速原样返回', [0.6, 1, 1.5].map(renderTest.clampVoiceRate), [0.6, 1, 1.5])
check('倍速字符串数字也认', [renderTest.clampVoiceRate('1.2'), renderTest.clampVoiceRate('0.8')], [1.2, 0.8])
check('倍速越界/非法回落默认 1', [0, 9, 'x', null].map(renderTest.clampVoiceRate), [1, 1, 1, 1])
check('音量档位表', renderTest.CLICK_VOLUMES.join(','), '0,40,60,80,100')
check('合法音量原样返回', [0, 100].map(renderTest.clampClickVolume), [0, 100])
check('音量越界/非数字回落默认 100', [-5, 999, 'abc'].map(renderTest.clampClickVolume), [100, 100, 100])
check('音量吸附最近一档', [55, 98, 12].map(renderTest.clampClickVolume), [60, 100, 0])
check('发音倍速接到 audio.playbackRate', (function () {
  let got = null
  sandbox.window.Audio = function () {
    return {
      play: () => Promise.resolve(), pause() {}, volume: 1,
      get playbackRate() { return got },
      set playbackRate(value) { got = value },
    }
  }
  renderTest.setSetting('voiceRate', 1.5)
  renderTest.speak('cancel')
  renderTest.setSetting('voiceRate', 1)
  delete sandbox.window.Audio
  return got
})(), 1.5)
check('按键音音量接到合成音增益', (function () {
  let peak = null
  sandbox.window.AudioContext = function () {
    return {
      state: 'running',
      currentTime: 0,
      destination: {},
      createOscillator: () => ({ frequency: {}, connect() {}, start() {}, stop() {} }),
      createGain: () => ({
        gain: { setValueAtTime: (value) => { peak = value }, exponentialRampToValueAtTime() {} },
        connect() {},
      }),
    }
  }
  renderTest.setSetting('clickVolume', 0)
  const quiet = (renderTest.playClick('hit'), peak)
  const full = renderTest.CLICK_TONES.hit.peak
  renderTest.setSetting('clickVolume', 100)
  const loud = (renderTest.playClick('hit'), peak)
  delete sandbox.window.AudioContext
  return [quiet, loud === full]
})(), [0, true])

// —— 长句排版：雅思整句要缩字号 + 断行，不能横着挤爆 ——
const LONG = "I'm taking the IELTS test because I want to study overseas."
check('wrapWord：空串 → 没有行', renderTest.wrapWord('', 10), [])
check('wrapWord：一个短词就一行', renderTest.wrapWord('cancel', 10), ['cancel'])
check('wrapWord：按空格断，不切词', renderTest.wrapWord('according to the rule', 12), ['according ', 'to the rule'])
check('wrapWord：断行拼回去等于原文', renderTest.wrapWord(LONG, 20).join(''), LONG)
check('wrapWord：超长无空格串按字符硬断', renderTest.wrapWord('abcdefghij', 4), ['abcd', 'efgh', 'ij'])
check('wrapWord：多空格不丢字', renderTest.wrapWord('a  b', 2).join(''), 'a  b')
check('wrapWord：中英混排也能断', renderTest.wrapWord('雅思 IELTS test', 6).join(''), '雅思 IELTS test')
check('wrapWord：每行不超过上限', renderTest.wrapWord(LONG, 18).every((line) => line.length <= 18), true)
check('字号阶梯从 52 起', renderTest.FIT_SIZES[0], 52)
check('字号阶梯单调不增', renderTest.FIT_SIZES.every((size, i) => i === 0 || size <= renderTest.FIT_SIZES[i - 1]), true)
check('等比系数在 0.5–0.8 之间', renderTest.CHAR_RATIO > 0.5 && renderTest.CHAR_RATIO < 0.8, true)
check('短词用最大字号、一行', [renderTest.fitWordStyle('cancel', 600).size, renderTest.fitWordStyle('cancel', 600).lines.length], [52, 1])
check('单行模式下中等长度会先缩字号', renderTest.fitWordStyle('extraordinary', 300, { maxLines: 1 }).size < 52, true)
check('允许三行时不再硬缩到很小', renderTest.fitWordStyle('extraordinary', 300, { maxLines: 3 }).size, 52)
check('雅思长句在条宽里排成三行内', renderTest.fitWordStyle(LONG, 520, { maxLines: 3 }).lines.length <= 3, true)
check('条越窄字号越小', renderTest.fitWordStyle(LONG, 320).size <= renderTest.fitWordStyle(LONG, 760).size, true)
check('fitWordStyle 的行拼回去等于原文', renderTest.fitWordStyle(LONG, 400).lines.join(''), LONG)
check('fitWordStyle 不截断任何字符', renderTest.fitWordStyle(LONG, 200, { maxLines: 2 }).lines.join('').length, LONG.length)
check('极端窄条也不丢字', renderTest.fitWordStyle(LONG, 10, { maxLines: 2 }).lines.join(''), LONG)
check('空串不炸', renderTest.fitWordStyle('', 400).lines, [])
check('没传宽度也有字号', renderTest.fitWordStyle('cancel').size > 0, true)

// —— 字号档（N13）：auto 等于不改，三档乘系数且单调，行数上限跟着档位放宽 ——
const BASE_FIT = renderTest.fitWordStyle(LONG, 520, { maxLines: 3 })
check('wordScale=auto 等于不改自动排版',
  renderTest.wordStyleFor(LONG, 520, { maxLines: 3, scale: 'auto' }), BASE_FIT)
check('不传 scale 也等于 auto', renderTest.wordStyleFor(LONG, 520, { maxLines: 3 }), BASE_FIT)
check('medium 系数为 1，与 auto 同档',
  renderTest.wordStyleFor(LONG, 520, { maxLines: 3, scale: 'medium' }).size, BASE_FIT.size)
const sizeAt = (scale) => renderTest.wordStyleFor(LONG, 520, { maxLines: 3, scale }).size
check('small < medium < large', sizeAt('small') < sizeAt('medium') && sizeAt('medium') < sizeAt('large'), true)
check('small 比自动小、large 比自动大', [sizeAt('small') < BASE_FIT.size, sizeAt('large') > BASE_FIT.size], [true, true])
check('large 放宽到 4 行', renderTest.wordStyleFor(LONG, 520, { maxLines: 3, scale: 'large' }).lines.length, 4)
check('small 收到 2 行', renderTest.wordStyleFor(LONG, 520, { maxLines: 3, scale: 'small' }).lines.length, 2)
check('缩放档也不丢字', ['small', 'medium', 'large']
  .every((scale) => renderTest.wordStyleFor(LONG, 320, { maxLines: 3, scale }).lines.join('') === LONG), true)
check('非法 scale 回落 auto', renderTest.clampWordScale('huge'), 'auto')
check('scale 脏值也回落 auto', [renderTest.clampWordScale(null), renderTest.clampWordScale(42)], ['auto', 'auto'])
check('合法 scale 原样返回、大小写不敏感',
  [renderTest.clampWordScale('large'), renderTest.clampWordScale(' SMALL ')], ['large', 'small'])
check('字号档顺序表', renderTest.WORD_SCALES.join(','), 'auto,small,medium,large')
check('三档系数', [renderTest.WORD_SCALE_FACTOR.small, renderTest.WORD_SCALE_FACTOR.medium, renderTest.WORD_SCALE_FACTOR.large],
  [0.85, 1, 1.25])
check('阶梯缩放：auto 原样返回', renderTest.scaleWordSizes(renderTest.FIT_SIZES, 'auto'), renderTest.FIT_SIZES)
check('阶梯缩放：large 每档都变大',
  renderTest.scaleWordSizes(renderTest.FIT_SIZES, 'large').every((size, i) => size > renderTest.FIT_SIZES[i]), true)
check('阶梯缩放：small 每档都变小',
  renderTest.scaleWordSizes(renderTest.FIT_SIZES, 'small').every((size, i) => size < renderTest.FIT_SIZES[i]), true)
{
  const lines = renderTest.wordLines(LONG, 30)
  check('wordLines 索引跨行连续', lines.map((line) => line.start),
    lines.reduce((acc, line, i) => (i === 0 ? [0] : [...acc, acc[i - 1] + lines[i - 1].chars.length]), []))
  check('wordLines 字母总数 = 句子长度', lines.reduce((acc, line) => acc + line.chars.length, 0), LONG.length)
  check('不给 perLine 就一行', renderTest.wordLines('cancel').length, 1)
}
{
  const wrapped = render('渲染：卡片上的长句', () => renderTest.components.Trainer({
    words: [LONG], variant: 'panel', showMeta: true, ctx: ctxStub,
  }))
  const classes = collectClasses(wrapped)
  check('长句渲染出多个 .qat-word-line', classes.filter((item) => String(item).split(/\s+/).includes('qat-word-line')).length >= 2, true)
  const letters = collectClasses(wrapped).filter((item) => String(item).split(/\s+/).includes('qat-letter')).length
  check('字母总数等于句子长度', letters, LONG.length)

  // —— 字号档真的落到 inline style 上：面板与跟打条都跟着档位变 ——
  const fontSizeOf = (variant) => {
    let size = null
    const walk = (node) => {
      if (!node || typeof node !== 'object' || size !== null) return
      if (Array.isArray(node)) return node.forEach(walk)
      if (typeof node.type === 'function') return walk(node.type(node.props ?? {}))
      if (String(node.props?.className ?? '').split(/\s+/).includes('qat-word')) size = node.props?.style?.fontSize
      walk(node.children)
      walk(node.props?.children)
    }
    walk(renderTest.components.Trainer({ words: [LONG], variant, showMeta: true, ctx: ctxStub }))
    return parseFloat(size)
  }
  const pxAt = (scale, variant) => {
    renderTest.setSetting('wordScale', scale)
    const px = fontSizeOf(variant)
    return px
  }
  const panelSmall = pxAt('small', 'panel')
  const panelMedium = pxAt('medium', 'panel')
  const panelLarge = pxAt('large', 'panel')
  check('面板 small < medium < large 字号', [panelSmall < panelMedium, panelMedium < panelLarge], [true, true])
  const barMedium = pxAt('medium', 'dock')
  const barLarge = pxAt('large', 'dock')
  check('跟打条 large 字号比 medium 大', barLarge > barMedium, true)
  renderTest.setSetting('wordScale', 'auto')
  check('auto 档回到自动排版字号', fontSizeOf('panel'), renderTest.fitWordStyle(LONG, 700, { maxLines: 3 }).size)
  check('样式里有多行排版的类', /\.qat-word\[data-wrap="true"\]/.test(source), true)
  check('样式里有 .qat-word-line', /\.qat-word-line\{/.test(source), true)
}

// —— 进度存档：Esc 关掉跟打条再打开，接着打上次那个词 ——
check('卡片里没有游离的 wordsRef 引用', /const prev = stepIndex\(stateRef\.current\.index, wordsRef/.test(source), false)

const barStore = (() => {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  }
})()
globalThis.window = { ...(globalThis.window ?? {}), localStorage: barStore }
check('存档键名固定', [renderTest.BAR_KEY, renderTest.CHAPTER_KEY], ['qwerty-autotype:bar-progress', 'qwerty-autotype:last-chapter'])
check('没存过时读不到存档', renderTest.readBarProgress(), null)
renderTest.writeBarProgress('cet4', 7)
check('存档写进去能读回来', [renderTest.readBarProgress().dictId, renderTest.readBarProgress().index], ['cet4', 7])
check('换词库的旧存档不认', renderTest.resumeIndex(renderTest.readBarProgress(), 'cet6', 20), 0)
check('同一词库接着上次那个词', renderTest.resumeIndex(renderTest.readBarProgress(), 'cet4', 20), 7)
check('词表变短时夹回第一个', renderTest.resumeIndex({ dictId: 'cet4', index: 7 }, 'cet4', 5), 0)
check('空词表不会给出非法索引', renderTest.resumeIndex({ dictId: 'cet4', index: 3 }, 'cet4', 0), 0)
check('负数索引归零', renderTest.resumeIndex({ dictId: 'cet4', index: -3 }, 'cet4', 20), 0)
renderTest.writeChapterPos('cet4', 5)
check('章节存档可读回', renderTest.resumeChapter(renderTest.readChapterPos(), 'cet4', 131), 5)
check('章节存档换库不认', renderTest.resumeChapter(renderTest.readChapterPos(), 'cet6', 131), 0)
check('章号越界夹到最后一章', renderTest.resumeChapter({ dictId: 'cet4', chapter: 999 }, 'cet4', 131), 130)

// 首帧就接上次那个词：存档 index=2，条上第一眼应该是词表第 3 个词
const barWords = renderTest.toWordList(renderTest.wordsSync('cet4'))
renderTest.writeBarProgress('cet4', 2)
renderTest.setOpen(true)
const resumedBar = render('渲染：跟打条接着上次那个词',
  () => renderTest.components.ComposerTrainer({ useInput: () => '', inputActions: {}, ctx: ctxStub }))
const resumedWord = (function pick(node) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = pick(item)
      if (hit) return hit
    }
    return null
  }
  if (typeof node.type === 'function') return pick(node.type(node.props ?? {}))
  if (node.props?.className === 'qat-word') {
    return (node.children ?? []).map((child) => (child?.children?.[0] ?? '')).join('')
  }
  return pick(node.children) || pick(node.props?.children)
})(resumedBar)
check('条上首帧就是存档那个词', resumedWord, barWords[2])
renderTest.setOpen(false)
renderTest.writeBarProgress('cet4', 0)

// —— 长句的 CSS 不能和 fitWordStyle 抢字号（D1 与 D2 合并后的回归） ——
{
  const rule = (source.match(/\.qat-word\[data-long="true"\][^{]*\{([^}]*)\}/g) ?? []).join(' ')
  check('长句规则里不再写死 font-size', /font-size/.test(rule), false)
  check('长句规则里不再 flex-wrap（会把多行折成多列）', /flex-wrap/.test(rule), false)
  check('长句规则仍收行距/字距', /line-height/.test(rule) && /letter-spacing/.test(rule), true)
  const longWord177 = `${'x'.repeat(176)}.`   // 上游最长的一条 name 就是 177 字符（雅思口语句子）
  const longCase = renderTest.components.Trainer({ words: [longWord177], variant: 'panel', showMeta: true, ctx: ctxStub })
  const longNode = (function find(node) {
    if (!node || typeof node !== 'object') return null
    if (Array.isArray(node)) return node.map(find).find(Boolean) ?? null
    if (typeof node.type === 'function') return find(node.type(node.props ?? {}))
    const cls = String(node.props?.className ?? '')
    if (cls.split(/\s+/).includes('qat-word')) return node
    return find(node.children) || find(node.props?.children)
  })(longCase)
  check('177 字符长句同时挂 data-long 与 data-wrap', [longNode?.props?.['data-long'], longNode?.props?.['data-wrap']], ['true', 'true'])
  check('字号走 inline style（CSS 抢不过它）', /px$/.test(String(longNode?.props?.style?.fontSize ?? '')), true)
}

// —— 样式表只进 head 一份 ——
const fakeDoc = (() => {
  const nodes = []
  const head = { appendChild: (node) => { nodes.push(node); node.parent = head } }
  const doc = {
    head,
    documentElement: head,
    nodes,
    createElement: () => ({ setAttribute() {}, textContent: '', parent: null }),
    querySelector: (sel) => nodes.find((node) => sel.includes('data-qwerty-autotype')) ?? null,
  }
  return doc
})()
check('样式表注入一次', renderTest.ensureStyles(fakeDoc), true)
check('head 里就一份 style', fakeDoc.nodes.length, 1)
check('重复注入不再加', renderTest.ensureStyles(fakeDoc), false)
check('head 里还是一份', fakeDoc.nodes.length, 1)
check('注入的 CSS 就是导出那份', fakeDoc.nodes[0].textContent.length, renderTest.CSS.length)
check('Styles 组件不再渲染 style 节点', renderTest.Styles(), null)
check('lookup 索引与缓存可清空', typeof renderTest.clearLookupCache, 'function')

// —— lookup：WeakMap 索引 + 结果缓存 ——
const indexSample = [{ w: 'dup', zh: '第一条', ipa: '/1/' }, { w: 'dup', zh: '第二条', ipa: '/2/' }]
check('索引同词只留第一条', renderTest.wordIndex(indexSample).get('dup').zh, '第一条')
check('同一数组重复建索引走缓存', renderTest.wordIndex(indexSample), renderTest.wordIndex(indexSample))
check('非数组给 null', renderTest.wordIndex('nope'), null)
const builtinFirst = renderTest.wordsSync('cet4')[0].w
check('内置词库查得到', Boolean(renderTest.lookup(builtinFirst)?.zh), true)
check('同一个词第二次拿到同一对象（命中缓存）',
  renderTest.lookup(builtinFirst), renderTest.lookup(builtinFirst))
renderTest.clearLookupCache()
check('清缓存后重新查还是同样结果', renderTest.lookup(builtinFirst)?.zh, renderTest.lookupOnce(builtinFirst)?.zh)
check('查不到的词给 undefined', renderTest.lookup('zzz-not-a-word-zzz'), undefined)
check('空词给 undefined', renderTest.lookup(''), undefined)

// —— 自定义词表 / 目录缓存：写进去立刻能读到，别读到旧 JSON ——
renderTest.writeCustomDicts({ 测试词表: [{ name: 'alpha', trans: ['甲'] }, { name: 'beta', trans: ['乙'] }] })
check('写完立刻读到新词表', Object.keys(renderTest.readCustomDicts()), ['测试词表'])
check('自定义词表进目录', renderTest.catalog().some((item) => item.id.includes('测试词表')), true)
const beforeSame = renderTest.catalog()
check('目录第二次走缓存（同一数组）', renderTest.catalog(), beforeSame)
renderTest.writeCustomDicts({ 测试词表: [{ name: 'alpha', trans: ['甲'] }] })
check('改词表后目录换新数组', renderTest.catalog() === beforeSame, false)
check('改词表后词数跟着变',
  renderTest.catalog().find((item) => item.id.includes('测试词表')).length, 1)
renderTest.clearCustomCache()
check('清缓存后重新解析出同样内容', Object.keys(renderTest.readCustomDicts()), ['测试词表'])
renderTest.writeCustomDicts({})
check('清空自定义词表目录里就没了', renderTest.catalog().some((item) => item.id.includes('测试词表')), false)

// —— 词库徽标：371 个库每个都有「色块 + 短标记」——
{
  const { dictBadge, badgeText, BADGE_TONES } = plugin.__test
  const realDicts = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'dicts.index.json'), 'utf8')).dicts
  const realById = (id) => {
    const hit = realDicts.find((dict) => dict.id === id)
    if (!hit) throw new Error(`dicts.index.json 里没有 ${id}`)
    return hit
  }

  // 代表性词库：真实数据兜底
  check('cet4 → C4 / en', dictBadge(realById('cet4')), { text: 'C4', tone: 'en', title: 'CET-4' })
  check('ielts → IE', dictBadge(realById('ielts')).text, 'IE')
  check('日语 N1（JapVocabList.N1）→ N1 / ja',
    [dictBadge(realById('japanese006')).text, dictBadge(realById('japanese006')).tone], ['N1', 'ja'])
  check('jsObject（js-object）→ JO / code',
    [dictBadge(realById('jsObject')).text, dictBadge(realById('jsObject')).tone], ['JO', 'code'])
  check('专插本英语词汇 → 专插', dictBadge(realById('zhuan-cha-ben-ying-yu')).text, '专插')
  check('Oxford5000 → O5', dictBadge(realById('Oxford5000')).text, 'O5')
  check('toefl → TO', dictBadge(realById('toefl')).text, 'TO')
  check('gre3000 → G3', dictBadge(realById('gre3000')).text, 'G3')
  check('raz-A → A（末尾字母字段）', dictBadge(realById('raz-A')).text, 'A')
  check('SATen → EN（末尾 en-en）', dictBadge(realById('SATen')).text, 'EN')
  check('kaoyan → 考研（中文片段）', dictBadge(realById('kaoyan')).text, '考研')
  check('平假名 → 平假', dictBadge(realById('japanese-hiragana')).text, '平假')
  check('德语 / 哈萨克语 / 印尼语都归 other',
    ['german2en', 'kazakh_basic_3000_arabic_hapin', 'indonesian_highFrequency_3043'].map((id) => dictBadge(realById(id)).tone),
    ['other', 'other', 'other'])
  check('title 就是完整词库名', dictBadge(realById('ielts')).title, 'IELTS')

  // 全量：371 个库逐个跑，只报一条
  const bad = []
  for (const meta of realDicts) {
    const badge = dictBadge(meta)
    if (!badge.text) bad.push(`${meta.id}:空`)
    else if (Array.from(badge.text).length > 2) bad.push(`${meta.id}:超长`)
    else if (!BADGE_TONES.includes(badge.tone)) bad.push(`${meta.id}:色相${badge.tone}`)
    else if (badge.title !== meta.name) bad.push(`${meta.id}:标题`)
  }
  check('371 个词库全部有合法徽标（text 非空 / ≤2 字符 / tone 合法）', bad, [])
  check('词库总数 371', realDicts.length, 371)
  check('真实数据用到 en / ja / code / other 四种色相',
    [...new Set(realDicts.map((meta) => dictBadge(meta).tone))].sort(), ['code', 'en', 'ja', 'other'])
  check('371 个库里没有任何一条落到兜底问号',
    realDicts.filter((meta) => dictBadge(meta).text === '?').length, 0)

  // 边界：缺字段不炸
  check('meta 为空 → 问号 + other', dictBadge(undefined), { text: '?', tone: 'other', title: '' })
  check('空对象同样兜底', dictBadge({}), { text: '?', tone: 'other', title: '' })
  check('只有 id 也能出标记', dictBadge({ id: 'cet4' }), { text: 'C4', tone: 'other', title: 'cet4' })
  check('没有 languageCategory → other', dictBadge({ id: 'x', name: 'X' }).tone, 'other')
  check('未知语言（fr）也归 other', dictBadge({ id: 'x', name: 'X', languageCategory: 'fr' }).tone, 'other')
  check('中文语言走 zh 色相',
    [dictBadge({ id: 'chengyu', name: '成语', languageCategory: 'zh' }).text,
      dictBadge({ id: 'chengyu', name: '成语', languageCategory: 'zh' }).tone], ['成语', 'zh'])
  check('名字全是符号也不崩', badgeText({ id: '???', name: '***' }), '?')

  // 渲染：DictBadge 只管画
  const { DictBadge } = renderPlugin.__test.components
  const badge20 = DictBadge({ meta: realById('cet4'), size: 20 })
  check('DictBadge 根节点是 span.qat-badge', [badge20.type, badge20.props.className], ['span', 'qat-badge'])
  check('DictBadge 带 data-tone / data-size', [badge20.props['data-tone'], badge20.props['data-size']], ['en', '20'])
  check('DictBadge 里是 span.qat-badge-text',
    [badge20.children[0].props.className, badge20.children[0].children[0]], ['qat-badge-text', 'C4'])
  check('DictBadge 的 title / aria-label 用完整库名',
    [badge20.props.title, badge20.props['aria-label']], ['CET-4', 'CET-4'])
  check('DictBadge 尺寸只认 20 / 28 两档',
    [DictBadge({ meta: realById('ielts'), size: 28 }).props['data-size'],
      DictBadge({ meta: realById('ielts') }).props['data-size'],
      DictBadge({ meta: realById('ielts'), size: 44 }).props['data-size']], ['28', '28', '28'])
  check('DictBadge 可以换成 i18n 的 aria 文案',
    DictBadge({ meta: realById('ielts'), label: format(DICT.zh.dictBadgeTitle, { name: 'IELTS' }) }).props['aria-label'],
    '词库：IELTS')
  check('DictBadge 不引任何图片',
    (() => {
      const walk = (node) => {
        if (!node || typeof node !== 'object') return true
        const props = node.props ?? {}
        if (props.src || props.href || props.backgroundImage) return false
        if (String(props.className ?? '').includes('qat-svg')) return false
        return node.children.every(walk)
      }
      return walk(badge20)
    })(), true)

  // 渲染：接进选择器以后，每个词库行前面都有徽标
  const fakeList = [
    { id: 'cet4', name: 'CET-4', category: '中国考试', length: 2607, languageCategory: 'en' },
    { id: 'japanese006', name: 'N1', category: '日语学习', length: 3477, languageCategory: 'ja' },
    { id: 'jsObject', name: 'JS: Object', category: '代码练习', length: 37, languageCategory: 'code' },
  ]
  const fakePicker = render('渲染：选择器带徽标', () => renderTest.components.DictPicker({
    t: (key, vars) => (vars && vars.name !== undefined ? `${key}:${vars.name}` : key),
    dictId: 'cet4',
    query: '',
    category: '',
    recent: [],
    categories: [],
    list: fakeList,
    onQuery: () => {},
    onCategory: () => {},
    onPick: () => {},
    onClose: () => {},
  }))
  const badgeCount = (node) => collectClasses(node).filter((name) => name === 'qat-badge').length
  check('徽标数量 = 词库数量', badgeCount(fakePicker), fakeList.length)
  check('每个词库行的第一个子节点是徽标', (function walk(node, out = []) {
    if (!node || typeof node !== 'object') return out
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, out))
      return out
    }
    if (typeof node.type === 'function') return walk(node.type(node.props ?? {}), out)
    if (String(node.props?.className ?? '') === 'qat-dictrow') {
      const first = node.children[0]
      const drawn = typeof first?.type === 'function' ? first.type(first.props ?? {}) : first
      out.push(drawn?.props?.['data-tone'] ?? 'missing')
    }
    walk(node.children, out)
    walk(node.props?.children, out)
    return out
  })(fakePicker), ['en', 'ja', 'code'])
  check('行内徽标是 28 号', (function walk(node, out = []) {
    if (!node || typeof node !== 'object') return out
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, out))
      return out
    }
    if (typeof node.type === 'function') return walk(node.type(node.props ?? {}), out)
    if (node.props?.['data-size'] === '28') out.push(1)
    walk(node.children, out)
    walk(node.props?.children, out)
    return out
  })(fakePicker).length, fakeList.length)
  check('真实目录：徽标数量和词库行数一致',
    badgeCount(picker), collectClasses(picker).filter((name) => name === 'qat-dictrow').length)

  // 样式：色相变体、两档尺寸都在表里，且没有图片
  check('样式表里有 .qat-badge', /\.qat-badge\{/.test(source), true)
  check('样式表里有 5 个 data-tone 变体',
    BADGE_TONES.every((tone) => new RegExp(`\\.qat-badge\\[data-tone="${tone}"\\]\\{`).test(source)), true)
  check('样式表里有 20 / 28 两档尺寸',
    [/\].qat-badge\[data-size="20"\]\{|\n\.qat-badge\[data-size="20"\]\{/.test(source),
      /\n\.qat-badge\[data-size="28"\]\{/.test(source)].every(Boolean), true)
  check('徽标用 --dsw token 上色，不写死颜色',
    BADGE_TONES.every((tone) => new RegExp(`\\.qat-badge\\[data-tone="${tone}"\\]\\{[^}]*var\\(--dsw-`).test(source)), true)
  check('徽标不吃布局宽度（flex:none）', /\.qat-badge\{[^}]*flex:none/.test(source), true)
  check('徽标不用图片 / iconify',
    /\.qat-badge[^{]*\{[^}]*url\(/.test(source) === false && /qat-badge[^}]*iconify/.test(source) === false, true)
  check('徽标文字层有独立样式', /\.qat-badge-text\{/.test(source), true)

  // 文案：两本字典都要有 aria 文案
  check('两份字典都有徽标 aria 文案',
    [DICT.zh.dictBadgeTitle, DICT.en.dictBadgeTitle].every((text) => typeof text === 'string' && text.includes('{name}')), true)
}

/* ------------------------------------------------------------------ */
/* D1 数据：长句子 / 假名入库 + 音标按口音分开 + 审计脚本纯函数          */
/* ------------------------------------------------------------------ */

// 单独解构：上面那一大段是多个子任务共用的，能不动就不动
const {
  inspectWord, phoneticOf, MAX_WORD_LENGTH, LONG_WORD_CHARS, DROP_REASONS,
  cleanPhone, bracketPhone,
} = plugin.__test

// 上游全库最长的一条 name 是 177 字符（雅思口语句子），所以边界定在 200
const WORD_177 = `${'x'.repeat(176)}.`
const WORD_200 = 'y'.repeat(200)
const WORD_201 = 'z'.repeat(201)

// —— 长度上限 40 → 200 ——
check('长度上限是 200', MAX_WORD_LENGTH, 200)
check('177 字符句子能入库', normalizeWord({ name: WORD_177, trans: ['长句'] }, 'en').w.length, 177)
check('200 字符正好在边界内', normalizeWord({ name: WORD_200, trans: ['长'] }, 'en').w.length, 200)
check('201 字符仍被丢弃', normalizeWord({ name: WORD_201, trans: ['长'] }, 'en'), null)
check('41 字符（旧上限外）词组能入库', normalizeWord({ name: 'a'.repeat(41), trans: ['词组'] }, 'en').w.length, 41)
check('60 字符词组能入库', normalizeWord({ name: 'ab cd '.repeat(10).trim(), trans: ['词组'] }, 'en') !== null, true)
check('超长原因记为 tooLong', inspectWord({ name: WORD_201, trans: ['长'] }, 'en').reason, 'tooLong')
check('没名字的词条原因记为 empty', inspectWord({ trans: ['无名'] }, 'en').reason, 'empty')
check('既无中文也无假名原因记为 noZh', inspectWord({ name: 'ghost', trans: [] }, 'en').reason, 'noZh')
check('合法词条没有丢弃原因', inspectWord({ name: 'cat', trans: ['猫'] }, 'en').reason, '')
check('丢弃原因是固定四档 + 兜底',
  DROP_REASONS.slice().sort().join(','), 'badChars,empty,noZh,tooLong')

// —— 长句子不破坏判定 / 遮罩 / 逐字比对 ——
check('长句子逐字打对判 done', judgeTyping(WORD_177, WORD_177).state, 'done')
check('长句子只打对前缀判 ok', judgeTyping(WORD_177, WORD_177.slice(0, 120)).state, 'ok')
check('长句子中途打错判 bad', judgeTyping(WORD_177, `${WORD_177.slice(0, 120)}Z`).state, 'bad')
check('长句子打超长判 over', judgeTyping(WORD_177, `${WORD_177}x`).state, 'over')
check('长句子最后一个字符用 pushChar 收尾', pushChar(WORD_177, WORD_177.slice(0, 176), '.').result, 'done')
check('长句子遮罩长度跟目标一致', maskLetters(WORD_177, 'hideAll', 0).length, 177)
check('长句子遮罩确实全遮住', maskLetters(WORD_177, 'hideAll', 0).every(Boolean), true)
check('长句子判定目标不被截断', effectiveTarget(WORD_177).length, 177)
// 章节切分（20 词一章）不受长度影响
check('长句子词表仍按 20 词一章切', wordsOfChapter(Array.from({ length: 900 }, (_, i) => ({ w: `${WORD_177}${i}` })), 0).length, 20)
check('900 条长句子 = 45 章', chapterCount({ length: 900 }), 45)
check('长句子占满最后一章', wordsOfChapter(Array.from({ length: 900 }, (_, i) => ({ w: `w${i}` })), 44).length, 20)

// —— 空 trans + 有 notation 的假名词库 ——
const kanaWord = normalizeWord({ name: 'aiueo', trans: [], notation: 'あいうえお' }, 'ja')
check('空 trans + 有 notation 能入库', kanaWord !== null, true)
check('假名词条保留假名', kanaWord?.notation, 'あいうえお')
check('假名词库练的是 romaji（name）', kanaWord?.w, 'aiueo')
check('假名词条没有中文释义', kanaWord?.zh, '')
check('假名不做中文清洗、不改大小写', normalizeWord({ name: 'aiueo', trans: [], notation: 'アイ ウ' }, 'ja')?.notation, 'アイ ウ')
check('空 trans 且无 notation 仍被丢弃', normalizeWord({ name: 'aoeui', trans: [] }, 'ja'), null)
check('自定义词表仍可只给单词', normalizeWord({ name: 'solo', trans: [] }, 'en', { allowNoZh: true })?.w, 'solo')
check('内置词库不放行「只给单词」', normalizeWord({ name: 'solo', trans: [] }, 'en'), null)

// —— 音标按口音分开：normalizeWord 产出 us / uk / ipa ——
const bothPhones = normalizeWord({ name: 'go', trans: ['去'], ukphone: 'gəu', usphone: 'goʊ' }, 'en')
check('us / uk 各存一支', [bothPhones.us, bothPhones.uk], ['/goʊ/', '/gəu/'])
check('ipa 默认取 us（取不到才 uk）', bothPhones.ipa, '/goʊ/')
check('传 accent=uk 时 ipa 取 uk', normalizeWord({ name: 'go', trans: ['去'], ukphone: 'gəu', usphone: 'goʊ' }, 'en', { accent: 'uk' }).ipa, '/gəu/')
check('只有 usphone 时 uk 空着', (function (w) { return [w.us, w.uk, w.ipa] })(normalizeWord({ name: 'go', trans: ['去'], usphone: 'goʊ' }, 'en')),
  ['/goʊ/', '', '/goʊ/'])
check('只有 ukphone 时 us 空着', (function (w) { return [w.us, w.uk, w.ipa] })(normalizeWord({ name: 'go', trans: ['去'], ukphone: 'gəu' }, 'en')),
  ['', '/gəu/', '/gəu/'])
check('只有上游 ipa 时不伪造口音', (function (w) { return [w.us, w.uk, w.ipa] })(normalizeWord({ name: 'cancel', trans: ['取消'], ipa: 'kænsl' }, 'en')),
  ['', '', '/kænsl/'])
check('代码词库三支音标都为空', (function (w) { return [w.us, w.uk, w.ipa] })(normalizeWord({ name: 'SELECT', trans: ['查询'], usphone: 'silekt', ukphone: 'silekt' }, 'code')),
  ['', '', ''])

// —— phoneticOf：按口音挑显示哪一支 ——
// text 只放音标体（已洗净、已套方括号），前缀走 label 让 UI 分开画
check('accent=us 显示 AmE', phoneticOf({ us: '/goʊ/', uk: '/gəu/' }, 'us'), { text: '[goʊ]', label: 'AmE' })
check('accent=uk 显示 BrE', phoneticOf({ us: '/goʊ/', uk: '/gəu/' }, 'uk'), { text: '[gəu]', label: 'BrE' })
check('accent=us 但缺美音 → 退回英音', phoneticOf({ uk: '/gəu/' }, 'us'), { text: '[gəu]', label: 'BrE' })
check('accent=uk 但缺英音 → 退回美音', phoneticOf({ us: '/goʊ/' }, 'uk'), { text: '[goʊ]', label: 'AmE' })
check('两支都没有 → 退回老缓存的 ipa（不编口音）', phoneticOf({ ipa: '/ˈkænsl/' }, 'uk'), { text: '[ˈkænsl]', label: '' })
check('什么都没有 → 空文本，UI 不渲染', phoneticOf({}, 'us'), { text: '', label: '' })
check('undefined 也不炸', phoneticOf(undefined, 'us'), { text: '', label: '' })
check('不会显示空括号', phoneticOf({ us: '/goʊ/' }, 'us').text.includes('[]'), false)
check('非法 accent 按 us 处理', phoneticOf({ us: '/goʊ/', uk: '/gəu/' }, 'xx').label, 'AmE')
check('日文/无口音词条不走 AmE 前缀', phoneticOf(normalizeWord({ name: 'aiueo', trans: [], notation: 'あいうえお' }, 'ja'), 'us').text, '')

// —— 老缓存兼容：只有 ipa 的老结构照样能显示 ——
const legacyCacheWord = { w: 'cancel', ipa: '/ˈkænsl/', zh: '取消' }
check('老缓存只有 ipa 时 phoneticOf 能显示', phoneticOf(legacyCacheWord, 'us').text, '[ˈkænsl]')
check('老缓存只有 ipa 时换口音也不炸', phoneticOf(legacyCacheWord, 'uk').text, '[ˈkænsl]')
check('lookup 把 us / uk / notation 带出去', (function (hit) {
  return [hit.word, hit.ipa, typeof hit.us, typeof hit.notation]
})(lookup('cancel')), ['cancel', '/ˈkænsl/', 'undefined', 'undefined'])
check('内置词条只有 ipa 时面板显示原样音标', phoneticOf(lookup('cancel'), 'us').text, '[ˈkænsl]')

// —— 长句子的排版标记（卡片 / 跟打条缩字号）——
function findNodeWithClass(node, className) {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findNodeWithClass(item, className)
      if (hit) return hit
    }
    return null
  }
  if (typeof node.type === 'function') return findNodeWithClass(node.type(node.props ?? {}), className)
  if (hasClass([String(node.props?.className ?? '')], className)) return node
  return findNodeWithClass(node.children, className) || findNodeWithClass(node.props?.children, className)
}
check('长句子上限阈值是 20 字', LONG_WORD_CHARS, 20)
check('长句子卡片挂 data-long',
  findNodeWithClass(renderTest.components.Trainer({ words: [WORD_177], variant: 'panel', showMeta: true, ctx: ctxStub }), 'qat-word')?.props?.['data-long'],
  'true')
check('短词不挂 data-long',
  findNodeWithClass(renderTest.components.Trainer({ words: ['cat'], variant: 'panel', showMeta: true, ctx: ctxStub }), 'qat-word')?.props?.['data-long'],
  'false')
check('样式表里有长句子缩排规则', /\[data-long="true"\]/.test(source), true)
check('样式表里有假名副行样式', /\.qat-gloss-notation\{/.test(source), true)
// 假名副行：用自定义词表把假名词条塞进缓存再渲染卡片（用完删掉，不留状态）
renderTest.saveCustomDict('kana-probe', [{ name: 'aiueo', trans: [], notation: 'あいうえお' }])
await renderTest.loadDictWords(`${CUSTOM_PREFIX}kana-probe`)
check('假名词条把 notation 渲染成副行', (function () {
  const node = findNodeWithClass(
    renderTest.components.Trainer({ words: ['aiueo'], variant: 'panel', showMeta: true, ctx: ctxStub }),
    'qat-gloss-notation',
  )
  return node ? gatherText(node) : ''
})(), 'あいうえお')
check('假名词条不再画中文行', collectClasses(
  renderTest.components.Trainer({ words: ['aiueo'], variant: 'panel', showMeta: true, ctx: ctxStub }),
).includes('qat-gloss-zh'), false)
renderTest.removeCustomDict('kana-probe')

// 面板音标的端到端接线：词条带 us / uk 时，显示哪一支跟 options.accent 走
renderTest.saveCustomDict('accent-probe', [{ name: 'go', trans: ['去'], usphone: 'goʊ', ukphone: 'gəu' }])
await renderTest.loadDictWords(`${CUSTOM_PREFIX}accent-probe`)
function panelIpaText(accent) {
  const node = findNodeWithClass(
    renderTest.components.Trainer({ words: ['go'], variant: 'panel', showMeta: true, options: { accent }, ctx: ctxStub }),
    'qat-gloss-ipa',
  )
  return node ? gatherText(node) : ''
}
check('面板按 accent=us 显示 AmE', panelIpaText('us'), 'AmE: [goʊ]')
check('面板按 accent=uk 显示 BrE', panelIpaText('uk'), 'BrE: [gəu]')
renderTest.removeCustomDict('accent-probe')

// —— N9：notation 拆成逐字 ruby（汉字挂读音、送假名/纯假名不挂） ——
const { isKanji, notationParts, notationNodes, romajiToHiragana } = renderTest
check('isKanji 认统一表意汉字', isKanji('食'), true)
check('isKanji 认兼容表意汉字', isKanji('\uf900'), true)
check('isKanji 认扩展 A', isKanji('\u3400'), true)
check('isKanji 不认假名', isKanji('あ'), false)
check('isKanji 不认拉丁字母', isKanji('a'), false)
check('isKanji 只认单字符', isKanji('食べ'), false)
check('notationParts 空串 → 空数组', JSON.stringify(notationParts('')), '[]')
check('notationParts 汉字整段挂 ruby', JSON.stringify(notationParts('食べる(たべる)')),
  JSON.stringify([{ base: '食べる', ruby: 'たべる' }]))
check('notationParts 送假名拆出来不挂 ruby', JSON.stringify(notationParts('お茶(おちゃ)')),
  JSON.stringify([{ base: 'お', ruby: '' }, { base: '茶', ruby: 'おちゃ' }]))
check('notationParts 纯假名单段无 ruby', JSON.stringify(notationParts('あい(あい)')),
  JSON.stringify([{ base: 'あい', ruby: '' }]))
check('notationParts 片假名保留读音', JSON.stringify(notationParts('コーヒー(こーひー)')),
  JSON.stringify([{ base: 'コーヒー', ruby: 'こーひー' }]))
check('notationParts 空括号吞掉读音', JSON.stringify(notationParts('食べる()')),
  JSON.stringify([{ base: '食べる', ruby: '' }]))
check('notationParts 嵌套按最外层不抛异常', JSON.stringify(notationParts('a(b(c))')),
  JSON.stringify([{ base: 'a(b', ruby: '' }, { base: ')', ruby: '' }]))
check('notationParts 括号外纯假名成段', JSON.stringify(notationParts('ねこ')),
  JSON.stringify([{ base: 'ねこ', ruby: '' }]))
check('notationNodes 没 ruby 时回纯文本', notationNodes('あいうえお'), 'あいうえお')
check('notationNodes 空串回 null', notationNodes(''), null)
check('样式表里有 ruby 样式', /\.qat-ruby\{/.test(source) && /\.qat-ruby-rt\{/.test(source), true)
check('ruby 读音用更淡的字色', /\.qat-ruby-rt\{[^}]*var\(--dsw-alias-label-tertiary\)/.test(source), true)
// 面板端到端：汉字挂 rt、纯假名不带 ruby
renderTest.saveCustomDict('kana-ruby', [
  { name: 'taberu', trans: [], notation: '食べる(たべる)' },
  { name: 'aiueo2', trans: [], notation: 'あい(あい)' },
])
await renderTest.loadDictWords(`${CUSTOM_PREFIX}kana-ruby`)
function panelNode(word) {
  return renderTest.components.Trainer({ words: [word], variant: 'panel', showMeta: true, ctx: ctxStub })
}
check('面板假名画成 ruby', Boolean(findNodeWithClass(panelNode('taberu'), 'qat-ruby')), true)
check('ruby 里只有一个读音 rt', findNodesByTag(panelNode('taberu'), 'rt').length, 1)
check('rt 里是假名读音', gatherText(findNodesByTag(panelNode('taberu'), 'rt')[0]), 'たべる')
check('ruby 的 base 是词形', gatherText(findNodeWithClass(panelNode('taberu'), 'qat-ruby')), '食べるたべる')
check('纯平假名不画 ruby', findNodeWithClass(panelNode('aiueo2'), 'qat-ruby'), null)
check('纯平假名仍是纯文本副行', gatherText(findNodeWithClass(panelNode('aiueo2'), 'qat-gloss-notation')), 'あい')
renderTest.removeCustomDict('kana-ruby')
// 跟打条太窄：继续纯文本，不挂 ruby
check('跟打条仍是纯文本假名', /barNotation \? h\('span', \{ className: 'qat-bar-notation' \}, barNotation\)/.test(source), true)
check('跟打条不接 ruby', /qat-bar-notation' \}, notationNodes/.test(source), false)

// —— N10：罗马字 → 平假名（紧凑表，3→2→1 贪心） ——
check('shinjuku → しんじゅく', romajiToHiragana('shinjuku'), 'しんじゅく')
check('gakkou → がっこう', romajiToHiragana('gakkou'), 'がっこう')
check('kanji → かんじ', romajiToHiragana('kanji'), 'かんじ')
check('matcha → まっちゃ', romajiToHiragana('matcha'), 'まっちゃ')
check('nihon → にほん', romajiToHiragana('nihon'), 'にほん')
check('tokyo → ときょ（ou 不合并长音）', romajiToHiragana('tokyo'), 'ときょ')
check('aiueo → あいうえお', romajiToHiragana('aiueo'), 'あいうえお')
check('空串 → 空串', romajiToHiragana(''), '')
check('ABC → あbc（小写化 + 不丢字）', romajiToHiragana('ABC'), 'あbc')
check('撇号去掉：shin\'ichi → しんいち', romajiToHiragana("shin'ichi"), 'しんいち')
check('非字母原样保留', romajiToHiragana('-ka-'), '-か-')
// 口音优先级：假名/汉字永远不听设置，只有英文吃 romaji 这类新档
check('罗马字档不抢假名词', renderTest.resolveAccent('りんご', { accent: 'romaji' }), 'ja')
check('罗马字档不抢汉字词', renderTest.resolveAccent('苹果', { accent: 'romaji' }), 'zh')
check('英文可吃 romaji 档', renderTest.resolveAccent('shinjuku', { accent: 'romaji' }), 'romaji')
check('英文可吃 de 档', renderTest.resolveAccent('Haus', { accent: 'de' }), 'de')
check('设置坏了仍回退美音', renderTest.resolveAccent('cancel', { accent: 'fr' }), 'us')
check('四档都有中文标签', ['de', 'id', 'kk', 'romaji'].map((k) => renderTest.DICT.zh[`accent_${k}`]).join('|'),
  'Deutsch|Indonesia|哈萨克语(俄音)|Romaji')
check('四档都有英文标签', ['de', 'id', 'kk', 'romaji'].map((k) => renderTest.DICT.en[`accent_${k}`]).join('|'),
  'German|Indonesian|Kazakh (Russian)|Romaji')

// —— 审计脚本：统计纯函数 ——
const auditNormalize = (raw) => (raw.ok ? { w: raw.ok, ipa: raw.ipa || '', us: '', uk: '', zh: raw.zh || '' } : null)
const auditInspect = (raw) => ({ ok: Boolean(raw.ok), reason: raw.reason || 'other' })
const auditSample = [
  { ok: 'cat', ipa: '/kæt/', zh: '猫' },
  { ok: 'dog', zh: '狗' },
  { ok: '', reason: 'noZh' },
  { ok: '', reason: 'tooLong' },
  { ok: '', reason: 'weird' },
]
const auditResult = auditRows(auditSample, auditNormalize, auditInspect)
check('审计：原始 / 保留 / 丢弃', [auditResult.raw, auditResult.kept, auditResult.dropped], [5, 2, 3])
check('审计：原因分布', [auditResult.reasons.noZh, auditResult.reasons.tooLong, auditResult.reasons.other], [1, 1, 1])
check('审计：有音标只按保留词条算', auditResult.withIpa, 1)
check('审计：有释义条数', auditResult.withZh, 2)
check('审计：没给 inspect 时全记 other', auditRows([{ ok: '' }, { ok: '' }], auditNormalize).reasons.other, 2)
check('审计：空输入不炸', auditRows([], auditNormalize).dropped, 0)
check('空桶结构', Object.keys(emptyStats().reasons).sort().join(','), REASON_KEYS.slice().sort().join(','))
const mergedStats = mergeStats([auditResult, auditRows([{ ok: 'fox', ipa: '/f/' }], auditNormalize)])
check('合并统计：原始相加', mergedStats.raw, 6)
check('合并统计：保留相加', mergedStats.kept, 3)
check('合并统计：原因相加', mergedStats.reasons.noZh, 1)
check('比例不会除以零', ratio(3, 0), 0)
check('比例算得对', ratio(1, 4), 0.25)
check('百分比三位小数', formatPct(0.000426, 3), '0.043%')
check('报表表头带 noZh 列', formatHead().includes('noZh'), true)
check('报表行含词库名与音标比例', formatRow({ name: 'a.json', ...emptyStats() }).includes('a.json'), true)
check('报表有总计段', formatReport([{ name: 'a.json', ...auditRows(auditSample, auditNormalize, auditInspect) }]).includes('—— 总计 ——'), true)
check('报表按丢词数排序（丢得多的在前）',
  formatReport([
    { name: 'keep.json', ...auditRows([{ ok: 'a', zh: '甲' }], auditNormalize, auditInspect) },
    { name: 'drop.json', ...auditRows(auditSample, auditNormalize, auditInspect) },
  ]).indexOf('drop.json') < formatReport([
    { name: 'keep.json', ...auditRows([{ ok: 'a', zh: '甲' }], auditNormalize, auditInspect) },
    { name: 'drop.json', ...auditRows(auditSample, auditNormalize, auditInspect) },
  ]).indexOf('keep.json'), true)
check('--top 只打印前 N 个', formatReport([{ name: 'a.json', ...emptyStats() }], { top: 0 }).includes('a.json'), true)
check('参数默认 top=0（全打）', parseArgs(['node', 'x']).top, 0)
check('参数能改上游目录', parseArgs(['node', 'x', '--upstream', '/tmp/u']).upstream, '/tmp/u')
check('清单里 /dicts/x.json 映射到本地文件', dictFilePath('/up', '/dicts/x.json'), path.join('/up', 'x.json'))
check('清单里 ./dicts/x.json 也认', dictFilePath('/up', './dicts/x.json'), path.join('/up', 'x.json'))

// —— cleanPhone：真实词库里的脏音标（扫描口径见下，脚本 scripts/scan-phone-shapes.mjs）——
check('剥斜杠外壳', cleanPhone('/ˈæpl/'), 'ˈæpl')
check('剥方括号外壳', cleanPhone('[ˈæpl]'), 'ˈæpl')
check('方括号套斜杠也剥干净', cleanPhone('/[ˈæpl]/'), 'ˈæpl')
check('前后空格压掉', cleanPhone('  goʊ  '), 'goʊ')
check('中间连续空格压成一个', cleanPhone('ˈæp(ə)l  ok'), 'ˈæp(ə)l ok')
check('全角斜杠转半角并剥壳', cleanPhone('／ruːt／'), 'ruːt')
check('全角空格压掉', cleanPhone('\u3000goʊ\u3000'), 'goʊ')
check('空串 → 空', cleanPhone(''), '')
check('占位符 - → 空', cleanPhone('-'), '')
check('null → 空', cleanPhone(null), '')
check('undefined → 空', cleanPhone(undefined), '')
check('纯斜杠 → 空', cleanPhone('/'), '')
check('一个字段两支口音：内部斜杠保留（不替词库猜口音）', cleanPhone('bɑ:θ/bæθ'), 'bɑ:θ/bæθ')
check('bracketPhone 套一层方括号', bracketPhone('ˈæpl'), '[ˈæpl]')
check('bracketPhone 洗过再套，不会套第二层', bracketPhone('[/ˈæpl/]'), '[ˈæpl]')
check('bracketPhone 占位值不套空括号', bracketPhone('-'), '')

// —— phoneticOf：label 只在真的取到该口音字段时出现 ——
check('label：两支都在，跟 accent 走（us）', phoneticOf({ us: '/goʊ/', uk: '/gəu/', en: true }, 'us').label, 'AmE')
check('label：只有 uk → BrE（并按 uk 显示）', phoneticOf({ uk: '  [gəu] ', en: true }, 'us'), { text: '[gəu]', label: 'BrE' })
check('label：两支都缺退回 ipa → label 为空（route 这种实际英音不标 AmE）',
  phoneticOf({ ipa: '/ruːt/', en: true }, 'us'), { text: '[ruːt]', label: '' })
check('label：只有 notation（无 phone）→ text / label 都空',
  phoneticOf({ notation: 'あいうえお', en: true }, 'us'), { text: '', label: '' })
check('label：非英文词库不加前缀', phoneticOf({ us: '/taberu/', en: false }, 'us'), { text: '[taberu]', label: '' })
check('脏 phone 进来也只有一层方括号', phoneticOf({ us: '[/goʊ/]', en: true }, 'us').text, '[goʊ]')
// 一个字段塞两支口音（4000_Essential_English_Words-meaning.json 的 bath）：原样保留、不猜顺序、只套一层括号
check('一个字段两支口音：原样保留且只套一层方括号', phoneticOf({ us: 'bɑ:θ/bæθ', en: true }, 'us').text, '[bɑ:θ/bæθ]')

// —— 面板渲染：前缀随 accent 变、无音标不画空行、方括号不重复 ——
function panelTree(word, extra = {}) {
  return renderTest.components.Trainer({ words: [word], variant: 'panel', showMeta: true, ctx: ctxStub, ...extra })
}
function panelLabelText(word, accent) {
  const node = findNodeWithClass(panelTree(word, accent ? { options: { accent } } : {}), 'qat-ipa-label')
  return node ? gatherText(node).trim() : ''
}
renderTest.saveCustomDict('phonetic-probe', [
  { name: 'go', trans: ['去'], usphone: 'goʊ', ukphone: 'gəu' },
  { name: 'route', trans: ['路线'], ipa: 'ruːt' },
  { name: 'zed', trans: ['zeta 字母'] },
])
await renderTest.loadDictWords(`${CUSTOM_PREFIX}phonetic-probe`)
check('面板 us → 前缀 AmE', panelLabelText('go', 'us'), 'AmE:')
check('面板 uk → 前缀 BrE', panelLabelText('go', 'uk'), 'BrE:')
check('切到 uk 后音标体跟着换', (function () {
  const node = findNodeWithClass(panelTree('go', { options: { accent: 'uk' } }), 'qat-gloss-ipa')
  return node ? gatherText(node).trim() : ''
})(), 'BrE: [gəu]')
// 设置里切 accent：不传 options.accent，面板直接读 settings（渲染时立刻反映，不等下一轮）
renderTest.setSetting('accent', 'uk')
check('设置切到 uk，面板前缀变 BrE（无需重新开一轮）', panelLabelText('go'), 'BrE:')
renderTest.setSetting('accent', 'us')
check('设置切回 us，面板前缀变 AmE', panelLabelText('go'), 'AmE:')
check('方括号只套一层：面板音标里只有一个 [ 和一个 ]', (function () {
  const text = gatherText(findNodeWithClass(panelTree('go', { options: { accent: 'us' } }), 'qat-gloss-ipa')).trim()
  return [(text.match(/\[/g) || []).length, (text.match(/\]/g) || []).length]
})(), [1, 1])
check('退回 ipa 的词不标前缀', panelLabelText('route', 'us'), '')
check('退回 ipa 的词音标体照常显示', (function () {
  const node = findNodeWithClass(panelTree('route', { options: { accent: 'us' } }), 'qat-gloss-ipa')
  return node ? gatherText(node).trim() : ''
})(), '[ruːt]')
check('完全没有音标的词条不画音标行', findNodeWithClass(panelTree('zed'), 'qat-gloss-ipa'), null)
check('没有音标也留着发音按钮（发音不依赖音标）', findNodeWithClass(panelTree('zed'), 'qat-speak') !== null, true)
check('没有音标、也没有释义时不画空 gloss 块', findNodeWithClass(
  renderTest.components.Trainer({ words: ['zed'], variant: 'panel', showMeta: true, ctx: ctxStub }),
  'qat-gloss',
) !== null, true)
renderTest.removeCustomDict('phonetic-probe')
// 假名词条：notation 走自己那行，音标行不出现（同一串不画两遍）
renderTest.saveCustomDict('kana-probe2', [{ name: 'aiueo', trans: [], notation: 'あいうえお' }])
await renderTest.loadDictWords(`${CUSTOM_PREFIX}kana-probe2`)
check('假名词条不出现音标行', findNodeWithClass(panelTree('aiueo'), 'qat-gloss-ipa'), null)
check('假名词条 notation 只画一次', (function () {
  const text = gatherText(panelTree('aiueo'))
  return text.split('あいうえお').length - 1
})(), 1)
renderTest.removeCustomDict('kana-probe2')
check('跟打条里的假名有自己的 class（不进 .qat-ipa）', /\.qat-bar-notation\{/.test(source), true)
check('口音前缀有独立样式类', /\.qat-ipa-label\{/.test(source), true)

// —— 面板排版之一：标题只出现一遍 ——
const textCount = (node, needle) => (gatherText(node).match(new RegExp(needle, 'g')) || []).length
const countClass = (node, name) => collectClasses(node).filter((item) => String(item).split(/\s+/).includes(name)).length

const panelTrainerText = (() => {
  const tree = renderTest.components.Trainer({ words: ['cancel'], variant: 'panel', showMeta: true, ctx: ctxStub })
  check('面板卡片渲染成功（标题断言前提）', tree !== null, true)
  return gatherText(tree)
})()
check('面板卡片不再重复标题', (panelTrainerText.match(/title/g) || []).length, 0)
check('面板卡片头部换成复练标签（chapter 为空时）', panelTrainerText.includes('panelHeadReview'), true)
const commandTrainerText = gatherText(
  renderTest.components.Trainer({ words: ['cancel'], variant: 'command', showMeta: true, ctx: ctxStub }),
)
check('跟打条仍然保留标题', (commandTrainerText.match(/title/g) || []).length, 1)
check('面板页面上「标题」只出现一次',
  textCount(renderTest.components.PracticePanel({ ctx: ctxStub }), 'title'), 1)
check('面板卡片给了 chapter 就显示章号', gatherText(
  renderTest.components.Trainer({ words: ['cancel'], variant: 'panel', showMeta: true, chapter: 2, chapterTotal: 20, ctx: ctxStub }),
).includes('panelHeadChapter'), true)
check('面板把章节标签透传进卡片', gatherText(
  renderTest.components.Trainer({ words: ['cancel'], variant: 'panel', showMeta: true, headTag: '第 3 章', ctx: ctxStub }),
).includes('第 3 章'), true)

// —— 面板排版之二：释义按条分行 ——
const splitSenseCase = renderTest.splitSense
check('splitSense：前缀词性 n.', splitSenseCase('n. 苹果'), { pos: 'n.', body: '苹果' })
check('splitSense：前缀词性 vt.', splitSenseCase('vt. 使…确信'), { pos: 'vt.', body: '使…确信' })
check('splitSense：没有词性的中文', splitSenseCase('苹果'), { pos: '', body: '苹果' })
check('splitSense：英文 adj.', splitSenseCase('adj. 正确的'), { pos: 'adj.', body: '正确的' })
check('splitSense：空串', splitSenseCase(''), { pos: '', body: '' })
check('splitSense：非字符串不炸', splitSenseCase(null), { pos: '', body: '' })
check('splitSense：词性后面紧跟空格', splitSenseCase('n.   苹果'), { pos: 'n.', body: '苹果' })
check('splitSense：词性后面没有空格', splitSenseCase('n.苹果'), { pos: 'n.', body: '苹果' })
check('splitSense：结尾括号词性（CET-6 形态）', splitSenseCase('期待得到的东西 (n.)'), { pos: 'n.', body: '期待得到的东西' })
check('splitSense：连着写的第二个词性', splitSenseCase('vt. &vi. 插入'), { pos: 'vt. & vi.', body: '插入' })

const splitSensesCase = renderTest.splitSenses
check('splitSenses：分号拆条目', splitSensesCase('取消，撤销；删去').length, 2)
check('splitSenses：一条里两个词性切两刀', splitSensesCase('n. 档案,公文箱 vt. 列队行进,归档').length, 2)
check('splitSenses：空串没有条目', splitSensesCase('').length, 0)
check('splitSenses：每条都带 pos/body 字段',
  splitSensesCase('n. 苹果').every((item) => 'pos' in item && 'body' in item), true)
check('sensesOf：旧缓存只有 zh 也能降级', renderTest.sensesOf({ zh: 'n. 苹果；v. 跑' }).length, 2)
check('sensesOf：带了 senses 字段就直接用', renderTest.sensesOf({ senses: ['n. 苹果', 'v. 跑'] }).length, 2)
check('lookup 的命中带出 senses', Array.isArray(renderTest.lookup('cancel')?.senses), true)

// 多释义：5 条 → 面板只铺 3 条 + 「+2」
renderTest.saveCustomDict('sense-probe', [
  { name: 'zapple', trans: ['n. 苹果', 'v. 跑', 'adj. 红的', 'adv. 快地', 'prep. 在'] },
])
await renderTest.loadDictWords(`${CUSTOM_PREFIX}sense-probe`)
const multiPanel = renderTest.components.Trainer({ words: ['zapple'], variant: 'panel', showMeta: true, ctx: ctxStub })
check('多释义渲染成多条 .qat-sense', countClass(multiPanel, 'qat-sense'), 3)
check('超过三条收成 +N 提示', gatherText(multiPanel).includes('+2'), true)
check('词性单独用 .qat-pos 前置', countClass(multiPanel, 'qat-pos'), 3)
check('词性从正文里剥出去', (function () {
  const body = findNodeWithClass(multiPanel, 'qat-sense-body')
  return body ? gatherText(body) : ''
})(), '苹果')
const multiCommand = renderTest.components.Trainer({ words: ['zapple'], variant: 'command', showMeta: true, ctx: ctxStub })
check('跟打条释义不铺成多条（.qat-sense 数量 ≤ 1）', countClass(multiCommand, 'qat-sense') <= 1, true)
check('跟打条释义仍是拼好的一行', gatherText(multiCommand).includes('n. 苹果；v. 跑'), true)

// 空释义：只有 notation 的假名词库不画空的 .qat-sense
renderTest.saveCustomDict('sense-empty', [{ name: 'zblank', trans: [], notation: 'あ' }])
await renderTest.loadDictWords(`${CUSTOM_PREFIX}sense-empty`)
const blankPanel = renderTest.components.Trainer({ words: ['zblank'], variant: 'panel', showMeta: true, ctx: ctxStub })
check('空释义不渲染 .qat-sense', countClass(blankPanel, 'qat-sense'), 0)
check('空释义不画空的释义容器', countClass(blankPanel, 'qat-gloss-zh'), 0)
check('空释义仍然显示假名副行', countClass(blankPanel, 'qat-gloss-notation'), 1)
renderTest.removeCustomDict('sense-empty')
renderTest.removeCustomDict('sense-probe')

// —— 面板排版之三：样式表跟着走 ——
check('样式表有释义条目规则', /\.qat-sense\{/.test(source), true)
check('样式表有词性小字规则', /\.qat-pos\{/.test(source), true)
check('样式表有 +N 提示规则', /\.qat-sense-more\{/.test(source), true)
check('样式表有面板卡片头部标签规则', /\.qat-headtag\{/.test(source), true)
check('面板音标比释义小一号', /\[data-variant="panel"\] \.qat-gloss-ipa\{font-size:13px/.test(source), true)
check('跟打条释义保持单行', /\[data-variant="command"\] \.qat-gloss-zh\{white-space:nowrap/.test(source), true)
check('释义条目限宽居中不溢出', /\.qat-sense\{[^}]*max-width:30em[^}]*overflow-wrap:break-word/.test(source), true)
check('释义样式不用写死颜色', /\.qat-(sense|pos|headtag)\{[^}]*#[0-9a-fA-F]{3,6}/.test(source), false)

// —— 音标审计：四桶口径、覆盖率、「有字段却没显示」 ——
// 归一化桩：raw 上直接写 us/uk，方便钉住「桶怎么分」和「什么算没显示」
const phNormalize = (raw) => (raw && raw.name
  ? { w: raw.name, us: raw.us || '', uk: raw.uk || '', ipa: raw.ipa || '', zh: raw.zh || 'x', ...(raw.notation ? { notation: raw.notation } : {}) }
  : null)
check('音标桶：both / usOnly / ukOnly / neither',
  [bucketOf({ us: '/ə/', uk: '/ə/' }), bucketOf({ us: '/ə/' }), bucketOf({ uk: '/ə/' }), bucketOf({})].join(','),
  'both,usOnly,ukOnly,neither')
check('音标桶顺序固定', PHONETIC_BUCKETS.join(','), 'both,usOnly,ukOnly,neither')
check('只有 code 算「没有音标概念」，ja 算「假名代音标」，其余该有 IPA',
  [classifyCategory('code'), classifyCategory('ja'), classifyCategory('en'), classifyCategory(undefined)].join(','),
  'noPhoneticConcept,notationInstead,expectsIpa,expectsIpa')

const phStats = phoneticRows([
  { name: 'both', us: '/b/', uk: '/b/' },
  { name: 'us', us: '/u/' },
  { name: 'uk', uk: '/k/' },
  { name: 'none', notation: 'あ' },
], 'en', phNormalize, { name: 'x.json' })
check('音标统计：四桶各一 + 只有假名的单列',
  [phStats.kept, phStats.both, phStats.usOnly, phStats.ukOnly, phStats.neither, phStats.notationOnly].join(','),
  '4,1,1,1,1,1')
check('覆盖率 = 有音标 / 保留，缺音标 = 保留 - 有音标',
  [phoneticCoverage(phStats), missingPhonetic(phStats)].join(','), '0.75,1')
check('没给 normalize 时不崩', phoneticRows([{ name: 'a' }], 'en').kept, 0)

// 「有字段却没显示」：原始有 usphone，归一化后 us/uk/ipa 全空 → hidden
const phLost = phoneticRows([{ name: 'lost', usphone: "ə'bændən", ukphone: '' }], 'en',
  () => ({ w: 'lost', us: '', uk: '', ipa: '', zh: '丢' }), { name: 'lost.json' })
check('有字段却没显示：hidden / rawPhone / lostUs / 样例词',
  [phLost.hidden, phLost.rawPhone, phLost.lostUs, phLost.hiddenSamples[0]?.word].join(','), '1,1,1,lost')
check('正常显示时 hidden 为 0',
  phoneticRows([{ name: 'ok', usphone: 'ə' }], 'en', (raw) => ({ w: raw.name, us: '/ə/', uk: '', ipa: '', zh: 'x' })).hidden, 0)
check('音标合并：保留与四桶、hidden 都相加',
  (() => {
    const merged = mergePhonetic([phStats, phLost])
    return [merged.kept, merged.both + merged.usOnly + merged.ukOnly + merged.neither, merged.hidden].join(',')
  })(), '5,5,1')

// 最差排序：覆盖率低的在前；code / ja 默认不参与（它们本来就不该有 IPA）
const phSortList = [
  { ...emptyPhoneticStats(), name: 'good.json', kept: 100, both: 100 },
  { ...emptyPhoneticStats(), name: 'bad.json', kept: 100, neither: 100 },
  { ...emptyPhoneticStats(), name: 'code.json', category: 'code', kept: 100, neither: 100 },
  { ...emptyPhoneticStats(), name: 'ja.json', category: 'ja', kept: 100, neither: 100 },
]
check('最差排序：覆盖率低的在前，code / ja 默认排除，可显式放开',
  [sortWorstPhonetic(phSortList)[0].name, sortWorstPhonetic(phSortList).length, sortWorstPhonetic(phSortList, { includeNonIpa: true }).length].join(','),
  'bad.json,2,4')
const phReport = formatPhoneticReport(phSortList, { top: 2 })
check('音标报表含全局 / 最差 / 有字段却没显示三段',
  ['有音标', '最差', '有字段却没显示'].every((key) => phReport.includes(key)), true)
check('音标报表行含词库名与覆盖率',
  formatPhoneticRow({ ...emptyPhoneticStats(), name: 'a.json', kept: 4, both: 1 }).includes('25.0%'), true)

check('音标参数默认 top=30 / 可改 / 认 --json',
  [parsePhoneticArgs(['node', 'x']).top, parsePhoneticArgs(['node', 'x', '--top', '5']).top, parsePhoneticArgs(['node', 'x', '--json']).json].join(','),
  '30,5,true')
check('上游候选带默认目录，且优先挑真实存在的那个',
  [upstreamCandidates('/tmp/nowhere', '/tmp/nowhere/dicts').includes('/tmp/nowhere/dicts'),
    pickUpstream(['/tmp/definitely-not-here', import.meta.dirname]),
    pickUpstream(['/tmp/definitely-not-here'])].join('|'),
  `true|${import.meta.dirname}|/tmp/definitely-not-here`)

// —— 音标在「错词本行」和「结算页错词胶囊」上也要看得见（N23：有字段却没画）——
renderTest.saveCustomDict('ipa-visible', [
  { name: 'go', trans: ['去'], usphone: 'goʊ', ukphone: 'gəu' },
  { name: 'plain', trans: ['朴素的'] },
])
await renderTest.loadDictWords(`${CUSTOM_PREFIX}ipa-visible`)
const ipaWrong = renderTest.components.WrongBookPanel({
  t: (key, vars) => (vars && vars.n !== undefined ? `${key}:${vars.n}` : key),
  rows: [
    { word: 'go', dictId: 'cet4', wrongCount: 2, lastAt: 1 },
    { word: 'plain', dictId: 'cet4', wrongCount: 1, lastAt: 2 },
  ],
  onReview: () => {}, onClear: () => {}, onClose: () => {},
})
check('错词本行带上音标', gatherText(findNodeWithClass(ipaWrong, 'qat-wrongipa')), '[goʊ]')
check('错词本里没音标的词不画空音标格', (collectClasses(ipaWrong).filter((name) => name === 'qat-wrongipa').length), 1)
const ipaScreen = renderTest.components.ResultScreen({
  t: (key, vars) => (vars && vars.n !== undefined ? `${key}:${vars.n}` : key),
  total: 2, elapsed: 10, hits: 2, retries: 1,
  mistakes: [{ word: 'go', wrongCount: 1 }],
  words: ['go', 'plain'],
  onRestart: () => {}, onRetryWrong: () => {}, onNextChapter: () => {},
})
check('结算页错词胶囊带上音标', gatherText(findNodeWithClass(ipaScreen, 'qat-mistake-ipa')), '[goʊ]')
check('音标跟着口音设置走（uk → BrE 那一支）', (function () {
  // 设置走 renderTest 这一份实例：两个 plugin 实例的设置缓存不共享（D1 踩过同一个坑）
  const previous = renderTest.readSettings().accent
  renderTest.setSetting('accent', 'uk')
  const node = findNodeWithClass(renderTest.components.WrongBookPanel({
    t: (key) => key,
    rows: [{ word: 'go', dictId: 'cet4', wrongCount: 1, lastAt: 1 }],
    onReview: () => {}, onClear: () => {}, onClose: () => {},
  }), 'qat-wrongipa')
  const text = node ? gatherText(node) : ''
  renderTest.setSetting('accent', previous)
  return text
})(), '[gəu]')
check('音标样式有独立规则、不写死颜色', /\.qat-wrongipa\{[^}]*var\(--dsw-alias/.test(source), true)
renderTest.removeCustomDict('ipa-visible')

/* ------------------------------------------------------------------ */
/* 章节计时 / 章节进度条 / 插件冲突提示（N5 / N25 / N11）               */
/* ------------------------------------------------------------------ */
// 单独解构：上面那一大段是多个子任务共用的，能不动就不动
const { clockText, clockVisible, progressOf, shouldWarnConflict } = plugin.__test

// —— 计时文本：对齐上游 src/pages/Typing/components/Speed（timerData.time 分/秒 padStart） ——
check('计时 0 毫秒 → 00:00', clockText(0).text, '00:00')
check('计时 59 秒 → 00:59', clockText(59_000).text, '00:59')
check('计时 61 秒 → 01:01', clockText(61_000).text, '01:01')
check('计时 3599 秒不跨小时', clockText(3_599_000).text, '59:59')
check('满 3600 秒 → 1:00:00', clockText(3_600_000).text, '1:00:00')
check('3661 秒 → 1:01:01', clockText(3_661_000).text, '1:01:01')
check('负数归 00:00', clockText(-5_000).text, '00:00')
check('NaN 归 00:00', clockText(NaN).text, '00:00')
check('不足一小时 hours=0', clockText(61_000).hours, 0)
check('满一小时 hours=1', clockText(3_661_000).hours, 1)
// 计时占用：面板一直显示，跟打条满一分钟才让出位置
check('面板一直显示计时', clockVisible('panel', 1_000), true)
check('跟打条 30 秒不显示计时', clockVisible('command', 30_000), false)
check('跟打条 60 秒开始显示计时', clockVisible('command', 60_000), true)

// —— 章节进度：对齐上游 src/pages/Typing/components/Progress（0 / 33 / 66 三档换色） ——
check('0 词进度归零', JSON.stringify(progressOf(0, 0)), '{"pct":0,"phase":0}')
check('满章 100%', progressOf(20, 20).pct, 100)
check('满章落到最后一档', progressOf(20, 20).phase, 2)
check('过半是 50%', progressOf(1, 2).pct, 50)
check('越界夹紧上限', progressOf(99, 20).pct, 100)
check('越界夹紧下限', progressOf(-3, 20).pct, 0)
check('phase 分界 32 → 0', progressOf(32, 100).phase, 0)
check('phase 分界 33 → 1', progressOf(33, 100).phase, 1)
check('phase 分界 65 → 1', progressOf(65, 100).phase, 1)
check('phase 分界 66 → 2', progressOf(66, 100).phase, 2)

// —— 插件冲突提示：对齐上游 Word/TipAlert（首章首词连错 3 次，会话说一次） ——
check('首章首词连错 3 次要提示', shouldWarnConflict({ chapter: 0, index: 0, wrongCount: 3, shown: false }), true)
check('错 2 次还不提示', shouldWarnConflict({ chapter: 0, index: 0, wrongCount: 2, shown: false }), false)
check('第 2 章不提示', shouldWarnConflict({ chapter: 1, index: 0, wrongCount: 4, shown: false }), false)
check('第 2 个词不提示', shouldWarnConflict({ chapter: 0, index: 1, wrongCount: 4, shown: false }), false)
check('已经提示过就不再提示', shouldWarnConflict({ chapter: 0, index: 0, wrongCount: 9, shown: true }), false)
check('跟打条（chapter=null）不提示', shouldWarnConflict({ chapter: null, index: 0, wrongCount: 3 }), false)
check('空输入不炸', shouldWarnConflict(), false)

// —— 渲染：面板有计时格与进度条，跟打条 0 秒不占位置 ——
const timedCard = render('渲染：章节计时与进度条', () => renderTest.components.Trainer({
  words: ['cancel', 'go'], variant: 'panel', chapter: 0, dictId: 'cet4', ctx: ctxStub,
}))
const clockNode = findNodeWithClass(timedCard, 'qat-clock')
check('面板头部有计时格', Boolean(clockNode), true)
check('面板计时文本形如 mm:ss', /^\d\d:\d\d$/.test(gatherText(clockNode) || ''), true)
check('计时格在头部指标那一排', Boolean(findNodeWithClass(findNodeWithClass(timedCard, 'qat-head'), 'qat-clock')), true)
const progressNode = findNodeWithClass(timedCard, 'qat-progress')
const fillNode = findNodeWithClass(timedCard, 'qat-progress-fill')
check('面板有进度条', Boolean(progressNode), true)
check('进度条带 data-phase', progressNode?.props?.['data-phase'], '0')
check('进度条宽度走百分比', fillNode?.props?.style?.width, '0%')
check('进度宽度是唯一的内联样式', fillNode?.props?.style && Object.keys(fillNode.props.style).join(','), 'width')
check('面板进度条在单词上方（先于 .qat-word 出现）', (function () {
  const classes = collectClasses(timedCard)
  return classes.indexOf('qat-progress') < classes.indexOf('qat-word')
})(), true)

renderTest.setOpen(true)
const timedBar = render('渲染：跟打条计时', () => renderTest.components.ComposerTrainer({
  useInput: () => '', inputActions: {}, ctx: ctxStub,
}))
const barSpeedText = gatherText(findNodeWithClass(timedBar, 'qat-bar-speed')) || ''
check('跟打条 0 秒不显示计时', /\d\d:\d\d/.test(barSpeedText), false)
check('跟打条不加章节进度条', hasClass(collectClasses(timedBar), 'qat-progress'), false)
renderTest.setOpen(false)

// —— 样式：三档颜色只走 data-phase + CSS 变量，不写死 ——
check('进度条三档用 CSS 变量换色', /\.qat-progress\[data-phase="1"\]\{--qat-fill:var\(--dsw-alias-state-warn-primary\)\}/.test(source), true)
check('进度填充读变量', /\.qat-progress-fill\{[^}]*background:var\(--qat-fill\)/.test(source), true)
check('进度条不写死颜色', /\.qat-progress[^{]*\{[^}]*#[0-9a-fA-F]{3,6}/.test(source), false)

// —— 文案：中英各一条，key 对齐由上面的通用断言兜住 ——
check('冲突提示有中英文案', ['conflictTitle', 'conflictBody'].every((key) => DICT.zh[key] && DICT.en[key]), true)
check('冲突提示说清「关插件或换浏览器」', /插件|扩展|browser/i.test(DICT.zh.conflictBody + DICT.en.conflictBody), true)


// —— 趋势图（R7）：最近 20 章的 WPM / 正确率双折线，纯函数 + 渲染 ——
const { trendSeries, polylineOf } = renderTest
const trendRecs = Array.from({ length: 25 }, (_, i) => ({ at: 1000 + i, wpm: 40 + i, accuracy: 80 + (i % 5) }))
const trendAll = trendSeries([...trendRecs].reverse())
check('趋势只留最后 20 章', trendAll.points.length, 20)
check('趋势按 at 升序（乱序输入）', trendAll.points.slice(0, 2).map((p) => p.at).join(','), '1005,1006')
check('趋势窗口是最新的 20 章', [trendAll.points[0].at, trendAll.points[19].at].join(','), '1005,1024')
check('wpmMax 取窗口内最大值', trendAll.wpmMax, 64)
check('两点以上才画线', trendAll.hasData, true)
check('窗口大小可传', trendSeries(trendRecs, 3).points.map((p) => p.at).join(','), '1022,1023,1024')
check('脏记录（wpm 非数字 / accuracy 为 null）被过滤', trendSeries([
  { at: 1, wpm: 'x', accuracy: null },
  { at: 2, wpm: 50, accuracy: 90 },
]).points.length, 1)
check('只有秒数/词数的老记录现算 wpm 与正确率', (function () {
  const point = trendSeries([{ at: 5, seconds: 30, wordCount: 30, wrongCount: 3 }]).points[0]
  return [point.wpm, point.accuracy].join(',')
})(), '60,91')
check('wpmMax 至少 1，防除 0',
  trendSeries([{ at: 1, wpm: 0, accuracy: 0 }, { at: 2, wpm: 0, accuracy: 0 }]).wpmMax, 1)
check('0 / 1 / 2 条的 hasData 依次 false / false / true',
  [0, 1, 2].map((n) => trendSeries(trendRecs.slice(0, n)).hasData).join(','), 'false,false,true')
check('没有记录时 points 是空数组', trendSeries(null).points.length, 0)

const line2 = polylineOf([{ wpm: 0 }, { wpm: 10 }], 'wpm', { max: 10 })
check('两点折线首点贴基线、末点贴顶', line2, '0,80 320,0')
check('折线坐标组数与点数一致', line2.split(' ').length, 2)
check('三点折线坐标取整', polylineOf([{ wpm: 5 }, { wpm: 10 }, { wpm: 0 }], 'wpm', { max: 10 }), '0,40 160,0 320,80')
check('max 越大同一点的 y 越靠下',
  [10, 20, 40].map((max) => Number(polylineOf([{ wpm: 5 }, { wpm: 10 }], 'wpm', { max }).split(' ')[0].split(',')[1])).join(','),
  '40,60,70')
check('宽高可传', polylineOf([{ wpm: 0 }, { wpm: 10 }], 'wpm', { width: 100, height: 50, max: 10 }), '0,50 100,0')
check('正确率默认按 0-100 归一', polylineOf([{ accuracy: 0 }, { accuracy: 100 }], 'accuracy'), '0,80 320,0')
check('1 个点画不出线', polylineOf([{ wpm: 3 }], 'wpm'), '')
check('0 个点画不出线', polylineOf([], 'wpm'), '')

const trendProps = {
  ...statsProps,
  records: [
    { at: 1, wpm: 40, accuracy: 90 },
    { at: 2, wpm: 62, accuracy: 98 },
    { at: 3, wpm: 55, accuracy: 95 },
  ],
}
const trendCase = render('渲染：统计 · 趋势', () => renderTest.components.StatsPanel(trendProps))
const trendNode = findNodesByClass(trendCase, 'qat-trend')[0]
check('统计里有一个趋势区块', findNodesByClass(trendCase, 'qat-trend').length, 1)
check('趋势里正好一个 svg', findNodesByTag(trendNode, 'svg').length, 1)
check('趋势两条 polyline', findNodesByTag(trendNode, 'polyline').length, 2)
check('趋势每个点一个 circle', findNodesByTag(trendNode, 'circle').length, 3)
check('圆点半径 2', findNodesByTag(trendNode, 'circle').every((node) => node.props.r === 2), true)
check('圆点 title 给 WPM 与正确率', findNodesByTag(trendNode, 'circle')[1].props.title, 'WPM 62 · accuracyShort:98')
check('趋势一条基线', findNodesByTag(trendNode, 'line').length, 1)
check('Y 轴只给 wpmMax 与 0',
  findNodesByClass(trendNode, 'qat-ty')[0].children.join('|'), '62|0')
check('svg viewBox 来自 TREND_SIZE', findNodesByTag(trendNode, 'svg')[0].props.viewBox, '0 0 320 80')
check('WPM 折线用最大值归一、正确率固定 0-100',
  findNodesByTag(trendNode, 'polyline').map((node) => node.props.points.split(' ').length).join(','), '3,3')
check('图例两个系列', findNodesByClass(trendNode, 'qat-trendlegend')[0].children.length, 2)
check('趋势落在汇总数字之后、日柱之前',
  findNodesByClass(trendCase, 'qat-picker')[0].children.slice(-2).map((node) => String(node.props.className)).join(','),
  'qat-trend,qat-bars')
const trendCss = collectCss(trendCase).join('\n')
const trendCssSlice = trendCss.slice(trendCss.indexOf('.qat-trend{'), trendCss.indexOf('.qat-tax{'))
check('趋势样式只用主题变量、不写死黑白',
  [/#fff|#000|:white|:black/.test(trendCssSlice),
    ['.qat-twpm,.qat-tacc{', '.qat-tdot{fill:var(--dsw-alias-brand-primary)}', '.qat-tacc{color:var(--dsw-alias-label-secondary)'].every((rule) => trendCssSlice.includes(rule))].join(','),
  'false,true')
check('正确率线是虚线', trendCssSlice.includes('stroke-dasharray'), true)

const trendEmptyCase = render('渲染：统计 · 趋势空态', () => renderTest.components.StatsPanel({ ...statsProps, records: [] }))
const trendEmptyNode = findNodesByClass(trendEmptyCase, 'qat-trend')[0]
check('记录不足时给空态文案', gatherText(trendEmptyNode).includes('trendEmpty'), true)
check('空态不画折线', findNodesByTag(trendEmptyNode, 'polyline').length, 0)
check('空态连 svg 都不画', findNodesByTag(trendEmptyNode, 'svg').length, 0)
check('只有 1 条记录同样走空态', findNodesByTag(findNodesByClass(
  renderTest.components.StatsPanel({ ...statsProps, records: [{ at: 1, wpm: 40, accuracy: 90 }] }),
  'qat-trend',
)[0], 'polyline').length, 0)

// —— N16：默写悬停显示答案（对齐上游 Word/index.tsx:140 getLetterVisible 的第一支） ——
check('不默写时答案恒放开', [
  answersRevealed({ dictation: 'none', answerOnHover: false, hovering: false }),
  answersRevealed({}),
  answersRevealed({ dictation: 'none', answerOnHover: true, hovering: true }),
].join(), 'true,true,true')
check('hideAll + 悬停 + 开关开 → 放开', answersRevealed({ dictation: 'hideAll', answerOnHover: true, hovering: true }), true)
check('hideAll + 悬停 + 开关关 → 仍遮', answersRevealed({ dictation: 'hideAll', answerOnHover: false, hovering: true }), false)
check('hideAll 不悬停 → 仍遮', answersRevealed({ dictation: 'hideAll', answerOnHover: true, hovering: false }), false)
check('遮罩被整体放开后一个字都不遮', maskLetters('cancel', 'hideAll', 0, true).some(Boolean), false)
check('未放开时照旧全遮', maskLetters('cancel', 'hideAll', 0, false).every(Boolean), true)

// —— N17：允许选中文本（对齐上游 Translation/index.tsx:32 的 select-text） ——
check('选择文本：开的真值', selectStyle(true), { 'data-selectable': 'true' })
check('选择文本：关的真值', selectStyle(false), { 'data-selectable': 'false' })
check('非布尔值一律当关', selectStyle('yes'), { 'data-selectable': 'false' })

/** 默写面板：字母的遮罩位（逐字母 data-mask 拼起来） */
const dictPanel = (extra) => renderTest.components.Trainer({
  words: ['cancel'], variant: 'panel', showMeta: true, dictation: 'hideAll', ctx: ctxStub, ...extra,
})
const maskOf = (tree) => findNodesByClass(tree, 'qat-letter').map((node) => node.props['data-mask']).join()
const hiddenAll = 'true,true,true,true,true,true'
const shownAll = 'false,false,false,false,false,false'

const dictBase = render('渲染：默写面板（不悬停）', () => dictPanel({}))
check('默写 + 不悬停：字母全部遮住', maskOf(dictBase), hiddenAll)
const dictWord = findNodeWithClass(dictBase, 'qat-word')
check('单词块绑了 onMouseEnter / onMouseLeave',
  [typeof dictWord?.props?.onMouseEnter, typeof dictWord?.props?.onMouseLeave].join(), 'function,function')
check('悬停回调可安全调用', (function () {
  try {
    dictWord.props.onMouseEnter()
    dictWord.props.onMouseLeave()
    return true
  } catch {
    return false
  }
})(), true)
check('鼠标压上去后同一位置字母全部现身', maskOf(render('渲染：默写面板（悬停）', () => dictPanel({ hovering: true }))), shownAll)
check('关掉开关后悬停也不放答案', (function () {
  renderTest.setSetting('answerOnHover', false)
  const masks = maskOf(dictPanel({ hovering: true }))
  renderTest.setSetting('answerOnHover', true)
  return masks
})(), hiddenAll)

renderTest.setOpen(true)
const barHover = (extra) => renderTest.components.ComposerTrainer({ useInput: () => '', inputActions: {}, ctx: ctxStub, ...extra })
const barBase = render('渲染：跟打条默写（不悬停）', () => barHover({}))
const barWord = findNodeWithClass(barBase, 'qat-word')
check('跟打条单词块也绑了 onMouseEnter', typeof barWord?.props?.onMouseEnter, 'function')
check('跟打条悬停后字母同样现身', maskOf(barHover({ hovering: true })), shownAll)

// —— 选择文本接线：单词区 + 释义区跟着开关走，样式表只用 user-select ——
check('面板默认单词不可选', findNodeWithClass(dictBase, 'qat-word')?.props?.['data-selectable'], 'false')
check('面板默认释义不可选', findNodeWithClass(dictBase, 'qat-gloss')?.props?.['data-selectable'], 'false')
check('打开后单词与释义都可选', (function () {
  renderTest.setSetting('textSelectable', true)
  const on = [
    findNodeWithClass(dictPanel({}), 'qat-word')?.props?.['data-selectable'],
    findNodeWithClass(dictPanel({}), 'qat-gloss')?.props?.['data-selectable'],
  ].join()
  renderTest.setSetting('textSelectable', false)
  return on
})(), 'true,true')
check('跟打条单词区跟着开关走', (function () {
  renderTest.setSetting('textSelectable', true)
  const on = findNodeWithClass(barHover({}), 'qat-wordblock')?.props?.['data-selectable']
  renderTest.setSetting('textSelectable', false)
  return [on, findNodeWithClass(barHover({}), 'qat-wordblock')?.props?.['data-selectable']].join()
})(), 'true,false')
const selectCss = collectCss(dictBase).join('')
const selectRules = '[data-selectable="false"]{user-select:none}[data-selectable="true"]{user-select:text}'
check('样式表有 user-select 两条规则（关掉不可选 / 打开可选）', selectRules.split('}').filter(Boolean).every((rule) => selectCss.includes(rule)), true)
check('user-select 规则里不写死颜色', /#fff|#000|:white|:black/.test(selectCss.slice(selectCss.indexOf('[data-selectable='), selectCss.indexOf('[data-selectable=') + 120)), false)

// —— 设置页两行新开关 ——
check('设置页有默写悬停提示开关', settingNode('answerOnHover')?.props?.['aria-checked'], 'true')
check('设置页有允许选中文本开关', settingNode('textSelectable')?.props?.['aria-checked'], 'false')
check('两行新设置的文案中英成对', ['settingAnswerOnHover', 'settingAnswerOnHoverHint', 'settingTextSelectable', 'settingTextSelectableHint']
  .filter((key) => !DICT.zh[key] || !DICT.en[key]).join(), '')

/* ================================================================== *
 * 章内乱序（N12，上游 Setting/AdvancedSetting.tsx + StartButton）
 * 中途 Restart（N19，上游 StartButton）
 * 默写 openBy=auto（N26，上游 ResultScreen + WordDictationSwitcher）
 * ================================================================== */

// —— shuffleWords：纯函数，可注入随机源 ——
const { shuffleWords, chapterWordList, nextDictation, applyDictation } = renderTest
/** 固定序列的随机源：同一串值 → 同一结果，用来断言「可复现」 */
const seqRandom = (values) => {
  let cursor = 0
  return () => values[cursor++ % values.length]
}
const WORDS_5 = ['alpha', 'bravo', 'charlie', 'delta', 'echo']
check('洗牌：同一串随机值 → 同一顺序（可复现）',
  shuffleWords(WORDS_5, seqRandom([0.1, 0.9, 0.4, 0.7])).join(','),
  shuffleWords(WORDS_5, seqRandom([0.1, 0.9, 0.4, 0.7])).join(','))
check('洗牌：换一串随机值 → 顺序变了（确实在洗）',
  shuffleWords(WORDS_5, seqRandom([0.1, 0.9, 0.4, 0.7])).join(',')
  !== shuffleWords(WORDS_5, seqRandom([0.9, 0.1, 0.8, 0.2])).join(','), true)
check('洗牌：不改传入数组', (function () {
  const source = WORDS_5.slice()
  shuffleWords(source, seqRandom([0.3, 0.6]))
  return source.join(',')
})(), WORDS_5.join(','))
check('洗牌：返回新数组', (function () {
  const source = WORDS_5.slice()
  return shuffleWords(source, seqRandom([0.3, 0.6])) !== source
})(), true)
check('洗牌：洗后集合与原来相等', shuffleWords(WORDS_5, seqRandom([0.2, 0.55, 0.31, 0.94])).slice().sort().join(','),
  WORDS_5.slice().sort().join(','))
check('洗牌：0 个词原样', shuffleWords([], seqRandom([0.5])), [])
check('洗牌：1 个词原样', shuffleWords(['solo'], seqRandom([0.5])), ['solo'])
check('洗牌：非数组当空处理', shuffleWords(null, seqRandom([0.5])), [])

// —— chapterWordList：只在「取新一批词」那一刻洗 ——
const chapterPool = Array.from({ length: 60 }, (_, index) => ({ w: `w${index}` }))
const plainChapter = chapterWordList(chapterPool, 0, 0, {})
const shuffledChapter = chapterWordList(chapterPool, 0, 0, { shuffle: true, random: seqRandom([0.42, 0.13, 0.77]) })
check('取新词：关乱序时保持章内原序', plainChapter.slice(0, 3).join(','), 'w0,w1,w2')
check('取新词：开乱序时长度不变', shuffledChapter.length, plainChapter.length)
check('取新词：开乱序后词集合不变', shuffledChapter.slice().sort().join(','), plainChapter.slice().sort().join(','))
check('取新词：开乱序后顺序变了', shuffledChapter.join(',') !== plainChapter.join(','), true)
check('取新词：round>0 取 20 个', chapterWordList(chapterPool, 0, 1, { shuffle: true }).length, 20)
check('取新词：空词库给空数组', chapterWordList([], 3, 1, { shuffle: true }), [])

// —— 渲染层守卫：同一章连续渲染两次，只洗一次（不然边打边变） ——
// 用带缓存的 useMemo 桩模拟「同一实例重渲染」，再数 vm 里 Math.random 的抽样次数
const memoSlots = new Map()
let memoCursor = 0
const memoReact = {
  ...reactForRender,
  useMemo: (fn, deps) => {
    const key = memoCursor
    memoCursor += 1
    const prev = memoSlots.get(key)
    if (prev && Array.isArray(deps) && deps.length === prev.deps.length
      && deps.every((value, index) => value === prev.deps[index])) return prev.value
    const value = fn()
    memoSlots.set(key, { deps: Array.isArray(deps) ? deps.slice() : [], value })
    return value
  },
}
const memoPlugin = factory((name) => {
  if (name === 'react') return memoReact
  throw new Error(`unexpected require: ${name}`)
})
const memoTest = memoPlugin.__test
const vmMath = vm.runInContext('Math', sandbox)
const realRandom = vmMath.random
const randomDraws = (fn) => {
  let draws = 0
  vmMath.random = () => {
    draws += 1
    return 0
  }
  try {
    const tree = fn()
    collectClasses(tree)
    gatherText(tree)
    return { tree, draws }
  } finally {
    vmMath.random = realRandom
  }
}
const firstWordOf = (tree) => {
  const word = findNodesByClass(tree, 'qat-word')[0]
  return word ? gatherText(word) : ''
}
memoCursor = 0
const shuffledOff = randomDraws(() => memoTest.components.PracticePanel({ ctx: ctxStub }))
check('渲染：乱序关着时一次都不抽样', shuffledOff.draws, 0)
memoTest.setSetting('shuffle', true)
memoSlots.clear()
memoCursor = 0
const shuffledFirst = randomDraws(() => memoTest.components.PracticePanel({ ctx: ctxStub }))
// 20 个词的 Fisher–Yates 正好抽 19 次：一次渲染只洗一遍
check('渲染：乱序开着时 20 词只洗一遍（19 次抽样）', shuffledFirst.draws, 19)
const firstOrder = firstWordOf(shuffledFirst.tree)
memoCursor = 0
const shuffledSecond = randomDraws(() => memoTest.components.PracticePanel({ ctx: ctxStub }))
check('渲染：同一章再渲染一次不再抽样', shuffledSecond.draws, 0)
check('渲染：同一章连续两次词序相同', firstWordOf(shuffledSecond.tree), firstOrder)
check('面板头部有重开按钮（data-act=restart）', findByAct(shuffledFirst.tree, 'restart') !== null, true)
check('面板有「默写本章节」入口（openBy=auto）', findByAct(shuffledFirst.tree, 'dictation-auto') !== null, true)
// 依赖表里必须有洗牌代次、且不许把 Math.random() 塞进去
check('洗牌代次进 useMemo 依赖', /\[all, chapter, round, settings\.shuffle, shuffleGen\]/.test(source), true)
check('useMemo 依赖里没有 Math.random',
  /useMemo\(\s*\(\) => chapterWordList[\s\S]{0,160}?\]\s*,?\s*\)/.test(source)
  && !/\[all, chapter, round, settings\.shuffle, shuffleGen[^\]]*Math\.random/.test(source), true)
memoTest.setSetting('shuffle', false)

// —— nextDictation：五条分支 ——
check('默写状态机：手动改形态 → openBy=user',
  nextDictation({ dictation: 'none', openBy: 'user' }, { type: 'user', value: 'hideAll' }),
  { dictation: 'hideAll', openBy: 'user' })
check('默写状态机：auto 入口 → openBy=auto',
  nextDictation({ dictation: 'none', openBy: 'user' }, { type: 'auto', value: 'hideVowel' }),
  { dictation: 'hideVowel', openBy: 'auto' })
check('默写状态机：换章时 auto 自动关掉并复位',
  nextDictation({ dictation: 'hideAll', openBy: 'auto' }, { type: 'chapter' }),
  { dictation: 'none', openBy: 'user' })
check('默写状态机：换章时 user 原样保留',
  nextDictation({ dictation: 'hideAll', openBy: 'user' }, { type: 'chapter' }),
  { dictation: 'hideAll', openBy: 'user' })
check('默写状态机：非法 action 原样返回',
  nextDictation({ dictation: 'hideAll', openBy: 'auto' }, { type: 'nope', value: 'hideAll' }),
  { dictation: 'hideAll', openBy: 'auto' })
check('默写状态机：非法形态原样返回',
  nextDictation({ dictation: 'hideAll', openBy: 'auto' }, { type: 'user', value: 'halfHide' }),
  { dictation: 'hideAll', openBy: 'auto' })
check('默写状态机：没有 action 也不炸',
  nextDictation({ dictation: 'hideVowel', openBy: 'auto' }, null), { dictation: 'hideVowel', openBy: 'auto' })
check('默写状态机：脏存档收敛成 none/user', nextDictation({ dictation: 'bogus', openBy: 'nope' }, {}),
  { dictation: 'none', openBy: 'user' })

// —— applyDictation：把状态机结果落到设置里（两个 key 一起写） ——
renderTest.setSetting('dictation', 'none')
renderTest.setSetting('dictationOpenBy', 'user')
check('设置落库：手动改形态记 user', (function () {
  applyDictation({ type: 'user', value: 'hideConsonant' })
  const live = renderTest.getSettings()
  return [live.dictation, live.dictationOpenBy].join(',')
})(), 'hideConsonant,user')
check('设置落库：「默写本章节」记 auto', (function () {
  applyDictation({ type: 'auto', value: 'hideAll' })
  const live = renderTest.getSettings()
  return [live.dictation, live.dictationOpenBy].join(',')
})(), 'hideAll,auto')
check('设置落库：换章把 auto 的那份关掉', (function () {
  applyDictation({ type: 'chapter' })
  const live = renderTest.getSettings()
  return [live.dictation, live.dictationOpenBy].join(',')
})(), 'none,user')
check('设置落库：换章不动 user 的那份', (function () {
  applyDictation({ type: 'user', value: 'hideVowel' })
  applyDictation({ type: 'chapter' })
  const live = renderTest.getSettings()
  return [live.dictation, live.dictationOpenBy].join(',')
})(), 'hideVowel,user')
check('默写来源默认 user', SETTING_DEFAULTS.dictationOpenBy, 'user')

// —— 中途 Restart：卡片按钮真的把 index/错词/计时归零 ——
const restartUpdates = []
const recordReact = {
  ...reactForRender,
  useState: (value) => {
    const initial = typeof value === 'function' ? value() : value
    // 卡片初始态改成「已经打到第 2 个词、已经错了几次」
    if (initial && typeof initial === 'object' && 'index' in initial) {
      return [{ ...initial, index: 1, typed: 'c', hits: 3, retries: 1 }, (next) => restartUpdates.push(next)]
    }
    return [initial, (next) => restartUpdates.push(next)]
  },
}
const recordPlugin = factory((name) => {
  if (name === 'react') return recordReact
  throw new Error(`unexpected require: ${name}`)
})
const restartCase = render('渲染：卡片的中间重开', () => recordPlugin.__test.components.Trainer({
  words: ['cancel', 'govern', 'arrow'],
  variant: 'panel',
  showMeta: true,
  dictId: 'cet4',
  chapter: 0,
  chapterTotal: 3,
  onReview: () => {},
  onRetryWrong: () => {},
  onNextChapter: () => {},
  ctx: ctxStub,
}))
const restartNode = findByAct(restartCase, 'restart')
check('卡片有 data-act=restart 的重开按钮', Boolean(restartNode), true)
restartNode?.props?.onClick?.()
const resetCall = restartUpdates.find((value) => value && typeof value === 'object' && value.index === 0)
check('重开：index 归 0', resetCall?.index, 0)
check('重开：半截输入清空', resetCall?.typed, '')
check('重开：hits/retries/wrongCount 归零', [resetCall?.hits, resetCall?.retries, resetCall?.wordWrong].join(','), '0,0,0')
check('重开：本轮 mistakes 清空',
  restartUpdates.some((value) => Array.isArray(value) && value.length === 0), true)
check('重开：不弹确认、不调 submit / 不发消息',
  /const restart = useCallback[\s\S]{0,900}?\}, \[onLiveWpm\]\)/.test(source)
  && !/const restartChapter[\s\S]{0,300}?submit\(/.test(source), true)
renderTest.setSetting('dictation', 'none')
renderTest.setSetting('dictationOpenBy', 'user')
renderTest.setSetting('shuffle', false)


/* ================================================================== */
/* N3 快捷键补齐 / N18 按住 Tab 偷看 / N4 上一个·下一个词预览           */
/* ================================================================== */

// —— resolveHotkey 全表：旧动作一条都不删，新动作只是多出来的档 ——
const hk2 = (over) => resolveHotkey({ key: 'a', meta: false, ctrl: false, alt: false, shift: false, ...over })
check('N3 Enter → 开始/暂停', hk2({ key: 'Enter' }), 'toggle')
check('N3 回车在输入框里也生效（无修饰键就接管）', hk2({ key: 'Enter', shift: false }), 'toggle')
check('N3 Cmd+Enter 不接管（宿主的换行/发送）', hk2({ key: 'Enter', meta: true }), '')
check('N3 Shift+Enter 不接管', hk2({ key: 'Enter', shift: true }), '')
check('N3 输入法组合中的回车不拦', hk2({ key: 'Enter', composing: true }), '')
check('N3 Ctrl+V → 开关默写', hk2({ key: 'v', ctrl: true }), 'dictate')
check('N3 Cmd+V → 开关默写', hk2({ key: 'V', meta: true }), 'dictate')
check('N3 Cmd+Shift+V → 换下一档默写', hk2({ key: 'v', meta: true, shift: true }), 'dictate-mode')
check('N3 Cmd+Shift+← → 上一个词', hk2({ key: 'ArrowLeft', meta: true, shift: true }), 'prev-word')
check('N3 Ctrl+Shift+← → 上一个词（Windows）', hk2({ key: 'ArrowLeft', ctrl: true, shift: true }), 'prev-word')
check('N3 Cmd+Shift+→ → 下一个词', hk2({ key: 'ArrowRight', meta: true, shift: true }), 'next-word')
check('N3 Ctrl+Shift+→ → 下一个词（Windows）', hk2({ key: 'ArrowRight', ctrl: true, shift: true }), 'next-word')
check('N3 Ctrl+← 仍是旧行为 prev（不带 shift）', hk2({ key: 'ArrowLeft', ctrl: true }), 'prev')
check('N3 Ctrl+→ 仍是旧行为 skip（不带 shift）', hk2({ key: 'ArrowRight', ctrl: true }), 'skip')
check('N3 裸 ←/→ 不接管（留给输入框）', [hk2({ key: 'ArrowLeft' }), hk2({ key: 'ArrowRight' })].join('|'), '|')
check('N3 Alt 组合一律不接管（⌘⌥Q 恐慌键不受影响）',
  [hk2({ key: 'Enter', alt: true }), hk2({ key: 'v', meta: true, alt: true }),
    hk2({ key: 'ArrowLeft', meta: true, shift: true, alt: true }), hk2({ key: 'Tab', alt: true }),
    hk2({ key: 'Escape', alt: true }), hk2({ key: 'j', ctrl: true, alt: true })].join('|'), '|||||')
check('N3 Esc / J / P 旧动作没被挤掉',
  [hk2({ key: 'Escape' }), hk2({ key: 'Escape', ctrl: true }), hk2({ key: 'j', meta: true }),
    hk2({ key: 'p', ctrl: true }), hk2({ key: 'P', meta: true, shift: true })].join('|'),
  'close||loop|pause|')
check('N3 空键 / null 输入返回空串', [resolveHotkey(null), resolveHotkey({}), resolveHotkey({ key: '' })].join('|'), '||')

// —— N18 Tab：resolveHotkey 认得它，但绝不和动作表里的任何一项混 ——
const PEEK_ACTIONS = ['close', 'prev', 'skip', 'prev-word', 'next-word', 'loop', 'pause', 'toggle', 'dictate', 'dictate-mode']
check('N18 Tab → peek（keydown 通道）', hk2({ key: 'Tab' }), 'peek')
check('N18 Cmd+Tab 不接管（系统切窗）', hk2({ key: 'Tab', meta: true }), '')
check('N18 Tab 不被误判成其它动作', PEEK_ACTIONS.includes(hk2({ key: 'Tab' })), false)
check('N18 peekKey 三态', [peekKey('down'), peekKey('up'), peekKey('')].join('|'), 'peek-on|peek-off|')
check('N18 peekKey 未知阶段给空串', [peekKey('press'), peekKey(undefined), peekKey(null)].join('|'), '||')
check('N18 源码里 keyup 也有偷看通道（不是只有 keydown）',
  /addEventListener\('keyup', onKey/.test(source) && /peekKey\('up'\)/.test(source), true)
check('N18 切窗（blur）会复位偷看态', /addEventListener\('blur', off\)/.test(source) && /addEventListener\('blur', onBlur\)/.test(source), true)

// —— N3 跳词复用同一套实现 ——
check('N3 跳词归一到同一套实现', [hotkeyAction('prev-word'), hotkeyAction('next-word')].join(','), 'prev,skip')
check('N3 其它动作原样透传',
  PEEK_ACTIONS.filter((act) => act !== 'prev-word' && act !== 'next-word').map(hotkeyAction).join(','),
  'close,prev,skip,loop,pause,toggle,dictate,dictate-mode')
check('N3 动作分发里一次 submit( 都没有（不碰 composer 内容）',
  source.split('hotkeyAction(resolveHotkey(').slice(1).every((tail) => !/submit\(/.test(tail.slice(0, 1400))), true)

// —— N3 默写两档 ——
check('N3 Ctrl+V：没默写 → 全遮', toggleDictationMode('none'), 'hideAll')
check('N3 Ctrl+V：已在默写 → 关掉',
  [toggleDictationMode('hideAll'), toggleDictationMode('hideVowel'), toggleDictationMode('randomHide')].join(','),
  'none,none,none')
check('N3 Ctrl+V：脏档位当没默写', [toggleDictationMode('nope'), toggleDictationMode(undefined)].join(','), 'hideAll,hideAll')
check('N3 Ctrl+Shift+V：循环换下一档',
  DICTATION_MODES.map(nextDictationMode).join(','), 'hideAll,hideVowel,hideConsonant,randomHide,none')
check('N3 Ctrl+Shift+V：末尾回 none',
  nextDictationMode(DICTATION_MODES[DICTATION_MODES.length - 1]), 'none')
check('N3 Ctrl+Shift+V：脏档位从头来', nextDictationMode('nope'), 'none')
check('N3 默写动作走 applyDictation（openBy 记 user）', (function () {
  renderTest.setSetting('dictation', 'none')
  renderTest.setSetting('dictationOpenBy', 'user')
  const next = renderTest.applyDictation({ type: 'user', value: toggleDictationMode('none') })
  renderTest.setSetting('dictation', 'none')
  return next
})(), { dictation: 'hideAll', openBy: 'user' })

// —— N4 neighborWords ——
const nb = ['alpha', 'bravo', 'charlie']
check('N4 中间词：前后都有', neighborWords(nb, 1), { prev: 'alpha', next: 'charlie' })
check('N4 第一个词：没有上一个', neighborWords(nb, 0), { prev: '', next: 'bravo' })
check('N4 最后一个词：没有下一个', neighborWords(nb, 2), { prev: 'bravo', next: '' })
check('N4 只有一个词：两边都空', neighborWords(['only'], 0), { prev: '', next: '' })
check('N4 非数组 / 空数组给两个空串',
  [neighborWords(null, 0), neighborWords(undefined, 0), neighborWords('abc', 0), neighborWords([], 0)]
    .every((item) => item.prev === '' && item.next === ''), true)
check('N4 越界索引也给两个空串',
  [neighborWords(nb, 5), neighborWords(nb, -1), neighborWords(nb, 1.5)]
    .every((item) => item.prev === '' && item.next === ''), true)
check('N4 默认关（上游 isShowPrevAndNextWordAtom 也是关）', SETTING_DEFAULTS.showNeighbors, false)
check('N4 中英都有设置文案',
  ['settingNeighbors', 'settingNeighborsHint'].every((key) => DICT.zh[key] && DICT.en[key]), true)
check('N4 设置页有 showNeighbors 开关', settingNode('showNeighbors')?.props?.['data-setting'], 'showNeighbors')
check('N4 开关是 role=switch 的控件', settingNode('showNeighbors')?.props?.role, 'switch')

// —— N18 answersRevealed：偷看优先级最高 ——
check('N18 偷看优先于 hover 开关',
  [answersRevealed({ dictation: 'hideAll', answerOnHover: false, hovering: false, peeking: true }),
    answersRevealed({ dictation: 'hideAll', answerOnHover: false, hovering: false, peeking: false })].join(','),
  'true,false')

// —— N4 渲染：开 → 出现 .qat-neighbors；关 → 不出现；边界不画空的 ——
const findNeighbors = (node) => (function walk(item) {
  if (!item || typeof item !== 'object') return null
  if (Array.isArray(item)) {
    for (const child of item) {
      const hit = walk(child)
      if (hit) return hit
    }
    return null
  }
  if (typeof item.props?.className === 'string' && item.props.className.split(/\s+/).includes('qat-neighbors')) return item
  if (typeof item.type === 'function') return walk(item.type(item.props ?? {}))
  return walk(item.children) ?? walk(item.props?.children)
})(node)
const findMasked = (node) => (function walk(item) {
  if (!item || typeof item !== 'object') return null
  if (Array.isArray(item)) {
    for (const child of item) {
      const hit = walk(child)
      if (hit) return hit
    }
    return null
  }
  if (Array.isArray(item.props?.masked)) return item.props.masked
  if (typeof item.type === 'function') return walk(item.type(item.props ?? {}))
  return walk(item.children) ?? walk(item.props?.children)
})(node)

renderTest.setSetting('showNeighbors', false)
const nbOff = renderTest.components.Trainer({ words: nb, variant: 'panel', showMeta: true, ctx: ctxStub })
check('N4 设置关着：不画 .qat-neighbors', countClass(nbOff, 'qat-neighbors'), 0)

renderTest.setSetting('showNeighbors', true)
const nbOn = renderTest.components.Trainer({ words: nb, variant: 'panel', showMeta: true, ctx: ctxStub })
check('N4 设置开着：出现 .qat-neighbors', countClass(nbOn, 'qat-neighbors'), 1)
check('N4 第一个词只给下一个（没有上一个）',
  [gatherText(findNeighbors(nbOn)).includes('bravo'), gatherText(findNeighbors(nbOn)).includes('<')].join(','),
  'true,false')
const nbSingle = renderTest.components.Trainer({ words: ['only'], variant: 'panel', showMeta: true, ctx: ctxStub })
check('N4 只有一个词：不画空气泡', countClass(nbSingle, 'qat-neighbors'), 0)

// 中间词（条里接着上次的进度）：两边都有，条上一律不带箭头字符
const nbBarDict = renderTest.readDictId()
const nbBarWords = renderTest.toWordList(renderTest.wordsSync(nbBarDict))
renderTest.writeBarProgress(nbBarDict, 1)
renderTest.setSetting('dictation', 'none')
renderTest.setOpen(true)
const nbBar = renderTest.components.ComposerTrainer({ useInput: () => '', inputActions: {}, ctx: ctxStub })
check('N4 跟打条也画 .qat-neighbors', countClass(nbBar, 'qat-neighbors'), 1)
check('N4 跟打条两个词都在、都不带箭头',
  [gatherText(findNeighbors(nbBar)).includes(nbBarWords[0]),
    gatherText(findNeighbors(nbBar)).includes(nbBarWords[2]),
    /[<>]/.test(gatherText(findNeighbors(nbBar)))].join(','),
  'true,true,false')
check('N4 跟打条预览用 · 分隔', gatherText(findNeighbors(nbBar)).includes('·'), true)
renderTest.setSetting('showNeighbors', false)
renderTest.setOpen(false)

// —— N18 渲染：hideAll 下偷看 → 字母全显 + 中文照给（即便 showZh:false） ——
renderTest.setSetting('showZh', false)
const peekOff = renderTest.components.Trainer({
  words: ['cancel'], variant: 'panel', showMeta: true, dictation: 'hideAll', ctx: ctxStub,
})
const peekOn = renderTest.components.Trainer({
  words: ['cancel'], variant: 'panel', showMeta: true, dictation: 'hideAll', peeking: true, ctx: ctxStub,
})
check('N18 不偷看：hideAll 字母全遮', findMasked(peekOff).join(','), 'true,true,true,true,true,true')
check('N18 偷看：字母全显', findMasked(peekOn).every((item) => item === false), true)
check('N18 偷看：无视 showZh 也给中文', countClass(peekOn, 'qat-gloss-zh'), 1)
check('N18 松手复原：中文照设置关掉', countClass(peekOff, 'qat-gloss-zh'), 0)
check('N18 偷看不改计数/判定（typed 仍是空、无 flash）',
  [findMasked(peekOn).length === findMasked(peekOff).length,
    /setPeeking\(true\)/.test(source)].join(','), 'true,true')
renderTest.setSetting('showZh', true)
renderTest.setSetting('dictation', 'none')

check('N4 样式表有 .qat-neighbors（灰色小字，不可点）',
  /\.qat-neighbors\{/.test(renderTest.CSS) && /pointer-events:none/.test(renderTest.CSS), true)

await recordFlow

// —— N24：发音预取（对齐上游 usePrefetchPronunciationSound） ——
check('预取开关默认开着', renderTest.PREFETCH_ENABLED, true)
check('预取：取下一个词', renderTest.nextWordToPrefetch(['a', 'b', 'c'], 0), 'b')
check('预取：最后一个词之后没有下一个', renderTest.nextWordToPrefetch(['a', 'b'], 1), '')
check('预取：越界给空串', renderTest.nextWordToPrefetch(['a'], 9), '')
check('预取：空数组给空串', renderTest.nextWordToPrefetch([], 0), '')
check('预取：词条对象也吃', renderTest.nextWordToPrefetch([{ w: 'cancel' }, { w: 'govern' }], 0), 'govern')
check('预取：非数组不炸', renderTest.nextWordToPrefetch(null, 0), '')
check('预取：首尾空白剃掉', renderTest.nextWordToPrefetch(['a', '  govern  '], 0), 'govern')
check('voice 关着不预取', renderTest.shouldPrefetch({ voice: false, word: 'cancel', dictation: 'none' }), false)
check('下一个词是空的不预取', renderTest.shouldPrefetch({ voice: true, word: '   ', dictation: 'none' }), false)
check('没有下一个词不预取', renderTest.shouldPrefetch({ voice: true, word: '', dictation: 'hideAll' }), false)
check('正常预取', renderTest.shouldPrefetch({ voice: true, word: 'cancel', dictation: 'none' }), true)
check('默写 hideAll 照样预取（预取的是声音，不是答案）',
  renderTest.shouldPrefetch({ voice: true, word: 'cancel', dictation: 'hideAll' }), true)

// —— N21：错词胶囊的键盘语义 ——
check('胶囊键盘：Enter 读一遍', renderTest.pillActKey('Enter'), 'speak')
check('胶囊键盘：空格读一遍', renderTest.pillActKey(' '), 'speak')
check('胶囊键盘：老浏览器的 Spacebar 也认', renderTest.pillActKey('Spacebar'), 'speak')
check('胶囊键盘：小写 enter 也认', renderTest.pillActKey('enter'), 'speak')
check('胶囊键盘：其它键不动', renderTest.pillActKey('a'), '')
check('胶囊键盘：没键值也不炸', renderTest.pillActKey(undefined), '')

// —— N22：退出复习只清 review ——
check('退出复习把 review 置空', renderTest.reviewExit(['cancel', 'govern']), null)
check('退出复习没有参数也置空', renderTest.reviewExit(), null)

// —— N20：词表行尾的发音小按钮 ——
const wlSpoke = []
let wlPicked = 0
const wlSpeakCase = render('渲染：词表行尾发音按钮', () => renderTest.components.WordListPanel({
  t: (key, vars) => (vars && vars.n !== undefined ? `${key}:${vars.n}` : key),
  rows: renderTest.wordListRows({ words: ['cancel', 'govern'], index: 0 }),
  hint: '',
  onPick: () => { wlPicked += 1 },
  onSpeak: (row) => wlSpoke.push(row.word),
  onClose: () => {},
}))
const wlSpeakNode = findByAct(wlSpeakCase, 'wordlist-speak')
check('词表每行都有发音按钮', nodesByClass(wlSpeakCase, 'qat-wordlist-speak').length, 2)
check('发音按钮和行是同级兄弟（不嵌套 button）', (function () {
  const rows = nodesByClass(wlSpeakCase, 'qat-wordlist-row').length
  const wraps = nodesByClass(wlSpeakCase, 'qat-wordlist-item').length
  return [rows, wraps].join(',')
})(), '2,2')
check('发音按钮吞掉 mousedown（不把焦点从隐形输入框抢走）', (function () {
  let prevented = false
  wlSpeakNode?.props?.onMouseDown?.({ preventDefault: () => { prevented = true } })
  return prevented
})(), true)
let wlStopped = ''
wlSpeakNode?.props?.onClick?.({ preventDefault: () => {}, stopPropagation: () => { wlStopped = 'yes' } })
check('点发音只读这个词', wlSpoke, ['cancel'])
check('点发音不跳行（onPick 没被调用）', wlPicked, 0)
check('点发音顺手拦住冒泡', wlStopped, 'yes')
const wlNoSpeak = render('渲染：词表抽屉（不传 onSpeak）', () => renderTest.components.WordListPanel({
  t: (key) => key,
  rows: renderTest.wordListRows({ words: ['cancel'] }),
  onPick: () => {},
  onClose: () => {},
}))
check('不传 onSpeak 就不画发音按钮', findByAct(wlNoSpeak, 'wordlist-speak'), null)

// —— N21：错词胶囊可点发音（保留 span 形态，不跳转、不关结算页） ——
const pillNode = findByAct(resultScreen, 'pill-speak')
check('错词胶囊带 data-act=pill-speak', Boolean(pillNode), true)
check('胶囊还是一个 span（要留在 flex 里）', pillNode?.type, 'span')
check('胶囊可聚焦、角色是按钮', [pillNode?.props?.role, pillNode?.props?.tabIndex].join(','), 'button,0')
const pillAudios = []
sandbox.window.Audio = function (src) {
  pillAudios.push(src)
  this.play = () => Promise.resolve()
  this.pause = () => {}
}
renderTest.setSetting('voice', true)
const retriedBefore = retriedWords.length
pillNode?.props?.onClick?.({ preventDefault: () => {} })
check('点胶囊读这个词', pillAudios.length, 1)
check('胶囊读的是这个词的 MP3', String(pillAudios[0]).includes(encodeURIComponent('cancel')), true)
check('点胶囊不跳转、不重练、不关结算页', retriedWords.length - retriedBefore, 0)
let pillKeyPrevented = false
pillNode?.props?.onKeyDown?.({ key: 'Enter', preventDefault: () => { pillKeyPrevented = true } })
check('胶囊 Enter 也读（并 preventDefault）', [pillAudios.length, pillKeyPrevented], [2, true])
pillNode?.props?.onKeyDown?.({ key: 'a', preventDefault: () => { pillKeyPrevented = 'nope' } })
check('胶囊其它键不读', pillAudios.length, 2)
renderTest.setSetting('voice', false)
pillNode?.props?.onClick?.({ preventDefault: () => {} })
check('voice 关着点胶囊什么都不做', pillAudios.length, 2)
renderTest.setSetting('voice', true)
delete sandbox.window.Audio

// —— N22：复习卡片上的明确出口 ——
const exitCalls = []
const reviewCard = render('渲染：复习中的卡片（带出口）', () => renderTest.components.Trainer({
  words: ['cancel', 'govern'],
  variant: 'panel',
  showMeta: true,
  headTag: 'panelHeadReview:2',
  onExitReview: () => exitCalls.push('exit'),
  onReview: () => {},
  ctx: ctxStub,
}))
const exitNode = findByAct(reviewCard, 'review-exit')
check('复习卡片有出口按钮', Boolean(exitNode), true)
check('出口按钮用 reviewExit 文案', gatherText(reviewCard).includes('reviewExit'), true)
exitNode?.props?.onClick?.()
check('点出口只回调一次', exitCalls, ['exit'])
check('普通卡片没有复习出口', findByAct(trainer, 'review-exit'), null)
check('面板把出口接到 reviewExit（清 review、不打结算、不 submit）',
  /onExitReview: \(\) => setReview\(reviewExit\(review\)\)/.test(source), true)

// 新入口在样式表里得有规则，不然按钮是裸的
check('新入口在样式表里有规则', [
  '\\.qat-wordlist-item\\{', '\\.qat-wordlist-speak\\{', '\\.qat-review-exit\\{',
].every((re) => new RegExp(re).test(source)), true)

if (failures > 0) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log(`\nALL PASS — ${passed} 条`)
