/**
 * Client half of the Qwerty 跟打 UI.
 *
 * 三个入口，都落在对话界面上：
 *  1) 侧栏底部一个「跟打」按钮（sidebar.footer.action）—— 开关跟打卡片；
 *  2) 打开后卡片长在输入框正上方（conversation.input.dock），单词就在对话列里，打对变绿、打错整词重打；
 *  3) `/qwerty-autotype` 指令行也渲染同一张卡片（conversation.chat.commandview，key = 指令名）。
 *
 * 三种入口共用同一个卡片组件，判定逻辑只有一份。
 */
window.__ModuleLoader__.load({
  id: '@local/qwerty-autotype-ui',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const {
      useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore,
    } = React

    const NS = 'qwerty-autotype'
    const COMMAND = 'qwerty-autotype'

    /**
     * 图标：path data 全部取自上游 qwerty-learner 用的同一套 iconify 图标
     * （tabler / heroicons / ic / bxs），内联进来，不依赖图标库、不用 base64 图片。
     */
    const ICONS = {
      prev: { filled: false, d: ['M5 12h14M5 12l4 4m-4-4l4-4'] },
      next: { filled: false, d: ['M5 12h14m-4 4l4-4m-4-4l4 4'] },
      loop: { filled: false, d: ['M4 12V9a3 3 0 0 1 3-3h13m-3-3l3 3l-3 3m3 3v3a3 3 0 0 1-3 3H4m3 3l-3-3l3-3'] },
      loopOff: { filled: false, d: ['M4 12V9a3 3 0 0 1 2.08-2.856M10 6h10m-3-3l3 3l-3 3m3 3v3a3 3 0 0 1-.133.886m-1.99 1.984A3 3 0 0 1 17 18H4m3 3l-3-3l3-3M3 3l18 18'] },
      check: { filled: false, d: ['m5 12l5 5L20 7'] },
      close: { filled: false, d: ['M18 6L6 18M6 6l12 12'] },
      list: { filled: false, d: ['M9 6h11M9 12h11M9 18h11M5 6v.01M5 12v.01M5 18v.01'] },
      lang: { filled: false, d: ['M9 6.371C9 10.789 6.761 13 4 13m0-6.629h7', 'M5 9c0 2.144 2.252 3.908 6 4m1 7l4-9l4 9m-.9-2h-6.2M6.694 3l.793.582'] },
      langOff: { filled: false, d: ['m12 20l2.463-5.541m1.228-2.764L16 11l.8 1.8M18 18h-5.1M8.747 8.748C8.087 11.582 6.211 13 4 13m0-6.629h2.371', 'M5 9c0 2.144 2.252 3.908 6 4M3 3l18 18'] },
      caret: { filled: false, d: ['m6 9l6 6l6-6'] },
      stats: { filled: false, d: ['M3 3v18h18m-1-3v3m-4-5v5m-4-8v8m-4-5v5', 'M3 11c6 0 5-5 9-5s3 5 9 5'] },
      gear: { filled: false, d: ['M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37c1 .608 2.296.07 2.572-1.065', 'M9 12a3 3 0 1 0 6 0a3 3 0 0 0-6 0'] },
      download: { filled: false, d: ['M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 11l5 5l5-5m-5-7v12'] },
      again: { filled: false, d: ['M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4m-4 4a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4'] },
      play: { filled: false, d: ['M7 4v16l13-8z'] },
      pause: { filled: false, d: ['M6 6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zm8 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1z'] },
      speak: { filled: true, d: ['M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.8 9.8 0 0 0 1.5 12c0 .898.121 1.768.35 2.595c.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06zm5.084 1.046a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06a8.25 8.25 0 0 0 0-11.668a.75.75 0 0 1 0-1.06', 'M15.932 7.757a.75.75 0 0 1 1.061 0a6 6 0 0 1 0 8.486a.75.75 0 0 1-1.06-1.061a4.5 4.5 0 0 0 0-6.364a.75.75 0 0 1 0-1.06'] },
      eye: { filled: true, d: ['M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6', 'M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69c.12.362.12.752 0 1.113c-1.487 4.471-5.705 7.697-10.677 7.697c-4.97 0-9.186-3.223-10.675-7.69a1.76 1.76 0 0 1 0-1.113M17.25 12a5.25 5.25 0 1 1-10.5 0a5.25 5.25 0 0 1 10.5 0'] },
      eyeOff: { filled: true, d: ['M3.53 2.47a.75.75 0 0 0-1.06 1.06l18 18a.75.75 0 1 0 1.06-1.06zm19.146 10.083a11.25 11.25 0 0 1-2.631 4.31l-3.099-3.099a5.25 5.25 0 0 0-6.71-6.71L7.759 4.577a11.2 11.2 0 0 1 4.242-.827c4.97 0 9.185 3.223 10.675 7.69c.12.362.12.752 0 1.113', 'M15.75 12q0 .27-.037.53l-4.244-4.243q.26-.037.531-.037A3.75 3.75 0 0 1 15.75 12m-3.22 3.713l-4.243-4.244q-.037.26-.037.531a3.75 3.75 0 0 0 4.28 3.713', 'M6.75 12c0-.619.107-1.213.304-1.764l-3.1-3.1a11.25 11.25 0 0 0-2.63 4.31c-.12.362-.12.752 0 1.114c1.489 4.467 5.704 7.69 10.675 7.69c1.5 0 2.933-.294 4.242-.827l-2.477-2.477A5.25 5.25 0 0 1 6.75 12'] },
      keyboard: { filled: true, d: ['M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m-9 3h2v2h-2zm0 3h2v2h-2zM8 8h2v2H8zm0 3h2v2H8zm-1 2H5v-2h2zm0-3H5V8h2zm8 7H9c-.55 0-1-.45-1-1s.45-1 1-1h6c.55 0 1 .45 1 1s-.45 1-1 1m1-4h-2v-2h2zm0-3h-2V8h2zm3 3h-2v-2h2zm0-3h-2V8h2z'] },
      book: { filled: true, d: ['M6.012 18H21V4a2 2 0 0 0-2-2H6c-1.206 0-3 .799-3 3v14c0 2.201 1.794 3 3 3h15v-2H6.012C5.55 19.988 5 19.805 5 19s.55-.988 1.012-1M8 6h9v2H8z'] },
      help: { filled: false, d: ['M9.5 9a2.5 2.5 0 114 2c-.9.7-1.5 1.2-1.5 2.3M12 17h.01'] },
    }

    /** 侧栏面板图标：上游那套键盘图标（ic:round-keyboard），实心，跟着 currentColor 走 */
    const GLYPH = ICONS.keyboard

    /** 画一个图标：实心图标用 fill，线性图标用 stroke；尺寸默认 14 */
    function Icon({ name, size = 14, strokeWidth = 1.7 }) {
      const icon = ICONS[name]
      if (!icon) return null
      const common = {
        className: `qat-svg qat-svg-${name}`,
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        'aria-hidden': 'true',
        focusable: 'false',
      }
      const paint = icon.filled
        ? { fill: 'currentColor', stroke: 'none' }
        : {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': strokeWidth,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }
      const children = icon.d.map((d, index) => h('path', { key: index, d, ...paint }))
      return h('svg', { ...common, ...paint }, ...children)
    }

    /** 侧栏图标：键盘（上游 ic:round-keyboard），内联 SVG，不依赖 CSS 或图片 */

    /** 水墨图标在 CSS mask 里的写法（用 background-color 上色，深浅主题都跟 currentColor 走） */

    /** 词表：单词 + 音标 + 中文（跟打条显示音标，输入框里显示中文） */
    const LEXICON = [
      { word: 'cancel', ipa: '/ˈkænsəl/', zh: '取消，撤销' },
      { word: 'explosive', ipa: '/ɪkˈspləʊsɪv/', zh: '爆炸性的；炸药' },
      { word: 'numerous', ipa: '/ˈnjuːmərəs/', zh: '众多的' },
      { word: 'govern', ipa: '/ˈɡʌvn/', zh: '统治，管理' },
      { word: 'decline', ipa: '/dɪˈklaɪn/', zh: '下降；婉拒' },
      { word: 'harvest', ipa: '/ˈhɑːvɪst/', zh: '收获，收成' },
      { word: 'mixture', ipa: '/ˈmɪkstʃə/', zh: '混合物' },
      { word: 'obstacle', ipa: '/ˈɒbstəkl/', zh: '障碍，妨碍' },
      { word: 'pioneer', ipa: '/ˌpaɪəˈnɪə/', zh: '先驱，开拓者' },
      { word: 'quantity', ipa: '/ˈkwɒntəti/', zh: '数量' },
      { word: 'remark', ipa: '/rɪˈmɑːk/', zh: '评论，谈到' },
      { word: 'splendid', ipa: '/ˈsplendɪd/', zh: '壮丽的，极好的' },
      { word: 'tender', ipa: '/ˈtendə/', zh: '温柔的；嫩的' },
      { word: 'ultimate', ipa: '/ˈʌltɪmət/', zh: '最终的，根本的' },
      { word: 'vessel', ipa: '/ˈvesl/', zh: '容器；船只' },
      { word: 'willing', ipa: '/ˈwɪlɪŋ/', zh: '愿意的' },
      { word: 'absorb', ipa: '/əbˈzɔːb/', zh: '吸收；使专心' },
      { word: 'boundary', ipa: '/ˈbaʊndri/', zh: '边界，分界' },
      { word: 'capacity', ipa: '/kəˈpæsəti/', zh: '容量；能力' },
      { word: 'delicate', ipa: '/ˈdelɪkət/', zh: '精致的；脆弱的' },
      { word: 'emphasis', ipa: '/ˈemfəsɪs/', zh: '强调，重点' },
      { word: 'flexible', ipa: '/ˈfleksəbl/', zh: '灵活的，可弯曲的' },
      { word: 'gradual', ipa: '/ˈɡrædʒuəl/', zh: '逐渐的，渐进的' },
      { word: 'humble', ipa: '/ˈhʌmbl/', zh: '谦逊的，卑微的' },
    ]

    /** 词库数据：scripts/build-dicts.mjs 从 qwerty-learner 生成后内联 */
    const DICT_DATA = {"source":"qwerty-learner","generatedAt":"2026-11-24","dicts":[{"id":"cet4","name":"CET-4","category":"大学英语","words":[{"w":"cancel","ipa":"/ˈkænsl/","zh":"取消，撤销；删去"},{"w":"apparent","ipa":"/əˈpærənt/","zh":"表面上的，明显的"},{"w":"union","ipa":"/ˈjuːnɪən/","zh":"工会，联盟；联合，团结；一致"},{"w":"murder","ipa":"/ˈmɜːdə/","zh":"谋杀，凶杀；谋杀罪；谋杀；杀害"},{"w":"airline","ipa":"/ˈeəlaɪn/","zh":"航空公司；航线"},{"w":"entire","ipa":"/ɪnˈtaɪə/","zh":"全部的，整个的"},{"w":"pine","ipa":"/paɪn/","zh":"消瘦，衰弱；痛苦，悲哀；渴望；松树，松木"},{"w":"arrow","ipa":"/ˈærəu/","zh":"箭，箭状物；箭头符号"},{"w":"basis","ipa":"/ˈbeɪsɪs/","zh":"基础，根据；原则"},{"w":"victim","ipa":"/ˈvɪktɪm/","zh":"牺牲者，受害者"},{"w":"confidential","ipa":"/ˌkɒnfɪˈdenʃl/","zh":"秘密的，机密的；亲信的"},{"w":"accident","ipa":"/ˈæksɪdənt/","zh":"意外，事故"},{"w":"tragedy","ipa":"/ˈtrædʒədi/","zh":"悲剧，惨事，惨案；悲剧艺术"},{"w":"ultimate","ipa":"/ˈʌltɪmət/","zh":"最后的，最终的；终极，顶点"},{"w":"purchase","ipa":"/ˈpɜːtʃəs/","zh":"买，购买；购买；购买的物品"},{"w":"supreme","ipa":"/suːˈpriːm/","zh":"最高的，最大的；极度的，最重要的"},{"w":"survive","ipa":"/səˈvaɪv/","zh":"活下来，幸存；从…逃出，幸免于；从中挺过来；比…活得长"},{"w":"potential","ipa":"/pəˈtenʃl/","zh":"潜在的，可能的；潜力，潜能"},{"w":"elsewhere","ipa":"/ˌelsˈweə/","zh":"在别处，向别处"},{"w":"innocent","ipa":"/ˈɪnəsnt/","zh":"清白的；幼稚的；没有恶意的"},{"w":"route","ipa":"/ruːt/","zh":"路线，路程"},{"w":"chip","ipa":"/tʃɪp/","zh":"屑片，碎片；炸土豆条；集成电路片，集成块；缺口，瑕疵"},{"w":"vanish","ipa":"/ˈvænɪʃ/","zh":"突然不见，消失；不复存在，绝迹"},{"w":"session","ipa":"/ˈseʃn/","zh":"会议，一届会期；集会"},{"w":"interpret","ipa":"/ɪnˈtɜːprɪt/","zh":"解释，说明；口译"},{"w":"statue","ipa":"/ˈstætʃuː/","zh":"塑像，雕像，铸像"},{"w":"mat","ipa":"/mæt/","zh":"席子，垫子"},{"w":"residence","ipa":"/ˈrezɪdəns/","zh":"住处，住宅；居住；居住资格"},{"w":"sour","ipa":"/ˈsauə/","zh":"酸的；馊的，酸味的；脾气坏的；变酸，变馊；变得乖戾"},{"w":"threat","ipa":"/θret/","zh":"威胁，恐吓；凶兆，征兆"},{"w":"receiver","ipa":"/rɪˈsiːvə/","zh":"听筒；接收器"},{"w":"global","ipa":"/ˈgləubl/","zh":"全球的，全世界的；总的，完整的"},{"w":"geometry","ipa":"/dʒiˈɒmətri/","zh":"几何，几何学"},{"w":"conquest","ipa":"/ˈkɒŋkwest/","zh":"攻取，征服，克服"},{"w":"apply","ipa":"/əˈplaɪ/","zh":"适用；申请，请求；涂，敷，施；应用，实施；使用；涂敷；把…施于"},{"w":"enable","ipa":"/ɪˈneɪbl/","zh":"使能够，使可能"},{"w":"architect","ipa":"/ˈɑːkɪtekt/","zh":"建筑师，设计师；缔造者"},{"w":"nucleus","ipa":"/ˈnjuːkliəs/","zh":"核心；核"},{"w":"publicity","ipa":"/pʌbˈlɪsəti/","zh":"公众的注意，名声；宣传，宣扬"},{"w":"modernization","ipa":"/ˌmɒdənaɪˈzeɪʃn/","zh":"现代化"},{"w":"via","ipa":"/ˈvaɪə/","zh":"经过，通过"},{"w":"aboard","ipa":"/əˈbɔːd/","zh":"在船上，上船"},{"w":"invasion","ipa":"/ɪnˈveɪʒn/","zh":"入侵，侵略，侵犯"},{"w":"minister","ipa":"/ˈmɪnɪstə/","zh":"部长，大臣；公使，外交使节；牧师"},{"w":"laser","ipa":"/ˈleɪzə/","zh":"激光"},{"w":"occupation","ipa":"/ˌɒkjuˈpeɪʃn/","zh":"占领，占据；职业；从事的活动，消遣"},{"w":"compose","ipa":"/kəmˈpəuz/","zh":"组成，构成；创作，为…谱曲；使平静，使镇静"},{"w":"anchor","ipa":"/ˈæŋkə/","zh":"抛锚，停泊；把…系住，使固定；担任主持人；固定，扎根；锚；给人安全感的物"},{"w":"expense","ipa":"/ɪkˈspens/","zh":"花费，消费；费用，开支；业务费用"},{"w":"specific","ipa":"/spəˈsɪfɪk/","zh":"特有的；具体的，明确的；详情，细节"},{"w":"remain","ipa":"/rɪˈmeɪn/","zh":"剩下，余留；保持；仍然是；残余；残骸；遗迹"},{"w":"vice","ipa":"/vaɪs/","zh":"罪恶；恶习，缺点；虎钳"},{"w":"furniture","ipa":"/ˈfɜːnɪtʃə/","zh":"家具"},{"w":"cautious","ipa":"/ˈkɔːʃəs/","zh":"十分小心的，谨慎的"},{"w":"container","ipa":"/kənˈteɪnə/","zh":"容器；集装箱"},{"w":"hollow","ipa":"/ˈhɒləu/","zh":"空的，空洞的；沉闷的；虚伪的"},{"w":"electricity","ipa":"/ɪˌlekˈtrɪsəti/","zh":"电"},{"w":"remonstrate","ipa":"/ˈremənstreɪt/","zh":"抗议"},{"w":"limitation","ipa":"/ˌlɪmɪˈteɪʃn/","zh":"限制，限度；局限"},{"w":"various","ipa":"/ˈveəriəs/","zh":"各种各样的，不同的"},{"w":"extend","ipa":"/ɪkˈstend/","zh":"延长，扩大；提供，给予；伸展，达到"},{"w":"scarcely","ipa":"/ˈskeəsli/","zh":"几乎不，简直不；决不；刚刚，才"},{"w":"rare","ipa":"/reə/","zh":"稀有的，冷僻的；珍奇的；出类拔萃的；稀薄的；煎得嫩的"},{"w":"precaution","ipa":"/prɪˈkɔːʃn/","zh":"预防；防备，警惕"},{"w":"comprehensive","ipa":"/ˌkɒmprɪˈhensɪv/","zh":"广泛的，综合的；理解的"},{"w":"youngster","ipa":"/ˈjʌŋstə/","zh":"青年，年轻人，孩子"},{"w":"suggestion","ipa":"/səˈdʒestʃən/","zh":"建议，意见；细微的迹象；暗示"},{"w":"fasten","ipa":"/ˈfɑːsn/","zh":"扎牢，扣住"},{"w":"investigate","ipa":"/ɪnˈvestɪgeɪt/","zh":"调查，研究"},{"w":"pulse","ipa":"/pʌls/","zh":"搏动，跳动；脉搏；脉冲"},{"w":"drip","ipa":"/drɪp/","zh":"滴下，漏水；水滴；滴水声"},{"w":"advisable","ipa":"/ədˈvaɪzəbl/","zh":"明智的，可取的"},{"w":"elastic","ipa":"/ɪˈlæstɪk/","zh":"有弹性的，灵活的；松紧带"},{"w":"upright","ipa":"/ˈʌpraɪt/","zh":"挺直着，竖立着；垂直的；正直的，诚实的"},{"w":"emphasize","ipa":"/ˈemfəsaɪz/","zh":"强调，着重"},{"w":"beyond","ipa":"/bɪˈjɒnd/","zh":"在更远处，再往后；在…的那边，远于；迟于；越出"},{"w":"freight","ipa":"/freɪt/","zh":"货运；货物；运费；运送"},{"w":"emotion","ipa":"/ɪˈməuʃn/","zh":"情感，感情；激动"},{"w":"curious","ipa":"/ˈkjuəriəs/","zh":"好奇的；奇怪的"},{"w":"award","ipa":"/əˈwɔːd/","zh":"奖，奖品；判定；授予，给予；判给，裁定"}]},{"id":"cet6","name":"CET-6","category":"大学英语","words":[{"w":"cancel","ipa":"/ˈkænsl/","zh":"取消，撤销，删去 (vt.)"},{"w":"coincide","ipa":"/ˌkəuɪnˈsaɪd/","zh":"同时发生；相符，相一致；位置重合，重叠 (vi.)"},{"w":"rational","ipa":"/ˈræʃnəl/","zh":"理性的，理智的；合理的 (adj.)"},{"w":"ambition","ipa":"/æmˈbɪʃn/","zh":"雄心，抱负，野心；期望得到的东西 (n.)"},{"w":"multiply","ipa":"/ˈmʌltɪplaɪ/","zh":"增加，繁殖；乘 (v.)"},{"w":"concise","ipa":"/kənˈsaɪs/","zh":"简明的，简要的 (adj.)"},{"w":"scrap","ipa":"/skræp/","zh":"碎片，碎屑；废金属；残羹剩饭；少量，点滴 (n.)；废弃，抛弃 (vt.)"},{"w":"descendant","ipa":"/dɪˈsendənt/","zh":"后裔，后代 (n.)"},{"w":"reconcile","ipa":"/ˈrekənsaɪl/","zh":"使协调；使和解；使顺从，使甘心 (vt.)"},{"w":"hysterical","ipa":"/hɪˈsterɪkl/","zh":"情绪异常激动的，歇斯底里般的 (adj.)"},{"w":"tug","ipa":"/tʌg/","zh":"用力拖 (v.)；拖船；猛拉，牵引 (n.)"},{"w":"input","ipa":"/ˈɪnput/","zh":"输入；投入的资金，输入的数据 (n.)；把…输入计算机 (vt.)"},{"w":"legislation","ipa":"/ˌledʒɪsˈleɪʃn/","zh":"法律，法规；立法，法律的制定 (n.)"},{"w":"tedious","ipa":"/ˈtiːdiəs/","zh":"冗长乏味的，沉闷的 (adj.)"},{"w":"luminous","ipa":"/ˈluːmɪnəs/","zh":"发光的，发亮的；光明的 (adj.)"},{"w":"typical","ipa":"/ˈtɪpɪkl/","zh":"典型的，有代表性的 (adj.)"},{"w":"regenerate","ipa":"/rɪˈdʒenər3ɪt/","zh":"新生，再生，起革新作用 (vi.)；使新生，重建，改革，革新 (vt.)"},{"w":"contradiction","ipa":"/ˌkɒntrəˈdɪkʃn/","zh":"矛盾，不一致；否认，反驳 (n.)"},{"w":"doom","ipa":"/duːm/","zh":"注定，命定 (vt.)；厄运，劫数 (n.)"},{"w":"correlate","ipa":"/ˈkɒrəleɪt/","zh":"相关，关联 (vi.)；使相互关联 (vt.)"},{"w":"pedestrian","ipa":"/pəˈdestriən/","zh":"步行者，行人 (n.)"},{"w":"census","ipa":"/ˈsensəs/","zh":"人口普查，统计 (n.)"},{"w":"maximum","ipa":"/ˈmæksɪməm/","zh":"最大的；最高的；顶点的 (adj.)；最大量；顶点 (n.)"},{"w":"impair","ipa":"/ɪmˈpeə/","zh":"损害，损伤；削弱 (vt.)"},{"w":"hemisphere","ipa":"/ˈhemɪsfɪə/","zh":"地球的半球；大脑半球 (n.)"},{"w":"hum","ipa":"/hʌm/","zh":"哼曲子；发嗡嗡声 (vi.)；哼 (vt.)；嗡嗡声，营营声，嘈杂声 (n.)"},{"w":"afford","ipa":"/əˈfɔːd/","zh":"担负得起；提供 (vt.)"},{"w":"pilgrim","ipa":"/ˈpɪlgrɪm/","zh":"朝圣者 (n.)"},{"w":"alter","ipa":"/ˈɔːltə/","zh":"改变，变更，变动 (vt.)"},{"w":"racket","ipa":"/ˈrækɪt/","zh":"喧嚷，吵闹；敲诈，勒索，诈骗；球拍 (n.)"},{"w":"pumpkin","ipa":"/ˈpʌmpkɪn/","zh":"南瓜 (n.)"},{"w":"execute","ipa":"/ˈeksɪkjuːt/","zh":"将…处死；实施 (vt.)"},{"w":"glance","ipa":"/glɑːns/","zh":"看一下 (vi.)；一瞥 (n.)"},{"w":"junction","ipa":"/ˈdʒʌŋkʃn/","zh":"联结点，交叉点，枢纽 (n.)"},{"w":"squad","ipa":"/skwɒd/","zh":"班，小队，小组 (n.)"},{"w":"propaganda","ipa":"/ˌprɒpəˈgændə/","zh":"宣传 (n.)"},{"w":"obstacle","ipa":"/ˈɒbstəkl/","zh":"障碍，障碍物；妨害 (n.)"},{"w":"excursion","ipa":"/ɪkˈskɜːʃn/","zh":"远足，短途旅行 (n.)"},{"w":"pole","ipa":"/pəul/","zh":"杆；极，磁极，电极 (n.)"},{"w":"mercury","ipa":"/ˈmɜːkjəri/","zh":"水银，汞 (n.)"},{"w":"vague","ipa":"/veɪg/","zh":"不明确的；含糊的；暧昧的 (adj.)"},{"w":"bronze","ipa":"/brɒnz/","zh":"青铜，青铜色，古铜色；青铜制品，铜牌 (n.)"},{"w":"weird","ipa":"/wɪəd/","zh":"古怪的，离奇的；怪诞的，神秘而可怕的 (adj.)"},{"w":"pose","ipa":"/pəuz/","zh":"造成，引起；提出，陈述；摆姿势；假装，冒充，装腔作势 (v.)；样子，姿势 (n.)"},{"w":"engine","ipa":"/ˈendʒɪn/","zh":"引擎，发动机；机车 (n.)"},{"w":"tendency","ipa":"/ˈtendənsi/","zh":"趋向，趋势，倾向 (n.)"},{"w":"confident","ipa":"/ˈkɒnfɪdənt/","zh":"确信的，肯定的；自信的 (adj.)"},{"w":"historian","ipa":"/hɪˈstɔːriən/","zh":"历史学家，史学工作者 (n.)"},{"w":"intense","ipa":"/ɪnˈtens/","zh":"强烈的；紧张的；认真的；热情的 (adj.)"},{"w":"render","ipa":"/ˈrendə/","zh":"使得，致使；给予，提供；翻译 (vt.)"},{"w":"flare","ipa":"/fleə/","zh":"闪耀，烧旺；突发，突然发怒 (vi.)；闪光信号，照明弹 (n.)"},{"w":"dissipate","ipa":"/ˈdɪsɪpeɪt/","zh":"消散，消失 (vi.)；使消散，使消失；浪费，挥霍 (vt.)"},{"w":"pudding","ipa":"/ˈpudɪŋ/","zh":"布丁 (n.)"},{"w":"cater","ipa":"/ˈkeɪtə/","zh":"满足需要，迎合；提供饮食及服务，承办酒席 (vi.)"},{"w":"magnify","ipa":"/ˈmægnɪfaɪ/","zh":"放大，扩大；夸大，夸张 (vt.)"},{"w":"tissue","ipa":"/ˈtɪʃuː/","zh":"组织；薄绢，薄纸，手巾纸 (n.)"},{"w":"denial","ipa":"/dɪˈnaɪəl/","zh":"否认；拒绝，拒绝给予 (n.)"},{"w":"statistics","ipa":"/stəˈtɪstɪks/","zh":"统计学；统计表 (n.)"},{"w":"transfer","ipa":"/trænsˈfɜː/","zh":"搬，转移；调动，转学；转让，过户；乘车，转乘 (v.)"},{"w":"intelligible","ipa":"/ɪnˈtelɪdʒəbl/","zh":"可理解的，明白易懂的，清楚的 (adj.)"},{"w":"plague","ipa":"/pleɪg/","zh":"瘟疫，鼠疫；灾难，祸患 (n.)；使痛苦，给…造成困难 (vt.)"},{"w":"hurl","ipa":"/hɜːl/","zh":"猛投，狠掷；大声叫骂 (vt.)"},{"w":"visa","ipa":"/ˈviːzə/","zh":"签证 (n.)"},{"w":"scrub","ipa":"/skrʌb/","zh":"用力擦洗，把…擦净；取消 (v.)；矮树丛，灌木丛 (n.)"},{"w":"oak","ipa":"/əuk/","zh":"栎树，橡树；栎木，橡木 (n.)"},{"w":"elaborate","ipa":"/ɪˈlæb(ə)rət/","zh":"复杂的；精心制作的 (adj.)；详述，详细制定 (v.)"},{"w":"defy","ipa":"/dɪˈfaɪ/","zh":"违抗，蔑视；使成为不可能；惹，激 (vt.)"},{"w":"bribe","ipa":"/braɪb/","zh":"向…贿赂，买通 (vt.)；贿赂，行贿物 (n.)"},{"w":"magistrate","ipa":"/ˈmædʒɪstreɪt/","zh":"地方行政官，地方法官；治安官 (n.)"},{"w":"embark","ipa":"/ɪmˈbɑːk/","zh":"上船；着手，开始工作 (vi.)"},{"w":"scandal","ipa":"/ˈskændl/","zh":"丑事，丑闻；流言蜚语；反感，愤慨 (n.)"},{"w":"sue","ipa":"/suː/","zh":"控告，起诉；要求，请求 (v.)"},{"w":"elastic","ipa":"/ɪˈlæstɪk/","zh":"有弹性的；灵活的 (adj.)；松紧带 (n.)"},{"w":"tuck","ipa":"/tʌk/","zh":"把边塞到下面；把…夹入，把…藏入 (vt.)；褶，裥 (n.)"},{"w":"emphasize","ipa":"/ˈemfəsaɪz/","zh":"强调，着重 (vt.)"},{"w":"hazard","ipa":"/ˈhæzəd/","zh":"危险，公害 (n.)；尝试着做，冒…风险 (vt.)"},{"w":"juvenile","ipa":"/ˈdʒuːvənaɪl/","zh":"少年的，少年特有的；幼稚的，不成熟的 (adj.)；未成年人，少年 (n.)"},{"w":"mingle","ipa":"/ˈmɪŋgl/","zh":"混合起来，相混合；相交往，相往来 (vi.)；使混合，使相混 (vt.)"},{"w":"individual","ipa":"/ˌɪndɪˈvɪdʒuəl/","zh":"个别的；独特的 (adj.)；个人，个体 (n.)"},{"w":"hoist","ipa":"/hɔɪst/","zh":"举起，升起，吊起 (vt.)；起重器械；举起，升起，吊起 (n.)"}]},{"id":"kaoyan","name":"考研","category":"考研","words":[{"w":"cancel","ipa":"/ˈkænsl/","zh":"相互抵消；取消；删去，划掉；把…作废"},{"w":"halt","ipa":"/hɔːlt/","zh":"止步，停止；止步，停步，停止前进"},{"w":"weld","ipa":"/weld/","zh":"焊接，锻接；焊接，焊缝"},{"w":"intellectual","ipa":"/ˌɪntəˈlektʃuəl/","zh":"智力的，有智力的，显示智力的 <；知识分子"},{"w":"generous","ipa":"/ˈdʒenərəs/","zh":"宽宏大量的，慷慨的"},{"w":"starve","ipa":"/stɑːv/","zh":"饿死，挨饿 <"},{"w":"bias","ipa":"/ˈbaɪəs/","zh":"偏见，偏心，偏袒；使有偏见，偏心，偏袒"},{"w":"attain","ipa":"/əˈteɪn/","zh":"达到，获得 <"},{"w":"compact","ipa":"/kəmˈpækt/","zh":"紧密的，结实的；简洁的；紧凑的；使紧密；压缩"},{"w":"revenge","ipa":"/rɪˈvendʒ/","zh":"报复，复仇；替…报仇"},{"w":"deadline","ipa":"/ˈdedlaɪn/","zh":"最后期限"},{"w":"relativity","ipa":"/ˌreləˈtɪvəti/","zh":"相关；相对论"},{"w":"cigar","ipa":"/sɪˈgɑː/","zh":"雪茄烟"},{"w":"discreet","ipa":"/dɪˈskriːt/","zh":"谨慎的，慎重的"},{"w":"structure","ipa":"/ˈstrʌktʃə/","zh":"结构，构造；建筑物；建筑，建造；组织，安排"},{"w":"expel","ipa":"/ɪkˈspel/","zh":"把…开除；驱逐；排出"},{"w":"bare","ipa":"/beə/","zh":"赤裸的；光秃的；空的；稀少的，仅有的；露出，暴露"},{"w":"reliable","ipa":"/rɪˈlaɪəbl/","zh":"可靠的"},{"w":"sting","ipa":"/stɪŋ/","zh":"刺，刺痛，叮 A；刺，刺痛，剧痛，叮"},{"w":"swarm","ipa":"/swɔːm/","zh":"云集；充满；群，蜂群"},{"w":"eloquent","ipa":"/ˈeləkwənt/","zh":"雄辩的，有说服力的；动人的，意味深长的"},{"w":"private","ipa":"/ˈpraɪvət/","zh":"私人的，个人的 <；秘密的，私下的"},{"w":"manipulate","ipa":"/məˈnɪpjuleɪt/","zh":"操作，控制；操纵，控制，影响"},{"w":"cable","ipa":"/ˈkeɪbl/","zh":"拍电报；电报；电缆；索，钢丝绳；有线电视"},{"w":"echo","ipa":"/ˈekəu/","zh":"产生回声，产生回响；回声；反响；共鸣"},{"w":"presently","ipa":"/ˈprezntli/","zh":"一会儿，不久；现在，目前"},{"w":"memorial","ipa":"/məˈmɔːriəl/","zh":"记忆的；纪念的；追悼的；纪念物；纪念碑；纪念馆"},{"w":"grin","ipa":"/grɪn/","zh":"露齿而笑，咧嘴笑"},{"w":"overhaul","ipa":"/əʊvəˈhɔːl/","zh":"彻底检修；改革A；彻底检修；赶上，超过"},{"w":"colonial","ipa":"/kəˈləuniəl/","zh":"殖民的"},{"w":"interview","ipa":"/ˈɪntəvjuː/","zh":"采访；面试；接见，会见；采访；面试"},{"w":"alert","ipa":"/əˈlɜːt/","zh":"警惕的；机灵的"},{"w":"fry","ipa":"/fraɪ/","zh":"油煎，油炸"},{"w":"toxic","ipa":"/ˈtɒksɪk/","zh":"有毒的；中毒的"},{"w":"roundabout","ipa":"/ˈraundəbaut/","zh":"迂回的，转弯抹角的；环状交叉路"},{"w":"cabin","ipa":"/ˈkæbɪn/","zh":"客舱，机舱；小屋"},{"w":"obscure","ipa":"/əbˈskjuə/","zh":"暗的；朦胧的；模糊的；晦涩的；使暗，使不明显"},{"w":"proof","ipa":"/pruːf/","zh":"证据，证明；校样；样张"},{"w":"onion","ipa":"/ˈʌnjən/","zh":"洋葱"},{"w":"inverse","ipa":"/ˈɪnvɜːs/","zh":"倒转的，反向的；反面；倒数"},{"w":"carriage","ipa":"/ˈkærɪdʒ/","zh":"马车；客车厢"},{"w":"enormous","ipa":"/ɪˈnɔːməs/","zh":"巨大的，庞大的"},{"w":"fiber","ipa":"/ˈfaɪbə/","zh":"纤维，纤维质"},{"w":"reign","ipa":"/reɪn/","zh":"统治，支配；盛行；占优势；统治，支配；统治时期；朝代"},{"w":"pursue","ipa":"/pəˈsjuː/","zh":"追赶，追踪；继续，从事 <"},{"w":"recognize","ipa":"/ˈrekəgnaɪz/","zh":"认出，识别；承认"},{"w":"preface","ipa":"/ˈprefəs/","zh":"序言，引言，前言"},{"w":"tray","ipa":"/treɪ/","zh":"盘，碟，托盘"},{"w":"unfortunately","ipa":"/ʌnˈfɔːtʃənətli/","zh":"不幸地；可惜地"},{"w":"colony","ipa":"/ˈkɒləni/","zh":"殖民地"},{"w":"discern","ipa":"/dɪˈsɜːn/","zh":"认出，发现；辨别，识别"},{"w":"burglar","ipa":"/ˈbɜːglə/","zh":"窃贼，破门盗窃者"},{"w":"staple","ipa":"/ˈsteɪpl/","zh":"主要的；经常需要的；订书钉，；主食；主要产品；用订书钉订，把…订起来"},{"w":"refugee","ipa":"/ˌrefjuˈdʒiː/","zh":"难民，流亡者"},{"w":"leadership","ipa":"/ˈliːdəʃɪp/","zh":"领导"},{"w":"infectious","ipa":"/ɪnˈfekʃəs/","zh":"传染的，传染性的；有感染力的"},{"w":"cradle","ipa":"/ˈkreɪdl/","zh":"摇篮 A；发源地"},{"w":"prick","ipa":"/prɪk/","zh":"刺伤，刺痛；刺孔；刺伤，刺痛"},{"w":"siege","ipa":"/siːdʒ/","zh":"包围，围攻"},{"w":"rust","ipa":"/rʌst/","zh":"生锈；铁锈"},{"w":"institute","ipa":"/ˈɪnstɪtjuːt/","zh":"设立，设置，制定；学会，研究所，学院"},{"w":"remedy","ipa":"/ˈremədi/","zh":"药品；治疗措施，补救办法；治疗，医治 A；纠正，补救 <"},{"w":"rim","ipa":"/rɪm/","zh":"边，轮缘；边界"},{"w":"recollect","ipa":"/ˌrekəˈlekt/","zh":"回忆，追想"},{"w":"dump","ipa":"/dʌmp/","zh":"倾倒，倾卸；垃圾场；堆存处"},{"w":"turkey","ipa":"/ˈtɜːki/","zh":"火鸡"},{"w":"vulnerable","ipa":"/ˈvʌlnərəbl/","zh":"易受攻击的"},{"w":"obstruct","ipa":"/əbˈstrʌkt/","zh":"妨碍，阻止 A；阻塞，截断"},{"w":"fireplace","ipa":"/ˈfaɪəpleɪs/","zh":"壁炉"},{"w":"omit","ipa":"/əˈmɪt/","zh":"省略，删去；遗漏，忽略 <"},{"w":"bar","ipa":"/bɑː/","zh":"条，杆，棒，棍，闩；酒吧；吧台；栅，栏，障碍；闩上；阻拦，拦住；妨碍"},{"w":"somewhat","ipa":"/ˈsʌmwɒt/","zh":"稍微，有点"},{"w":"bound","ipa":"/baund/","zh":"跳；受约束的；有义务的；注定的，肯定的；准备到…去的，开往…的；跳"},{"w":"crystal","ipa":"/ˈkrɪstl/","zh":"水晶的；晶体的；透明的 A <；水晶；水晶饰品 <；结晶，晶体"},{"w":"predominant","ipa":"/prɪˈdɒmɪnənt/","zh":"占优势的；主要的，突出的"},{"w":"composite","ipa":"/ˈkɒmpəzɪt/","zh":"合成的，复合的；混合物，合成物"},{"w":"cricket","ipa":"/ˈkrɪkɪt/","zh":"板球；蟋蟀"},{"w":"brutal","ipa":"/ˈbruːtl/","zh":"残忍的；严峻的，严酷的"},{"w":"lean","ipa":"/liːn/","zh":"倾斜；屈身；倚，靠；依赖；瘦的，无脂肪的"},{"w":"tax","ipa":"/tæks/","zh":"税；负担；对…征税；使负重担；使受压力"}]},{"id":"toefl","name":"TOEFL","category":"国际考试","words":[{"w":"cancel","ipa":"/ˈkænsl/","zh":"取消，废除；删去，删除；抵消"},{"w":"halt","ipa":"/hɔːlt/","zh":"停住，停下；停止，阻止；暂停"},{"w":"emancipate","ipa":"/ɪˈmænsɪpeɪt/","zh":"解放，解除"},{"w":"daylight","ipa":"/ˈdeɪlaɪt/","zh":"日光；白昼"},{"w":"hatch","ipa":"/hætʃ/","zh":"孵化，孵出；开口；舱门"},{"w":"state","ipa":"/steɪt/","zh":"陈述，说明，声明；规定；情况，状况；国家；州"},{"w":"source","ipa":"/sɔːrs/","zh":"源，源泉；来源，出处；信息来源"},{"w":"mesmerize","ipa":"/ˈmezməraɪz/","zh":"施催眠术；使入迷，迷住"},{"w":"assure","ipa":"/əˈʃur/","zh":"确保；使确信"},{"w":"instructor","ipa":"/ɪnˈstrʌktər/","zh":"导师，讲师；教练，指导员"},{"w":"conceivable","ipa":"/kənˈsiːvəbl/","zh":"可能的；可信的，可想象的"},{"w":"rigor","ipa":"/ˈrɪgər/","zh":"严格；严酷"},{"w":"hemisphere","ipa":"/ˈhemɪsfɪr/","zh":"半球；大脑半球"},{"w":"invalid","ipa":"/ˈɪnvəlɪd/","zh":"无效的；无可靠根据的，站不住脚的；病弱者，残疾者"},{"w":"alter","ipa":"/ˈɔːltər/","zh":"改变"},{"w":"curl","ipa":"/kɜːrl/","zh":"卷曲，蜷缩；卷发；卷曲状；卷曲物"},{"w":"dye","ipa":"/daɪ/","zh":"染色；颜料，染料"},{"w":"revoke","ipa":"/rɪˈvouk/","zh":"撤销，撤回；取消，废除"},{"w":"confederacy","ipa":"/kənˈfedərəsi/","zh":"联盟，同盟，联邦；私党"},{"w":"exaggerate","ipa":"/ɪgˈzædʒəreɪt/","zh":"夸张，夸大"},{"w":"anguish","ipa":"/ˈæŋgwɪʃ/","zh":"极度痛苦；极度痛苦"},{"w":"intrusion","ipa":"/ɪnˈtruːʒn/","zh":"侵扰，干扰；侵犯；侵入，闯入"},{"w":"paucity","ipa":"/ˈpɔːsəti/","zh":"极小量，少量"},{"w":"contradict","ipa":"/ˌkɑːntrəˈdɪkt/","zh":"反驳；同…矛盾，相抵触"},{"w":"aerial","ipa":"/ˈeriəl/","zh":"空中的，地表以上的；从飞行器上的；天线"},{"w":"manifest","ipa":"/ˈmænɪfest/","zh":"明显的；表明，显示；货物清单"},{"w":"demobilize","ipa":"/diːˈmoubəlaɪz/","zh":"遣散；使复员"},{"w":"despondent","ipa":"/dɪˈspɑːndənt/","zh":"垂头丧气的，沮丧的"},{"w":"physiology","ipa":"/ˌfɪziˈɑːlədʒi/","zh":"生理学；生理机能"},{"w":"overflow","ipa":"/əʊvəˈfləʊ/","zh":"泛滥，溢出；溢出；容纳不下的物"},{"w":"selective","ipa":"/sɪˈlektɪv/","zh":"选择的，选择性的；精挑细选的"},{"w":"canyon","ipa":"/ˈkænjən/","zh":"峡谷"},{"w":"ribbon","ipa":"/ˈrɪbən/","zh":"带状物；丝带，缎带；绶带；色带"},{"w":"welfare","ipa":"/ˈwelfer/","zh":"福利；安宁，幸福"},{"w":"oral","ipa":"/ˈɔːrəl/","zh":"口头的，口述的；口腔的"},{"w":"productivity","ipa":"/ˌprɑːdʌkˈtɪvəti/","zh":"生产力，生产率"},{"w":"viral","ipa":"/ˈvaɪrəl/","zh":"病毒的，病毒引起的"},{"w":"conscientious","ipa":"/ˌkɑːnʃiˈenʃəs/","zh":"凭良心的；认真谨慎的，一丝不苟的"},{"w":"proof","ipa":"/pruːf/","zh":"耐…的，防…的；证据，证明；证词；检验，证实；校样"},{"w":"hospitable","ipa":"/hɑːˈspɪtəbl/","zh":"宜人的；好客的，殷勤的；开通的"},{"w":"readability","ipa":"/ˌriːdəˈbɪləti/","zh":"可读性"},{"w":"deceitful","ipa":"/dɪˈsiːtfl/","zh":"欺诈的，惯于欺骗的，不诚实的"},{"w":"sloth","ipa":"/slouθ/","zh":"树懒；懒散，怠惰"},{"w":"precursor","ipa":"/priːˈkɜːrsər/","zh":"先驱；先兆，前兆；前身"},{"w":"frugal","ipa":"/ˈfruːgl/","zh":"节约的，节俭的；少量的"},{"w":"rationality","ipa":"/ˌræʃəˈnæləti/","zh":"理性；合理性"},{"w":"sewerage","ipa":"/ˈsuːərɪdʒ/","zh":"排水系统；污水处理；污水"},{"w":"locomotive","ipa":"/ˌloukəˈmoutɪv/","zh":"运动的；移动的；机车，火车头"},{"w":"ideomotor","ipa":"/ˌaɪdiəˈmoutər/","zh":"观念运动的"},{"w":"layer","ipa":"/ˈler/","zh":"层，层次"},{"w":"square","ipa":"/skwer/","zh":"正方形的；成直角的，方的；平方的；正方形；广场；平方；使成正方形；求平方；使打成平局"},{"w":"preference","ipa":"/ˈprefrəns/","zh":"偏爱；优先"},{"w":"represent","ipa":"/ˌreprɪˈzent/","zh":"代表；表现；描绘；象征"},{"w":"diplomat","ipa":"/ˈdɪpləmæt/","zh":"外交官；有手腕的人"},{"w":"positive","ipa":"/ˈpɑːzətɪv/","zh":"肯定的；积极的；确凿的；自信的，乐观的；正电的"},{"w":"racket","ipa":"/ˈrækɪt/","zh":"球拍；喧嚷，吵闹；勒索，诈骗"},{"w":"disastrous","ipa":"/dɪˈzæstrəs/","zh":"灾难性的"},{"w":"monumental","ipa":"/ˌmɑːnjuˈmentl/","zh":"纪念碑的；不朽的"},{"w":"sturdy","ipa":"/ˈstɜːrdi/","zh":"健壮的，结实的；稳固的；顽强的"},{"w":"inhabit","ipa":"/ɪnˈhæbɪt/","zh":"居住于，栖居于"},{"w":"stylized","ipa":"/ˈstaɪlaɪzd/","zh":"非写实的；程式化的"},{"w":"insistence","ipa":"/ɪnˈsɪstəns/","zh":"坚持，坚决主张"},{"w":"consent","ipa":"/kənˈsent/","zh":"同意，赞成，准许"},{"w":"hardy","ipa":"/ˈhɑːrdi/","zh":"强壮的；耐寒的；能吃苦耐劳的"},{"w":"meditate","ipa":"/ˈmedɪteɪt/","zh":"沉思，冥想；考虑；谋划"},{"w":"radical","ipa":"/ˈrædɪkl/","zh":"根本的；激进的，极端的；全新的，不同凡响的；激进分子；游离基，自由基"},{"w":"gentility","ipa":"/dʒenˈtɪləti/","zh":"有教养，文雅"},{"w":"statistic","ipa":"/stəˈtɪstɪk/","zh":"统计数字，统计资料"},{"w":"experimental","ipa":"/ɪkˌsperɪˈmentl/","zh":"实验的，用于实验的"},{"w":"aggravate","ipa":"/ˈægrəveɪt/","zh":"恶化，加重；激怒"},{"w":"spread","ipa":"/spred/","zh":"展开；蔓延，扩散；散布；涂，敷；传播，蔓延；涉及幅度，活动范围"},{"w":"isolate","ipa":"/ˈaɪsəleɪt/","zh":"使隔离，使孤立"},{"w":"pendant","ipa":"/ˈpendənt/","zh":"垂饰，下垂物"},{"w":"simile","ipa":"/ˈsɪməli/","zh":"明喻"},{"w":"deter","ipa":"/dɪˈtɜːr/","zh":"威慑，阻止"},{"w":"scandal","ipa":"/ˈskændl/","zh":"丑事，丑闻；恶意诽谤，流言蜚语；可耻的行为"},{"w":"quell","ipa":"/kwel/","zh":"制止，镇压；缓解，减轻"},{"w":"saunter","ipa":"/ˈsɔːntər/","zh":"闲逛，漫步"},{"w":"wear","ipa":"/wer/","zh":"穿，戴；留；面露，面带；磨损，用旧；穿戴，衣着；服装，穿戴物；磨损，损坏"},{"w":"verse","ipa":"/vɜːrs/","zh":"诗歌；韵文；诗节"}]},{"id":"ielts","name":"IELTS","category":"国际考试","words":[{"w":"cancel","ipa":"/ˈkænsl/","zh":"取消，废除；抵消，对消；删去，划掉"},{"w":"connect","ipa":"/kəˈnekt/","zh":"连接，衔接；联合，关联；由…联想到；给…接通电话"},{"w":"anticipation","ipa":"/ænˌtɪsɪˈpeɪʃn/","zh":"预料"},{"w":"irony","ipa":"/ˈaɪərəni/","zh":"反话，讽刺；出人意料的事情"},{"w":"adventure","ipa":"/ədˈventʃə(r)/","zh":"冒险，冒险活动；异乎寻常的经历，奇遇"},{"w":"supply","ipa":"/səˈplaɪ/","zh":"供给，供应；供给，供应；满足，弥补"},{"w":"medical","ipa":"/ˈmedɪkl/","zh":"医学的，医疗的；内科的"},{"w":"calcium","ipa":"/ˈkælsiəm/","zh":"钙"},{"w":"introspection","ipa":"/ˌɪntrəˈspekʃn/","zh":"内省，反省"},{"w":"particular","ipa":"/pəˈtɪkjələ(r)/","zh":"特殊的，特别的；特定的，个别的；详细的；详情，细目，细节"},{"w":"profile","ipa":"/ˈprəufaɪl/","zh":"面部的侧影，侧面轮廓；传略，人物简介；扼要介绍；写传略"},{"w":"limestone","ipa":"/ˈlaɪmstəun/","zh":"石灰石，石灰岩"},{"w":"ferry","ipa":"/ˈferi/","zh":"渡运；渡船；摆渡"},{"w":"synchronise","ipa":"/ˈsɪŋkrənaɪz/","zh":"同步发生，同速进行"},{"w":"strip","ipa":"/strɪp/","zh":"剥夺；夺去，使空无一物；拆卸，拆开；带状物；条纹；狭长地带，带状水域"},{"w":"empirical","ipa":"/ɪmˈpɪrɪkl/","zh":"经验主义的，以经验为依据的"},{"w":"renewal","ipa":"/rɪˈnjuːəl/","zh":"更新，恢复；重新开始；重建；复兴；续期；重申"},{"w":"disrupt","ipa":"/dɪsˈrʌpt/","zh":"使中断；扰乱"},{"w":"van","ipa":"/væn/","zh":"运货车"},{"w":"stir","ipa":"/stɜː(r)/","zh":"搅动；摇动；激动"},{"w":"habitat","ipa":"/ˈhæbɪtæt/","zh":"栖息地，住处"},{"w":"slat","ipa":"/slæt/","zh":"板条，狭板；用板条制作"},{"w":"protrude","ipa":"/prəˈtruːd/","zh":"伸出；突出"},{"w":"landward","ipa":"/ˈlændwəd/","zh":"向陆的/地，近陆的/地"},{"w":"thrifty","ipa":"/ˈθrɪfti/","zh":"节俭的，节约的"},{"w":"migrant","ipa":"/ˈmaɪgrənt/","zh":"移居者，移民；迁移动物，候鸟"},{"w":"wealthy","ipa":"/ˈwelθi/","zh":"富的，富裕的；充裕的"},{"w":"statement","ipa":"/ˈsteɪtmənt/","zh":"陈述；声明；报表"},{"w":"souvenir","ipa":"/ˌsuːvəˈnɪə(r)/","zh":"纪念品，纪念物"},{"w":"contribute","ipa":"/kənˈtrɪbjuːt/","zh":"捐赠，捐助；起作用，影响"},{"w":"metaphorical","ipa":"/ˌmetəˈfɒrɪkl/","zh":"隐喻的"},{"w":"clarify","ipa":"/ˈklærəfaɪ/","zh":"澄清；阐明"},{"w":"digital","ipa":"/ˈdɪdʒɪtl/","zh":"数码的，数字的"},{"w":"supplement","ipa":"/ˈsʌplɪment/","zh":"补充，增补['sʌplɪmənt]；增补，补充；补遗；增刊；附录"},{"w":"unconquerable","ipa":"/ˌʌnˈkɒŋkərəbl/","zh":"不可征服的"},{"w":"luxury","ipa":"/ˈlʌkʃəri/","zh":"奢华的；豪华；奢侈"},{"w":"cavort","ipa":"/kəˈvɔːt/","zh":"欢跃，跳跃；嬉戏"},{"w":"amphibious","ipa":"/æmˈfɪbiəs/","zh":"两栖的；水陆两用的"},{"w":"leather","ipa":"/ˈleðə(r)/","zh":"皮革，皮革制品"},{"w":"drum","ipa":"/drʌm/","zh":"鼓，鼓状物"},{"w":"cognition","ipa":"/kɒgˈnɪʃn/","zh":"感知，认知；认识力"},{"w":"glossy","ipa":"/ˈglɒsi/","zh":"有光泽的，光滑的"},{"w":"enormous","ipa":"/ɪˈnɔːməs/","zh":"巨大的，庞大的，极大的"},{"w":"overshadow","ipa":"/ˌəuvəˈʃædəu/","zh":"给…蒙上阴影；使扫兴；使黯然失色"},{"w":"conduce","ipa":"/kənˈdjuːs/","zh":"有益于，有助于；导致"},{"w":"conformity","ipa":"/kənˈfɔːməti/","zh":"符合，一致"},{"w":"circle","ipa":"/ˈsɜːkl/","zh":"圈出；盘旋，环绕…移动；圆；圈，环状物；圈子，阶层；周期，循环"},{"w":"facsimile","ipa":"/fækˈsɪməli/","zh":"复制品；副本"},{"w":"aggravation","ipa":"/ˌægrəˈveɪʃn/","zh":"加重；恶化；愤怒，恼怒"},{"w":"reverse","ipa":"/rɪˈvɜːs/","zh":"相反的；倒转的，颠倒的；颠倒，倒退；相反，颠倒；背面，后面"},{"w":"overdraft","ipa":"/ˈəuvədrɑːft/","zh":"透支；透支额"},{"w":"population","ipa":"/ˌpɒpjʊˈleɪʃn/","zh":"人口"},{"w":"corpus","ipa":"/ˈkɔːpəs/","zh":"文集，文献，汇编；语料库"},{"w":"adventurous","ipa":"/ədˈventʃərəs/","zh":"喜欢冒险的，敢作敢为的；充满危险和刺激的，惊险的"},{"w":"segregate","ipa":"/ˈsegrɪgeɪt/","zh":"隔离，分开"},{"w":"transform","ipa":"/trænsˈfɔːm/","zh":"使改观，改革，改善；变换，把…转换成"},{"w":"understandable","ipa":"/ˌʌndəˈstændəbl/","zh":"可以理解的，能懂的；可同情的"},{"w":"celebrate","ipa":"/ˈselɪbreɪt/","zh":"赞扬，歌颂；庆祝"},{"w":"desirable","ipa":"/dɪˈzaɪərəbl/","zh":"值得拥有的；合意的；可取的，有利的"},{"w":"begrimed","ipa":"/bɪˈgraɪmd/","zh":"污秽的"},{"w":"camouflage","ipa":"/ˈkæməflɑːʒ/","zh":"掩饰，伪装"},{"w":"uncertainty","ipa":"/ʌnˈsɜːtnti/","zh":"犹豫，迟疑；不确定；无把握"},{"w":"benevolent","ipa":"/bəˈnevələnt/","zh":"善心的，仁心的"},{"w":"casual","ipa":"/ˈkæʒʊəl/","zh":"偶然的，碰巧的，不经意的；临时的，非正式的"},{"w":"spur","ipa":"/spɜː(r)/","zh":"刺激；激励；靴刺，马刺；刺激，激励，鞭策；策马加速"},{"w":"shin","ipa":"/ʃɪn/","zh":"爬；胫，胫部，胫骨"},{"w":"ash","ipa":"/æʃ/","zh":"灰；灰烬"},{"w":"obstruct","ipa":"/əbˈstrʌkt/","zh":"妨碍，阻止；阻塞；截断"},{"w":"bleak","ipa":"/bliːk/","zh":"寒冷的，阴沉的；阴郁的，暗淡的；没有希望的，不乐观的；荒凉的；索然无味的"},{"w":"sponsor","ipa":"/ˈspɒnsə(r)/","zh":"发起者，赞助人，主办者；主顾；发起，主办；赞助，资助；惠顾"},{"w":"personal","ipa":"/ˈpɜːsənl/","zh":"个人的，私人的；亲自的，本人的；身体的，人身的"},{"w":"differentiate","ipa":"/ˌdɪfəˈrenʃieɪt/","zh":"区分，区别；差别对待，区别对待"},{"w":"advanced","ipa":"/ədˈvɑːnst/","zh":"先进的"},{"w":"discovery","ipa":"/dɪˈskʌvəri/","zh":"发现"},{"w":"drill","ipa":"/drɪl/","zh":"钻；训练"},{"w":"hurricane","ipa":"/ˈhʌrɪkən/","zh":"飓风"},{"w":"luggage","ipa":"/ˈlʌgɪdʒ/","zh":"行李"},{"w":"drought","ipa":"/draut/","zh":"干旱，旱灾"},{"w":"derive","ipa":"/dɪˈraɪv/","zh":"取得；起源"},{"w":"tan","ipa":"/tæn/","zh":"晒成棕褐色，晒黑；硝；棕褐色；晒黑"}]},{"id":"bec2","name":"商务英语","category":"国际考试","words":[{"w":"pharmacy","ipa":"/ˈfɑːməsɪ/","zh":"药房；配药学，药剂学；制药业；一批备用药品"},{"w":"sequel","ipa":"/ˈsiːkw(ə)l/","zh":"续集；结局；继续；后果"},{"w":"conversation","ipa":"/kɒnvəˈseɪʃ(ə)n/","zh":"交谈，会话；社交；交往，交际；会谈；（人与计算机的）人机对话"},{"w":"capital","ipa":"/ˈkæpɪt(ə)l/","zh":"首都，省会；资金；大写字母；资本家；首都的；重要的；大写的"},{"w":"country","ipa":"/ˈkʌntrɪ/","zh":"国家，国土；国民；乡下，农村；乡村；故乡；祖国的，故乡的；地方的，乡村的；国家的；粗鲁的；乡村音乐的"},{"w":"booking","ipa":"/ˈbʊkɪŋ/","zh":"预订；预约；演出契约"},{"w":"wholesale","ipa":"/ˈhəʊlseɪl/","zh":"批发的；大规模的；批发；大规模地；以批发方式；批发"},{"w":"indeed","ipa":"/ɪnˈdiːd/","zh":"的确；实在；真正地；甚至；真的（表示惊讶、怀疑、讽刺等）"},{"w":"club","ipa":"/klʌb/","zh":"俱乐部，社团；夜总会；棍棒；（扑克牌中的）梅花；用棍棒打；募集；俱乐部的"},{"w":"contract","ipa":"/ˈkɒntrækt/","zh":"收缩；感染；订约；合同；婚约"},{"w":"lonely","ipa":"/ˈləʊnlɪ/","zh":"寂寞的；偏僻的；孤独者"},{"w":"clinic","ipa":"/ˈklɪnɪk/","zh":"临床；诊所"},{"w":"eliminate","ipa":"/ɪˈlɪmɪneɪt/","zh":"消除；排除"},{"w":"medium","ipa":"/ˈmiːdɪəm/","zh":"中间的，中等的；半生熟的；方法；媒体；媒介；中间物"},{"w":"maximize","ipa":"/ˈmæksimaiz/","zh":"取…最大值；对…极为重视"},{"w":"underinsured","ipa":"/ʌndərɪnˈʃʊəd/","zh":"投保额低于实际价值的"},{"w":"sideline","ipa":"/ˈsaɪdlaɪn/","zh":"副业；球场边线；局外人的观点；迫使退出；倾斜的"},{"w":"circumstance","ipa":"/ˈsɜːkəmstəns/","zh":"环境，情况；事件；境遇"},{"w":"transaction","ipa":"/trænˈzækʃ(ə)n/","zh":"交易；事务；办理；会报，学报"},{"w":"manpower","ipa":"/ˈmænpaʊə/","zh":"人力；人力资源；劳动力"},{"w":"minutes","ipa":"/ˈminits/","zh":"分钟（minute的复数）；会议记录；备忘录；把…记录在案；为…测定时间（minute的单三形式）"},{"w":"contribution","ipa":"/kɒntrɪˈbjuːʃ(ə)n/","zh":"贡献；捐献；投稿"},{"w":"monopoly","ipa":"/məˈnɒp(ə)lɪ/","zh":"垄断；垄断者；专卖权"},{"w":"obsolescence","ipa":"/ɒbsəʊˈlesəns/","zh":"[生物] 退化；荒废"},{"w":"assimilation","ipa":"/ə,sɪmɪˈleɪʃən/","zh":"同化；吸收；[生化] 同化作用"},{"w":"score","ipa":"/skɔː/","zh":"分数；二十；配乐；刻痕；获得；评价；划线，刻划；把…记下"},{"w":"experienced","ipa":"/ɪkˈspɪərɪənst/","zh":"老练的，熟练的；富有经验的"},{"w":"admittance","ipa":"/ədˈmɪt(ə)ns/","zh":"进入；入场权；通道"},{"w":"doubt","ipa":"/daʊt/","zh":"怀疑；疑问；疑惑；怀疑；不信；恐怕；拿不准"},{"w":"staff","ipa":"/stɑːf/","zh":"职员；参谋；棒；支撑；职员的；行政工作的；供给人员；给…配备职员"},{"w":"occupy","ipa":"/ˈɒkjʊpaɪ/","zh":"占据，占领；居住；使忙碌"},{"w":"undermine","ipa":"/ʌndəˈmaɪn/","zh":"破坏，渐渐破坏；挖掘地基"},{"w":"plausible","ipa":"/ˈplɔːzɪb(ə)l/","zh":"貌似可信的，花言巧语的；貌似真实的，貌似有理的"},{"w":"commit","ipa":"/kəˈmɪt/","zh":"犯罪，做错事；把交托给；指派…作战；使…承担义务"},{"w":"exotic","ipa":"/ɪgˈzɒtɪk/","zh":"异国的；外来的；异国情调的"},{"w":"subliminal","ipa":"/səˈblɪmɪn(ə)l/","zh":"[生理] 阈下的；潜在意识的；微小得难以察觉的；潜意识；阈下意识"},{"w":"guilty","ipa":"/ˈgɪltɪ/","zh":"有罪的；内疚的"},{"w":"desert","ipa":"/(forv.)dɪˈzɜːt/","zh":"遗弃；放弃；逃跑；沙漠；荒原；应得的赏罚；沙漠的；荒凉的；不毛的"},{"w":"accuse","ipa":"/əˈkjuːz/","zh":"控告，指控；谴责；归咎于"},{"w":"endeavour","ipa":"/ɪnˈdevə/","zh":"尽力，竭力；竭力做到，试图或力图（做某事）"},{"w":"boom","ipa":"/buːm/","zh":"使兴旺；发隆隆声；繁荣；吊杆；隆隆声"},{"w":"opening","ipa":"/ˈəʊp(ə)nɪŋ/","zh":"开始；机会；通路；空缺的职位；开始的；开放（open的ing形式）；打开；公开"},{"w":"compensation","ipa":"/kɒmpenˈseɪʃ(ə)n/","zh":"补偿；报酬；赔偿金"},{"w":"tank","ipa":"/tæŋk/","zh":"坦克；水槽；池塘；把…贮放在柜内；打败"},{"w":"simulation","ipa":"/sɪmjʊˈleɪʃən/","zh":"仿真；模拟；模仿；假装"},{"w":"piracy","ipa":"/ˈpaɪrəsɪ/","zh":"海盗行为；剽窃；著作权侵害；非法翻印"},{"w":"inflation","ipa":"/ɪnˈfleɪʃ(ə)n/","zh":"膨胀；通货膨胀；夸张；自命不凡"},{"w":"extraordinary","ipa":"/ɪkˈstrɔːd(ə)n(ə)ri/","zh":"非凡的；特别的；离奇的；临时的；特派的"},{"w":"prepaid","ipa":"/priːˈpeɪd/","zh":"先付的，已支付的；预付（prepay的过去式和过去分词）"},{"w":"embarkation","ipa":"/embɑːˈkeɪʃən/","zh":"从事；装载；乘坐"},{"w":"consistent","ipa":"/kənˈsɪst(ə)nt/","zh":"始终如一的，一致的；坚持的"},{"w":"pitfall","ipa":"/ˈpɪtfɔːl/","zh":"陷阱，圈套；缺陷；诱惑"},{"w":"royalty","ipa":"/ˈrɒɪəltɪ/","zh":"皇室；版税；王权；专利税"},{"w":"incorrect","ipa":"/ɪnkəˈrekt/","zh":"错误的，不正确的；不适当的；不真实的"},{"w":"stability","ipa":"/stəˈbɪlɪtɪ/","zh":"稳定性；坚定，恒心"},{"w":"increase","ipa":"/ɪnˈkriːs/","zh":"增加，增长；提高；增加，增大；繁殖"},{"w":"curtail","ipa":"/kɜːˈteɪl/","zh":"缩减；剪短；剥夺…特权等"},{"w":"blank","ipa":"/blæŋk/","zh":"空白的；空虚的；单调的；空白；空虚；空白表格；使…无效；使…模糊；封锁"},{"w":"survey","ipa":"/ˈsəːveɪ/","zh":"调查；测量；审视；纵览；调查；勘测；俯瞰"},{"w":"complicated","ipa":"/ˈkɒmplɪkeɪtɪd/","zh":"难懂的，复杂的"},{"w":"merchandise","ipa":"/ˈmɜːtʃ(ə)ndaɪs/","zh":"商品；货物；买卖；推销"},{"w":"introduction","ipa":"/ɪntrəˈdʌkʃ(ə)n/","zh":"介绍；引进；采用；入门；传入"},{"w":"operator","ipa":"/ˈɒpəreɪtə/","zh":"经营者；操作员；话务员；行家"},{"w":"seldom","ipa":"/ˈseldəm/","zh":"很少，不常"},{"w":"debenture","ipa":"/dɪˈbentʃə/","zh":"（英）[金融] 公司债券；[税收] 退税证明书"},{"w":"sponsor","ipa":"/ˈspɒnsə/","zh":"赞助者；主办者；保证人；赞助；发起"},{"w":"commercial","ipa":"/kəˈmɜːʃ(ə)l/","zh":"商业的；营利的；靠广告收入的；商业广告"},{"w":"streamline","ipa":"/ˈstriːmlaɪn/","zh":"把…做成流线型；使现代化；组织；使合理化；使简单化；流线；流线型；流线型的"},{"w":"accountability","ipa":"/ə,kaʊntəˈbɪlɪtɪ/","zh":"有义务；有责任；可说明性"},{"w":"mineral","ipa":"/ˈmɪn(ə)r(ə)l/","zh":"矿物；（英）矿泉水；无机物；苏打水（常用复数表示）；矿物的；矿质的"},{"w":"hotel","ipa":"/həʊˈtel/","zh":"旅馆，饭店；客栈；使…在饭店下榻；进行旅馆式办公"},{"w":"pure","ipa":"/pjʊə/","zh":"纯的；纯粹的；纯洁的；清白的；纯理论的；(Pure)人名；(俄)普雷"},{"w":"previous","ipa":"/ˈpriːvɪəs/","zh":"以前的；早先的；过早的；在先；在…以前"},{"w":"hall","ipa":"/hɔːl/","zh":"过道，门厅，走廊；会堂；食堂；学生宿舍；大厅，前厅；娱乐中心，会所"},{"w":"spur","ipa":"/spɜː/","zh":"鼓舞，刺激；马刺；山坡；骑马疾驰；给予刺激"},{"w":"shareholder","ipa":"/ˈʃeəhəʊldə/","zh":"股东；股票持有人"},{"w":"undergo","ipa":"/ʌndəˈgəʊ/","zh":"经历，经受；忍受"},{"w":"infringement","ipa":"/ɪnˈfrɪn(d)ʒm(ə)nt/","zh":"侵犯；违反"},{"w":"theocracy","ipa":"/θɪˈɒkrəsɪ/","zh":"神政；神权政体；神治国（复数theocracies）"},{"w":"share","ipa":"/ʃeə/","zh":"分享，分担；分配；份额；股份"}]},{"id":"coder","name":"Coder Dict","category":"代码练习","words":[{"w":"file","ipa":"","zh":"n. 档案,公文箱,锉刀,[计算机] 文件 vt. 列队行进,归档,申请"},{"w":"current","ipa":"","zh":"n. (水、气、电)流, 趋势 adj. 流通的, 现在的, 最近的"},{"w":"margin","ipa":"","zh":"n. 差额,利润,页边空白,边缘 vt. 使围绕于,加边缘"},{"w":"insert","ipa":"","zh":"n. 插入物 vt. &vi. 插入"},{"w":"right","ipa":"","zh":"adj. 正确的,正直的,合适的,垂直的,右面的，正常的,正面的 n. 权利,右，正义，实况 adv. 正好,恰当,径直地,正确地,立即,非常,向右边 vt. 纠正,扶直,公正对待,伸冤 vi. 复正"},{"w":"desire","ipa":"","zh":"n. 愿望, 欲望, 情欲 v. 向往, 要求, 请求 vt. 渴望"},{"w":"last","ipa":"","zh":"adj. 最后的,末尾的,最近的,晚了，迟到了 adv. 最后,最新 n. 最后来的人（或发生的事）vi. &vt. 持续"},{"w":"page","ipa":"","zh":"n. 页 v. (给...)当听差 vt. (通过扩音器、传呼机等)呼叫"},{"w":"label","ipa":"","zh":"n.标签；称标记，符号；[建] 门或窗户上面的线脚 vt.贴标签于；把…称为；把…列为；[化]用放射性元素使（元素或原子等）示踪"},{"w":"either","ipa":"","zh":"pron. 任一的 conj. 或, 也 adj. 任一, 两方的 adv. 也"},{"w":"title","ipa":"","zh":"n. 头衔,名称,标题,所有权,资格,冠军 vt. 赋予称号,加标题于 adj. 标题的"},{"w":"work","ipa":"","zh":"n. 工作,作用,成果,作品,善行,工艺,奏效,建筑工程,工厂,(机械)活动部件 adj. 工作的 vi. 创造, 实现, 有工作, 起作用, 操作, 正常运转, 成功, 产生影响, 逐渐进行, 处理 vt. 造成, 产生, 使运转, 锻造, 奋力达到, 利用"},{"w":"load","ipa":"","zh":"n. 负荷, 重担, 装载量 v. 装载, 装填, 担负, 给(枪)装子弹 [计算机] 装入"},{"w":"application","ipa":"","zh":"n.适用，应用，运用；申请，请求，申请表格；勤勉，用功；敷用，敷用药"},{"w":"extend","ipa":"","zh":"v. 扩充, 延伸, 伸展, 扩展"},{"w":"password","ipa":"","zh":"n. 口令，密码"},{"w":"unique","ipa":"","zh":"adj. 独一无二的, 独特的, 稀罕的"},{"w":"match","ipa":"","zh":"n. 比赛, 火柴, 对手, 般配的人, 配偶 v. 使...相配, 与...竞争, 相配"},{"w":"modification","ipa":"","zh":"n. 修正, 修饰, 修改"},{"w":"browse","ipa":"","zh":"vt. &vi. 浏览, 随意观看, 吃草 n. 浏览, 嫩叶"},{"w":"demonstration","ipa":"","zh":"n. 示范,实证,表达,集会"},{"w":"possible","ipa":"","zh":"adj. 可能的"},{"w":"interpreter","ipa":"","zh":"n. 译员,口译者，解释程序"},{"w":"loss","ipa":"","zh":"n. 丧失, 损耗, 亏损"},{"w":"count","ipa":"","zh":"v. 计算, 视为, 依赖 n. 计数"},{"w":"enclose","ipa":"","zh":"vt. 围绕, 圈起, 放入封套, 附上 [计算机] 括入"},{"w":"true","ipa":"","zh":"adj. 确切的,可靠的,真实的,正确的,正式的 adv. 笔直地,事实地 n. 真相,精确 vt. 使...平衡"},{"w":"searching","ipa":"","zh":"adj. 探寻的，洞察的 动词search的现在分词"},{"w":"keypad","ipa":"","zh":"n. [计算机]小键盘"},{"w":"year","ipa":"","zh":"n.年；年纪；一年的期间；某年级的学生"},{"w":"enough","ipa":"","zh":"adj. 足够的 adv. 足够地 n. 充足,足够 pron. 足够(的)"},{"w":"interface","ipa":"","zh":"n. 界面,接触面 vt. 连接,作接口 vi. 连接"},{"w":"hexadecimal","ipa":"","zh":"adj. 十六的, 十六进制的 n. 十六进制"},{"w":"preview","ipa":"","zh":"n. 预审,查阅,预习,预告 vt. 事先查看,查阅,预审,预习"},{"w":"tiny","ipa":"","zh":"adj. 极小的,微小的"},{"w":"sum","ipa":"","zh":"n. 总数(计),金额,顶点,概略,一笔钱 vt. 总计,概括 vi. 总计"},{"w":"facility","ipa":"","zh":"n.设备；容易；能力；灵巧"},{"w":"freeze","ipa":"","zh":"v. 冻结, 冷冻, 僵硬"},{"w":"anytime","ipa":"","zh":"adv. 任何时候；无例外地"},{"w":"pending","ipa":"","zh":"adj. 待定的,即将发生或来临的 prep. 直到,等待...的时候,在...期间"},{"w":"stand","ipa":"","zh":"n. 站立,停顿,楼台,货摊 vi. 站立,位于，停滞 vt. 忍受,使站立"},{"w":"skeleton","ipa":"","zh":"n. 骨架,纲要,骨骼,骨瘦如柴的人或动物,家丑 adj. 骨骼的"},{"w":"expire","ipa":"","zh":"vi. 期满,失效,终止,断气 vt. 呼气"},{"w":"matter","ipa":"","zh":"n. 事件, 物质, 原因 vi. 有关系"},{"w":"throughout","ipa":"","zh":"adv. 到处, 自始至终 prep. 遍及, 贯穿"},{"w":"manifest","ipa":"","zh":"n. 载货单,运货单,旅客名单 adj. 显然的,明白的 vt. 显示, 证实, 出示"},{"w":"medium","ipa":"","zh":"n. 媒体, 方法, 媒介 adj. 适中的, 中等的"},{"w":"valuable","ipa":"","zh":"adj. 贵重的, 有价值的 n. (pl.)贵重物品"},{"w":"surrounding","ipa":"","zh":"adj. 周围的 n. 环境, 周围的事物"},{"w":"odometer","ipa":"","zh":"n. 里程表"},{"w":"assist","ipa":"","zh":"n. 帮助,协助,协助的器械 vt. 帮助,协助 vi. 帮助,协助,出席"},{"w":"busy","ipa":"","zh":"adj. 忙的,杂乱的 vt. 使忙于 vi. 忙"},{"w":"stationary","ipa":"","zh":"adj. 不动的(稳定的) n. 固定物(驻军)"},{"w":"sit","ipa":"","zh":"vt. 坐,担任,开会,孵 vi. 坐,孵 n. 坐"},{"w":"additionally","ipa":"","zh":"adv. 另外(加之, 又)"},{"w":"fix","ipa":"","zh":"vt. &vi. 使...固定,修理,准备 n. 困境, (船只、飞机等的)定方位,贿赂"},{"w":"restrict","ipa":"","zh":"v. 限制,约束"},{"w":"height","ipa":"","zh":"n. 高度,高处,身高, 最高峰, 极点"},{"w":"compose","ipa":"","zh":"vt. 组成, 写作, 作曲, 使镇静 vi. 创作"},{"w":"manufacture","ipa":"","zh":"n. 产品,制造,制造业 vt. 制造,加工 vi. 参与制造"},{"w":"ship","ipa":"","zh":"n. 船,舰,船员,飞船 vt. 以船运送,乘船,运送,进水,在船上工作 vi. 上船,坐船,运送,在船上工作"},{"w":"vowel","ipa":"","zh":"n. 母音, 元音"},{"w":"reflect","ipa":"","zh":"v. 反映, 反射, 归咎"},{"w":"father","ipa":"","zh":"n. 父亲,鼻祖 vt. 作为父亲生育子女 vi. 像父亲般照顾"},{"w":"inexperienced","ipa":"","zh":"adj. 无经验的, 不熟练的"},{"w":"initiate","ipa":"","zh":"n. 创始人 adj. 新加入的 vt. 开始,创始,启蒙,介绍加入"},{"w":"tension","ipa":"","zh":"n. 紧张,张力,拉力 vt.（使金属线、帆等）拉紧"},{"w":"printable","ipa":"","zh":"可印刷的"},{"w":"higher","ipa":"","zh":"adj. 更高的"},{"w":"predict","ipa":"","zh":"v. 预知, 预言, 预报"},{"w":"superimpose","ipa":"","zh":"vt. 重叠(安装,添加)"},{"w":"demonstrate","ipa":"","zh":"vt. 示范, 演示, 证明 vi. 示威"},{"w":"adjust","ipa":"","zh":"vt. 调整, 使...适于 vi. 适应"},{"w":"explanatory","ipa":"","zh":"adj. 说明的, 解释的"},{"w":"desk","ipa":"","zh":"n. 书桌"},{"w":"ascending","ipa":"","zh":"adj. 上升的"},{"w":"sale","ipa":"","zh":"n. 销售(量),削价出售"},{"w":"mix","ipa":"","zh":"n. 混合(物),融合 vt. &vi. 混合,掺入,合成,交往,联系 [计算机] 混合"},{"w":"disc","ipa":"","zh":"n. 圆盘，[电子] 唱片（等于disk）vt. 灌唱片"},{"w":"perforator","ipa":"","zh":"n.穿孔器,穿孔员"}]}]}

    /** 词表里的纯单词（保持老接口） */
    const WORD_POOL = LEXICON.map((entry) => entry.word)

    /** 内置兜底词库（qwerty-learner 数据没内联进来时用） */
    const FALLBACK_DICT = {
      id: 'builtin',
      name: '内置 24 词',
      category: '内置',
      words: LEXICON.map((entry) => ({ w: entry.word, ipa: entry.ipa, zh: entry.zh })),
    }

    /* @dict-index:start —— 由 scripts/build-index.mjs 生成，勿手改 */ const DICT_INDEX = {"source":"qwerty-learner","pinned":"490d7e3fef019c8246ee8c53f59e28f641253ef1","generatedAt":"2026-11-24","chapterLength":20,"dicts":[{"id":"cet4","name":"CET-4","category":"中国考试","tags":["大学英语"],"length":2607,"url":"/dicts/CET4_T.json","languageCategory":"en"},{"id":"cet6","name":"CET-6","category":"中国考试","tags":["大学英语"],"length":2345,"url":"/dicts/CET6_T.json","languageCategory":"en"},{"id":"xinghuoqiaoji_4","name":"四级巧记速记","category":"中国考试","tags":["大学英语"],"length":2522,"url":"/dicts/xinghuoqiaoji_4.json","languageCategory":"en"},{"id":"xinghuoqiaoji_6","name":"六级巧记速记","category":"中国考试","tags":["大学英语"],"length":7520,"url":"/dicts/xinghuoqiaoji_6.json","languageCategory":"en"},{"id":"cet4-sub","name":"CET-4-Sub","category":"中国考试","tags":["大学英语"],"length":1957,"url":"/dicts/DanCiDeJianFa_4.json","languageCategory":"en"},{"id":"cet6-sub","name":"CET-6-Sub","category":"中国考试","tags":["大学英语"],"length":1949,"url":"/dicts/DanCiDeJianFa_6.json","languageCategory":"en"},{"id":"kaoyan","name":"考研","category":"中国考试","tags":["考研"],"length":3728,"url":"/dicts/KaoYan_3_T.json","languageCategory":"en"},{"id":"kaoyan_2024","name":"考研 2024","category":"中国考试","tags":["考研"],"length":3731,"url":"/dicts/KaoYan_2024.json","languageCategory":"en"},{"id":"kaoyanshanguo_2023","name":"考研闪过 2023","category":"中国考试","tags":["考研"],"length":1771,"url":"/dicts/KaoYanShanGuo_2023.json","languageCategory":"en"},{"id":"926","name":"考研926词汇","category":"中国考试","tags":["考研"],"length":926,"url":"/dicts/926.json","languageCategory":"en"},{"id":"dancimimi_1","name":"单词的秘密-英语一","category":"中国考试","tags":["考研"],"length":5657,"url":"/dicts/DanCiDeMimi_1.json","languageCategory":"en"},{"id":"dancimimi_2","name":"单词的秘密-英语二","category":"中国考试","tags":["考研"],"length":3827,"url":"/dicts/DanCiDeMimi_2.json","languageCategory":"en"},{"id":"2024HongBao T1","name":"2024考研英语hongbaoshu(上)","category":"中国考试","tags":["考研"],"length":997,"url":"/dicts/2024HongBao_T1.json","languageCategory":"en"},{"id":"2024HongBao T2","name":"2024考研英语hongbaoshu(下)","category":"中国考试","tags":["考研"],"length":854,"url":"/dicts/2024HongBao_T2.json","languageCategory":"en"},{"id":"hongbaoshu-2026","name":"2026考研英语 hongbaoshu","category":"中国考试","tags":["考研"],"length":4858,"url":"/dicts/hongbaoshu-2026.json","languageCategory":"en"},{"id":"English_II","name":"英语二单词书","category":"中国考试","tags":["考研"],"length":4559,"url":"/dicts/English_II.json","languageCategory":"en"},{"id":"kaoyanshanguo2025","name":"考研 shanguo 2025","category":"中国考试","tags":["考研"],"length":2257,"url":"/dicts/kaoyanshanguo2025.json","languageCategory":"en"},{"id":"level4","name":"专四","category":"中国考试","tags":["大学英语"],"length":4025,"url":"/dicts/Level4luan_2_T.json","languageCategory":"en"},{"id":"level8","name":"专八","category":"中国考试","tags":["大学英语"],"length":12197,"url":"/dicts/Level8luan_2_T.json","languageCategory":"en"},{"id":"archVocabulary","name":"建筑专业英语","category":"中国考试","tags":["专业英语"],"length":630,"url":"/dicts/archVocabulary.json","languageCategory":"en"},{"id":"itVocabulary","name":"计算机专用英语","category":"中国考试","tags":["专业英语"],"length":1665,"url":"/dicts/itVocabulary.json","languageCategory":"en"},{"id":"pets3","name":"PETS","category":"中国考试","tags":["PET"],"length":1942,"url":"/dicts/PETS_3.json","languageCategory":"en"},{"id":"pets3-2023","name":"PETS-2023","category":"中国考试","tags":["PET"],"length":4449,"url":"/dicts/PETS3-2023.json","languageCategory":"en"},{"id":"self-study_English1","name":"自考1800高频单词","category":"中国考试","tags":["自考英语二"],"length":1800,"url":"/dicts/self-study_English1.json","languageCategory":"en"},{"id":"self-study_English2","name":"自考英语二高频悠悠单词","category":"中国考试","tags":["自考英语二"],"length":2181,"url":"/dicts/self-study_English2.json","languageCategory":"en"},{"id":"self-study_English3","name":"自考英语二完整单词","category":"中国考试","tags":["自考英语二"],"length":4603,"url":"/dicts/self-study_English3.json","languageCategory":"en"},{"id":"coca_20000","name":"COCA20000词","category":"中国考试","tags":["其他"],"length":20199,"url":"/dicts/coca20000.json","languageCategory":"en"},{"id":"4000_Essential_English_Words1","name":"Essential Words","category":"中国考试","tags":["其他"],"length":3600,"url":"/dicts/4000_Essential_English_Words-meaning.json","languageCategory":"en"},{"id":"4000_Essential_English_Words2","name":"Essential Words","category":"中国考试","tags":["其他"],"length":3600,"url":"/dicts/4000_Essential_English_Words-sentence.json","languageCategory":"en"},{"id":"longman_communication_3000_words","name":"Longman Communication 3000","category":"中国考试","tags":["其他"],"length":3168,"url":"/dicts/Longman_Communication_3000.json","languageCategory":"en"},{"id":"top_2000_English_Words","name":"Top 2000 words","category":"中国考试","tags":["其他"],"length":1867,"url":"/dicts/top2000words.json","languageCategory":"en"},{"id":"top_1500_nouns_Words","name":"Top 1500 Nouns","category":"中国考试","tags":["其他"],"length":1525,"url":"/dicts/Top1500NounWords.json","languageCategory":"en"},{"id":"top_1000_verb_Words","name":"Top 1000 Verbs","category":"中国考试","tags":["其他"],"length":1011,"url":"/dicts/Top1000VerbWords.json","languageCategory":"en"},{"id":"top_500_Adj_Words","name":"Top 500 adj.","category":"中国考试","tags":["其他"],"length":527,"url":"/dicts/Top500AdjectiveWords.json","languageCategory":"en"},{"id":"top_250_Adv_Words","name":"Top 250 adv.","category":"中国考试","tags":["其他"],"length":255,"url":"/dicts/Top250AdverbWords.json","languageCategory":"en"},{"id":"top_60_Pronouns","name":"Top 60 pron.","category":"中国考试","tags":["其他"],"length":59,"url":"/dicts/Top60Pronouns.json","languageCategory":"en"},{"id":"top_50_Prepositions","name":"Top 50 prep.","category":"中国考试","tags":["其他"],"length":46,"url":"/dicts/Top50Prepositions.json","languageCategory":"en"},{"id":"suffix word","name":"suffix word","category":"中国考试","tags":["其他"],"length":126,"url":"/dicts/suffix_word.json","languageCategory":"en"},{"id":"word roots1","name":"word roots1","category":"中国考试","tags":["其他"],"length":369,"url":"/dicts/word_roots1.json","languageCategory":"en"},{"id":"adult self-study examination","name":"专升本词汇","category":"中国考试","tags":["其他"],"length":3692,"url":"/dicts/adult-self-study-examination.json","languageCategory":"en"},{"id":"zhuan-cha-ben-ying-yu","name":"专插本英语词汇","category":"中国考试","tags":["其他"],"length":3217,"url":"/dicts/zhuan-cha-ben.json","languageCategory":"en"},{"id":"zhuan-sheng-ben-xue-shi","name":"专升本学士学位的英语","category":"中国考试","tags":["其他"],"length":897,"url":"/dicts/xueshiyingyu.json","languageCategory":"en"},{"id":"Oxford5000","name":"牛津5000词","category":"中国考试","tags":["其他"],"length":5836,"url":"/dicts/Oxford5000.json","languageCategory":"en"},{"id":"Merriam_Webster_sVocabularyBuilder","name":"韦氏词根词典","category":"中国考试","tags":["其他"],"length":1191,"url":"/dicts/Merriam_Webster_sVocabularyBuilder.json","languageCategory":"en"},{"id":"tingshuokaoshi","name":"听说考试常见词汇","category":"中国考试","tags":["其他"],"length":557,"url":"/dicts/tingshuokaoshi.json","languageCategory":"en"},{"id":"TOEFL_ZhangHongYan","name":"ZhangHongYan的TOEFL词汇书","category":"国际考试","tags":["TOEFL"],"length":4032,"url":"/dicts/TOEFL_ZhangHongYan.json","languageCategory":"en"},{"id":"2025KaoYanHongBaoShu","name":"2025考研英语词汇hongbao书","category":"中国考试","tags":["考研"],"length":6705,"url":"/dicts/2025KaoYanHongBaoShu.json","languageCategory":"en"},{"id":"3000_ClassRoom_English_Words","name":"专升本3000词","category":"中国考试","tags":["大学英语"],"length":2991,"url":"/dicts/3000_ClassRoom_English_Words.json","languageCategory":"en"},{"id":"frequently_used_words01","name":"超频单词level 1","category":"中国考试","tags":["其他"],"length":679,"url":"/dicts/frequently_used_word01.json","languageCategory":"en"},{"id":"frequently_used_words03","name":"超频单词level 2","category":"中国考试","tags":["其他"],"length":1040,"url":"/dicts/frequently_used_word02.json","languageCategory":"en"},{"id":"roger","name":"roger","category":"英语词典","tags":["课外词汇"],"length":4174,"url":"/dicts/RogersWords.json","languageCategory":"en"},{"id":"pet-2024","name":"PET-2024","category":"国际考试","tags":["PET"],"length":1871,"url":"/dicts/pet-vacabulary-list-2024.json","languageCategory":"en"},{"id":"gmat","name":"GMAT","category":"国际考试","tags":["GMAT"],"length":3047,"url":"/dicts/GMAT_3_T.json","languageCategory":"en"},{"id":"gre","name":"GRE","category":"国际考试","tags":["GRE"],"length":6515,"url":"/dicts/GRE_3_T.json","languageCategory":"en"},{"id":"gre1500","name":"GRE重点1500词-fen哥","category":"国际考试","tags":["GRE"],"length":1533,"url":"/dicts/GRE_1500.json","languageCategory":"en"},{"id":"gre3000","name":"GRE3000","category":"国际考试","tags":["GRE"],"length":3041,"url":"/dicts/GRE3000_3_T.json","languageCategory":"en"},{"id":"GRE-computer-based-test","name":"GRE机经词汇","category":"国际考试","tags":["GRE"],"length":1451,"url":"/dicts/GRE-computer-based-test.json","languageCategory":"en"},{"id":"ZaiYaoNiMing_GRE3000","name":"再要你命GRE3000","category":"国际考试","tags":["GRE"],"length":3041,"url":"/dicts/ZaiYaoNiMing_GRE3000.json","languageCategory":"en"},{"id":"GRE_equivalent","name":"GRE等价词","category":"国际考试","tags":["GRE"],"length":827,"url":"/dicts/GRE_equivalent.json","languageCategory":"en"},{"id":"GRE_ciyileiji","name":"GRE词以类记","category":"国际考试","tags":["GRE"],"length":8785,"url":"/dicts/gre-ciyileiji.json","languageCategory":"en"},{"id":"biomedical-terms","name":"生物医学专业英语词汇","category":"专业词汇","tags":["生物"],"length":560,"url":"/dicts/BIOmedical.json","languageCategory":"en"},{"id":"IELTS_tinglichangjing","name":"雅思听力场景词汇","category":"国际考试","tags":["IELTS"],"length":1204,"url":"/dicts/IELTS_tinglichangjing.json","languageCategory":"en"},{"id":"ielts_disorder","name":"IELTS乱序完整版","category":"国际考试","tags":["IELTS"],"length":9389,"url":"/dicts/IELTS_disorder.json","languageCategory":"en"},{"id":"ielts_order","name":"IELTS顺序完整版","category":"国际考试","tags":["IELTS"],"length":9389,"url":"/dicts/IELTS_order.json","languageCategory":"en"},{"id":"ielts","name":"IELTS","category":"国际考试","tags":["IELTS"],"length":3575,"url":"/dicts/IELTS_3_T.json","languageCategory":"en"},{"id":"heqiong","name":"heQiong雅思听力必考词汇","category":"国际考试","tags":["IELTS"],"length":2529,"url":"/dicts/HeQiong_IELTS.json","languageCategory":"en"},{"id":"ieltsWang3","name":"雅思wang C3","category":"国际考试","tags":["IELTS"],"length":1135,"url":"/dicts/IELTS_WANG_3.json","languageCategory":"en"},{"id":"ieltsWang4","name":"雅思wang C4","category":"国际考试","tags":["IELTS"],"length":346,"url":"/dicts/IELTS_WANG_4.json","languageCategory":"en"},{"id":"ieltsWang5","name":"雅思wang C5","category":"国际考试","tags":["IELTS"],"length":1569,"url":"/dicts/IELTS_WANG_5.json","languageCategory":"en"},{"id":"ieltsWang11","name":"雅思wang C11","category":"国际考试","tags":["IELTS"],"length":1738,"url":"/dicts/IELTS_WANG_11.json","languageCategory":"en"},{"id":"DuckCircle_IELTS","name":"鸭圈雅思核心词","category":"国际考试","tags":["IELTS"],"length":2644,"url":"/dicts/DuckCircle_IELTS.json","languageCategory":"en"},{"id":"IELTSVocabularyBible","name":"雅思词汇真经","category":"国际考试","tags":["IELTS"],"length":3673,"url":"/dicts/IELTSVocabularyBible.json","languageCategory":"en"},{"id":"IELTS-807","name":"雅思 wanglu 807","category":"国际考试","tags":["IELTS"],"length":4340,"url":"/dicts/ielts-807.json","languageCategory":"en"},{"id":"ielts-real-high","name":"雅思 real 词汇 高频","category":"国际考试","tags":["IELTS"],"length":524,"url":"/dicts/ielts-real-high.json","languageCategory":"en"},{"id":"ielts-real-5","name":"雅思 real 词汇 5","category":"国际考试","tags":["IELTS"],"length":183,"url":"/dicts/ielts-real-5.json","languageCategory":"en"},{"id":"ielts-real-4","name":"雅思 real 词汇 4","category":"国际考试","tags":["IELTS"],"length":201,"url":"/dicts/ielts-real-4.json","languageCategory":"en"},{"id":"ielts-real-3","name":"雅思 real 词汇 3","category":"国际考试","tags":["IELTS"],"length":256,"url":"/dicts/ielts-real-3.json","languageCategory":"en"},{"id":"ielts-real-2","name":"雅思 real 词汇 2","category":"国际考试","tags":["IELTS"],"length":402,"url":"/dicts/ielts-real-2.json","languageCategory":"en"},{"id":"ielts-real-1","name":"雅思 real 词汇 1","category":"国际考试","tags":["IELTS"],"length":737,"url":"/dicts/ielts-real-1.json","languageCategory":"en"},{"id":"IELTS9988wangyong","name":"雅思9988wangyong","category":"国际考试","tags":["IELTS"],"length":3698,"url":"/dicts/IELTS9988wangyong.json","languageCategory":"en"},{"id":"IELTSKingLu807","name":"wanglu807雅思词汇听力第2版","category":"国际考试","tags":["IELTS"],"length":1916,"url":"/dicts/IELTSKingLu807.json","languageCategory":"en"},{"id":"IELTSXDF7000","name":"100个句子记完7000个雅思单词","category":"国际考试","tags":["IELTS"],"length":5567,"url":"/dicts/IELTS_XDF_7000.json","languageCategory":"en"},{"id":"IELTS-oral-900","name":"雅思口语 900 beta版","category":"国际考试","tags":["IELTS"],"length":900,"url":"/dicts/IELTS-oral-900.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task1","name":"xdf听力 雅思中级直通车 day1","category":"国际考试","tags":["IELTS"],"length":44,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task1.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task2","name":"xdf听力 雅思中级直通车 day2","category":"国际考试","tags":["IELTS"],"length":33,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task2.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task3","name":"xdf听力 雅思中级直通车 day3","category":"国际考试","tags":["IELTS"],"length":33,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task3.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task4","name":"xdf听力 雅思中级直通车 day4","category":"国际考试","tags":["IELTS"],"length":33,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task4.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task5","name":"xdf听力 雅思中级直通车 day5","category":"国际考试","tags":["IELTS"],"length":38,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task5.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task6","name":"xdf听力 雅思中级直通车 day6","category":"国际考试","tags":["IELTS"],"length":33,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task6.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task7","name":"xdf听力 雅思中级直通车 day7","category":"国际考试","tags":["IELTS"],"length":39,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task7.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task8","name":"xdf听力 雅思中级直通车 day8","category":"国际考试","tags":["IELTS"],"length":32,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task8.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task9","name":"xdf听力 雅思中级直通车 day9","category":"国际考试","tags":["IELTS"],"length":46,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task9.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task10","name":"xdf听力 雅思中级直通车 day10","category":"国际考试","tags":["IELTS"],"length":44,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task10.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task11","name":"xdf听力 雅思中级直通车 day11","category":"国际考试","tags":["IELTS"],"length":36,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task11.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task12","name":"xdf听力 雅思中级直通车 day12","category":"国际考试","tags":["IELTS"],"length":45,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task12.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task13","name":"xdf听力 雅思中级直通车 day13","category":"国际考试","tags":["IELTS"],"length":49,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task13.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task14","name":"xdf听力 雅思中级直通车 day14","category":"国际考试","tags":["IELTS"],"length":46,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task14.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task15","name":"xdf听力 雅思中级直通车 day15","category":"国际考试","tags":["IELTS"],"length":29,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task15.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task16","name":"xdf听力 雅思中级直通车 day16","category":"国际考试","tags":["IELTS"],"length":42,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task16.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task17","name":"xdf听力 雅思中级直通车 day17","category":"国际考试","tags":["IELTS"],"length":22,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task17.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task18","name":"xdf听力 雅思中级直通车 day18","category":"国际考试","tags":["IELTS"],"length":37,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task18.json","languageCategory":"en"},{"id":"IELTS-listening-NeworientalDirect-Task19","name":"xdf听力 雅思中级直通车 day19","category":"国际考试","tags":["IELTS"],"length":26,"url":"/dicts/IELTS-listening-NewOrientalDirect-Task19.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-1","name":"雅思听力词汇18天 day1","category":"国际考试","tags":["IELTS"],"length":74,"url":"/dicts/IELTS-listening-18days-day1.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-2","name":"雅思听力词汇18天 day2","category":"国际考试","tags":["IELTS"],"length":77,"url":"/dicts/IELTS-listening-18days-day2.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-3","name":"雅思听力词汇18天 day3","category":"国际考试","tags":["IELTS"],"length":77,"url":"/dicts/IELTS-listening-18days-day3.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-4","name":"雅思听力词汇18天 day4","category":"国际考试","tags":["IELTS"],"length":73,"url":"/dicts/IELTS-listening-18days-day4.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-5","name":"雅思听力词汇18天 day5","category":"国际考试","tags":["IELTS"],"length":76,"url":"/dicts/IELTS-listening-18days-day5.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-6","name":"雅思听力词汇18天 day6","category":"国际考试","tags":["IELTS"],"length":77,"url":"/dicts/IELTS-listening-18days-day6.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-7","name":"雅思听力词汇18天 day7","category":"国际考试","tags":["IELTS"],"length":75,"url":"/dicts/IELTS-listening-18days-day7.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-8","name":"雅思听力词汇18天 day8","category":"国际考试","tags":["IELTS"],"length":76,"url":"/dicts/IELTS-listening-18days-day8.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-9","name":"雅思听力词汇18天 day9","category":"国际考试","tags":["IELTS"],"length":76,"url":"/dicts/IELTS-listening-18days-day9.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-10","name":"雅思听力词汇18天 day10","category":"国际考试","tags":["IELTS"],"length":33,"url":"/dicts/IELTS-listening-18days-day10.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-11","name":"雅思听力词汇18天 day11","category":"国际考试","tags":["IELTS"],"length":52,"url":"/dicts/IELTS-listening-18days-day11.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-12","name":"雅思听力词汇18天 day12","category":"国际考试","tags":["IELTS"],"length":77,"url":"/dicts/IELTS-listening-18days-day12.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-13","name":"雅思听力词汇18天 day13","category":"国际考试","tags":["IELTS"],"length":78,"url":"/dicts/IELTS-listening-18days-day13.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-14","name":"雅思听力词汇18天 day14","category":"国际考试","tags":["IELTS"],"length":76,"url":"/dicts/IELTS-listening-18days-day14.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-15","name":"雅思听力词汇18天 day15","category":"国际考试","tags":["IELTS"],"length":77,"url":"/dicts/IELTS-listening-18days-day15.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-16","name":"雅思听力词汇18天 day16","category":"国际考试","tags":["IELTS"],"length":77,"url":"/dicts/IELTS-listening-18days-day16.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-17","name":"雅思听力词汇18天 day17","category":"国际考试","tags":["IELTS"],"length":46,"url":"/dicts/IELTS-listening-18days-day17.json","languageCategory":"en"},{"id":"IELTS-listening-18-days-18","name":"雅思听力词汇18天 day18","category":"国际考试","tags":["IELTS"],"length":76,"url":"/dicts/IELTS-listening-18days-day18.json","languageCategory":"en"},{"id":"ket","name":"KET","category":"国际考试","tags":["KET"],"length":1147,"url":"./dicts/ket2021.json","languageCategory":"en"},{"id":"sat","name":"SAT","category":"国际考试","tags":["SAT"],"length":4464,"url":"/dicts/SAT_3_T.json","languageCategory":"en"},{"id":"SATen","name":"SAT en-en","category":"国际考试","tags":["SAT"],"length":2681,"url":"/dicts/SATen.json","languageCategory":"en"},{"id":"toefl","name":"TOEFL","category":"国际考试","tags":["TOEFL"],"length":4264,"url":"/dicts/TOEFL_3_T.json","languageCategory":"en"},{"id":"bec2","name":"商务英语","category":"国际考试","tags":["BEC"],"length":2753,"url":"/dicts/BEC_2_T.json","languageCategory":"en"},{"id":"bec3","name":"BEC","category":"国际考试","tags":["BEC"],"length":2825,"url":"/dicts/BEC_3_T.json","languageCategory":"en"},{"id":"PTE_junior","name":"PTE 基础词汇","category":"国际考试","tags":["PTE"],"length":2651,"url":"/dicts/PTE_junior.json","languageCategory":"en"},{"id":"PTE_senior","name":"PTE 高阶词汇","category":"国际考试","tags":["PTE"],"length":3170,"url":"/dicts/PTE_senior.json","languageCategory":"en"},{"id":"PTE_FIB_R_junior","name":"阅读 FIB 基础机经词汇","category":"国际考试","tags":["PTE"],"length":941,"url":"/dicts/PTE_FIB_R_junior.json","languageCategory":"en"},{"id":"PTE_FIB_R_senior","name":"阅读 FIB 高阶机经词汇","category":"国际考试","tags":["PTE"],"length":1272,"url":"/dicts/PTE_FIB_R_senior.json","languageCategory":"en"},{"id":"PTE_WFD","name":"WFD 机经词汇","category":"国际考试","tags":["PTE"],"length":1212,"url":"/dicts/PTE_WFD.json","languageCategory":"en"},{"id":"PTE_FIB_L","name":"听力 FIB 机经词汇","category":"国际考试","tags":["PTE"],"length":646,"url":"/dicts/PTE_FIB_L.json","languageCategory":"en"},{"id":"PTE_Basic_apeuni","name":"PTE 基础词汇 xingji","category":"国际考试","tags":["PTE"],"length":2652,"url":"/dicts/PTE_Basic_apeuni.json","languageCategory":"en"},{"id":"PTE_Advanced_apeuni.json","name":"PTE 高阶词汇 xingji","category":"国际考试","tags":["PTE"],"length":3169,"url":"/dicts/PTE_Advanced_apeuni.json","languageCategory":"en"},{"id":"PTE_Read_apeuni.json","name":"PTE 阅读FIB机经词汇 xingji","category":"国际考试","tags":["PTE"],"length":630,"url":"/dicts/PTE_Read_apeuni.json","languageCategory":"en"},{"id":"PTE_Listening_apeuni.json","name":"PTE 听力FIB机经词汇 xingji","category":"国际考试","tags":["PTE"],"length":674,"url":"/dicts/PTE_Listening_apeuni.json","languageCategory":"en"},{"id":"TOEIC","name":"TOEIC 词汇","category":"国际考试","tags":["TOEIC"],"length":1694,"url":"/dicts/TOEIC.json","languageCategory":"en"},{"id":"Duolingo_Vocabulary_B1","name":"多邻国分级词汇B1","category":"国际考试","tags":["CEFR"],"length":801,"url":"/dicts/Duolingo_Vocabulary_B1.json","languageCategory":"en"},{"id":"Duolingo_Vocabulary_B2","name":"多邻国分级词汇B2","category":"国际考试","tags":["CEFR"],"length":1423,"url":"/dicts/Duolingo_Vocabulary_B2.json","languageCategory":"en"},{"id":"Duolingo_Vocabulary_C1","name":"多邻国分级词汇C1","category":"国际考试","tags":["CEFR"],"length":1314,"url":"/dicts/Duolingo_Vocabulary_C1.json","languageCategory":"en"},{"id":"Oxford3000","name":"牛津3000词","category":"国际考试","tags":["牛津版"],"length":1342,"url":"/dicts/Oxford3000.json","languageCategory":"en"},{"id":"voa","name":"VOA 基础词库","category":"国际考试","tags":["其他"],"length":1505,"url":"/dicts/voa.json","languageCategory":"en"},{"id":"Common-Phrases-PTE-Unofficial","name":"PTE 常用短语 (非官方)","category":"国际考试","tags":["PTE"],"length":274,"url":"/dicts/Common-Phrases-PTE-Unofficial.json","languageCategory":"en"},{"id":"Common-Phrases-FCE-Unofficial","name":"FCE 常用短语 (非官方)","category":"国际考试","tags":["FCE"],"length":438,"url":"/dicts/Common-Phrases-FCE-Unofficial.json","languageCategory":"en"},{"id":"Categorized_TOEFL_Vocabulary_by_Zhanghongyan","name":"Categorized Vocab.","category":"国际考试","tags":["TOEFL"],"length":4123,"url":"/dicts/Categorized_TOEFL_Vocabulary_by_Zhanghongyan.json","languageCategory":"en"},{"id":"gaokao3500","name":"高考 3500 词","category":"青少年英语","tags":["通用"],"length":3893,"url":"/dicts/GaoKao_3500.json","languageCategory":"en"},{"id":"gaokaozhentihexin","name":"高考历年真题核心高频","category":"青少年英语","tags":["通用"],"length":799,"url":"/dicts/GaoKaoZhenTiHeXinGaoPin.json","languageCategory":"en"},{"id":"gaokao-yuedu-gaopin","name":"高考英语阅读高频词汇","category":"青少年英语","tags":["通用"],"length":688,"url":"/dicts/gaokao-yuedu-gaopin.json","languageCategory":"en"},{"id":"zhongkaohexin","name":"中考核心词","category":"青少年英语","tags":["通用"],"length":2140,"url":"/dicts/ZhongKaoHeXin.json","languageCategory":"en"},{"id":"nce1","name":"新概念英语-1","category":"青少年英语","tags":["新概念英语"],"length":900,"url":"/dicts/NCE_1.json","languageCategory":"en"},{"id":"nce2","name":"新概念英语-2","category":"青少年英语","tags":["新概念英语"],"length":858,"url":"/dicts/NCE_2.json","languageCategory":"en"},{"id":"nce3","name":"新概念英语-3","category":"青少年英语","tags":["新概念英语"],"length":1052,"url":"/dicts/NCE_3.json","languageCategory":"en"},{"id":"nce4","name":"新概念英语-4","category":"青少年英语","tags":["新概念英语"],"length":784,"url":"/dicts/NCE_4.json","languageCategory":"en"},{"id":"nce-new-1","name":"新概念英语(新版)-1","category":"青少年英语","tags":["新概念英语"],"length":908,"url":"/dicts/nce-new-1.json","languageCategory":"en"},{"id":"nce-new-2","name":"新概念英语(新版)-2","category":"青少年英语","tags":["新概念英语"],"length":862,"url":"/dicts/nce-new-2.json","languageCategory":"en"},{"id":"nce-new-3","name":"新概念英语(新版)-3","category":"青少年英语","tags":["新概念英语"],"length":1062,"url":"/dicts/nce-new-3.json","languageCategory":"en"},{"id":"nce-new-4","name":"新概念英语(新版)-4","category":"青少年英语","tags":["新概念英语"],"length":793,"url":"/dicts/nce-new-4.json","languageCategory":"en"},{"id":"SHjuniormiddleOxford","name":"上海初中牛津词汇","category":"青少年英语","tags":["牛津版"],"length":1270,"url":"/dicts/OxfordVocabulary_juniorMiddleSH.json","languageCategory":"en"},{"id":"san1","name":"三年级上","category":"青少年英语","tags":["人教版"],"length":64,"url":"/dicts/PEPXiaoXue3_1_T.json","languageCategory":"en"},{"id":"san2","name":"三年级下","category":"青少年英语","tags":["人教版"],"length":72,"url":"/dicts/PEPXiaoXue3_2_T.json","languageCategory":"en"},{"id":"si1","name":"四年级上","category":"青少年英语","tags":["人教版"],"length":84,"url":"/dicts/PEPXiaoXue4_1_T.json","languageCategory":"en"},{"id":"si2","name":"四年级下","category":"青少年英语","tags":["人教版"],"length":104,"url":"/dicts/PEPXiaoXue4_2_T.json","languageCategory":"en"},{"id":"wu1","name":"五年级上","category":"青少年英语","tags":["人教版"],"length":131,"url":"/dicts/PEPXiaoXue5_1_T.json","languageCategory":"en"},{"id":"wu2","name":"五年级下","category":"青少年英语","tags":["人教版"],"length":156,"url":"/dicts/PEPXiaoXue5_2_T.json","languageCategory":"en"},{"id":"liu1","name":"六年级上","category":"青少年英语","tags":["人教版"],"length":130,"url":"/dicts/PEPXiaoXue6_1_T.json","languageCategory":"en"},{"id":"liu2","name":"六年级下","category":"青少年英语","tags":["人教版"],"length":108,"url":"/dicts/PEPXiaoXue6_2_T.json","languageCategory":"en"},{"id":"pep-sl-yi1","name":"人教版(新起点)一年级上","category":"青少年英语","tags":["人教版"],"length":52,"url":"/dicts/PEP_SL_XiaoXue1_1_t.json","languageCategory":"en"},{"id":"pep-sl-yi2","name":"人教版(新起点)一年级下","category":"青少年英语","tags":["人教版"],"length":45,"url":"/dicts/PEP_SL_XiaoXue1_2_t.json","languageCategory":"en"},{"id":"pep-sl-er1","name":"人教版(新起点)二年级上","category":"青少年英语","tags":["人教版"],"length":54,"url":"/dicts/PEP_SL_XiaoXue2_1_t.json","languageCategory":"en"},{"id":"pep-sl-er2","name":"人教版(新起点)二年级下","category":"青少年英语","tags":["人教版"],"length":55,"url":"/dicts/PEP_SL_XiaoXue2_2_t.json","languageCategory":"en"},{"id":"pep-sl-san1","name":"人教版(新起点)三年级上","category":"青少年英语","tags":["人教版"],"length":103,"url":"/dicts/PEP_SL_XiaoXue3_1_t.json","languageCategory":"en"},{"id":"pep-sl-san2","name":"人教版(新起点)三年级下","category":"青少年英语","tags":["人教版"],"length":84,"url":"/dicts/PEP_SL_XiaoXue3_2_t.json","languageCategory":"en"},{"id":"pep-sl-si1","name":"人教版(新起点)四年级上","category":"青少年英语","tags":["人教版"],"length":116,"url":"/dicts/PEP_SL_XiaoXue4_1_t.json","languageCategory":"en"},{"id":"pep-sl-si2","name":"人教版(新起点)四年级下","category":"青少年英语","tags":["人教版"],"length":87,"url":"/dicts/PEP_SL_XiaoXue4_2_t.json","languageCategory":"en"},{"id":"pep-sl-wu1","name":"人教版(新起点)五年级上","category":"青少年英语","tags":["人教版"],"length":66,"url":"/dicts/PEP_SL_XiaoXue5_1_t.json","languageCategory":"en"},{"id":"pep-sl-wu2","name":"人教版(新起点)五年级下","category":"青少年英语","tags":["人教版"],"length":96,"url":"/dicts/PEP_SL_XiaoXue5_2_t.json","languageCategory":"en"},{"id":"pep-sl-liu1","name":"人教版(新起点)六年级上","category":"青少年英语","tags":["人教版"],"length":102,"url":"/dicts/PEP_SL_XiaoXue6_1_t.json","languageCategory":"en"},{"id":"pep-sl-liu2","name":"人教版(新起点)六年级下","category":"青少年英语","tags":["人教版"],"length":41,"url":"/dicts/PEP_SL_XiaoXue6_2_t.json","languageCategory":"en"},{"id":"qi1","name":"七年级上","category":"青少年英语","tags":["人教版"],"length":392,"url":"/dicts/PEPChuZhong7_1_T.json","languageCategory":"en"},{"id":"qi2","name":"七年级下","category":"青少年英语","tags":["人教版"],"length":492,"url":"/dicts/PEPChuZhong7_2_T.json","languageCategory":"en"},{"id":"ba1","name":"八年级上","category":"青少年英语","tags":["人教版"],"length":419,"url":"/dicts/PEPChuZhong8_1_T.json","languageCategory":"en"},{"id":"ba2","name":"八年级下","category":"青少年英语","tags":["人教版"],"length":466,"url":"/dicts/PEPChuZhong8_2_T.json","languageCategory":"en"},{"id":"jiu","name":"九年级","category":"青少年英语","tags":["人教版"],"length":551,"url":"/dicts/PEPChuZhong9_1_T.json","languageCategory":"en"},{"id":"renjiaogaozhong1","name":"高中必修1","category":"青少年英语","tags":["人教版"],"length":311,"url":"/dicts/PEPGaoZhong_1_T.json","languageCategory":"en"},{"id":"renjiaogaozhong2","name":"高中必修2","category":"青少年英语","tags":["人教版"],"length":319,"url":"/dicts/PEPGaoZhong_2_T.json","languageCategory":"en"},{"id":"renjiaogaozhong3","name":"高中必修3","category":"青少年英语","tags":["人教版"],"length":366,"url":"/dicts/PEPGaoZhong_3_T.json","languageCategory":"en"},{"id":"renjiaogaozhong4","name":"高中必修4","category":"青少年英语","tags":["人教版"],"length":307,"url":"/dicts/PEPGaoZhong_4_T.json","languageCategory":"en"},{"id":"renjiaogaozhong5","name":"高中必修5","category":"青少年英语","tags":["人教版"],"length":357,"url":"/dicts/PEPGaoZhong_5_T.json","languageCategory":"en"},{"id":"renjiaogaozhong6","name":"高中选修6","category":"青少年英语","tags":["人教版"],"length":391,"url":"/dicts/PEPGaoZhong_6_T.json","languageCategory":"en"},{"id":"renjiaogaozhong7","name":"高中选修7","category":"青少年英语","tags":["人教版"],"length":384,"url":"/dicts/PEPGaoZhong_7_T.json","languageCategory":"en"},{"id":"renjiaogaozhong8","name":"高中选修8","category":"青少年英语","tags":["人教版"],"length":420,"url":"/dicts/PEPGaoZhong_8_T.json","languageCategory":"en"},{"id":"renjiaogaozhong9","name":"高中选修9","category":"青少年英语","tags":["人教版"],"length":352,"url":"/dicts/PEPGaoZhong_9_T.json","languageCategory":"en"},{"id":"renjiaogaozhong10","name":"高中选修10","category":"青少年英语","tags":["人教版"],"length":361,"url":"/dicts/PEPGaoZhong_10_T.json","languageCategory":"en"},{"id":"renjiaogaozhong11","name":"高中选修11","category":"青少年英语","tags":["人教版"],"length":309,"url":"/dicts/PEPGaoZhong_11_T.json","languageCategory":"en"},{"id":"waiyan1","name":"外研七年级上册","category":"青少年英语","tags":["外研版"],"length":629,"url":"/dicts/WaiYanSheChuZhong_1_T.json","languageCategory":"en"},{"id":"new-waiyan1","name":"新外研七年级上册","category":"青少年英语","tags":["外研版"],"length":294,"url":"/dicts/Newwaiyan7-1.json","languageCategory":"en"},{"id":"new-waiyan2","name":"新外研七年级下册","category":"青少年英语","tags":["外研版"],"length":306,"url":"/dicts/Newwaiyan7-2.json","languageCategory":"en"},{"id":"waiyan2","name":"外研七年级下册","category":"青少年英语","tags":["外研版"],"length":438,"url":"/dicts/WaiYanSheChuZhong_2_T.json","languageCategory":"en"},{"id":"waiyan3","name":"外研八年级上册","category":"青少年英语","tags":["外研版"],"length":320,"url":"/dicts/WaiYanSheChuZhong_3_T.json","languageCategory":"en"},{"id":"waiyan4","name":"外研八年级下册","category":"青少年英语","tags":["外研版"],"length":266,"url":"/dicts/WaiYanSheChuZhong_4_T.json","languageCategory":"en"},{"id":"waiyan5","name":"外研九年级上册","category":"青少年英语","tags":["外研版"],"length":381,"url":"/dicts/WaiYanSheChuZhong_5_T.json","languageCategory":"en"},{"id":"waiyan6","name":"外研九年级下册","category":"青少年英语","tags":["外研版"],"length":128,"url":"/dicts/WaiYanSheChuZhong_6_T.json","languageCategory":"en"},{"id":"waiyan7","name":"外研高中必修1","category":"青少年英语","tags":["外研版"],"length":411,"url":"/dicts/WaiYanSheGaoZhong_1_T.json","languageCategory":"en"},{"id":"waiyan8","name":"外研高中必修2","category":"青少年英语","tags":["外研版"],"length":272,"url":"/dicts/WaiYanSheGaoZhong_2_T.json","languageCategory":"en"},{"id":"waiyan9","name":"外研一年级上册","category":"青少年英语","tags":["外研版"],"length":138,"url":"/dicts/WaiYanSheChuZhong_1-Volume-up.json","languageCategory":"en"},{"id":"waiyan10","name":"外研一年级下册","category":"青少年英语","tags":["外研版"],"length":118,"url":"/dicts/WaiYanSheChuZhong_1-Volume-down.json","languageCategory":"en"},{"id":"waiyan11","name":"外研二年级上册","category":"青少年英语","tags":["外研版"],"length":118,"url":"/dicts/WaiYanSheChuZhong_2-Volume-top.json","languageCategory":"en"},{"id":"waiyan12","name":"外研二年级下册","category":"青少年英语","tags":["外研版"],"length":110,"url":"/dicts/WaiYanSheChuZhong_2-Volume-down.json","languageCategory":"en"},{"id":"waiyan13","name":"外研三年级上册","category":"青少年英语","tags":["外研版"],"length":82,"url":"/dicts/WaiYanSheChuZhong_3-Volume-top.json","languageCategory":"en"},{"id":"waiyan14","name":"外研三年级下册","category":"青少年英语","tags":["外研版"],"length":106,"url":"/dicts/WaiYanSheChuZhong_3-Volume-down.json","languageCategory":"en"},{"id":"waiyan15","name":"外研四年级上册","category":"青少年英语","tags":["外研版"],"length":116,"url":"/dicts/WaiYanSheChuZhong_4-Volume-top.json","languageCategory":"en"},{"id":"waiyan16","name":"外研四年级下册","category":"青少年英语","tags":["外研版"],"length":78,"url":"/dicts/WaiYanSheChuZhong_4-Volume-down.json","languageCategory":"en"},{"id":"waiyan17","name":"外研五年级上册","category":"青少年英语","tags":["外研版"],"length":80,"url":"/dicts/WaiYanSheChuZhong_5-Volume-top.json","languageCategory":"en"},{"id":"waiyan18","name":"外研五年级下册","category":"青少年英语","tags":["外研版"],"length":72,"url":"/dicts/WaiYanSheChuZhong_5-Volume-down.json","languageCategory":"en"},{"id":"waiyan19","name":"外研六年级上册","category":"青少年英语","tags":["外研版"],"length":61,"url":"/dicts/WaiYanSheChuZhong_6-Volume-top.json","languageCategory":"en"},{"id":"waiyan20","name":"外研六年级下册","category":"青少年英语","tags":["外研版"],"length":91,"url":"/dicts/WaiYanSheChuZhong_6-Volume-down.json","languageCategory":"en"},{"id":"waiyan3-1","name":"外研新起点三年级上册","category":"青少年英语","tags":["外研版"],"length":134,"url":"/dicts/waiyan-xin-3-1.json","languageCategory":"en"},{"id":"waiyan3-2","name":"外研新起点三年级下册","category":"青少年英语","tags":["外研版"],"length":156,"url":"/dicts/waiyan-xin-3-2.json","languageCategory":"en"},{"id":"waiyan4-1","name":"外研新起点四年级上册","category":"青少年英语","tags":["外研版"],"length":144,"url":"/dicts/waiyan-xin-4-1.json","languageCategory":"en"},{"id":"waiyan4-2","name":"外研新起点四年级下册","category":"青少年英语","tags":["外研版"],"length":134,"url":"/dicts/waiyan-xin-4-2.json","languageCategory":"en"},{"id":"waiyan5-1","name":"外研新起点五年级上册","category":"青少年英语","tags":["外研版"],"length":152,"url":"/dicts/waiyan-xin-5-1.json","languageCategory":"en"},{"id":"waiyan5-2","name":"外研新起点五年级下册","category":"青少年英语","tags":["外研版"],"length":147,"url":"/dicts/waiyan-xin-5-2.json","languageCategory":"en"},{"id":"waiyan6-1","name":"外研新起点六年级上册","category":"青少年英语","tags":["外研版"],"length":83,"url":"/dicts/waiyan-xin-6-1.json","languageCategory":"en"},{"id":"waiyan6-2","name":"外研新起点六年级下册","category":"青少年英语","tags":["外研版"],"length":105,"url":"/dicts/waiyan-xin-6-2.json","languageCategory":"en"},{"id":"shanghai-6-2word","name":"上海新教材六年级下","category":"青少年英语","tags":["上海版"],"length":274,"url":"/dicts/shanghai-6-2-word.json","languageCategory":"en"},{"id":"Yilin1","name":"高中必修1","category":"青少年英语","tags":["译林版"],"length":276,"url":"./dicts/YiLin_1.json","languageCategory":"en"},{"id":"Yilin2","name":"高中必修2","category":"青少年英语","tags":["译林版"],"length":297,"url":"./dicts/YiLin_2.json","languageCategory":"en"},{"id":"Yilin3","name":"高中必修3","category":"青少年英语","tags":["译林版"],"length":295,"url":"./dicts/YiLin_3.json","languageCategory":"en"},{"id":"beishi1","name":"高中必修1","category":"青少年英语","tags":["北师大"],"length":226,"url":"/dicts/BeiShiGaoZhong_1_T.json","languageCategory":"en"},{"id":"beishi2","name":"高中必修2","category":"青少年英语","tags":["北师大"],"length":244,"url":"/dicts/BeiShiGaoZhong_2_T.json","languageCategory":"en"},{"id":"beishi3","name":"高中必修3","category":"青少年英语","tags":["北师大"],"length":295,"url":"/dicts/BeiShiGaoZhong_3_T.json","languageCategory":"en"},{"id":"beishi4","name":"高中必修4","category":"青少年英语","tags":["北师大"],"length":336,"url":"/dicts/BeiShiGaoZhong_4_T.json","languageCategory":"en"},{"id":"beishi5","name":"高中必修5","category":"青少年英语","tags":["北师大"],"length":327,"url":"/dicts/BeiShiGaoZhong_5_T.json","languageCategory":"en"},{"id":"beishi6","name":"高中选修6","category":"青少年英语","tags":["北师大"],"length":271,"url":"/dicts/BeiShiGaoZhong_6_T.json","languageCategory":"en"},{"id":"beishi7","name":"高中选修7","category":"青少年英语","tags":["北师大"],"length":334,"url":"/dicts/BeiShiGaoZhong_7_T.json","languageCategory":"en"},{"id":"beishi8","name":"高中选修8","category":"青少年英语","tags":["北师大"],"length":364,"url":"/dicts/BeiShiGaoZhong_8_T.json","languageCategory":"en"},{"id":"beishi9","name":"高中选修9","category":"青少年英语","tags":["北师大"],"length":299,"url":"/dicts/BeiShiGaoZhong_9_T.json","languageCategory":"en"},{"id":"beishi10","name":"高中选修10","category":"青少年英语","tags":["北师大"],"length":267,"url":"/dicts/BeiShiGaoZhong_10_T.json","languageCategory":"en"},{"id":"beishi11","name":"高中选修11","category":"青少年英语","tags":["北师大"],"length":330,"url":"/dicts/BeiShiGaoZhong_11_T.json","languageCategory":"en"},{"id":"jijiao1","name":"冀教 3 上","category":"青少年英语","tags":["冀教版"],"length":75,"url":"/dicts/jiJiao3-1.json","languageCategory":"en"},{"id":"jijiao2","name":"冀教 3 下","category":"青少年英语","tags":["冀教版"],"length":76,"url":"/dicts/jiJiao3-2.json","languageCategory":"en"},{"id":"jijiao3","name":"冀教 4 上","category":"青少年英语","tags":["冀教版"],"length":78,"url":"/dicts/jiJiao4-1.json","languageCategory":"en"},{"id":"jijiao4","name":"冀教 4 下","category":"青少年英语","tags":["冀教版"],"length":84,"url":"/dicts/jiJiao4-2.json","languageCategory":"en"},{"id":"jijiao5","name":"冀教 5 上","category":"青少年英语","tags":["冀教版"],"length":79,"url":"/dicts/jiJiao5-1.json","languageCategory":"en"},{"id":"jijiao6","name":"冀教 5 下","category":"青少年英语","tags":["冀教版"],"length":96,"url":"/dicts/jiJiao5-2.json","languageCategory":"en"},{"id":"jijiao7","name":"冀教 6 上","category":"青少年英语","tags":["冀教版"],"length":66,"url":"/dicts/jiJiao6-1.json","languageCategory":"en"},{"id":"jijiao8","name":"冀教 6 下","category":"青少年英语","tags":["冀教版"],"length":51,"url":"/dicts/jiJiao6-2.json","languageCategory":"en"},{"id":"jijiao9","name":"冀教 7 上","category":"青少年英语","tags":["冀教版"],"length":561,"url":"/dicts/jiJiao7-1.json","languageCategory":"en"},{"id":"jijiao10","name":"冀教 7 下","category":"青少年英语","tags":["冀教版"],"length":514,"url":"/dicts/jiJiao7-2.json","languageCategory":"en"},{"id":"jijiao11","name":"冀教 8 上","category":"青少年英语","tags":["冀教版"],"length":420,"url":"/dicts/jiJiao8-1.json","languageCategory":"en"},{"id":"jijiao12","name":"冀教 8 下","category":"青少年英语","tags":["冀教版"],"length":487,"url":"/dicts/jiJiao8-2.json","languageCategory":"en"},{"id":"jijiao13","name":"冀教 9 上","category":"青少年英语","tags":["冀教版"],"length":636,"url":"/dicts/jiJiao9.json","languageCategory":"en"},{"id":"BJJuniorHigh","name":"北京初中","category":"青少年英语","tags":["其他"],"length":1844,"url":"/dicts/beijing_junior_high_school.json","languageCategory":"en"},{"id":"eflevel1","name":"EF-LEVEL-1","category":"青少年英语","tags":["EF"],"length":297,"url":"/dicts/EF_LEVEL_1.json","languageCategory":"en"},{"id":"eflevel2","name":"EF-LEVEL-2","category":"青少年英语","tags":["EF"],"length":353,"url":"/dicts/EF_LEVEL_2.json","languageCategory":"en"},{"id":"eflevel3","name":"EF-LEVEL-3","category":"青少年英语","tags":["EF"],"length":172,"url":"/dicts/EF_LEVEL_3.json","languageCategory":"en"},{"id":"eflevel4","name":"EF-LEVEL-4","category":"青少年英语","tags":["EF"],"length":178,"url":"/dicts/EF_LEVEL_4.json","languageCategory":"en"},{"id":"eflevel5","name":"EF-LEVEL-5","category":"青少年英语","tags":["EF"],"length":172,"url":"/dicts/EF_LEVEL_5.json","languageCategory":"en"},{"id":"eflevel6","name":"EF-LEVEL-6","category":"青少年英语","tags":["EF"],"length":172,"url":"/dicts/EF_LEVEL_6.json","languageCategory":"en"},{"id":"eflevel7","name":"EF-LEVEL-7","category":"青少年英语","tags":["EF"],"length":171,"url":"/dicts/EF_LEVEL_7.json","languageCategory":"en"},{"id":"eflevel8","name":"EF-LEVEL-8","category":"青少年英语","tags":["EF"],"length":172,"url":"/dicts/EF_LEVEL_8.json","languageCategory":"en"},{"id":"eflevel9","name":"EF-LEVEL-9","category":"青少年英语","tags":["EF"],"length":165,"url":"/dicts/EF_LEVEL_9.json","languageCategory":"en"},{"id":"eflevel10","name":"EF-LEVEL-10","category":"青少年英语","tags":["EF"],"length":174,"url":"/dicts/EF_LEVEL_10.json","languageCategory":"en"},{"id":"eflevel11","name":"EF-LEVEL-11","category":"青少年英语","tags":["EF"],"length":176,"url":"/dicts/EF_LEVEL_11.json","languageCategory":"en"},{"id":"eflevel12","name":"EF-LEVEL-12","category":"青少年英语","tags":["EF"],"length":170,"url":"/dicts/EF_LEVEL_12.json","languageCategory":"en"},{"id":"eflevel13","name":"EF-LEVEL-13","category":"青少年英语","tags":["EF"],"length":172,"url":"/dicts/EF_LEVEL_13.json","languageCategory":"en"},{"id":"eflevel14","name":"EF-LEVEL-14","category":"青少年英语","tags":["EF"],"length":171,"url":"/dicts/EF_LEVEL_14.json","languageCategory":"en"},{"id":"eflevel15","name":"EF-LEVEL-15","category":"青少年英语","tags":["EF"],"length":168,"url":"/dicts/EF_LEVEL_15.json","languageCategory":"en"},{"id":"eflevel16","name":"EF-LEVEL-16","category":"青少年英语","tags":["EF"],"length":170,"url":"/dicts/EF_LEVEL_16.json","languageCategory":"en"},{"id":"ReadingExplorer3","name":"Reading Explorer 3","category":"青少年英语","tags":["其他"],"length":239,"url":"/dicts/ReadingExplorer3.json","languageCategory":"en"},{"id":"Macmillan7000","name":"麦克米伦7000","category":"中国考试","tags":["其他"],"length":6268,"url":"/dicts/Macmillan7000.json","languageCategory":"en"},{"id":"raz-AA","name":"RAZ 分级阅读 AA","category":"青少年英语","tags":["RAZ"],"length":422,"url":"/dicts/raz-AA.json","languageCategory":"en"},{"id":"raz-A","name":"RAZ 分级阅读 A","category":"青少年英语","tags":["RAZ"],"length":487,"url":"/dicts/raz-A.json","languageCategory":"en"},{"id":"raz-B","name":"RAZ 分级阅读 B","category":"青少年英语","tags":["RAZ"],"length":465,"url":"/dicts/raz-B.json","languageCategory":"en"},{"id":"raz-C","name":"RAZ 分级阅读 C","category":"青少年英语","tags":["RAZ"],"length":480,"url":"/dicts/raz-C.json","languageCategory":"en"},{"id":"raz-D","name":"RAZ 分级阅读 D","category":"青少年英语","tags":["RAZ"],"length":436,"url":"/dicts/raz-D.json","languageCategory":"en"},{"id":"raz-E","name":"RAZ 分级阅读 E","category":"青少年英语","tags":["RAZ"],"length":427,"url":"/dicts/raz-E.json","languageCategory":"en"},{"id":"raz-F","name":"RAZ 分级阅读 F","category":"青少年英语","tags":["RAZ"],"length":437,"url":"/dicts/raz-F.json","languageCategory":"en"},{"id":"raz-G","name":"RAZ 分级阅读 G","category":"青少年英语","tags":["RAZ"],"length":435,"url":"/dicts/raz-G.json","languageCategory":"en"},{"id":"raz-H","name":"RAZ 分级阅读 H","category":"青少年英语","tags":["RAZ"],"length":385,"url":"/dicts/raz-H.json","languageCategory":"en"},{"id":"raz-I","name":"RAZ 分级阅读 I","category":"青少年英语","tags":["RAZ"],"length":408,"url":"/dicts/raz-I.json","languageCategory":"en"},{"id":"raz-J","name":"RAZ 分级阅读 J","category":"青少年英语","tags":["RAZ"],"length":434,"url":"/dicts/raz-J.json","languageCategory":"en"},{"id":"raz-K","name":"RAZ 分级阅读 K","category":"青少年英语","tags":["RAZ"],"length":397,"url":"/dicts/raz-K.json","languageCategory":"en"},{"id":"raz-L","name":"RAZ 分级阅读 L","category":"青少年英语","tags":["RAZ"],"length":402,"url":"/dicts/raz-L.json","languageCategory":"en"},{"id":"raz-M","name":"RAZ 分级阅读 M","category":"青少年英语","tags":["RAZ"],"length":403,"url":"/dicts/raz-M.json","languageCategory":"en"},{"id":"raz-N","name":"RAZ 分级阅读 N","category":"青少年英语","tags":["RAZ"],"length":376,"url":"/dicts/raz-N.json","languageCategory":"en"},{"id":"raz-O","name":"RAZ 分级阅读 O","category":"青少年英语","tags":["RAZ"],"length":429,"url":"/dicts/raz-O.json","languageCategory":"en"},{"id":"raz-P","name":"RAZ 分级阅读 P","category":"青少年英语","tags":["RAZ"],"length":379,"url":"/dicts/raz-P.json","languageCategory":"en"},{"id":"raz-Q","name":"RAZ 分级阅读 Q","category":"青少年英语","tags":["RAZ"],"length":442,"url":"/dicts/raz-Q.json","languageCategory":"en"},{"id":"raz-R","name":"RAZ 分级阅读 R","category":"青少年英语","tags":["RAZ"],"length":422,"url":"/dicts/raz-R.json","languageCategory":"en"},{"id":"raz-S","name":"RAZ 分级阅读 S","category":"青少年英语","tags":["RAZ"],"length":434,"url":"/dicts/raz-S.json","languageCategory":"en"},{"id":"raz-T","name":"RAZ 分级阅读 T","category":"青少年英语","tags":["RAZ"],"length":427,"url":"/dicts/raz-T.json","languageCategory":"en"},{"id":"raz-U","name":"RAZ 分级阅读 U","category":"青少年英语","tags":["RAZ"],"length":418,"url":"/dicts/raz-U.json","languageCategory":"en"},{"id":"raz-V","name":"RAZ 分级阅读 V","category":"青少年英语","tags":["RAZ"],"length":409,"url":"/dicts/raz-V.json","languageCategory":"en"},{"id":"raz-W","name":"RAZ 分级阅读 W","category":"青少年英语","tags":["RAZ"],"length":392,"url":"/dicts/raz-W.json","languageCategory":"en"},{"id":"raz-X","name":"RAZ 分级阅读 X","category":"青少年英语","tags":["RAZ"],"length":546,"url":"/dicts/raz-X.json","languageCategory":"en"},{"id":"raz-Y","name":"RAZ 分级阅读 Y","category":"青少年英语","tags":["RAZ"],"length":461,"url":"/dicts/raz-Y.json","languageCategory":"en"},{"id":"raz-Z","name":"RAZ 分级阅读 Z","category":"青少年英语","tags":["RAZ"],"length":414,"url":"/dicts/raz-Z.json","languageCategory":"en"},{"id":"raz-Z1","name":"RAZ 分级阅读 Z1","category":"青少年英语","tags":["RAZ"],"length":467,"url":"/dicts/raz-Z1.json","languageCategory":"en"},{"id":"raz-Z2","name":"RAZ 分级阅读 Z2","category":"青少年英语","tags":["RAZ"],"length":492,"url":"/dicts/raz-Z2.json","languageCategory":"en"},{"id":"raz-all","name":"RAZ 分级阅读 所有词汇","category":"青少年英语","tags":["RAZ"],"length":5831,"url":"/dicts/raz-all.json","languageCategory":"en"},{"id":"Cambridge_JOIN_IN","name":"剑桥小学英语 JOIN IN","category":"青少年英语","tags":["其他"],"length":1350,"url":"/dicts/Cambridge_JOIN_IN.json","languageCategory":"en"},{"id":"coder","name":"Coder Dict","category":"代码练习","tags":["通用"],"length":1700,"url":"/dicts/it-words.json","languageCategory":"code"},{"id":"childCode","name":"少儿 Python","category":"代码练习","tags":["少儿编程","Python"],"length":19,"url":"/dicts/Child_python_code.json","languageCategory":"code"},{"id":"childCode002","name":"少儿 Python Turtle","category":"代码练习","tags":["少儿编程","Python"],"length":27,"url":"/dicts/Child_python_turtle_code.json","languageCategory":"code"},{"id":"childCode003","name":"少儿 C++","category":"代码练习","tags":["少儿编程","C++"],"length":39,"url":"/dicts/Child_cpp.json","languageCategory":"code"},{"id":"oi-xcpc","name":"OI / XCPC 竞赛词汇","category":"代码练习","tags":["C++"],"length":195,"url":"/dicts/OI_XCPC.json","languageCategory":"code"},{"id":"childCode004","name":"Arduino","category":"代码练习","tags":["少儿编程","Arduino"],"length":78,"url":"/dicts/arduino_keywords.json","languageCategory":"code"},{"id":"jsArray","name":"JS: Array","category":"代码练习","tags":["JavaScript"],"length":36,"url":"/dicts/js-array.json","languageCategory":"code"},{"id":"jsDate","name":"JS: Date","category":"代码练习","tags":["JavaScript"],"length":34,"url":"/dicts/js-date.json","languageCategory":"code"},{"id":"jsGlobal","name":"JS: Global","category":"代码练习","tags":["JavaScript"],"length":9,"url":"/dicts/js-global.json","languageCategory":"code"},{"id":"jsMapSet","name":"JS: Map & Set","category":"代码练习","tags":["JavaScript"],"length":16,"url":"/dicts/js-map-set.json","languageCategory":"code"},{"id":"jsMath","name":"JS: Math","category":"代码练习","tags":["JavaScript"],"length":38,"url":"/dicts/js-math.json","languageCategory":"code"},{"id":"jsNumber","name":"JS: Number","category":"代码练习","tags":["JavaScript"],"length":22,"url":"/dicts/js-number.json","languageCategory":"code"},{"id":"jsObject","name":"JS: Object","category":"代码练习","tags":["JavaScript"],"length":37,"url":"/dicts/js-object.json","languageCategory":"code"},{"id":"jsPromise","name":"JS: Promise","category":"代码练习","tags":["JavaScript"],"length":9,"url":"/dicts/js-promise.json","languageCategory":"code"},{"id":"jsString","name":"JS: String","category":"代码练习","tags":["JavaScript"],"length":32,"url":"/dicts/js-string.json","languageCategory":"code"},{"id":"python-builtin","name":"Python: Built-in","category":"代码练习","tags":["Python"],"length":65,"url":"/dicts/python-builtin.json","languageCategory":"code"},{"id":"python-array","name":"Python: array","category":"代码练习","tags":["Python"],"length":11,"url":"/dicts/python-array.json","languageCategory":"code"},{"id":"python-date","name":"Python: date","category":"代码练习","tags":["Python"],"length":39,"url":"/dicts/python-date.json","languageCategory":"code"},{"id":"python-file","name":"Python: file","category":"代码练习","tags":["Python"],"length":21,"url":"/dicts/python-file.json","languageCategory":"code"},{"id":"python-class","name":"Python: class","category":"代码练习","tags":["Python"],"length":13,"url":"/dicts/python-class.json","languageCategory":"code"},{"id":"python-set","name":"Python: set","category":"代码练习","tags":["Python"],"length":29,"url":"/dicts/python-set.json","languageCategory":"code"},{"id":"python-math","name":"Python: math","category":"代码练习","tags":["Python"],"length":37,"url":"/dicts/python-math.json","languageCategory":"code"},{"id":"python-string","name":"Python: string","category":"代码练习","tags":["Python"],"length":40,"url":"/dicts/python-string.json","languageCategory":"code"},{"id":"python-system","name":"Python: system","category":"代码练习","tags":["Python"],"length":24,"url":"/dicts/python-sys.json","languageCategory":"code"},{"id":"javeArrayList","name":"Java: ArrayList","category":"代码练习","tags":["Java"],"length":25,"url":"/dicts/java-arraylist.json","languageCategory":"code"},{"id":"javaCharacter","name":"Java: Character","category":"代码练习","tags":["Java"],"length":8,"url":"/dicts/java-character.json","languageCategory":"code"},{"id":"javaHashmap","name":"Java: Hashmap","category":"代码练习","tags":["Java"],"length":22,"url":"/dicts/java-hashmap.json","languageCategory":"code"},{"id":"javaLinkedList","name":"Java: LinkedList","category":"代码练习","tags":["Java"],"length":25,"url":"/dicts/java-linkedlist.json","languageCategory":"code"},{"id":"javaString","name":"Java: String","category":"代码练习","tags":["Java"],"length":48,"url":"/dicts/java-string.json","languageCategory":"code"},{"id":"javaStringBuffer","name":"Java: StringBuffer","category":"代码练习","tags":["Java"],"length":20,"url":"/dicts/java-stringBuffer.json","languageCategory":"code"},{"id":"linuxCommand","name":"Linux","category":"代码练习","tags":["Linux"],"length":575,"url":"/dicts/linux-command.json","languageCategory":"code"},{"id":"csharpKeywords","name":"C#关键字","category":"代码练习","tags":["C#"],"length":78,"url":"/dicts/csharp-keywords.json","languageCategory":"code"},{"id":"csharpString","name":"C#: String API","category":"代码练习","tags":["C#"],"length":79,"url":"/dicts/csharp-string.json","languageCategory":"code"},{"id":"csharpList","name":"C#: List API","category":"代码练习","tags":["C#"],"length":36,"url":"/dicts/csharp-list.json","languageCategory":"code"},{"id":"sql-lower-case","name":"SQL: 常用语句 lower case","category":"代码练习","tags":["SQL"],"length":12,"url":"/dicts/SQL_statement_lower-case.json","languageCategory":"code"},{"id":"sql-upper-case","name":"SQL: 常用语句 upper case","category":"代码练习","tags":["SQL"],"length":12,"url":"/dicts/SQL_statement_upper-case.json","languageCategory":"code"},{"id":"ai-machine-learning","name":"人工智能: 机器学习","category":"代码练习","tags":["AI"],"length":726,"url":"/dicts/ai_machine_learning.json","languageCategory":"code"},{"id":"ai-ai-for-science","name":"人工智能: AI for Science","category":"代码练习","tags":["AI"],"length":491,"url":"/dicts/ai_for_science.json","languageCategory":"code"},{"id":"go_keyword","name":"golang-keyword","category":"代码练习","tags":["golang"],"length":25,"url":"/dicts/go_keyword.json","languageCategory":"code"},{"id":"go_builtin","name":"golang-builtin","category":"代码练习","tags":["golang"],"length":46,"url":"/dicts/go_builtin.json","languageCategory":"code"},{"id":"rustKeyword","name":"Rust: Keyword","category":"代码练习","tags":["Rust"],"length":35,"url":"/dicts/rust-keyword.json","languageCategory":"code"},{"id":"rustString","name":"Rust: String","category":"代码练习","tags":["Rust"],"length":24,"url":"/dicts/rust-string.json","languageCategory":"code"},{"id":"rustVector","name":"Rust: Vector","category":"代码练习","tags":["Rust"],"length":28,"url":"/dicts/rust-vector.json","languageCategory":"code"},{"id":"rustHashMap","name":"Rust: HashMap","category":"代码练习","tags":["Rust"],"length":23,"url":"/dicts/rust-hashmap.json","languageCategory":"code"},{"id":"SoundSfxKey","name":"AudioKey_UCS-SubCategory","category":"代码练习","tags":["RAZ"],"length":436,"url":"/dicts/AudioKey_SubCategory.json","languageCategory":"en"},{"id":"SoundSfxKey2","name":"AudioKey_UCS-Category","category":"代码练习","tags":["RAZ"],"length":82,"url":"/dicts/AudioKey_Category.json","languageCategory":"code"},{"id":"japanese-hiragana","name":"平假名","category":"日语学习","tags":["基础","五十音","平假名"],"length":280,"url":"/dicts/JapaneseHiragana.json","languageCategory":"ja"},{"id":"japanese-katakana","name":"片假名","category":"日语学习","tags":["基础","五十音","片假名"],"length":280,"url":"/dicts/JapaneseKatakana.json","languageCategory":"ja"},{"id":"japanese001","name":"日语常见词","category":"日语学习","tags":["基础"],"length":100,"url":"/dicts/Japanesebasicword.json","languageCategory":"ja"},{"id":"japanese001-zh","name":"日语常见词","category":"日语学习","tags":["基础"],"length":100,"url":"/dicts/Japanesebasicword_zh.json","languageCategory":"ja"},{"id":"japanese002","name":"N5","category":"日语学习","tags":["基础"],"length":670,"url":"/dicts/JapVocabList.N5.json","languageCategory":"ja"},{"id":"japanese002-zh","name":"N5","category":"日语学习","tags":["基础"],"length":670,"url":"/dicts/JapVocabList.N5_zh.json","languageCategory":"ja"},{"id":"japanese003","name":"N4","category":"日语学习","tags":["基础"],"length":635,"url":"/dicts/JapVocabList.N4.json","languageCategory":"ja"},{"id":"japanese003-zh","name":"N4","category":"日语学习","tags":["基础"],"length":635,"url":"/dicts/JapVocabList.N4_zh.json","languageCategory":"ja"},{"id":"japanese004","name":"N3","category":"日语学习","tags":["基础"],"length":1830,"url":"/dicts/JapVocabList.N3.json","languageCategory":"ja"},{"id":"japanese004-zh","name":"N3","category":"日语学习","tags":["基础"],"length":1830,"url":"/dicts/JapVocabList.N3_zh.json","languageCategory":"ja"},{"id":"japanese005","name":"N2","category":"日语学习","tags":["基础"],"length":1836,"url":"/dicts/JapVocabList.N2.json","languageCategory":"ja"},{"id":"japanese005-zh","name":"N2","category":"日语学习","tags":["基础"],"length":1836,"url":"/dicts/JapVocabList.N2_zh.json","languageCategory":"ja"},{"id":"japanese006","name":"N1","category":"日语学习","tags":["基础"],"length":3477,"url":"/dicts/JapVocabList.N1.json","languageCategory":"ja"},{"id":"japanese006-zh","name":"N1","category":"日语学习","tags":["基础"],"length":3477,"url":"/dicts/JapVocabList.N1_zh.json","languageCategory":"ja"},{"id":"japanese007","name":"高频单词_N1","category":"日语学习","tags":["基础"],"length":3000,"url":"/dicts/Jap_High-Frequency_N1.json","languageCategory":"ja"},{"id":"japanese008","name":"高频单词_N2","category":"日语学习","tags":["基础"],"length":2500,"url":"/dicts/Jap_High-Frequency_N2.json","languageCategory":"ja"},{"id":"japanese009","name":"高频单词_N3","category":"日语学习","tags":["基础"],"length":1999,"url":"/dicts/Jap_High-Frequency_N3.json","languageCategory":"ja"},{"id":"japanese0010","name":"高频单词_N4N5","category":"日语学习","tags":["基础"],"length":2000,"url":"/dicts/Jap_High-Frequency_N4N5.json","languageCategory":"ja"},{"id":"german2en","name":"德语 英译","category":"德语学习","tags":["基础"],"length":5892,"url":"/dicts/german2en.json","languageCategory":"de"},{"id":"en2german","name":"英语 德译","category":"德语学习","tags":["基础"],"length":5025,"url":"/dicts/en2german.json","languageCategory":"de"},{"id":"kazakh_basic_3000_arabic_hapin","name":"基础3000词(老文字版)","category":"哈萨克语","tags":["老文字","哈拼"],"length":3002,"url":"/dicts/kazakh_basic_3000_arabic_hapin.json","languageCategory":"kk"},{"id":"kazakh_basic_3000_cyrillic_hapin","name":"基础3000词(西里尔字母版)","category":"哈萨克语","tags":["西里尔字母","哈拼"],"length":3002,"url":"/dicts/kazakh_basic_3000_cyrillic_hapin.json","languageCategory":"kk"},{"id":"indonesian_highFrequency_3043","name":"印尼语高频词汇","category":"印尼语","tags":["基础"],"length":3037,"url":"/dicts/Indonesian.json","languageCategory":"id"}]} /* @dict-index:end */

    const CHAPTER_LENGTH = (DICT_INDEX && DICT_INDEX.chapterLength) || 20

    const DICT_STORAGE_KEY = 'qwerty-autotype:dict'
    const RECENT_STORAGE_KEY = 'qwerty-autotype:recent'
    const CACHE_DB_NAME = 'qwerty-autotype'
    const CACHE_DB_VERSION = 2
    const CACHE_STORE = 'dicts'
    const WORD_STORE = 'wordRecords'
    const CHAPTER_STORE = 'chapterRecords'
    const PROGRESS_STORE = 'progress'

    /** 上游仓库与固定 ref（换版本只改这里；jsDelivr 不吃 commit sha 时才用分支） */
    const DICT_REPO = 'RealKai42/qwerty-learner'
    const DICT_REF = 'master'
    /** 上游的钉住提交（有就优先按 SHA 拉，避免 master 漂移；失败自动回退 master） */
    const DICT_PIN = (DICT_INDEX && DICT_INDEX.pinned) || ''

    /**
     * 词条来源：jsDelivr → raw.githubusercontent。
     * 只有当前页面本身就跑在 8081（本地 qwerty-learner 开发服）时才优先用它，
     * 因为那个服务不带 CORS 头，别的 origin 取不到。
     */
    function dictSourceList() {
      const list = []
      // 钉住的提交优先：master 漂移或词库被改都不影响；拿不到再回退 master
      if (DICT_PIN) {
        list.push((file) => `https://cdn.jsdelivr.net/gh/${DICT_REPO}@${DICT_PIN}/public${file}`)
        list.push((file) => `https://raw.githubusercontent.com/${DICT_REPO}/${DICT_PIN}/public${file}`)
      }
      list.push((file) => `https://cdn.jsdelivr.net/gh/${DICT_REPO}@${DICT_REF}/public${file}`)
      list.push((file) => `https://raw.githubusercontent.com/${DICT_REPO}/${DICT_REF}/public${file}`)
      try {
        const { hostname, port } = window.location
        if (port === '8081' && (hostname === '127.0.0.1' || hostname === 'localhost')) {
          list.unshift((file) => `http://127.0.0.1:8081${file}`)
        }
      } catch {
        /* 非浏览器环境（测试）忽略 */
      }
      return list
    }

    /** 内存缓存：dictId → 归一化词条数组 */
    const DICT_CACHE = new Map()
    /** 进行中的加载：dictId → Promise，避免重复请求 */
    const DICT_INFLIGHT = new Map()

    /** 内联的 7 个词库（离线兜底 + 首次可用） */
    function builtinDicts() {
      const inline = typeof DICT_DATA === 'undefined' ? null : DICT_DATA
      return Array.isArray(inline?.dicts) ? inline.dicts : []
    }

    function builtinById(id) {
      return builtinDicts().find((dict) => dict.id === id)
    }

    /** 全量词库元数据（371 条）；缺失时回落到内置 7 库 */
    function catalog() {
      const custom = Object.entries(readCustomDicts()).map(([name, words]) => ({
        id: CUSTOM_PREFIX + name,
        name,
        category: '自定义',
        tags: ['自定义'],
        length: words.length,
        url: '',
        languageCategory: 'en',
      }))
      const list = DICT_INDEX?.dicts
      if (Array.isArray(list) && list.length > 0) {
        return custom.length ? [...custom, ...list] : list
      }
      const builtin = builtinDicts().map((dict) => ({
        id: dict.id,
        name: dict.name,
        category: dict.category,
        tags: [],
        length: (dict.words || []).length,
        url: '',
        languageCategory: 'en',
      }))
      return custom.length ? [...custom, ...builtin] : builtin
    }

    function dictionaries() {
      return catalog()
    }

    function dictionaryById(id) {
      const list = catalog()
      return list.find((dict) => dict.id === id) ?? list[0]
    }

    /** 词库元数据 → 章数 */
    function chapterCount(meta) {
      const length = Number(meta?.length) || 0
      return Math.max(1, Math.ceil(length / CHAPTER_LENGTH))
    }

    function chaptersOf(id) {
      const meta = dictionaryById(id)
      return { count: chapterCount(meta), length: CHAPTER_LENGTH, words: Number(meta?.length) || 0 }
    }

    /** 取某章的词条（0-based） */
    function wordsOfChapter(words, chapter, size) {
      const step = size || CHAPTER_LENGTH
      const start = Math.max(0, Number(chapter) || 0) * step
      return (words || []).slice(start, start + step)
    }

    /** 文本清洗：去换行/压缩空格/中文标点两侧不留空格 */
    function cleanZh(text) {
      if (!text) return ''
      return String(text)
        .replace(/\r?\n/g, ' ')
        .replace(/[\u3000\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\s*([，。；：、！？（）「」])\s*/g, '$1')
        .replace(/^[\s;；,，]+|[\s;；,，]+$/g, '')
        .trim()
    }

    /** ukphone 优先、其次 usphone；多音取第一支；' → ˈ；包成 /.../ */
    function buildIpa(raw) {
      const text = (raw || '').toString().trim()
      if (!text) return ''
      let first = text.split(/[;；]/)[0].trim()
      first = first.replace(/^[/[\].,，、\s]+/, '').replace(/[/[\]\s]+$/, '')
      if (!first) return ''
      return `/${first.replace(/'/g, 'ˈ').replace(/\s+/g, '')}/`
    }

    /** 允许词组（单词之间单空格），不允许前后空格 / 换行 / 控制字符 */
    const WORD_OK = /^[^\s\u0000-\u001f](?:[^\u0000-\u001f]*[^\s\u0000-\u001f])?$/

    /**
     * 上游裸词条 { name, trans[], usphone, ukphone } → { w, ipa, zh }
     * 不合法返回 null（空词、空释义、超长、含控制字符）
     * 大小写：en 一律小写（判定不因大小写卡人）；code 保留原样（SQL 等有意义）
     */
    function normalizeWord(raw, languageCategory, options) {
      if (!raw || typeof raw !== 'object') return null
      const isCode = languageCategory === 'code'
      let w = (raw.name ?? raw.w ?? '').toString().replace(/\s+/g, ' ').trim()
      if (!w || w.length > 40) return null
      if (!WORD_OK.test(w)) return null
      if (!isCode) w = w.toLowerCase()
      const zh = cleanZh(Array.isArray(raw.trans) ? raw.trans.join('；') : (raw.trans ?? raw.zh))
      // 自定义词表允许只给单词（没释义也能练），内置/网络词库仍要求有中文
      if (!zh && options?.allowNoZh !== true) return null
      const ipa = isCode ? '' : buildIpa(raw.ukphone || raw.usphone || raw.ipa)
      return { w, ipa, zh }
    }

    /** 批量归一化 + 去重（保序） */
    function normalizeWords(list, languageCategory, options) {
      const seen = new Set()
      const out = []
      for (const raw of list || []) {
        const word = normalizeWord(raw, languageCategory, options)
        if (!word) continue
        const key = word.w.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(word)
      }
      return out
    }

    /* ---------------- IndexedDB 缓存 ---------------- */

    let DB_PROMISE = null

    function openCacheDb() {
      if (DB_PROMISE) return DB_PROMISE
      DB_PROMISE = new Promise((resolve) => {
        try {
          if (!window.indexedDB) return resolve(null)
          const request = window.indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION)
          request.onupgradeneeded = () => {
            const db = request.result
            if (!db.objectStoreNames.contains(CACHE_STORE)) {
              db.createObjectStore(CACHE_STORE, { keyPath: 'key' })
            }
            if (!db.objectStoreNames.contains(WORD_STORE)) {
              const store = db.createObjectStore(WORD_STORE, { keyPath: 'id', autoIncrement: true })
              store.createIndex('word', 'word')
              store.createIndex('dictId', 'dictId')
              store.createIndex('at', 'at')
            }
            if (!db.objectStoreNames.contains(CHAPTER_STORE)) {
              const store = db.createObjectStore(CHAPTER_STORE, { keyPath: 'id', autoIncrement: true })
              store.createIndex('dictId', 'dictId')
              store.createIndex('at', 'at')
            }
            if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
              db.createObjectStore(PROGRESS_STORE, { keyPath: 'key' })
            }
          }
          request.onsuccess = () => {
            const db = request.result
            // 别的标签页升级版本时主动让路，避免后续事务全被 blocked
            db.onversionchange = () => {
              try {
                db.close()
              } catch {
                /* ignore */
              }
              DB_PROMISE = null
            }
            resolve(db)
          }
          request.onerror = () => resolve(null)
          request.onblocked = () => resolve(null)
        } catch {
          resolve(null)
        }
      })
      return DB_PROMISE
    }

    function cacheGet(key) {
      return openCacheDb().then(
        (db) =>
          new Promise((resolve) => {
            if (!db) return resolve(null)
            try {
              const tx = db.transaction(CACHE_STORE, 'readonly')
              const request = tx.objectStore(CACHE_STORE).get(key)
              request.onsuccess = () => resolve(request.result?.words ?? null)
              request.onerror = () => resolve(null)
            } catch {
              resolve(null)
            }
          }),
      )
    }

    function cachePut(key, words, meta) {
      return openCacheDb().then(
        (db) =>
          new Promise((resolve) => {
            if (!db) return resolve(false)
            try {
              const tx = db.transaction(CACHE_STORE, 'readwrite')
              tx.objectStore(CACHE_STORE).put({
                key,
                words,
                count: words.length,
                dictId: meta?.id ?? key,
                savedAt: Date.now(),
              })
              tx.oncomplete = () => resolve(true)
              tx.onerror = () => resolve(false)
            } catch {
              resolve(false)
            }
          }),
      )
    }

    /* ---------------- 练习记录（wordRecords / chapterRecords / progress） ---------------- */

    /** 事务包装：拿 store 名 + 回调，无 IndexedDB 时静默跳过 */
    function withStore(names, mode, run) {
      return openCacheDb().then(
        (db) =>
          new Promise((resolve) => {
            if (!db) return resolve(null)
            try {
              const tx = db.transaction(names, mode)
              let result = null
              run(tx, (value) => {
                result = value
              })
              tx.oncomplete = () => resolve(result)
              tx.onerror = () => resolve(null)
              tx.onabort = () => resolve(null)
            } catch {
              resolve(null)
            }
          }),
      )
    }

    /** 记一个词：打对记一条，打错几次记几次（wrongCount 用同一轮内累计） */
    function recordWord(entry) {
      if (!entry || !entry.word) return Promise.resolve(null)
      return withStore(WORD_STORE, 'readwrite', (tx, done) => {
        const request = tx.objectStore(WORD_STORE).add({
          word: String(entry.word),
          dictId: entry.dictId ?? '',
          chapter: Number.isInteger(entry.chapter) ? entry.chapter : null,
          at: entry.at ?? Date.now(),
          wrongCount: Math.max(0, Number(entry.wrongCount) || 0),
          timing: Array.isArray(entry.timing) ? entry.timing.slice(0, 64) : [],
        })
        request.onsuccess = () => done(request.result)
      }).then((id) => {
        if (id === null) {
          const mirror = readMirror()
          mirror.wordRecords.unshift({
            word: String(entry.word),
            dictId: entry.dictId ?? '',
            chapter: Number.isInteger(entry.chapter) ? entry.chapter : null,
            at: entry.at ?? Date.now(),
            wrongCount: Math.max(0, Number(entry.wrongCount) || 0),
          })
          writeMirror(mirror)
        }
        return id
      })
    }

    /** 记一章：词数 / 对错 / 用时（秒） */
    function recordChapter(entry) {
      if (!entry) return Promise.resolve(null)
      return withStore(CHAPTER_STORE, 'readwrite', (tx, done) => {
        const request = tx.objectStore(CHAPTER_STORE).add({
          dictId: entry.dictId ?? '',
          chapter: Number.isInteger(entry.chapter) ? entry.chapter : null,
          at: entry.at ?? Date.now(),
          seconds: Math.max(1, Number(entry.seconds) || 1),
          wordCount: Math.max(0, Number(entry.wordCount) || 0),
          wrongCount: Math.max(0, Number(entry.wrongCount) || 0),
          wrongLetters: entry.wrongLetters && typeof entry.wrongLetters === 'object' ? { ...entry.wrongLetters } : {},
        })
        request.onsuccess = () => done(request.result)
      }).then((id) => {
        if (id === null) {
          const mirror = readMirror()
          mirror.chapterRecords.unshift({ ...entry })
          writeMirror(mirror)
        }
        return id
      })
    }

    /** 写章节进度（key = `${dictId}:${chapter}`） */
    function saveProgress(dictId, chapter, patch) {
      const key = `${dictId}:${chapter}`
      return withStore(PROGRESS_STORE, 'readwrite', (tx, done) => {
        const store = tx.objectStore(PROGRESS_STORE)
        const get = store.get(key)
        get.onsuccess = () => {
          const next = { ...(get.result || { key, dictId, chapter }), ...patch, updatedAt: Date.now() }
          const put = store.put(next)
          put.onsuccess = () => done(next)
        }
      })
    }

    function readProgress(dictId) {
      return withStore(PROGRESS_STORE, 'readonly', (tx, done) => {
        const request = tx.objectStore(PROGRESS_STORE).getAll()
        request.onsuccess = () => {
          const all = Array.isArray(request.result) ? request.result : []
          done(dictId ? all.filter((item) => item.dictId === dictId) : all)
        }
      }).then((value) => {
        if (value && value.length) return value
        const mirror = readMirror().progress
        return dictId ? mirror.filter((item) => item.dictId === dictId) : mirror
      })
    }

    function readWordRecords(limit) {
      return withStore(WORD_STORE, 'readonly', (tx, done) => {
        const request = tx.objectStore(WORD_STORE).getAll()
        request.onsuccess = () => {
          const all = Array.isArray(request.result) ? request.result : []
          all.sort((a, b) => (b.at || 0) - (a.at || 0))
          done(limit ? all.slice(0, limit) : all)
        }
      }).then((value) => (value && value.length ? value : readMirror().wordRecords))
    }

    function readChapterRecords(limit) {
      return withStore(CHAPTER_STORE, 'readonly', (tx, done) => {
        const request = tx.objectStore(CHAPTER_STORE).getAll()
        request.onsuccess = () => {
          const all = Array.isArray(request.result) ? request.result : []
          all.sort((a, b) => (b.at || 0) - (a.at || 0))
          done(limit ? all.slice(0, limit) : all)
        }
      }).then((value) => value ?? [])
    }

    /** 词库缓存占用（IndexedDB `dicts` store）：条数 + 近似字节数 */
    function cacheStats() {
      return withStore(CACHE_STORE, 'readonly', (tx, done) => {
        const request = tx.objectStore(CACHE_STORE).getAll()
        request.onsuccess = () => {
          const rows = Array.isArray(request.result) ? request.result : []
          let chars = 0
          for (const row of rows) {
            try {
              chars += JSON.stringify(row?.words ?? []).length
            } catch {
              /* 单条坏数据跳过 */
            }
          }
          done({ count: rows.length, bytes: chars * 2 })
        }
        request.onerror = () => done({ count: 0, bytes: 0 })
      }).then((value) => value ?? { count: 0, bytes: 0 })
    }

    /** 清空词库缓存（含内存缓存），记录与设置不动 */
    function clearDictCache() {
      DICT_CACHE.clear()
      return withStore(CACHE_STORE, 'readwrite', (tx, done) => {
        try {
          const request = tx.objectStore(CACHE_STORE).clear()
          request.onsuccess = () => done(true)
          request.onerror = () => done(false)
        } catch {
          done(false)
        }
      }).then((ok) => ok === true)
    }

    /* ---------------- 自定义词表 ---------------- */

    const CUSTOM_KEY = 'qwerty-autotype:custom-dicts'
    const CUSTOM_PREFIX = 'custom:'
    const CUSTOM_LIMIT = 2000

    function isCustomId(id) {
      return typeof id === 'string' && id.startsWith(CUSTOM_PREFIX)
    }

    /** 读全部自定义词表：{ [name]: [{ name, trans, ipa }] } */
    function readCustomDicts() {
      try {
        const raw = JSON.parse(window.localStorage.getItem(CUSTOM_KEY) || '{}')
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
        const out = {}
        for (const [key, words] of Object.entries(raw)) {
          if (!key || !Array.isArray(words)) continue
          out[key] = words.filter((word) => word && typeof word.name === 'string' && word.name)
        }
        return out
      } catch {
        return {}
      }
    }

    function writeCustomDicts(map) {
      try {
        window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(map))
      } catch {
        /* 配额满了就算了 */
      }
    }

    /**
     * 解析用户粘贴的词表：一行一个词，支持
     *   word
     *   word 中文
     *   word,中文        word,中文,音标
     *   word<Tab>中文
     * 空行、`#` 注释、以 `//` 开头的行都跳过；大小写去重；上限 CUSTOM_LIMIT 条。
     */
    function parseCustomWords(text) {
      const lines = String(text ?? '').split(/\r?\n/)
      const seen = new Set()
      const out = []
      for (const raw of lines) {
        const line = raw.trim()
        if (!line || line.startsWith('#') || line.startsWith('//')) continue
        const parts = line.split(/\t|,|，|\s{2,}|\s/).map((part) => part.trim()).filter(Boolean)
        const word = parts[0] ?? ''
        if (!word || word.length > 40) continue
        const lower = word.toLowerCase()
        if (seen.has(lower)) continue
        seen.add(lower)
        const trans = parts.slice(1).find((part) => !/^\/[^/]*\/$/.test(part)) ?? ''
        const ipaRaw = parts.slice(1).find((part) => /^\/[^/]*\/$/.test(part)) ?? ''
        out.push({
          name: word,
          trans: trans ? [trans] : [],
          ...(ipaRaw ? { ipa: ipaRaw.replace(/^\/|\/$/g, '') } : {}),
        })
        if (out.length >= CUSTOM_LIMIT) break
      }
      return out
    }

    /** 拆一行 CSV（支持双引号包裹、内部逗号与 "" 转义） */
    function splitCsvLine(line) {
      const out = []
      let cell = ''
      let quoted = false
      for (let index = 0; index < line.length; index += 1) {
        const ch = line[index]
        if (quoted) {
          if (ch === '"') {
            if (line[index + 1] === '"') {
              cell += '"'
              index += 1
            } else {
              quoted = false
            }
          } else {
            cell += ch
          }
          continue
        }
        if (ch === '"' && !cell) {
          quoted = true
          continue
        }
        if (ch === ',' || ch === '，') {
          out.push(cell.trim())
          cell = ''
          continue
        }
        cell += ch
      }
      out.push(cell.trim())
      return out
    }

    /** 一条外部数据 → 词条（兼容 {name,trans,ipa} 与 {word,meaning,phonetic} 两种写法） */
    function toCustomWord(entry) {
      if (typeof entry === 'string') {
        const parts = splitCsvLine(entry)
        return { name: parts[0] ?? '', trans: parts[1] ? [parts[1]] : [], ...(parts[2] ? { ipa: parts[2] } : {}) }
      }
      if (!entry || typeof entry !== 'object') return null
      const name = String(entry.name ?? entry.word ?? entry.text ?? '').trim()
      if (!name) return null
      const rawTrans = entry.trans ?? entry.translation ?? entry.meaning ?? entry.zh
      const trans = Array.isArray(rawTrans)
        ? rawTrans.map((item) => String(item ?? '').trim()).filter(Boolean)
        : String(rawTrans ?? '').split(/[;；]/).map((item) => item.trim()).filter(Boolean)
      const ipa = String(entry.ipa ?? entry.phonetic ?? entry.ukphone ?? '').trim()
      return { name, trans, ...(ipa ? { ipa } : {}) }
    }

    /**
     * 解析导入文件：按扩展名分派
     *   .json  → 数组 / { words: [...] } / { 单词: 释义 } 三种形状
     *   .csv   → word,meaning,ipa（首行是表头就跳过，支持引号）
     *   其它   → 交给 parseCustomWords（一行一个词）
     * 统一去重、限长、限条数。
     */
    function parseCustomFile(fileName, text) {
      const ext = String(fileName ?? '').toLowerCase().split('.').pop() || ''
      let entries = []
      if (ext === 'json') {
        let raw
        try {
          raw = JSON.parse(String(text ?? ''))
        } catch {
          return []
        }
        if (Array.isArray(raw)) entries = raw
        else if (Array.isArray(raw?.words)) entries = raw.words
        else if (raw?.dicts && typeof raw.dicts === 'object' && !Array.isArray(raw.dicts)) {
          // 备份文件里的自定义词表
          const first = Object.values(raw.dicts)[0]
          entries = Array.isArray(first) ? first : []
        } else if (raw && typeof raw === 'object') {
          entries = Object.entries(raw).map(([word, meaning]) => ({ name: word, trans: meaning }))
        }
      } else if (ext === 'csv') {
        const lines = String(text ?? '').split(/\r?\n/).filter((line) => line.trim())
        const first = lines[0] ? splitCsvLine(lines[0]) : []
        const headerWords = /^(word|name|单词|词汇)$/i
        const start = first.length && headerWords.test(first[0]) ? 1 : 0
        entries = lines.slice(start).map((line) => ({
          name: splitCsvLine(line)[0] ?? '',
          trans: splitCsvLine(line)[1] ?? '',
          ipa: splitCsvLine(line)[2] ?? '',
        }))
      } else {
        return parseCustomWords(text)
      }

      const seen = new Set()
      const out = []
      for (const entry of entries) {
        const word = toCustomWord(entry)
        if (!word || word.name.length > 40) continue
        const key = word.name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(word)
        if (out.length >= CUSTOM_LIMIT) break
      }
      return out
    }

    /** 音标统一成 /…/（内部存的有可能已经带斜杠） */
    function withSlashes(ipa) {
      const text = String(ipa ?? '').trim()
      if (!text) return ''
      return text.startsWith('/') ? text : `/${text}/`
    }

    /** 导出自定义词表为文本（txt 一行一个 / json 带结构），用于换机或分享 */
    function serializeCustomDict(id, format) {
      const words = customWords(id)
      if (!words.length) return ''
      if (String(format).toLowerCase() === 'json') {
        return JSON.stringify({
          name: String(id).replace(CUSTOM_PREFIX, ''),
          words: words.map((word) => ({
            name: word.w,
            trans: word.zh ? [word.zh] : [],
            ...(word.ipa ? { ipa: withSlashes(word.ipa) } : {}),
          })),
        }, null, 2)
      }
      return words
        .map((word) => `${word.w}${word.zh ? ` ${word.zh}` : ''}${word.ipa ? ` ${withSlashes(word.ipa)}` : ''}`)
        .join('\n')
    }

    /** 保存/覆盖一个自定义词表（名字去首尾空格，空名字返回 null） */
    function saveCustomDict(name, words) {
      const key = String(name ?? '').trim().slice(0, 24)
      if (!key) return null
      const list = Array.isArray(words) ? words.filter((word) => word?.name).slice(0, CUSTOM_LIMIT) : []
      if (!list.length) return null
      const map = readCustomDicts()
      map[key] = list
      writeCustomDicts(map)
      DICT_CACHE.delete(CUSTOM_PREFIX + key)
      return CUSTOM_PREFIX + key
    }

    function removeCustomDict(id) {
      if (!isCustomId(id)) return false
      const name = id.slice(CUSTOM_PREFIX.length)
      const map = readCustomDicts()
      if (!(name in map)) return false
      delete map[name]
      writeCustomDicts(map)
      DICT_CACHE.delete(id)
      return true
    }

    /** 自定义词表 → 归一化词条（和网络词库同一形状） */
    function customWords(id) {
      if (!isCustomId(id)) return []
      const name = id.slice(CUSTOM_PREFIX.length)
      return normalizeWords(readCustomDicts()[name] || [], 'en', { allowNoZh: true })
    }

    /** 「已掌握」的词：`${dictId}:${word}` 集合，存 localStorage（不占 IndexedDB 版本位） */
    const MASTERED_KEY = 'qwerty-autotype:mastered'

    function masteredKey(dictId, word) {
      return `${dictId || ''}:${word}`
    }

    function readMastered() {
      try {
        const raw = JSON.parse(window.localStorage.getItem(MASTERED_KEY) || '[]')
        return Array.isArray(raw) ? raw.filter((item) => typeof item === 'string') : []
      } catch {
        return []
      }
    }

    function writeMastered(list) {
      try {
        window.localStorage.setItem(MASTERED_KEY, JSON.stringify([...new Set(list)].slice(0, 2000)))
      } catch {
        /* ignore */
      }
    }

    /** 切换掌握状态，返回切换后的布尔值 */
    function toggleMastered(dictId, word) {
      const key = masteredKey(dictId, word)
      const list = readMastered()
      const has = list.includes(key)
      writeMastered(has ? list.filter((item) => item !== key) : [...list, key])
      return !has
    }

    /** localStorage 降级镜像（IndexedDB 被禁/隐私模式时用，只在内存里留最近 300 条） */
    const MIRROR_KEY = 'qwerty-autotype:records-mirror'
    const MIRROR_LIMIT = 300

    function readMirror() {
      try {
        const raw = JSON.parse(window.localStorage.getItem(MIRROR_KEY) || 'null')
        if (!raw || typeof raw !== 'object') return { wordRecords: [], chapterRecords: [], progress: [] }
        return {
          wordRecords: Array.isArray(raw.wordRecords) ? raw.wordRecords : [],
          chapterRecords: Array.isArray(raw.chapterRecords) ? raw.chapterRecords : [],
          progress: Array.isArray(raw.progress) ? raw.progress : [],
        }
      } catch {
        return { wordRecords: [], chapterRecords: [], progress: [] }
      }
    }

    function writeMirror(mirror) {
      try {
        window.localStorage.setItem(MIRROR_KEY, JSON.stringify({
          wordRecords: (mirror.wordRecords || []).slice(0, MIRROR_LIMIT),
          chapterRecords: (mirror.chapterRecords || []).slice(0, MIRROR_LIMIT),
          progress: (mirror.progress || []).slice(0, MIRROR_LIMIT),
        }))
      } catch {
        /* 配额满了就算了，IndexedDB 才是主存储 */
      }
    }

    /* ---------------- 备份（导出 / 导入） ---------------- */

    const BACKUP_VERSION = 1
    /** 备份里各表最多带多少条，避免导出一个几十 MB 的文件 */
    const BACKUP_LIMITS = { wordRecords: 5000, chapterRecords: 2000, progress: 2000 }

    /** 打包成可下载的 JSON 文本（只含本地练习数据 + 设置，不含词库词条） */
    function serializeBackup(parts) {
      const { settings, wordRecords, chapterRecords, progress, mastered, customDicts } = parts || {}
      const trim = (list, limit) => (Array.isArray(list) ? list.slice(0, limit) : [])
      const payload = {
        kind: 'qwerty-autotype-backup',
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        // 只带已知设置项，别把 localStorage 里的杂项搬来搬去
        settings: Object.fromEntries(
          Object.keys(SETTING_DEFAULTS)
            .filter((key) => settings && key in settings)
            .map((key) => [key, settings[key]]),
        ),
        wordRecords: trim(wordRecords, BACKUP_LIMITS.wordRecords),
        chapterRecords: trim(chapterRecords, BACKUP_LIMITS.chapterRecords),
        progress: trim(progress, BACKUP_LIMITS.progress),
        mastered: trim(mastered, BACKUP_LIMITS.progress),
        customDicts: customDicts && typeof customDicts === 'object' ? customDicts : {},
      }
      return JSON.stringify(payload, null, 2)
    }

    /**
     * 解析备份文本：结构不对 / 版本更高就抛错，字段类型不对就丢掉那一条。
     * 返回 { settings, wordRecords, chapterRecords, progress }
     */
    function parseBackup(text) {
      let raw
      try {
        raw = JSON.parse(String(text ?? ''))
      } catch {
        throw new Error('backup:not-json')
      }
      if (!raw || typeof raw !== 'object') throw new Error('backup:not-object')
      if (raw.kind !== 'qwerty-autotype-backup') throw new Error('backup:bad-kind')
      if (!Number.isInteger(raw.version) || raw.version < 1) throw new Error('backup:bad-version')
      if (raw.version > BACKUP_VERSION) throw new Error('backup:version-too-new')

      const keepStrings = (value) => (typeof value === 'string' ? value : '')
      const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)

      const settings = {}
      if (raw.settings && typeof raw.settings === 'object') {
        for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
          if (key in raw.settings) settings[key] = typeof value === 'boolean' ? !!raw.settings[key] : String(raw.settings[key])
        }
      }

      const wordRecords = (Array.isArray(raw.wordRecords) ? raw.wordRecords : [])
        .filter((row) => row && typeof row.word === 'string' && row.word)
        .map((row) => ({
          word: row.word,
          dictId: keepStrings(row.dictId),
          chapter: Number.isInteger(row.chapter) ? row.chapter : null,
          at: num(row.at) || Date.now(),
          wrongCount: Math.max(0, num(row.wrongCount)),
          timing: Array.isArray(row.timing) ? row.timing.slice(0, 64) : [],
        }))

      const chapterRecords = (Array.isArray(raw.chapterRecords) ? raw.chapterRecords : [])
        .filter((row) => row && typeof row === 'object')
        .map((row) => ({
          dictId: keepStrings(row.dictId),
          chapter: Number.isInteger(row.chapter) ? row.chapter : null,
          at: num(row.at) || Date.now(),
          seconds: Math.max(1, num(row.seconds) || 1),
          wordCount: Math.max(0, num(row.wordCount)),
          wrongCount: Math.max(0, num(row.wrongCount)),
        }))

      const progress = (Array.isArray(raw.progress) ? raw.progress : [])
        .filter((row) => row && typeof row.dictId === 'string' && Number.isInteger(row.chapter))
        .map((row) => ({
          key: `${row.dictId}:${row.chapter}`,
          dictId: row.dictId,
          chapter: row.chapter,
          index: Math.max(0, num(row.index)),
          words: Math.max(0, num(row.words)),
          done: !!row.done,
          updatedAt: num(row.updatedAt) || Date.now(),
        }))

      const mastered = (Array.isArray(raw.mastered) ? raw.mastered : [])
        .filter((item) => typeof item === 'string' && item)

      // 自定义词表：只收 { 名字: 词条数组 }，单表超上限就截断
      const customDicts = {}
      if (raw.customDicts && typeof raw.customDicts === 'object' && !Array.isArray(raw.customDicts)) {
        for (const [name, words] of Object.entries(raw.customDicts)) {
          const key = String(name || '').trim()
          if (!key || !Array.isArray(words)) continue
          const list = words
            .filter((word) => word && typeof word.name === 'string' && word.name)
            .slice(0, CUSTOM_LIMIT)
            .map((word) => ({
              name: word.name,
              trans: Array.isArray(word.trans) ? word.trans.filter((item) => typeof item === 'string') : [],
              ...(typeof word.ipa === 'string' && word.ipa ? { ipa: word.ipa } : {}),
            }))
          if (list.length) customDicts[key] = list
        }
      }

      return { settings, wordRecords, chapterRecords, progress, mastered, customDicts }
    }

    /** 清空一张表（IndexedDB 不可用时清镜像） */
    function clearStores(names) {
      return withStore(names, 'readwrite', (tx, done) => {
        let pending = names.length
        for (const name of names) {
          try {
            const request = tx.objectStore(name).clear()
            request.onsuccess = () => {
              pending -= 1
              if (pending === 0) done(true)
            }
            request.onerror = () => {
              pending -= 1
              if (pending === 0) done(false)
            }
          } catch {
            pending -= 1
            if (pending === 0) done(false)
          }
        }
      })
    }

    /** 导入：先清空再批量写入（progress 用 put，其余用 add） */
    function importData(parsed) {
      const names = [WORD_STORE, CHAPTER_STORE, PROGRESS_STORE]
      return clearStores(names).then((cleared) => {
        if (!cleared) {
          // 没有 IndexedDB：整份进镜像
          writeMirror({
            wordRecords: parsed.wordRecords,
            chapterRecords: parsed.chapterRecords,
            progress: parsed.progress,
          })
          return {
            restored: parsed.wordRecords.length + parsed.chapterRecords.length + parsed.progress.length,
            fallback: true,
          }
        }
        return withStore(names, 'readwrite', (tx, done) => {
          let ok = 0
          let pending = parsed.wordRecords.length + parsed.chapterRecords.length + parsed.progress.length
          const settle = (hit) => {
            if (hit) ok += 1
            pending -= 1
            // 全部落库后把条数交给 withStore 的 oncomplete
            if (pending <= 0) done(ok)
          }
          const submit = (storeName, row, method) => {
            try {
              const request = tx.objectStore(storeName)[method](row)
              request.onsuccess = () => settle(true)
              request.onerror = () => settle(false)
            } catch {
              settle(false)
            }
          }
          if (pending <= 0) {
            done(0)
            return
          }
          for (const row of parsed.wordRecords) {
            submit(WORD_STORE, {
              word: row.word,
              dictId: row.dictId,
              chapter: row.chapter,
              at: row.at,
              wrongCount: row.wrongCount,
              timing: row.timing || [],
            }, 'add')
          }
          for (const row of parsed.chapterRecords) submit(CHAPTER_STORE, { ...row }, 'add')
          for (const row of parsed.progress) submit(PROGRESS_STORE, { ...row }, 'put')
        }).then((count) => ({
          restored: count ?? parsed.wordRecords.length + parsed.chapterRecords.length,
          fallback: false,
        }))
      })
    }

    /** 清空本地练习数据（settings 可选保留） */
    function clearData(options) {
      const { keepSettings = true } = options || {}
      return clearStores([WORD_STORE, CHAPTER_STORE, PROGRESS_STORE]).then(() => {
        writeMirror({ wordRecords: [], chapterRecords: [], progress: [] })
        writeMastered([])
        clearSession()
        if (!keepSettings) {
          for (const key of Object.keys(SETTING_DEFAULTS)) {
            try {
              window.localStorage.removeItem(SETTING_PREFIX + key)
            } catch {
              /* ignore */
            }
          }
        }
        return true
      })
    }

    /** 导出当前所有本地数据为 JSON 文本 */
    function exportBackup() {
      return Promise.all([readWordRecords(), readChapterRecords(), readProgress()]).then(
        ([wordRecords, chapterRecords, progress]) => serializeBackup({
          settings: getSettings(),
          wordRecords,
          chapterRecords,
          progress,
          mastered: readMastered(),
          customDicts: readCustomDicts(),
        }),
      )
    }

    /* ---------------- 纯聚合（可在 node 里测） ---------------- */

    /** 本地时区的自然日 key：YYYY-MM-DD */
    function dayKey(timestamp) {
      const date = new Date(timestamp ?? Date.now())
      const pad = (n) => String(n).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    /** 按天聚合章节记录：{ day, words, chapters, wrong, seconds, accuracy, wpm } */
    function aggregateDaily(chapters) {
      const buckets = new Map()
      for (const item of chapters || []) {
        const day = dayKey(item.at)
        const bucket = buckets.get(day) ?? { day, words: 0, chapters: 0, wrong: 0, seconds: 0 }
        bucket.chapters += 1
        bucket.words += Number(item.wordCount) || 0
        bucket.wrong += Number(item.wrongCount) || 0
        bucket.seconds += Number(item.seconds) || 0
        buckets.set(day, bucket)
      }
      return [...buckets.values()]
        .sort((a, b) => (a.day < b.day ? -1 : 1))
        .map((bucket) => {
          const total = bucket.words + bucket.wrong
          return {
            ...bucket,
            accuracy: total > 0 ? Math.round((bucket.words / total) * 100) : 0,
            wpm: bucket.seconds > 0 ? Math.round((bucket.words / bucket.seconds) * 60) : 0,
          }
        })
    }

    /** 总体指标：词数 / 章数 / 正确率 / WPM */
    function summarize(chapters) {
      let words = 0
      let wrong = 0
      let seconds = 0
      for (const item of chapters || []) {
        words += Number(item.wordCount) || 0
        wrong += Number(item.wrongCount) || 0
        seconds += Number(item.seconds) || 0
      }
      const total = words + wrong
      return {
        words,
        wrong,
        chapters: (chapters || []).length,
        accuracy: total > 0 ? Math.round((words / total) * 100) : 0,
        wpm: seconds > 0 ? Math.round((words / seconds) * 60) : 0,
      }
    }

    /**
     * 错词聚合：wordRecords 里 wrongCount > 0 的，按 (dictId, word) 合并
     * 返回 [{ word, dictId, wrongCount, lastAt }]，按错次数降序、同次数按最近降序
     */
    function collectWrongWords(records, limit) {
      const map = new Map()
      for (const item of records || []) {
        const word = item?.word
        if (!word || !(Number(item.wrongCount) > 0)) continue
        const key = `${item.dictId ?? ''}::${word}`
        const prev = map.get(key)
        if (prev) {
          prev.wrongCount += Number(item.wrongCount) || 0
          prev.lastAt = Math.max(prev.lastAt, Number(item.at) || 0)
        } else {
          map.set(key, {
            word,
            dictId: item.dictId ?? '',
            wrongCount: Number(item.wrongCount) || 0,
            lastAt: Number(item.at) || 0,
          })
        }
      }
      const list = [...map.values()].sort(
        (a, b) => (b.wrongCount - a.wrongCount) || (b.lastAt - a.lastAt),
      )
      return limit ? list.slice(0, limit) : list
    }

    /** 热力等级：0 词 = 0；按当日词数落 1..4 档（对齐 GitHub 的观感） */
    function heatLevel(words) {
      const n = Number(words) || 0
      if (n <= 0) return 0
      if (n < 20) return 1
      if (n < 50) return 2
      if (n < 100) return 3
      return 4
    }

    /**
     * 热力图：近 weeks 周，每周 7 天（周一起），最后一列是本周。
     * 返回 [{ days: [{ day, words, level, future }] }]，future 用于把本周还没到的日子画成空格。
     */
    function heatmapWeeks(chapters, weeks, now) {
      const count = Math.max(1, weeks ?? 12)
      const today = new Date(now ?? Date.now())
      const todayKey = dayKey(today.getTime())
      const byDay = new Map(aggregateDaily(chapters).map((item) => [item.day, item]))
      // 本周周一
      const weekday = (today.getDay() + 6) % 7
      const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - weekday)
      const columns = []
      for (let w = count - 1; w >= 0; w -= 1) {
        const days = []
        for (let d = 0; d < 7; d += 1) {
          const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - w * 7 + d)
          const day = dayKey(date.getTime())
          const hit = byDay.get(day)
          days.push({
            day,
            words: hit ? hit.words : 0,
            level: heatLevel(hit ? hit.words : 0),
            future: day > todayKey,
          })
        }
        columns.push({ days })
      }
      return columns
    }

    /** 最容易打错的字母：把每章记录里的 wrongLetters 累加，取前 N */
    function topWrongLetters(chapters, limit) {
      const tally = new Map()
      for (const row of chapters || []) {
        const map = row && row.wrongLetters
        if (!map || typeof map !== 'object') continue
        for (const [letter, count] of Object.entries(map)) {
          const key = String(letter)
          if (!key) continue
          const add = Math.max(0, Number(count) || 0)
          if (!add) continue
          tally.set(key, (tally.get(key) || 0) + add)
        }
      }
      return [...tally.entries()]
        .map(([letter, count]) => ({ letter, count }))
        .sort((a, b) => b.count - a.count || (a.letter < b.letter ? -1 : 1))
        .slice(0, Math.max(1, limit ?? 5))
    }

    /** QWERTY 三行布局，热力图直接用 */
    const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

    /**
     * 把 wrongLetters 铺到键盘上：返回三行按键，每键 { key, count, level }。
     * level 按「本次最多的键」分 0..4，没打错的键是 0。
     */
    function keyboardHeat(letters) {
      const tally = new Map()
      const rows = Array.isArray(letters)
        ? letters.map((item) => [String(item?.letter ?? '').toLowerCase(), Math.max(0, Number(item?.count) || 0)])
        : Object.entries(letters || {}).map(([letter, count]) => [String(letter).toLowerCase(), Math.max(0, Number(count) || 0)])
      for (const [key, count] of rows) {
        if (!key || !count) continue
        tally.set(key, (tally.get(key) || 0) + count)
      }
      const max = Math.max(0, ...tally.values())
      const levelOf = (count) => {
        if (!count || !max) return 0
        const ratio = count / max
        if (ratio >= 0.75) return 4
        if (ratio >= 0.5) return 3
        if (ratio >= 0.25) return 2
        return 1
      }
      return KEY_ROWS.map((row) => [...row].map((key) => ({
        key,
        count: tally.get(key) || 0,
        level: levelOf(tally.get(key) || 0),
      })))
    }

    /** 错词本筛选：按词库 + 关键词 + 排序方式 */
    function filterWrongWords(rows, filters) {
      const { query, dictId, sort, mastered, showMastered = false } = filters || {}
      const needle = String(query ?? '').trim().toLowerCase()
      const known = mastered instanceof Set ? mastered : new Set(mastered || [])
      let list = (rows || []).filter((row) => {
        if (dictId && row.dictId !== dictId) return false
        // 已掌握的默认不出现，但要能看到（showMastered）
        if (!showMastered && known.has(`${row.dictId || ''}:${row.word}`)) return false
        if (!needle) return true
        const meta = lookup(row.word)
        return row.word.toLowerCase().includes(needle)
          || String(meta?.zh ?? '').toLowerCase().includes(needle)
      })
      if (sort === 'recent') list = list.slice().sort((a, b) => b.lastAt - a.lastAt)
      else if (sort === 'alpha') list = list.slice().sort((a, b) => (a.word < b.word ? -1 : 1))
      return list
    }

    /** 词表抽屉一次列多少个词：和一章的词数对齐（对齐上游 WordList 只列当前章） */
    const WORDLIST_LIMIT = 20

    /**
     * 词表行的状态，优先级从高到低：
     * current（当前词） > mastered（已掌握） > wrong（打错过） > done（已打过） > idle（没碰过）
     * 「当前词」永远压过其它状态；「已掌握」压过「打错过」，因为掌握是用户显式确认的结论。
     */
    const WORDLIST_STATES = ['current', 'mastered', 'wrong', 'done', 'idle']

    /** 状态 → 文案 key（渲染和测试共用一份） */
    const WORDLIST_STATE_LABEL = {
      current: 'wordStateCurrent',
      mastered: 'wordStateMastered',
      wrong: 'wordStateWrong',
      done: 'wordStateDone',
      idle: 'wordStateIdle',
    }

    /**
     * 词表抽屉的纯函数：本章的词 → 可渲染的行。
     * @param input.words - 本轮词（字符串数组，或 { w / word, ipa, zh } 词条）
     * @param input.index - 当前词的章内下标（打完后可能是 words.length，此时没有 current 行）
     * @param input.records - wordRecords 原始记录（「打过」/「打错过」的判定来源）
     * @param input.mastered - readMastered() 的结果（`dictId:word` 或裸 word 都认）
     * @param input.dictId - 只统计该词库的记录 / 掌握标记（传空则不过滤）
     * @param input.limit - 行数上限，默认 WORDLIST_LIMIT
     * @returns [{ index, word, ipa, zh, state }]
     */
    function wordListRows(input) {
      const {
        words, index, records, mastered, dictId = '', limit = WORDLIST_LIMIT,
      } = input || {}
      const list = Array.isArray(words) ? words : []
      const cap = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : list.length
      const current = Number.isInteger(index) ? index : -1

      const typed = new Set()
      const wrong = new Set()
      for (const item of records || []) {
        const word = item?.word
        if (!word) continue
        if (dictId && String(item.dictId ?? '') !== String(dictId)) continue
        typed.add(String(word))
        if (Number(item.wrongCount) > 0) wrong.add(String(word))
      }

      const known = new Set((mastered || []).map((key) => String(key)))
      const masteredWord = (word) =>
        known.has(word)
        || known.has(masteredKey(dictId, word))
        // 别的词库里标过掌握也认（用户视角里就是"这个词我掌握了"）
        || [...known].some((key) => key.endsWith(`:${word}`))

      const rows = []
      for (let i = 0; i < list.length && rows.length < cap; i += 1) {
        const entry = list[i]
        const word = String(typeof entry === 'string' ? entry : (entry?.w ?? entry?.word ?? ''))
        if (!word) continue
        const meta = lookup(word)
        const own = typeof entry === 'object' && entry ? entry : null
        const ipa = String(own?.ipa ?? meta?.ipa ?? '')
        const zh = String(own?.zh ?? meta?.zh ?? '')
        let state = 'idle'
        if (i === current) state = 'current'
        else if (masteredWord(word)) state = 'mastered'
        else if (wrong.has(word)) state = 'wrong'
        else if (typed.has(word)) state = 'done'
        rows.push({ index: i, word, ipa, zh, state })
      }
      return rows
    }

    /** 最近 n 天（含今天），缺失的日子补零，供折线/柱状图直接画 */
    function lastDays(chapters, days, now) {
      const count = days ?? 30
      const aggregated = aggregateDaily(chapters)
      const byDay = new Map(aggregated.map((item) => [item.day, item]))
      const out = []
      const base = new Date(now ?? Date.now())
      for (let i = count - 1; i >= 0; i -= 1) {
        const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i)
        const day = dayKey(date.getTime())
        out.push(byDay.get(day) ?? { day, words: 0, chapters: 0, wrong: 0, seconds: 0, accuracy: 0, wpm: 0 })
      }
      return out
    }

    /** 拉一个词库的原始 JSON：按 DICT_SOURCES 依次尝试 */
    async function fetchDictJson(meta) {
      const file = meta?.url
      if (!file) throw new Error('该词库没有数据地址')
      let lastError = null
      for (const build of dictSourceList()) {
        const target = build(file)
        try {
          const response = await fetch(target)
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const data = await response.json()
          const list = Array.isArray(data) ? data : data[Object.keys(data)[0]]
          if (!Array.isArray(list)) throw new Error('数据格式不是数组')
          return list
        } catch (error) {
          lastError = error
        }
      }
      throw lastError ?? new Error('词库加载失败')
    }

    /** 读词条：内存 → 内置 → IndexedDB → 网络（force=true 时跳过前三级） */
    async function loadDictWords(id, options) {
      const force = Boolean(options?.force)
      // 自定义词表不走网络
      if (isCustomId(id)) {
        if (!force && DICT_CACHE.has(id)) return DICT_CACHE.get(id)
        const words = customWords(id)
        if (!words.length) throw new Error(`自定义词表为空：${id}`)
        DICT_CACHE.set(id, words)
        return words
      }
      const meta = dictionaryById(id)
      if (!meta) throw new Error(`未知词库：${id}`)

      if (!force) {
        if (DICT_CACHE.has(id)) return DICT_CACHE.get(id)
        const cached = await cacheGet(id)
        if (Array.isArray(cached) && cached.length) {
          DICT_CACHE.set(id, cached)
          return cached
        }
      }

      if (DICT_INFLIGHT.has(id)) return DICT_INFLIGHT.get(id)

      const task = (async () => {
        try {
          const raw = await fetchDictJson(meta)
          const words = normalizeWords(raw, meta.languageCategory)
          if (!words.length) throw new Error('词库解析后没有有效词条')
          DICT_CACHE.set(id, words)
          cachePut(id, words, meta)
          return words
        } catch (error) {
          // 拉不到就退回内置采样（只对 7 个内置库有效），并让调用方知道降级了
          const builtin = builtinById(id)
          if (builtin?.words?.length) {
            DICT_CACHE.set(id, builtin.words)
            throw Object.assign(error, { fallbackWords: builtin.words })
          }
          throw error
        }
      })()

      DICT_INFLIGHT.set(id, task)
      try {
        return await task
      } finally {
        DICT_INFLIGHT.delete(id)
      }
    }

    /** 只取已就绪的词条（不触发网络），没有就返回内置兜底 */
    function wordsSync(id) {
      if (DICT_CACHE.has(id)) return DICT_CACHE.get(id)
      if (isCustomId(id)) {
        const words = customWords(id)
        if (words.length) DICT_CACHE.set(id, words)
        return words
      }
      const builtin = builtinById(id)
      if (builtin?.words?.length) return builtin.words
      return LEXICON.map((entry) => ({ w: entry.word, ipa: entry.ipa, zh: entry.zh }))
    }

    function readDictId() {
      try {
        const saved = window.localStorage.getItem(DICT_STORAGE_KEY)
        if (saved && catalog().some((dict) => dict.id === saved)) return saved
      } catch {
        /* 无痕模式等，忽略 */
      }
      return catalog()[0]?.id ?? 'builtin'
    }

    function writeDictId(id) {
      try {
        window.localStorage.setItem(DICT_STORAGE_KEY, id)
        const recent = readRecent().filter((item) => item !== id)
        recent.unshift(id)
        window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent.slice(0, 5)))
      } catch {
        /* ignore */
      }
    }

    function readRecent() {
      try {
        const raw = JSON.parse(window.localStorage.getItem(RECENT_STORAGE_KEY) || '[]')
        return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : []
      } catch {
        return []
      }
    }

    /** 查一个词的中文与音标：已加载词库 → 内置词库 → LEXICON */
    function lookup(word) {
      if (!word) return undefined
      const needle = String(word).toLowerCase()
      for (const dict of builtinDicts()) {
        const hit = dict.words?.find((entry) => entry.w === needle)
        if (hit) return { word: hit.w, ipa: hit.ipa, zh: hit.zh }
      }
      for (const words of DICT_CACHE.values()) {
        const hit = words.find((entry) => entry.w === needle)
        if (hit) return { word: hit.w, ipa: hit.ipa, zh: hit.zh }
      }
      const fallback = LEXICON.find((entry) => entry.word === needle)
      return fallback ? { word: fallback.word, ipa: fallback.ipa, zh: fallback.zh } : undefined
    }

    /** 按分类把词库分组（保持首次出现的顺序） */
    function groupByCategory(dicts) {
      const groups = []
      for (const dict of dicts) {
        const category = dict.category || '其它'
        const group = groups.find((item) => item.category === category)
        if (group) group.dicts.push(dict)
        else groups.push({ category, dicts: [dict] })
      }
      return groups
    }

    /** 从一批词条里随机取 count 个词（Fisher-Yates 洗牌后截断） */
    function sampleFromWords(words, count) {
      const pool = (words || []).map((entry) => entry.w).filter(Boolean)
      const list = pool.slice()
      for (let i = list.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1))
        const swap = list[i]
        list[i] = list[j]
        list[j] = swap
      }
      return list.slice(0, count ?? 20)
    }

    /** 从指定词库随机取一批词（只用于已就绪的数据，异步加载见 loadDictWords） */
    function sampleWords(dictId, count) {
      return sampleFromWords(wordsSync(dictId), count)
    }

    /** 搜索词库：名称 / id / 标签 */
    function searchCatalog(query, limit) {
      const q = String(query || '').trim().toLowerCase()
      if (!q) return []
      const list = catalog().filter((dict) => {
        const hay = [dict.name, dict.id, ...(dict.tags || [])].join(' ').toLowerCase()
        return hay.includes(q)
      })
      return list.slice(0, limit ?? 40)
    }

    const DICT = {
      zh: {
        title: 'Qwerty 跟打',
        progress: '进度 {done}/{total}',
        hits: '命中 {n}',
        retries: '重打 {n}',
        placeholder: '跟打输入区（键盘直接打，不需要点框）',
        hint: '打中字母变绿、自动进下一个词；打错变红、清空重打整词。回车不会发送消息。',
        tipFirstLetter: '首字母提示 {pattern}',
        tipTwoLetters: '再给两个字母 {pattern}',
        tipReveal: '只剩最后一个字母 {pattern}',
        auto: '自动打',
        autoStop: '停止自动',
        restart: '重开',
        close: '收起',
        barHint: '焦点放在下面的输入框，照着单词打；打错整词重打，回车不会发送。',
        dictTitle: '选择词库',
        doneShort: '完成 {total} 个 · {sec}s',
        autoTitle: '自动打',
        doneTitle: '这一轮打完了',
        doneBody: '完成 {total}/{total}，用时 {sec}s，命中 {hits}，重打 {retries}',
        again: '再来一轮',
        resultWrongTitle: '本轮打错 {n} 个',
        resultRetryWrong: '重练这些词',
        resultNextChapter: '下一章',
        resultNextChapterLast: '回到第 1 章',
        empty: '没有单词；用空格分隔即可，例如：/qwerty-autotype cancel govern',
        sideLabel: '跟打',
        sideTitle: '开 / 关 Qwerty 跟打卡片',
        searchDict: '搜索词库（名称 / 标签）',
        allCategories: '全部',
        recent: '最近使用',
        searchResult: '搜索结果',
        loading: '正在加载词库…',
        loadFailed: '词库加载失败，先用内置词库继续',
        chapterTitle: '选择章节',
        speak: '读一遍',
        todayStats: '今日 {words} 词 · 正确率 {accuracy}% · {wpm} WPM',
        accuracyShort: '正确率 {n}%',
        prevTip: '上一个（Ctrl/⌘+←）',
        skipTip: '跳过（Ctrl/⌘+→）',
        loopTip: '循环当前词（Ctrl/⌘+J）',
        pauseTip: '暂停（Ctrl/⌘+P）',
        resumeTip: '继续',
        pausedTip: '已暂停（失焦或切标签页会自动暂停）',
        resume: '继续',
        wrongBook: '错词本',
        wordListOpen: '本章词表',
        wordListTitle: '本章词表 {n} 个',
        wordListEmpty: '这一章还没有词',
        wordListHint: '点一行直接跳过去',
        wordStateCurrent: '当前',
        wordStateDone: '已打过',
        wordStateWrong: '打错过',
        wordStateMastered: '已掌握',
        wordStateIdle: '未打',
        wrongSearch: '搜单词或释义',
        mistakesLabel: '本轮打错 {n} 个：',
        settingsTitle: '跟打',
        settingSound: '键音',
        settingSoundHint: '打对/打错时给一声轻提示',
        settingAutoNext: '自动继续',
        settingAutoNextHint: '打完 20 个自动接下一章，不用手动点',
        hotkeysTitle: '快捷键',
        announceWrong: '打错了，请整词重打 {word}',
        announceDone: '本轮完成，共 {n} 个词',
        hotkeysList: 'Esc 关闭 · Ctrl/⌘+← 上一个 · Ctrl/⌘+→ 跳过 · Ctrl/⌘+J 循环 · Ctrl/⌘+P 暂停 · 在输入框里按 Tab 开始',
        lettersTitle: '易错字母',
        customNew: '＋ 导入自定义词表',
        customName: '词表名字（可留空）',
        customPlaceholder: '一行一个词：word 中文\n也支持 word,中文,/音标/\n# 开头是注释',
        customSave: '保存并开始',
        customFile: '从文件导入（.txt / .csv / .json）',
        customFileLoaded: '已读取文件，解析出 {n} 个词，确认后保存',
        customExport: '导出这个词表',
        customEmpty: '没解析出任何单词，检查一下格式',
        customSaved: '已保存 {n} 个词',
        cancel: '取消',
        markMastered: '标记已掌握',
        cacheLabel: '词库缓存',
        cacheHint: '已缓存 {n} 个词库，约 {size}；清掉后下次用到会重新下载',
        cacheLoading: '读取中…',
        cacheClear: '清理缓存',
        cacheCleared: '词库缓存已清理',
        dataTitle: '数据',
        backupExport: '导出备份',
        backupImport: '导入备份',
        backupClear: '清空记录',
        clearConfirm: '再点一次确认清空',
        clearedDone: '已清空本地练习记录',
        backupExported: '备份已开始下载',
        backupImported: '已恢复 {n} 条记录',
        backupBadFile: '这个文件不是跟打备份',
        backupFailed: '导出失败，浏览器可能禁止了下载',
        settingCaseSensitive: '区分大小写',
        settingCaseSensitiveHint: '关：Cancel 打 cancel 也算对（代码词库建议开）',
        settingIgnorePunct: '忽略标点',
        settingIgnorePunctHint: '开：append() 只需要打 append',
        settingVoice: '自动发音',
        settingAccent: '发音口音',
        settingAccentHint: '英音走有道教 type=1，美音 type=2；中日文自动判断',
        accent_us: '美音',
        accent_uk: '英音',
        settingVoiceHint: '换词时自动读一遍（有道音频，离线退回系统语音）',
        settingDictation: '默写形态',
        settingDictationHint: '默认遮住哪些字母，练习时仍可临时切换',
        reviewMistakes: '重练这些词',
        nextChapter: '下一章',
        allDicts: '全部',
        sortCount: '按错误次数',
        sortRecent: '按最近出错',
        wrongTitle: '错词本 · {n} 个',
        wrongEmpty: '还没有错词。打错过的词会自动出现在这里。',
        reviewTop: '重练前 20',
        clearWrong: '刷新',
        stats: '统计',
        statsTitle: '近 14 天',
        statWords: '{n} 词',
        statChapters: '{n} 章',
        elapsedShort: '用时 {sec}s',
        dictation: '默写形态',
        dictation_none: '正常显示',
        dictation_hideAll: '全部隐藏',
        dictation_hideVowel: '隐藏元音',
        dictation_hideConsonant: '隐藏辅音',
        dictation_randomHide: '随机隐藏',
        wordCount: '{n} 词',
      },
      en: {
        title: 'Qwerty practice',
        progress: '{done}/{total}',
        hits: '{n} hit',
        retries: '{n} retry',
        placeholder: 'Dictation input (just type; no need to click a box)',
        hint: 'Correct letters turn green and the next word starts; a wrong letter turns red, clears the field, and you retype the whole word. Enter here never sends a message.',
        tipFirstLetter: 'First letter {pattern}',
        tipTwoLetters: 'First two letters {pattern}',
        tipReveal: 'All but the last letter {pattern}',
        auto: 'Auto type',
        autoStop: 'Stop auto',
        restart: 'Restart',
        close: 'Hide',
        barHint: 'Focus the composer below and type along; a wrong letter restarts the word, and Enter never sends.',
        dictTitle: 'Choose a dictionary',
        doneShort: '{total} done · {sec}s',
        autoTitle: 'Auto type',
        loading: 'Loading dictionary…',
        doneTitle: 'Round complete',
        doneBody: '{total}/{total} done in {sec}s — {hits} hits, {retries} retries',
        again: 'Go again',
        resultWrongTitle: 'Mistyped {n} this round',
        resultRetryWrong: 'Retry these',
        resultNextChapter: 'Next chapter',
        resultNextChapterLast: 'Back to chapter 1',
        searchDict: 'Search dictionaries',
        allCategories: 'All',
        recent: 'Recent',
        searchResult: 'Results',
        loadFailed: 'Dictionary failed to load — using the built-in one',
        chapterTitle: 'Chapter',
        speak: 'Read aloud',
        todayStats: 'Today {words} words · {accuracy}% · {wpm} WPM',
        accuracyShort: '{n}% accuracy',
        prevTip: 'Previous (⌘/Ctrl+←)',
        skipTip: 'Skip (⌘/Ctrl+→)',
        loopTip: 'Loop this word (⌘/Ctrl+J)',
        pauseTip: 'Pause (⌘/Ctrl+P)',
        resumeTip: 'Resume',
        pausedTip: 'Paused (auto-paused on blur or tab switch)',
        resume: 'Resume',
        wrongBook: 'Wrong words',
        wordListOpen: 'Chapter words',
        wordListTitle: 'Chapter words ({n})',
        wordListEmpty: 'No words in this chapter',
        wordListHint: 'Click a row to jump there',
        wordStateCurrent: 'Now',
        wordStateDone: 'Done',
        wordStateWrong: 'Missed',
        wordStateMastered: 'Mastered',
        wordStateIdle: 'Idle',
        wrongSearch: 'Search word or meaning',
        mistakesLabel: 'Mistyped {n} this round:',
        settingsTitle: 'Typing drill',
        settingSound: 'Key sound',
        settingSoundHint: 'A soft click on hit or miss',
        settingAutoNext: 'Auto-continue',
        settingAutoNextHint: 'Roll into the next chapter instead of stopping at 20',
        hotkeysTitle: 'Shortcuts',
        announceWrong: 'Mistyped — retype the whole word {word}',
        announceDone: 'Round finished, {n} words',
        hotkeysList: 'Esc close · Ctrl/⌘+← prev · Ctrl/⌘+→ skip · Ctrl/⌘+J loop · Ctrl/⌘+P pause · Tab in the composer starts',
        lettersTitle: 'Tricky letters',
        customNew: '+ Import word list',
        customName: 'List name (optional)',
        customPlaceholder: 'One word per line: word meaning\nalso word,meaning,/ipa/\n# starts a comment',
        customSave: 'Save and start',
        customFile: 'Import from file (.txt / .csv / .json)',
        customFileLoaded: 'File loaded — {n} words parsed, save to confirm',
        customExport: 'Export this list',
        customEmpty: 'No words parsed — check the format',
        customSaved: 'Saved {n} words',
        cancel: 'Cancel',
        markMastered: 'Mark as mastered',
        cacheLabel: 'Dictionary cache',
        cacheHint: '{n} dictionaries cached, about {size}; they re-download on next use',
        cacheLoading: 'Reading…',
        cacheClear: 'Clear cache',
        cacheCleared: 'Dictionary cache cleared',
        dataTitle: 'Data',
        backupExport: 'Export backup',
        backupImport: 'Import backup',
        backupClear: 'Clear records',
        clearConfirm: 'Click again to confirm',
        clearedDone: 'Local practice records cleared',
        backupExported: 'Backup download started',
        backupImported: 'Restored {n} records',
        backupBadFile: 'Not a typing-drill backup',
        backupFailed: 'Export failed — the browser blocked the download',
        settingCaseSensitive: 'Case sensitive',
        settingCaseSensitiveHint: 'Off: typing "cancel" passes for "Cancel"',
        settingIgnorePunct: 'Ignore punctuation',
        settingIgnorePunctHint: 'On: "append()" only needs "append"',
        settingVoice: 'Auto pronounce',
        settingAccent: 'Pronunciation',
        settingAccentHint: 'US uses type=2, UK uses type=1; Japanese/Chinese detected automatically',
        accent_us: 'US',
        accent_uk: 'UK',
        settingVoiceHint: 'Read each new word aloud (Youdao audio, TTS fallback)',
        settingDictation: 'Dictation',
        settingDictationHint: 'Which letters stay hidden by default',
        reviewMistakes: 'Review them',
        nextChapter: 'Next chapter',
        allDicts: 'All',
        sortCount: 'By mistakes',
        sortRecent: 'By recent',
        wrongTitle: 'Wrong words · {n}',
        wrongEmpty: 'No wrong words yet — mistyped words land here automatically.',
        reviewTop: 'Review top 20',
        clearWrong: 'Refresh',
        stats: 'Stats',
        statsTitle: 'Last 14 days',
        statWords: '{n} words',
        statChapters: '{n} chapters',
        elapsedShort: '{sec}s',
        dictation: 'Dictation',
        dictation_none: 'Show all',
        dictation_hideAll: 'Hide all',
        dictation_hideVowel: 'Hide vowels',
        dictation_hideConsonant: 'Hide consonants',
        dictation_randomHide: 'Hide random',
        wordCount: '{n} words',
        empty: 'No words; separate them with spaces, e.g. /qwerty-autotype cancel govern',
        sideLabel: 'Practice',
        sideTitle: 'Show / hide the Qwerty practice card',
      },
    }

    const CSS = `
.qat-bar{position:relative;display:flex;align-items:center;justify-content:center;padding:0 0 5px;background:transparent;border:0;box-sizing:border-box;font-size:12px;color:var(--dsw-alias-label-secondary);min-height:52px}
.qat-bar .qat-word{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;font-size:52px;line-height:1.1;min-height:60px;gap:1px;letter-spacing:.01em;font-weight:400}
.qat-card[data-variant="panel"] .qat-word{font-size:64px;min-height:74px}
/* 面板按官方 Typing 页的骨架摆：顶部一行工具、中间单词居中、底部一行按钮 + 一行提示 */
.qat-card[data-variant="panel"]{position:relative;min-height:380px;justify-content:center;padding:56px 24px 52px}
.qat-card[data-variant="panel"] .qat-head{position:absolute;left:16px;right:16px;top:14px;width:auto;gap:8px}
.qat-card[data-variant="panel"] > .qat-row{position:absolute;left:0;right:0;bottom:42px;justify-content:center}
.qat-card[data-variant="panel"] > .qat-hint{position:absolute;left:0;right:0;bottom:14px;text-align:center;margin:0}
.qat-card[data-variant="panel"] .qat-done{width:100%;align-items:center}
.qat-bar-empty{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.qat-bar-center{display:flex;align-items:center;justify-content:center;min-width:0;width:100%}
.qat-bar-count{position:absolute;left:0;top:50%;transform:translateY(-50%);font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.qat-bar-gloss{font-size:12px;color:var(--dsw-alias-label-tertiary);max-width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qat-bar-close{position:absolute;right:0;top:50%;transform:translateY(-50%);opacity:.45;font-size:13px}
.qat-bar-close:hover{opacity:.9}
.qat-wordblock{display:inline-flex;flex-direction:column;align-items:center;gap:1px;line-height:1.15}
.qat-ipa{font-size:13px;line-height:1.25;color:var(--dsw-alias-label-secondary);opacity:.7;letter-spacing:0;user-select:none}
.qat-bar-done{font-size:13px;color:var(--dsw-alias-state-success-primary)}
.qat-meta{font-size:11px;opacity:.6;font-variant-numeric:tabular-nums;white-space:nowrap}
.qat-meta-sep{margin:0 4px;opacity:.5}
.qat-select{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:1px 6px;font:inherit;font-size:11px;cursor:pointer;max-width:150px}
.qat-select:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.qat-select:focus{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.qat-dictbtn{display:inline-flex;align-items:center;gap:4px;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 8px;font-size:12px;cursor:pointer}
.qat-dictbtn .qat-svg{opacity:.6}
.qat-picker{width:100%;display:flex;flex-direction:column;gap:10px;padding:4px 2px 12px}
.qat-picker-head{display:flex;align-items:center;gap:10px}
.qat-search{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 10px;font:inherit;font-size:13px}
.qat-search:focus{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.qat-chips{display:flex;flex-wrap:wrap;gap:6px}
.qat-chip{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;padding:3px 10px;font-size:12px;cursor:pointer}
.qat-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.qat-chip[data-active="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}
.qat-dictgroup{display:flex;flex-direction:column;gap:4px;min-height:0}
.qat-dictgroup-title{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:2px 2px 4px}
.qat-dictscroll{max-height:320px;overflow:auto;display:flex;flex-direction:column;gap:2px;padding-right:4px}
.qat-dictrow{display:flex;align-items:baseline;justify-content:space-between;gap:10px;border:none;background:transparent;color:var(--dsw-alias-label-primary);text-align:left;padding:7px 9px;border-radius:8px;font:inherit;font-size:13px;cursor:pointer}
.qat-dictrow:hover{background:var(--dsw-alias-interactive-bg-hover)}
.qat-dictrow[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover)}
.qat-dictname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qat-dictmeta{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.qat-loading{color:var(--dsw-alias-label-secondary);font-size:13px;padding:24px 0;text-align:center}
.qat-letter[data-mask="true"]{color:var(--dsw-alias-label-tertiary);opacity:.55}
.qat-picker-title{font-size:13px;color:var(--dsw-alias-label-secondary)}
.qat-wrongrow{display:flex;align-items:baseline;gap:10px;padding:6px 8px;border-radius:8px}
.qat-wrongrow:hover{background:var(--dsw-alias-interactive-bg-hover)}
.qat-wrongrow{display:flex;align-items:center;gap:8px;padding:3px 2px}
.qat-icon[data-active="true"][data-act="mastered"]{color:var(--dsw-alias-state-success-primary);opacity:1}
.qat-wrongword{font-size:14px;color:var(--dsw-alias-label-primary);min-width:110px}
.qat-wrongzh{flex:1;font-size:12px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qat-wrongcount{font-size:12px;color:var(--dsw-alias-state-error-primary)}
.qat-wordlist{display:flex;flex-direction:column;gap:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:10px 12px;background:var(--dsw-alias-bg-layer-1)}
.qat-wordlist-head{display:flex;align-items:center;gap:8px}
.qat-wordlist-list{display:flex;flex-direction:column;gap:2px;max-height:340px;overflow:auto;padding-right:4px}
.qat-wordlist-row{display:flex;align-items:baseline;gap:8px;width:100%;box-sizing:border-box;border:0;background:transparent;border-radius:8px;padding:5px 8px;font:inherit;font-size:13px;text-align:left;color:var(--dsw-alias-label-primary);cursor:pointer}
.qat-wordlist-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.qat-wordlist-row[data-state="current"]{background:var(--dsw-alias-interactive-bg-hover);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}
.qat-wordlist-row[data-state="mastered"] .qat-wordlist-word{opacity:.7}
.qat-wordlist-no{flex:none;width:22px;text-align:right;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.qat-wordlist-word{flex:none;min-width:108px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;color:var(--dsw-alias-label-primary)}
.qat-wordlist-ipa{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.qat-wordlist-zh{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qat-wordlist-state{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.qat-wordlist-state[data-state="current"]{color:var(--dsw-alias-brand-primary)}
.qat-wordlist-state[data-state="done"]{color:var(--dsw-alias-state-success-primary)}
.qat-wordlist-state[data-state="wrong"]{color:var(--dsw-alias-state-error-primary)}
.qat-wordlist-state[data-state="mastered"]{color:var(--dsw-alias-state-success-primary);opacity:.85}
.qat-stats-nums{display:flex;gap:16px;font-size:13px;color:var(--dsw-alias-label-secondary)}
.qat-letters{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-secondary);margin:2px 0 6px}
.qat-letters-label{color:var(--dsw-alias-label-tertiary)}
.qat-letterchip{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.qat-kbd{display:flex;flex-direction:column;gap:3px;margin:0 0 10px}
.qat-kbdrow{display:flex;gap:3px}
.qat-kbdrow:nth-child(2){margin-left:8px}
.qat-kbdrow:nth-child(3){margin-left:18px}
.qat-key{width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;border-radius:3px;font-size:9px;line-height:1;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.qat-key[data-level="1"]{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 22%, transparent);color:var(--dsw-alias-label-secondary)}
.qat-key[data-level="2"]{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);color:var(--dsw-alias-label-primary)}
.qat-key[data-level="3"]{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 62%, transparent);color:#fff}
.qat-key[data-level="4"]{background:var(--dsw-alias-state-error-primary);color:#fff}
.qat-heat{display:flex;gap:3px;margin:4px 0 10px}
.qat-heatcol{display:flex;flex-direction:column;gap:3px}
.qat-heatcell{width:9px;height:9px;border-radius:2px;background:var(--dsw-alias-border-l1)}
.qat-heatcell[data-level="1"]{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, transparent)}
.qat-heatcell[data-level="2"]{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 50%, transparent)}
.qat-heatcell[data-level="3"]{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 74%, transparent)}
.qat-heatcell[data-level="4"]{background:var(--dsw-alias-brand-primary)}
.qat-heatcell[data-level="future"]{background:transparent}
.qat-wrongsearch{max-width:160px;margin-left:8px}
.qat-bars{display:flex;align-items:flex-end;gap:6px;height:120px;padding:8px 2px 0}
.qat-barcol{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:4px}
.qat-barfill{width:100%;max-width:22px;background:var(--dsw-alias-brand-primary);border-radius:3px 3px 0 0;min-height:2px}
.qat-barfill[data-empty="true"]{background:var(--dsw-alias-border-l1)}
.qat-barlabel{font-size:9px;color:var(--dsw-alias-label-tertiary)}
.qat-btn:focus-visible,.qat-icon:focus-visible,.qat-chip:focus-visible,.qat-switch:focus-visible,.qat-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px;border-radius:6px}
.qat-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.qat-help{margin:2px 0 8px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.7}
.qat-btn[data-on="true"]{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-selected)}
.qat-paused{display:flex;align-items:center;gap:12px;font-size:13px;color:var(--dsw-alias-label-secondary);padding:6px 0}
.qat-metric{color:var(--dsw-alias-label-tertiary)}
.qat-settings{display:flex;flex-direction:column;gap:12px;padding:14px 0}
.qat-settings-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.qat-setrow{display:flex;align-items:center;justify-content:space-between;gap:16px}
.qat-settext{display:flex;flex-direction:column;gap:2px;min-width:0}
.qat-setlabel{font-size:13px;color:var(--dsw-alias-label-primary)}
.qat-sethint{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.qat-import{display:flex;flex-direction:column;gap:8px;padding:10px 0 2px;border-top:1px solid var(--dsw-alias-border-l1);margin-top:6px}
.qat-importopen{padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1);margin-top:6px}
.qat-filepick{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-brand-primary);cursor:pointer}
.qat-filepick input{display:none}
.qat-textarea{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
.qat-textarea:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.qat-datablock{margin-top:6px}
.qat-hotkeys{line-height:1.7;margin-top:-6px}
.qat-databtns{display:flex;gap:8px;flex-wrap:wrap}
.qat-switch{display:inline-flex;align-items:center;justify-content:center;min-width:40px;padding:3px 10px;border-radius:999px;font-size:12px;cursor:pointer;user-select:none;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.qat-switch[data-on="true"]{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}
.qat-mistakes{display:flex;flex-direction:column;align-items:flex-start;gap:5px;font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:2px}
.qat-mistakes-title{color:var(--dsw-alias-label-secondary)}
.qat-mistakes-list{display:flex;flex-wrap:wrap;align-items:center;gap:6px;color:var(--dsw-alias-state-error-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.qat-mistake{display:inline-flex;align-items:baseline;gap:5px;padding:1px 7px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-error-primary);line-height:1.5}
.qat-mistake[data-wrong="1"]{color:var(--dsw-alias-label-primary)}
.qat-mistake-zh{font-family:inherit;font-size:11px;color:var(--dsw-alias-label-tertiary);font-weight:400;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qat-done-metrics{display:flex;gap:14px;font-size:13px;color:var(--dsw-alias-label-secondary);margin-top:6px}
.qat-speak{display:inline-flex;align-items:center;margin-left:8px;cursor:pointer;font-size:13px;opacity:.65;user-select:none}
.qat-speak:hover{opacity:1}
.qat-chapter{max-width:110px}
.qat-dictation{max-width:110px}
.qat-note{font-size:12px;color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-label-secondary));padding:2px 0 6px}
.qat-glyph{display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);flex:none;transition:color 120ms linear}
.qat-glyph[data-active="true"]{color:var(--dsw-alias-brand-primary)}
.qat-glyph[data-active="true"]{color:var(--dsw-alias-label-primary)}
.qat-panel{padding:28px 32px;max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
.qat-panel-head{display:flex;align-items:center;gap:8px;min-width:0}
.qat-tools{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;margin-top:-2px}
.qat-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;line-height:1;transition:background-color 120ms linear,color 120ms linear}
.qat-iconbtn:hover{background:var(--dsw-alias-bg-sunken);color:var(--dsw-alias-label-primary)}
.qat-iconbtn[data-on="true"]{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-sunken)}
.qat-panel-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary)}
.qat-panel-sub{font-size:12px;color:var(--dsw-alias-label-secondary)}
.qat-card[data-variant="panel"]{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;padding:28px 24px 22px;background:var(--dsw-alias-bg-layer-1);align-items:center;cursor:text}
.qat-card[data-variant="panel"] .qat-head{justify-content:center}
.qat-card[data-variant="panel"] .qat-word{font-size:56px;justify-content:center;gap:2px;margin:8px 0 4px}
.qat-gloss{display:flex;flex-direction:column;align-items:center;gap:4px;margin:6px 0 16px;text-align:center}
.qat-gloss-ipa{font-size:15px;line-height:1.4;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.qat-gloss-zh{font-size:16px;line-height:1.5;color:var(--dsw-alias-label-secondary);max-width:34em}
.qat-acts{display:inline-flex;align-items:center;gap:2px;opacity:.55}
.qat-acts:hover{opacity:1}
.qat-icon{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:5px;cursor:pointer;user-select:none;font-size:12px;line-height:1;gap:0}
.qat-icon>.qat-svg,.qat-btn>.qat-svg,.qat-speak>.qat-svg{pointer-events:none}
.qat-icon:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.qat-icon[data-active="true"]{color:var(--dsw-alias-brand-primary)}
.qat-card{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-sizing:border-box}
.qat-card[data-variant="dock"]{width:100%}
.qat-head{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.qat-title{color:var(--dsw-alias-label-primary);font-weight:600;font-size:13px}
.qat-sep{width:1px;height:12px;background:var(--dsw-alias-border-l1)}
.qat-grow{flex:1}
.qat-word{display:flex;align-items:center;gap:2px;min-height:38px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:30px;line-height:1.15;letter-spacing:.02em;flex-wrap:wrap}
.qat-letter{color:var(--dsw-alias-label-primary);transition:color 90ms linear}
.qat-letter[data-state="ok"]{color:var(--dsw-alias-state-success-primary)}
.qat-letter[data-state="bad"]{color:var(--dsw-alias-state-error-primary)}
.qat-word[data-flash="true"]{animation:qat-shake 220ms ease-in-out}
@keyframes qat-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
.qat-input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px}
/* 面板里不画输入框：留一个 1px 的隐形输入目标接住键入与输入法（对齐上游 InputHandler） */
.qat-input-ghost{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);border:0;background:transparent;opacity:0;pointer-events:none}
.qat-input:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.qat-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-secondary)}
.qat-btn{display:inline-flex;align-items:center;gap:4px;user-select:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;line-height:1.6}
.qat-btn:hover{border-color:var(--dsw-alias-brand-primary)}
.qat-btn[data-active="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.qat-hint{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.5}
/* 打错提示：小字、次要色、贴在不挡单词的位置；不弹窗、不遮答案 */
.qat-tip{display:flex;align-items:center;gap:6px;font-size:12px;line-height:1.4;letter-spacing:0;color:var(--dsw-alias-label-tertiary);user-select:none;pointer-events:none}
.qat-tip[data-tip-level="1"]{color:var(--dsw-alias-label-secondary)}
.qat-tip[data-tip-level="2"]{color:var(--dsw-alias-label-secondary)}
.qat-tip[data-tip-level="3"]{color:var(--dsw-alias-label-secondary)}
.qat-card[data-variant="panel"] .qat-tip{justify-content:center;margin-top:-4px}
.qat-card[data-variant="command"] .qat-tip{justify-content:center}
.qat-bar-tip{font-size:11px;line-height:1.3;letter-spacing:0;font-family:inherit;color:var(--dsw-alias-label-tertiary);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none}
.qat-done{display:flex;flex-direction:column;gap:8px}
.qat-done-title{color:var(--dsw-alias-state-success-primary);font-weight:600;font-size:13px}
.qat-done-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.qat-btn-retry{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.qat-btn-next{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.qat-side{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;min-width:28px;padding:0 8px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;line-height:1;white-space:nowrap}
.qat-side:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.qat-side[data-active="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.qat-side-icon{display:inline-block;width:16px;height:16px;line-height:1;background-color:currentColor;-webkit-mask-image:var(--qat-ink);mask-image:var(--qat-ink);-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center}
.qat-svg{display:block;flex:none;overflow:visible}
`

    /* ---------------------------------------------------------------- locale */

    let localeVersion = 0
    const localeListeners = new Set()
    const bumpLocale = () => {
      localeVersion += 1
      for (const fn of localeListeners) fn()
    }
    const subscribeLocale = (fn) => {
      localeListeners.add(fn)
      return () => localeListeners.delete(fn)
    }
    const getLocaleVersion = () => localeVersion

    function format(text, vars) {
      let out = text
      if (vars) {
        for (const key of Object.keys(vars)) out = out.split(`{${key}}`).join(String(vars[key]))
      }
      return out
    }

    let PLUGIN_CTX = null

    function useT(ctx) {
      const current = useSyncExternalStore(subscribeLocale, getLocaleVersion, getLocaleVersion)
      return useMemo(() => {
        let translate = null
        try {
          translate = ctx.locale.bind(NS)
        } catch {
          translate = null
        }
        return (key, vars) => format(translate?.(key) ?? DICT.zh[key] ?? key, vars)
      }, [ctx, current])
    }

    /** 浏览器下载一段文本（txt / json / csv），失败返回 false */
    function downloadText(fileName, text) {
      try {
        const blob = new Blob([String(text ?? '')], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        return true
      } catch {
        return false
      }
    }

    /**
     * 让 span 扮的按钮真的能用键盘：Tab 可聚焦、Enter/Space 等于点击。
     * 用法：h('span', { ...pressable(() => doIt()), className: 'qat-btn' }, '文字')
     */
    function pressable(onPress) {
      return {
        role: 'button',
        tabIndex: 0,
        onMouseDown: (event) => event.preventDefault(),
        onClick: onPress,
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onPress?.(event)
          }
        },
      }
    }

    /* ------------------------------------------------------------- open state */

    let open = false
    const openListeners = new Set()
    function setOpen(value) {
      const next = value === undefined ? !open : Boolean(value)
      if (next === open) return
      open = next
      for (const fn of openListeners) fn()
    }
    const subscribeOpen = (fn) => {
      openListeners.add(fn)
      return () => openListeners.delete(fn)
    }
    const getOpen = () => open

    function Styles() {
      return h('style', { 'data-qwerty-autotype': '' }, CSS)
    }

    /** 命令参数 / 默认词表 → 单词数组 */
    function parseWords(args, fallbackCount) {
      const raw = String(args ?? '').trim()
      if (!raw) return WORD_POOL.slice(0, fallbackCount ?? 12)
      return raw.split(/\s+/).filter((word) => /^[a-zA-Z][a-zA-Z'-]*$/.test(word)).slice(0, 60)
    }

    /* ---------------------------------------------------------------- judging */

    /**
     * 纯判定：把"已输入的内容"和"目标词"比一遍。
     * 'ok'   还没错，可以继续打
     * 'done' 整词打对 → 通过、进下一个词
     * 'bad'  某个位置打错 → 标红、清空、整词重打
     * 'over' 打超长，直接忽略
     */
    /** 判定时忽略的标点（不含 ' 和 -，它们属于单词本身） */
    const PUNCT_RE = /[()[\]{}<>.,;:!?"“”‘’·、，。；：！？（）《》【】…]/g

    function stripPunct(text) {
      return String(text ?? '').replace(PUNCT_RE, '')
    }

    /**
     * 实际参与判定的目标串：
     * - `ignorePunct` 去掉标点（代码词库的 `append()` 只打 append）
     * - 非 `caseSensitive` 一律小写（默认，避免大写词卡人）
     */
    function effectiveTarget(word, options) {
      const { caseSensitive = false, ignorePunct = false } = options || {}
      let text = String(word ?? '')
      if (ignorePunct) text = stripPunct(text) || text
      if (!caseSensitive) text = text.toLowerCase()
      return text
    }

    /**
     * 逐位比对，返回 { state, badIndex }。
     * state: 'ok' 前缀正确 / 'done' 整词正确 / 'bad' 某位打错 / 'over' 超长
     */
    function judgeTyping(target, value, options) {
      const word = effectiveTarget(target, options)
      const typed = String(value ?? '')
      if (!word) return { state: 'bad', badIndex: -1 }
      if (typed.length > word.length) return { state: 'over', badIndex: -1 }
      for (let i = 0; i < typed.length; i += 1) {
        if (typed[i] !== word[i]) return { state: 'bad', badIndex: i }
      }
      return { state: typed === word ? 'done' : 'ok', badIndex: -1 }
    }

    /**
     * 往当前词上追加一个字符，返回下一个"已输入"串和结果。
     * 'ok' 继续；'done' 整词打对；'bad' 该位打错 → 整词重打；'over' 打超长 → 忽略
     * @param target - 目标词
     * @param typed - 已经打对的前缀
     * @param ch - 新按下的一个字符
     */
    function pushChar(target, typed, ch, options) {
      if (!target) return { typed, result: 'over' }
      const next = typed + ch
      const verdict = judgeTyping(target, next, options)
      if (verdict.state === 'over') return { typed, result: 'over' }
      return { typed: next, result: verdict.state === 'bad' ? 'bad' : verdict.state }
    }

    /* -------------------------------------------------------------- 打错提示 */

    /**
     * 打错到第几次给提示（对齐上游 TipAlert 的「逐档揭示」语义）：
     * 第 3 次给首字母、第 4 次给前两个字母、第 5 次起给到只剩最后一个字母。
     * 想改档位只改这个常量，或者给 tipState 传自己的 thresholds。
     */
    const TIP_THRESHOLDS = [3, 4, 5]

    /** 遮住的字母用下划线表示（不画点，避免和默写遮罩混淆） */
    const TIP_MASK = '_'

    /** 档位 → 文案 key（两份字典都必须有这几个 key） */
    function tipKey(level) {
      if (level === 1) return 'tipFirstLetter'
      if (level === 2) return 'tipTwoLetters'
      if (level >= 3) return 'tipReveal'
      return ''
    }

    /**
     * 打错计数：打中一次归零，打错一次加一，其他结果原样返回。
     * 两个训练入口都走这里，「打对后重新攒」的语义只有一份。
     * @param previous - 当前词这一轮已经打错的次数
     * @param result - 'hit' | 'miss' | 其他
     */
    function nextWrongCount(previous, result) {
      const count = Math.max(0, Math.floor(Number(previous) || 0))
      if (result === 'hit') return 0
      if (result === 'miss') return count + 1
      return count
    }

    /**
     * 纯判定：这一轮打错了几次 → 给到第几档提示、揭示几个字母。
     * @param input.wrongCount - 当前词这一轮打错的次数（打对后归零）
     * @param input.word - 目标词（照原样展示，不做大小写归一）
     * @param input.typed - 已经打对的前缀（这些字母本来就在屏幕上，提示至少要揭示到它）
     * @param input.thresholds - 档位阈值，默认 TIP_THRESHOLDS
     * @returns {{level: number, reveal: number, prefix: string, text: string, key: string}}
     *   level 0 = 不提示（1–2 次）；reveal = 揭示的前导字母个数；
     *   text = 遮住其余字母的提示串，长度恒等于词长，且永远不会是整词。
     */
    function tipState(input) {
      const { wrongCount, word, typed, thresholds } = input || {}
      const chars = String(word ?? '').split('')
      const len = chars.length
      const count = Math.max(0, Math.floor(Number(wrongCount) || 0))
      const levels = Array.isArray(thresholds) && thresholds.length ? thresholds : TIP_THRESHOLDS
      if (len === 0) return { level: 0, reveal: 0, prefix: '', text: '', key: '' }
      let level = 0
      for (let i = 0; i < levels.length; i += 1) {
        const at = Math.max(1, Math.floor(Number(levels[i]) || 0))
        if (count >= at) level = i + 1
      }
      // 1–2 次（或任何没到第一档的次数）一律不提示
      if (level === 0) return { level: 0, reveal: 0, prefix: '', text: '', key: '' }
      // 最后一档给到「只剩最后一个字母」；中间档位按档号递增（1 → 首字母，2 → 前两个）
      const byLevel = level >= levels.length ? len - 1 : level
      // 已经打对的前缀本来就在屏幕上，提示至少揭示到它；但绝不揭示整词
      const typedText = String(typed ?? '')
      let matched = 0
      while (matched < typedText.length && matched < len && typedText[matched] === chars[matched]) matched += 1
      const cap = Math.max(0, len - 1)
      const reveal = Math.min(cap, Math.max(0, byLevel, matched))
      const prefix = chars.slice(0, reveal).join('')
      const text = chars.map((ch, i) => (i < reveal ? ch : (ch === ' ' ? ' ' : TIP_MASK))).join('')
      return { level, reveal, prefix, text, key: tipKey(level) }
    }

    /* -------------------------------------------------- 指标 / Tab 裁决 / 会话 */

    /**
     * 有效练习毫秒：暂停期间不计时（失焦、切标签页、手动暂停都走这里）
     * clock = { ms: 已累计毫秒, last: 上一次开始计时的时刻 | null(暂停中) }
     */
    function activeMs(clock, now) {
      const base = Number(clock?.ms) || 0
      if (!clock || clock.last === null || clock.last === undefined) return Math.max(0, base)
      return Math.max(0, base + Math.max(0, (now ?? Date.now()) - clock.last))
    }

    /**
     * 快捷键裁决（只在焦点位于 composer 时问它）：
     * 返回 'prev' | 'skip' | 'loop' | 'pause' | 'close' | ''，
     * 空字符串表示不是我们管的键，交给宿主。
     */
    function resolveHotkey(input) {
      const { key, meta, ctrl, alt, shift } = input || {}
      if (!key) return ''
      const mod = !!(meta || ctrl)
      if (alt) return ''
      if (key === 'Escape') return mod ? '' : 'close'
      if (key === 'ArrowLeft' && mod && !shift) return 'prev'
      if (key === 'ArrowRight' && mod && !shift) return 'skip'
      if ((key === 'j' || key === 'J') && mod && !shift) return 'loop'
      if ((key === 'p' || key === 'P') && mod && !shift) return 'pause'
      return ''
    }

    /** WPM：词数 / 秒 → 每分钟词数（四舍五入，和上游同口径） */
    function calcWpm(words, seconds) {
      const n = Number(words) || 0
      const sec = Number(seconds) || 0
      if (n <= 0 || sec <= 0) return 0
      return Math.round((n / sec) * 60)
    }

    /** 正确率：打对词数 /（打对 + 打错次数）× 100 */
    function calcAccuracy(hits, retries) {
      const ok = Number(hits) || 0
      const bad = Number(retries) || 0
      if (ok + bad <= 0) return 0
      return Math.round((ok / (ok + bad)) * 100)
    }

    /**
     * Tab 该不该用来启动跟打：只在「没开 + 焦点在 composer + 草稿为空 + 无修饰键」时接管，
     * 其余一律还给宿主（见文档 §3.6 的三分支裁决）。
     */
    function shouldStartOnTab(input) {
      const { key, open, inComposer, draft, modifier, ownDraft } = input || {}
      if (key !== 'Tab') return false
      if (open) return false
      if (!inComposer) return false
      if (modifier) return false
      const text = String(draft ?? '')
      if (text.trim() === '') return true
      // 残留的是我们自己写进去的提示语，可以当空处理（否则一次没清干净就再也按不开）
      return Boolean(ownDraft) && text === String(ownDraft)
    }

    const SESSION_KEY = 'qwerty-autotype:session'

    /** 存一份进行中的练习（切面板回来能接着打） */
    function saveSession(session) {
      if (!session || !session.dictId || !Array.isArray(session.words) || session.words.length === 0) return false
      try {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify({
          dictId: session.dictId,
          chapter: Number.isInteger(session.chapter) ? session.chapter : null,
          words: session.words,
          index: Math.max(0, Number(session.index) || 0),
          hits: Math.max(0, Number(session.hits) || 0),
          retries: Math.max(0, Number(session.retries) || 0),
          startedAt: Number(session.startedAt) || Date.now(),
          activeMs: Math.max(0, Number(session.activeMs) || 0),
          savedAt: Date.now(),
        }))
        return true
      } catch {
        return false
      }
    }

    function readSession() {
      try {
        const raw = JSON.parse(window.localStorage.getItem(SESSION_KEY) || 'null')
        if (!raw || !raw.dictId || !Array.isArray(raw.words) || raw.words.length === 0) return null
        if (raw.index >= raw.words.length) return null
        return raw
      } catch {
        return null
      }
    }

    function clearSession() {
      try {
        window.localStorage.removeItem(SESSION_KEY)
      } catch {
        /* ignore */
      }
    }

    /** 存档和当前这轮是不是同一轮（词库 + 章节 + 词表都一致才算） */
    function sameSession(session, dictId, chapter, words) {
      if (!session || !Array.isArray(words) || words.length === 0) return false
      if (session.dictId !== dictId) return false
      const key = Number.isInteger(chapter) ? chapter : null
      if (session.chapter !== key) return false
      if (session.words.length !== words.length) return false
      return session.words.every((word, index) => word === words[index])
    }

    /* ------------------------------------------------------- 默写 / 发音 / 设置 */

    /** 默写形态（对齐上游 WordDictationSwitcher:18-32） */
    const DICTATION_MODES = ['none', 'hideAll', 'hideVowel', 'hideConsonant', 'randomHide']
    const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

    /**
     * 每个字母是否要遮住（true = 默写时打码，打对后自动现身）
     * randomHide 用 (seed, i) 的确定性伪随机，同一个词每次遮的位置一致
     */
    function maskLetters(target, mode, seed) {
      const chars = String(target ?? '').split('')
      if (!mode || mode === 'none') return chars.map(() => false)
      if (mode === 'hideAll') return chars.map(() => true)
      if (mode === 'hideVowel') return chars.map((ch) => VOWELS.has(ch.toLowerCase()))
      if (mode === 'hideConsonant') return chars.map((ch) => /[a-z]/i.test(ch) && !VOWELS.has(ch.toLowerCase()))
      return chars.map((ch, index) => {
        if (!/[a-z]/i.test(ch)) return false
        const noise = Math.abs(Math.sin((Number(seed) + 1) * (index + 7)) * 10000) % 1
        return noise < 0.5
      })
    }

    /** 读一遍这个词（浏览器内置 TTS，没有就静默返回 false） */
    /**
     * 键音三档（对齐上游 playHintSound 的"轻提示"）：
     * hit 打对一声高、miss 打错一声低、hint 打错到出提示时一声更轻的三角波。
     * 没有 WebAudio、或者设置里关掉 sound，就一律静默（开关语义不变）。
     */
    const CLICK_TONES = {
      hit: { type: 'sine', freq: 880, peak: 0.02, decay: 0.05, stop: 0.13 },
      miss: { type: 'sine', freq: 220, peak: 0.02, decay: 0.12, stop: 0.13 },
      hint: { type: 'triangle', freq: 1320, peak: 0.012, decay: 0.09, stop: 0.11 },
    }

    let AUDIO_CTX = null
    function playClick(kind) {
      try {
        if (!getSettings().sound) return false
        const Ctor = window.AudioContext || window.webkitAudioContext
        if (!Ctor) return false
        AUDIO_CTX = AUDIO_CTX || new Ctor()
        if (AUDIO_CTX.state === 'suspended') AUDIO_CTX.resume?.()
        const tone = CLICK_TONES[kind] || CLICK_TONES.hit
        const osc = AUDIO_CTX.createOscillator()
        const gain = AUDIO_CTX.createGain()
        osc.type = tone.type
        osc.frequency.value = tone.freq
        const now = AUDIO_CTX.currentTime
        gain.gain.setValueAtTime(tone.peak, now)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.decay)
        osc.connect(gain)
        gain.connect(AUDIO_CTX.destination)
        osc.start(now)
        osc.stop(now + tone.stop)
        return true
      } catch {
        return false
      }
    }

    /* ---------------- 发音（对齐上游 usePronunciation：有道词典音频） ---------------- */

    const PRON_API = 'https://dict.youdao.com/dictvoice?audio='

    /** 上游 generateWordSoundSrc：us → type=2、uk → type=1、日/中走 le= */
    function pronunciationSrc(word, type = 'us') {
      const text = String(word ?? '').trim()
      if (!text) return ''
      const q = encodeURIComponent(text)
      if (type === 'uk') return `${PRON_API}${q}&type=1`
      if (type === 'ja') return `${PRON_API}${q}&le=jap`
      if (type === 'zh') return `${PRON_API}${q}&le=zh`
      return `${PRON_API}${q}&type=2`
    }

    /** 按单词自动挑发音类型：假名 → 日语、汉字 → 中文、其余按美音 */
    /** 口音可选：us（默认）/ uk，跟上游 pronunciationConfigAtom.type 一致 */
    const ACCENTS = ['us', 'uk']

    /**
     * 实际用哪个口音：中日文按文字判定（有道教 le=jap / le=zh），英文按设置里的 accent。
     * @param word - 单词。
     * @param options - 可选 { accent }。
     * @returns 'us' | 'uk' | 'ja' | 'zh'。
     */
    function resolveAccent(word, options) {
      const natural = pronunciationType(word)
      if (natural !== 'us') return natural
      const accent = options?.accent ?? (typeof getSettings === 'function' ? getSettings().accent : 'us')
      return ACCENTS.includes(accent) ? accent : 'us'
    }

    function pronunciationType(word) {
      const text = String(word ?? '')
      if (/[\u3040-\u30ff]/.test(text)) return 'ja'
      if (/[\u4e00-\u9fff]/.test(text)) return 'zh'
      return 'us'
    }

    let AUDIO_NODE = null

    /** 有道教 MP3 优先（上游就是这么放的），失败退回浏览器 TTS */
    function speak(word, options) {
      const text = String(word ?? '').trim()
      if (!text) return false
      const type = options?.type ?? resolveAccent(text)
      const src = pronunciationSrc(text, type)
      try {
        if (AUDIO_NODE) {
          AUDIO_NODE.pause()
          AUDIO_NODE = null
        }
        if (src && typeof window.Audio === 'function') {
          const audio = new window.Audio(src)
          audio.volume = Math.min(1, Math.max(0, Number(options?.volume ?? 1)))
          audio.playbackRate = Math.min(2, Math.max(0.5, Number(options?.rate ?? 1)))
          const played = audio.play()
          AUDIO_NODE = audio
          if (played && typeof played.catch === 'function') {
            played.catch(() => {
              if (AUDIO_NODE === audio) AUDIO_NODE = null
              speakWithTts(text, type)
            })
          }
          return true
        }
      } catch {
        /* 落到 TTS */
      }
      return speakWithTts(text, type)
    }

    /** 兜底：浏览器自带 TTS */
    function speakWithTts(text, type) {
      try {
        const synth = window.speechSynthesis
        if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') return false
        synth.cancel()
        const utterance = new window.SpeechSynthesisUtterance(text)
        utterance.lang = type === 'ja' ? 'ja-JP' : type === 'zh' ? 'zh-CN' : 'en-US'
        utterance.rate = 0.95
        synth.speak(utterance)
        return true
      } catch {
        return false
      }
    }

    const SETTING_DEFAULTS = {
      dictation: 'none',
      caseSensitive: false,
      ignorePunct: false,
      showZh: true,
      showIpa: true,
      voice: true,
      accent: 'us',
      sound: true,
      autoNext: true,
    }
    const SETTING_PREFIX = 'qwerty-autotype:setting:'

    let SETTINGS = null
    const settingListeners = new Set()

    function readSettings() {
      const merged = { ...SETTING_DEFAULTS }
      try {
        for (const key of Object.keys(SETTING_DEFAULTS)) {
          const raw = window.localStorage.getItem(SETTING_PREFIX + key)
          if (raw === null) continue
          try {
            merged[key] = JSON.parse(raw)
          } catch {
            merged[key] = raw
          }
        }
      } catch {
        /* 无痕模式：用默认值 */
      }
      if (!DICTATION_MODES.includes(merged.dictation)) merged.dictation = 'none'
      return merged
    }

    function getSettings() {
      if (!SETTINGS) SETTINGS = readSettings()
      return SETTINGS
    }

    function subscribeSettings(listener) {
      settingListeners.add(listener)
      return () => settingListeners.delete(listener)
    }

    function setSetting(id, value) {
      if (!(id in SETTING_DEFAULTS)) return getSettings()
      SETTINGS = { ...getSettings(), [id]: value }
      try {
        window.localStorage.setItem(SETTING_PREFIX + id, JSON.stringify(value))
      } catch {
        /* ignore */
      }
      for (const listener of settingListeners) listener()
      return SETTINGS
    }

    /* --------------------------------------------------------------- trainer */

    /**
     * 结算页：成绩 + 本轮错词清单 + 三条出路（再来一轮 / 重练错词 / 下一章）。
     * 单独抽成组件：不依赖训练态就能直接渲染断言，也给面板各入口复用。
     * @param props.mistakes - 本轮打错过的词（{ word, wrongCount } 或纯字符串）
     * @param props.nextIsLast - 当前是否是末章（末章按钮改成「回到第 1 章」）
     */
    function ResultScreen({
      t, total, elapsed, hits, retries, mistakes, words,
      nextIsLast = false, onRestart, onRetryWrong, onNextChapter,
    }) {
      // 清单只来自本轮 mistakes；全打对就是空数组，整块不渲染
      const rows = wordsOfRound(mistakes, words)
      const retry = () => onRetryWrong?.(rows.map((row) => row.word))
      return h('div', { className: 'qat-done' },
        h('div', { className: 'qat-done-title' }, t('doneTitle')),
        h('div', { className: 'qat-hint' }, t('doneBody', { total, sec: elapsed, hits, retries })),
        h('div', { className: 'qat-done-metrics' },
          h('span', null, `WPM ${calcWpm(total, elapsed)}`),
          h('span', null, t('accuracyShort', { n: calcAccuracy(total, retries) })),
          h('span', null, t('elapsedShort', { sec: elapsed })),
        ),
        rows.length
          ? h('div', { className: 'qat-mistakes' },
            h('span', { className: 'qat-mistakes-title' }, t('resultWrongTitle', { n: rows.length })),
            h('div', { className: 'qat-mistakes-list' },
              rows.map((row) => {
                const zh = lookup(row.word)?.zh ?? ''
                return h('span', {
                  key: row.word,
                  className: 'qat-mistake',
                  'data-wrong': String(row.wrongCount),
                  title: zh ? `${row.word} ${zh}` : row.word,
                },
                  h('span', null, `${row.word} ×${row.wrongCount}`),
                  zh ? h('span', { className: 'qat-mistake-zh' }, zh) : null,
                )
              }),
            ),
          )
          : null,
        h('div', { className: 'qat-row qat-done-acts' },
          onRestart
            ? h('span', {
              ...pressable(onRestart),
              className: 'qat-btn',
              'data-act': 'again',
            }, t('again'))
            : null,
          rows.length && onRetryWrong
            ? h('span', {
              ...pressable(retry),
              className: 'qat-btn qat-btn-retry',
              'data-act': 'retry-wrong',
            }, t('resultRetryWrong'))
            : null,
          onNextChapter
            ? h('span', {
              ...pressable(onNextChapter),
              className: 'qat-btn qat-btn-next',
              'data-act': 'next-chapter',
            }, t(nextIsLast ? 'resultNextChapterLast' : 'resultNextChapter'))
            : null,
        ),
      )
    }

    /**
     * 打错提示行：level 0 时整个不渲染，level > 0 只画一条小字。
     * 独立成组件，两个入口（跟打条 / 面板卡片）共用同一份 UI，测试也能直接渲染它。
     * @param props.tip - tipState() 的返回值
     * @param props.t - useT 出来的翻译函数
     * @param props.className - 覆盖样式（跟打条用 qat-bar-tip）
     */
    function TipLine({ tip, t, className }) {
      if (!tip || !tip.level || !tip.text) return null
      const key = tip.key || tipKey(tip.level)
      // 用 span 而不是 div：跟打条里它嵌在 span（.qat-wordblock）里，div 会造成非法嵌套
      return h('span', {
        className: className || 'qat-tip',
        'data-tip-level': String(tip.level),
        role: 'note',
      }, h('span', null, t(key, { pattern: tip.text })))
    }

    /**
     * 跟打卡片本体。三种入口共用，判定/计数/自动打全都在这。
     * @param props.words - 本轮单词
     * @param props.variant - 'dock' | 'command'（只影响宽度与是否显示收起按钮）
     * @param props.onClose - 收起回调（侧栏入口开出来的卡片才有）
     */
    function Trainer({
      words, variant, onClose, showMeta = false, options, dictation = 'none',
      dictId = '', chapter = null, chapterTotal = 0, onFinish, onReview, onRetryWrong, onNextChapter, ctx,
      jump = null, onIndex,
    }) {
      const t = useT(ctx)
      const [state, setState] = useState({
        index: 0, typed: '', flash: false, hits: 0, retries: 0, wordWrong: 0, finishedAt: null,
      })
      const [auto, setAuto] = useState(false)
      const inputRef = useRef(null)
      const live = useRef({ index: 0, typed: '', locked: false, timer: null })
      /** 当前这个词这一轮打错了几次（写记录用） */
      const wrongRef = useRef(0)
      /** 是否已经尝试过从存档恢复（只恢复一次，避免覆盖用户手动重开） */
      const restoredRef = useRef(false)
      const stateRef = useRef(state)
      const startedAt = useRef(Date.now())
      /** 有效练习时钟（暂停不计时） */
      const clock = useRef({ ms: 0, last: Date.now() })
      const [paused, setPaused] = useState(false)
      const [loop, setLoop] = useState(false)
      /** 本轮打错过的词（结果页展示 + 一键重练） */
      const [mistakes, setMistakes] = useState([])
      const [helpOpen, setHelpOpen] = useState(false)
      /** 读屏播报：只在状态变化时更新，避免每敲一键都朗读 */
      const [announce, setAnnounce] = useState('')
      const voiceOn = useSyncExternalStore(subscribeSettings, getSettings, getSettings).voice
      /** 本轮打错时"该打却没打对"的字母计数 */
      const lettersRef = useRef({})
      const pausedRef = useRef(false)

      useEffect(() => {
        stateRef.current = state
        live.current.index = state.index
        live.current.typed = state.typed
      }, [state])

      useEffect(() => () => {
        if (live.current.timer !== null) clearTimeout(live.current.timer)
      }, [])

      // 只在挂载时聚焦一次；之后完全靠点击，绝不反复从 composer 手里抢焦点
      useEffect(() => {
        const id = setTimeout(() => {
          const element = inputRef.current
          if (element && document.activeElement?.closest?.('.qat-card') === null) element.focus()
        }, 60)
        return () => clearTimeout(id)
      }, [])

      // 从存档恢复：词库 + 章节 + 词表完全一致才接着打（切面板回来不丢进度）
      useEffect(() => {
        if (restoredRef.current) return
        restoredRef.current = true
        if (variant !== 'panel' || !dictId) return
        const saved = readSession()
        if (!sameSession(saved, dictId, chapter, words)) return
        live.current.index = saved.index
        live.current.typed = ''
        startedAt.current = saved.startedAt
        clock.current = { ms: Number(saved.activeMs) || 0, last: Date.now() }
        setState({
          index: saved.index,
          typed: '',
          flash: false,
          hits: saved.hits,
          retries: saved.retries,
          wordWrong: 0,
          finishedAt: null,
        })
      }, [chapter, dictId, variant, words])

      /** 当前词索引往外报：词表抽屉要用它高亮「当前」那一行 */
      useEffect(() => {
        onIndex?.(state.index)
      }, [onIndex, state.index])

      /**
       * 从词表抽屉跳词：jump 每次点击都是新对象，effect 才会重跑一次。
       * 只挪索引、清掉半截输入与本词错误计数，不动本轮 hits/retries（不能把已有行为改坏）。
       */
      useEffect(() => {
        if (!jump || !Number.isInteger(jump.index)) return
        if (jump.index < 0 || jump.index >= words.length) return
        live.current.index = jump.index
        live.current.typed = ''
        wrongRef.current = 0
        setState((prev) => ({
          ...prev, index: jump.index, typed: '', flash: false, finishedAt: null,
        }))
      }, [jump, words])

      /** 暂停/继续：暂停期间不计时，也吞掉击键 */
      const applyPaused = useCallback((next) => {
        if (pausedRef.current === next) return
        pausedRef.current = next
        if (next) {
          clock.current = { ms: activeMs(clock.current, Date.now()), last: null }
        } else {
          clock.current = { ...clock.current, last: Date.now() }
        }
        setPaused(next)
        setState((prev) => ({ ...prev, typed: '', flash: false }))
        live.current.typed = ''
      }, [])

      // 失焦 / 切标签页自动暂停，回来继续（手动暂停的状态不会被焦点事件解除）
      useEffect(() => {
        if (variant !== 'panel' && variant !== 'command') return undefined
        const pause = () => {
          if (!pausedRef.current) applyPaused(true)
        }
        const onVisibility = () => {
          if (document.hidden) pause()
        }
        window.addEventListener('blur', pause)
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
          window.removeEventListener('blur', pause)
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, [applyPaused, variant])

      /** 上一个 / 跳过 / 循环 三个动作（快捷键和点击共用） */
      const goPrev = useCallback(() => {
        const prev = stepIndex(stateRef.current.index, wordsRef.current.length, -1)
        live.current.typed = ''
        wrongRef.current = 0
        setState((prevState) => ({ ...prevState, index: prev, typed: '', flash: false, wordWrong: 0, finishedAt: null }))
      }, [])

      const goSkip = useCallback(() => {
        const next = Math.min(words.length, stateRef.current.index + 1)
        live.current.typed = ''
        wrongRef.current = 0
        setState((prevState) => ({
          ...prevState,
          index: next,
          typed: '',
          flash: false,
          wordWrong: 0,
          finishedAt: next >= words.length ? Date.now() : null,
        }))
      }, [words])

      const goLoop = useCallback(() => setLoop((value) => !value), [])

      const focusInput = useCallback((event) => {
        const element = inputRef.current
        if (element && event?.target !== element) element.focus()
      }, [])


      const total = words.length
      // 跟打条是流水线：没有「完成」态，索引绕圈
      const done = isRoundDone(state.index, total)
      const current = done ? '' : (words[state.index] ?? '')
      // 判定用的目标串（忽略标点 / 大小写）与展示用的遮罩
      const target = effectiveTarget(current, options)
      const chars = target.split('')
      const masked = maskLetters(target, dictation, state.index)
      const meta = lookup(current)
      const ipaText = meta?.ipa ?? ''
      const gloss = meta?.zh ?? ''
      // 打错提示：3 / 4 / 5 次逐档揭示，打对（advance）归零
      const tip = tipState({ wrongCount: state.wordWrong, word: target, typed: state.typed })

      const setTyped = useCallback((value) => {
        live.current.typed = value
        setState((prev) => ({ ...prev, typed: value }))
      }, [])

      const advance = useCallback(() => {
        const snapshot = stateRef.current
        // 循环单词：原地重打，不推进进度、不写记录
        if (loop) {
          live.current = { ...live.current, typed: '' }
          setState((prev) => ({ ...prev, typed: '', flash: false, wordWrong: 0, hits: prev.hits + 1 }))
          return
        }
        const next = snapshot.index + 1
        const finished = next >= words.length
        const at = Date.now()
        const word = effectiveTarget(words[snapshot.index] ?? '', options)

        // 落一条单词记录（打错次数 = 本词这一轮累计）
        if (word) {
          recordWord({ word, dictId, chapter, at, wrongCount: wrongRef.current, timing: [] })
        }
        wrongRef.current = 0

        if (!finished && variant === 'panel' && dictId) {
          saveSession({
            dictId,
            chapter,
            words,
            index: next,
            hits: snapshot.hits + 1,
            retries: snapshot.retries,
            startedAt: startedAt.current,
            activeMs: activeMs(clock.current, Date.now()),
          })
        }
        if (finished) {
          lettersRef.current = {}
          if (variant === 'panel') clearSession()
          const seconds = Math.max(1, Math.round(activeMs(clock.current, at) / 1000))
          recordChapter({
            dictId,
            chapter,
            at,
            seconds,
            wordCount: words.length,
            wrongCount: snapshot.retries,
            wrongLetters: lettersRef.current,
          })
          if (dictId && Number.isInteger(chapter)) {
            saveProgress(dictId, chapter, { done: true, words: words.length, index: words.length })
          }
          setAnnounce(t('announceDone', { n: words.length }))
          onFinish?.({ words: words.length, seconds, retries: snapshot.retries, hits: snapshot.hits + 1 })
        } else if (dictId && Number.isInteger(chapter)) {
          saveProgress(dictId, chapter, { index: next, words: words.length })
        }

        live.current.typed = ''
        setState((prev) => ({
          ...prev,
          typed: '',
          flash: false,
          wordWrong: 0,
          hits: prev.hits + 1,
          index: next,
          finishedAt: finished ? at : null,
        }))
      }, [chapter, dictId, loop, onFinish, options, variant, words])

      const accept = useCallback((value) => {
        if (live.current.locked) return
        const guess = words[live.current.index] ?? ''
        const verdict = judgeTyping(guess, value, options)
        if (verdict.state === 'over') return
        if (verdict.state !== 'bad') {
          setTyped(value)
          if (verdict.state === 'done') {
            playClick('hit')
            live.current.locked = true
            live.current.timer = setTimeout(() => {
              live.current.timer = null
              live.current.locked = false
              advance()
            }, 200)
          }
          return
        }
        // 打错：标红 → 抖动 → 清空并要求整词重打
        wrongRef.current += 1
        // 提示档位升了一档（第 3/4/5 次）就给一声更轻的提示音
        const prevTip = tipState({ wrongCount: stateRef.current.wordWrong, word: target, typed: stateRef.current.typed })
        const nextWrong = nextWrongCount(stateRef.current.wordWrong, 'miss')
        if (tipState({ wrongCount: nextWrong, word: target, typed: '' }).level > prevTip.level) playClick('hint')
        else playClick('miss')
        setAnnounce(t('announceWrong', { word: target }))
        const expect = target[stateRef.current.typed.length]
        if (expect && expect !== ' ') {
          lettersRef.current[expect] = (lettersRef.current[expect] || 0) + 1
        }
        // 记「打错次数」而不是去重词表：结算页要显示每个词错了几次
        setMistakes((list) => {
          const hit = list.find((item) => item.word === target)
          if (hit) return list.map((item) => (item.word === target ? { ...item, wrongCount: item.wrongCount + 1 } : item))
          return [...list, { word: target, wrongCount: 1 }]
        })
        live.current.locked = true
        setTyped(value)
        setState((prev) => ({ ...prev, flash: true }))
        live.current.timer = setTimeout(() => {
          live.current.timer = null
          live.current.locked = false
          live.current.typed = ''
          setState((prev) => ({
            ...prev, typed: '', flash: false, retries: prev.retries + 1, wordWrong: nextWrong,
          }))
        }, 320)
      }, [advance, options, setTyped, words])

      // 自动打：把目标词逐字打进同一个输入框，行为和手打一致（不伪造通过）
      useEffect(() => {
        if (!auto || done || total === 0) return undefined
        const id = setInterval(() => {
          const snapshot = stateRef.current
          const goal = effectiveTarget(words[snapshot.index] ?? '', options)
          if (!goal || live.current.locked) return
          if (!goal.startsWith(snapshot.typed)) {
            setTyped('')
            return
          }
          if (snapshot.typed.length >= goal.length) return
          const next = goal.slice(0, snapshot.typed.length + 1)
          setTyped(next)
          if (next === goal) {
            live.current.locked = true
            live.current.timer = setTimeout(() => {
              live.current.timer = null
              live.current.locked = false
              advance()
            }, 220)
          }
        }, 120)
        return () => clearInterval(id)
      }, [advance, auto, done, options, setTyped, total, words])

      // 面板里输入框已经隐形，挂载时主动把焦点交给它，用户不用先点哪儿
      useEffect(() => {
        if (variant !== 'panel') return
        const input = inputRef.current
        if (input && typeof input.focus === 'function') input.focus()
      }, [variant, words])

      const restart = useCallback(() => {
        startedAt.current = Date.now()
        live.current = { index: 0, typed: '', locked: false, timer: null }
        wrongRef.current = 0
        lettersRef.current = {}
        setMistakes([])
        if (variant === 'panel') clearSession()
        setAuto(false)
        setState({ index: 0, typed: '', flash: false, hits: 0, retries: 0, wordWrong: 0, finishedAt: null })
        const input = inputRef.current
        if (input) input.focus()
      }, [])

      if (total === 0) {
        return h('div', { className: 'qat-card' }, h(Styles), h('div', { className: 'qat-hint' }, t('empty')))
      }

      const elapsed = Math.max(1, Math.round(activeMs(clock.current, done ? state.finishedAt : Date.now()) / 1000))

      return h('div', { className: 'qat-card', 'data-variant': variant ?? 'command', onMouseDown: focusInput },
        h(Styles),
        h('div', { className: 'qat-sr', 'aria-live': 'polite', 'aria-atomic': 'true', role: 'status' }, announce),
        helpOpen ? h('div', { className: 'qat-help', 'data-help': 'true' }, t('hotkeysList')) : null,
        h('div', { className: 'qat-head' },
          h('span', { className: 'qat-title' }, t('title')),
          h('span', { className: 'qat-sep' }),
          h('span', null, t('progress', { done: Math.min(state.index, total), total })),
          h('span', { className: 'qat-sep' }),
          h('span', null, t('hits', { n: state.hits })),
          h('span', null, t('retries', { n: state.retries })),
          h('span', { className: 'qat-metric' }, `WPM ${calcWpm(state.hits, elapsed)}`),
          h('span', { className: 'qat-metric' }, t('accuracyShort', { n: calcAccuracy(state.hits, state.retries) })),
          h('span', { className: 'qat-grow' }),
          h('span', {
            ...pressable(() => setHelpOpen((value) => !value)),
            className: 'qat-icon',
            'data-act': 'help',
            'aria-expanded': helpOpen ? 'true' : 'false',
            title: t('hotkeysTitle'),
            'aria-label': t('hotkeysTitle'),
          }, h(Icon, { name: 'help' })),
          h('span', {
            ...pressable(goPrev),
            className: 'qat-btn',
            'data-act': 'prev',
            title: t('prevTip'),
          }, h(Icon, { name: 'prev' })),
          h('span', {
            ...pressable(goSkip),
            className: 'qat-btn',
            'data-act': 'skip',
            title: t('skipTip'),
          }, h(Icon, { name: 'next' })),
          h('span', {
            ...pressable(goLoop),
            className: 'qat-btn',
            'data-act': 'loop',
            'data-on': loop ? 'true' : 'false',
            title: t('loopTip'),
          }, h(Icon, { name: 'loop', size: 15 })),
          h('span', {
            ...pressable(() => applyPaused(!pausedRef.current)),
            className: 'qat-btn',
            'data-act': 'pause',
            title: paused ? t('resumeTip') : t('pauseTip'),
          }, h(Icon, { name: paused ? 'play' : 'pause', size: 15 })),
          onClose
            ? h('span', {
              ...pressable(onClose),
              className: 'qat-btn',
            }, t('close'))
            : null,
        ),
        paused && !done
          ? h('div', { className: 'qat-paused' },
            h('span', null, t('pausedTip')),
            h('span', {
              ...pressable(() => applyPaused(false)),
              className: 'qat-btn',
            }, t('resume')),
          )
          : null,
        done
          ? h(ResultScreen, {
            t,
            total,
            elapsed,
            hits: state.hits,
            retries: state.retries,
            mistakes,
            words,
            // 章号从面板传进来才知道是不是末章；命令卡（chapter = null）永远当非末章
            nextIsLast: Number.isInteger(chapter) && chapterTotal > 0 && chapter + 1 >= chapterTotal,
            onRestart: restart,
            onRetryWrong,
            onNextChapter,
          })
          : h('div', null,
            h('div', { className: 'qat-word', 'data-flash': state.flash ? 'true' : 'false' },
              chars.map((ch, i) => {
                const typedChar = state.typed[i]
                const letterState = typedChar === undefined ? 'idle' : typedChar === ch ? 'ok' : 'bad'
                const hidden = typedChar === undefined && masked[i]
                return h('span', {
                  key: `${i}-${ch}`,
                  className: 'qat-letter',
                  'data-state': letterState,
                  'data-mask': hidden ? 'true' : 'false',
                }, hidden ? '·' : (ch === ' ' ? '␣' : ch))
              }),
            ),
            showMeta && (ipaText || gloss)
              ? h('div', { className: 'qat-gloss' },
                ipaText ? h('div', { className: 'qat-gloss-ipa' }, ipaText) : null,
                gloss ? h('div', { className: 'qat-gloss-zh' }, gloss) : null,
                current && voiceOn
                  ? h('span', {
                    ...pressable(() => speak(current)),
                    className: 'qat-speak',
                    title: t('speak'),
                    'aria-label': t('speak'),
                  }, h(Icon, { name: 'speak', size: 15 }))
                  : null,
              )
              : null,
            h(TipLine, { tip, t }),
            // 上游没有可见输入框（InputHandler 用隐藏元素吃键盘）：这里同样只留一个
            // 视觉隐藏的输入目标，用来接住键入与输入法，界面上不画框。
            h('input', {
              ref: inputRef,
              className: 'qat-input qat-input-ghost',
              type: 'text',
              value: state.typed,
              'aria-label': t('placeholder'),
              tabIndex: -1,
              autoFocus: true,
              autoComplete: 'off',
              autoCapitalize: 'none',
              spellCheck: false,
              onChange: (event) => accept(event.target.value),
              onKeyDown: (event) => {
                // 回车/制表符就地吞掉；空格留给带空格的词，只阻止冒泡
                if (event.key === 'Enter' || event.key === 'Tab') event.preventDefault()
                if (event.key === 'Escape' && onClose) onClose()
                event.stopPropagation()
                const action = resolveHotkey({
                  key: event.key,
                  meta: event.metaKey,
                  ctrl: event.ctrlKey,
                  alt: event.altKey,
                  shift: event.shiftKey,
                })
                if (!action) return
                event.preventDefault()
                if (action === 'prev') goPrev()
                else if (action === 'skip') goSkip()
                else if (action === 'loop') goLoop()
                else if (action === 'pause') applyPaused(!pausedRef.current)
                else if (action === 'close' && onClose) onClose()
              },
              onKeyUp: (event) => event.stopPropagation(),
            }),
            h('div', { className: 'qat-row' },
              h('span', {
                ...pressable(() => setAuto((value) => !value)),
                className: 'qat-btn',
                'data-active': auto ? 'true' : 'false',
              }, auto ? t('autoStop') : t('auto')),
              h('span', {
                ...pressable(restart),
                className: 'qat-btn',
              }, t('restart')),
            ),
            h('div', { className: 'qat-hint' }, t('hint')),
          ),
      )
    }

    /* ------------------------------------------------------------ entry: side */

    /**
     * 侧栏底部的开关按钮（root scope，和 Settings 并排）。
     * @param props.wide - 侧栏是宽态还是 56px 轨道；轨道态只留图标
     */
    function SidebarButton({ wide, ctx }) {
      const t = useT(ctx)
      const isOpen = useSyncExternalStore(subscribeOpen, getOpen, getOpen)
      return h('button', {
        type: 'button',
        className: 'qat-side',
        'data-active': isOpen ? 'true' : 'false',
        title: t('sideTitle'),
        'aria-pressed': isOpen,
        onClick: () => setOpen(),
        onKeyDown: (event) => event.stopPropagation(),
      },
        h('span', {
          className: 'qat-side-icon',
          'aria-hidden': 'true',
        }, null),
        wide === false ? null : h('span', null, t('sideLabel')),
      )
    }

    /* ------------------------------- entry: bar above the real composer */

    const COMPOSER_EDITOR = '[data-composer-input]'

    /** 输入框那一排（编辑器 + 工具条 + 发送键）的容器近似 */
    function composerRegion() {
      let node = findComposerEditor()
      if (!node) return null
      for (let i = 0; i < 4 && node.parentElement; i += 1) node = node.parentElement
      return node
    }

    /** 拿到当前可见的 composer 编辑器（多列/多会话时取可见那个） */
    function findComposerEditor() {
      const editors = [...document.querySelectorAll(COMPOSER_EDITOR)]
      return editors.find((el) => el.offsetParent !== null) ?? editors[0] ?? null
    }

    /**
     * 关条时要不要清草稿：只有「我们写过 + 草稿还是我们那一句」才清。
     * 抽成纯函数是因为这里曾经无条件清空，把用户关条后敲的每个字都吃掉了。
     * @param input - { open, draft, wrote }
     * @returns 是否应该执行清空。
     */
    function shouldClearDraft(input) {
      const { open, draft, wrote } = input || {}
      if (open) return false
      if (!wrote) return false
      return String(draft ?? '') === String(wrote)
    }

    /**
     * 训练中要挡的按钮：发送 / 发送并排队 / 打断。
     * 只看 aria-label（DSH 的发送按钮带 aria-label={primaryLabel}），中文 '发送消息'、英文 'Send message' 都命中。
     */
    const SEND_LABEL_RE = /发送|队列|发送消息|Send|Queue|Steer/i

    function shouldBlockSend(label) {
      const text = String(label ?? '').trim()
      if (!text) return false
      if (/停止|Stop/i.test(text)) return false   // 停止/中断是逃生口，永远放行
      return SEND_LABEL_RE.test(text)
    }

    /** 点在这些按钮上就吞掉：训练中按发送会把输入框里的提示语发出去 */
    function isSendTrigger(target) {
      if (!(target instanceof Element)) return false
      const button = target.closest('button, [role="button"]')
      if (!button) return false
      if (button.closest('[data-qat]')) return false      // 我们自己的按钮不管
      return shouldBlockSend(button.getAttribute('aria-label') ?? button.textContent)
    }

    /** 旧版本曾在 composer 上留过 inputmode=latin / data-qat-ime，载入时清干净 */
    function releaseStuckComposer() {
      try {
        for (const node of document.querySelectorAll(COMPOSER_EDITOR)) {
          const marker = node.getAttribute('data-qat-ime')
          if (marker) {
            try {
              const saved = JSON.parse(marker)
              for (const [name, value] of Object.entries(saved || {})) {
                if (value === null || value === undefined) node.removeAttribute(name)
                else node.setAttribute(name, value)
              }
            } catch {
              /* 存档坏了就直接删属性 */
            }
            node.removeAttribute('data-qat-ime')
          }
          if (node.getAttribute('inputmode') === 'latin') node.removeAttribute('inputmode')
          if (node.style && node.style.imeMode === 'inactive') node.style.imeMode = ''
        }
      } catch {
        /* ignore */
      }
    }

    /**
     * 跟打条：单词显示在输入框正上方，**打字就打在真正的 composer 输入框里**。
     *
     * 做法：打开期间在捕获阶段监听 keydown，只处理落在 composer 编辑器里的按键——
     * 字母就地判定并 preventDefault（所以 composer 里不会留下任何文字），
     * 退格删一个字母，回车/制表符直接吞掉，Esc 收起。这样既能用真输入框打字，
     * 又不可能出现"打了一半被回车发出去"。
     */
    /** 一轮是否打完：面板打完要停，跟打条永远不停（走 stepIndex） */
    function isRoundDone(index, total) {
      return Number(total) > 0 && Number(index) >= Number(total)
    }

    /**
     * 本轮错词清单：把 mistakes（这一轮打错过的词）映射成「词 + 打错次数」。
     * - 元素既支持字符串（早期只存词）也支持 { word, wrongCount }
     * - 顺序优先跟本轮词表一致（words 里的先后），词表里没有的按出现顺序补在后面
     * - 空 mistakes / 全打对 → 空数组，结算页据此决定要不要出错词清单
     */
    function wordsOfRound(mistakes, words) {
      const counts = new Map()
      for (const item of mistakes || []) {
        const word = String(typeof item === 'string' ? item : (item?.word ?? ''))
        if (!word) continue
        const key = word.toLowerCase()
        const prev = counts.get(key)
        const times = typeof item === 'object' && item !== null ? Number(item.wrongCount) : 1
        const add = Number.isFinite(times) && times > 0 ? times : 1
        counts.set(key, {
          word: prev?.word ?? word,
          wrongCount: (prev?.wrongCount ?? 0) + add,
        })
      }
      if (!counts.size) return []
      const rows = []
      const seen = new Set()
      const order = (words || [])
        .map((entry) => (typeof entry === 'string' ? entry : (entry?.w ?? entry?.word ?? '')))
        .filter(Boolean)
      for (const word of order) {
        const key = String(word).toLowerCase()
        const hit = counts.get(key)
        if (!hit || seen.has(key)) continue
        seen.add(key)
        rows.push(hit)
      }
      for (const [key, hit] of counts) {
        if (seen.has(key)) continue
        seen.add(key)
        rows.push(hit)
      }
      return rows
    }

    /**
     * 下一章序号（0-based）：末章绕回第 1 章；章数非法时回到 0，越界也收敛到合法范围。
     * 面板的「下一章」按钮和上游 autoNext 用同一套绕回语义。
     */
    function nextChapterIndex(current, total) {
      const size = Math.floor(Number(total) || 0)
      if (size <= 0) return 0
      const now = Math.floor(Number(current) || 0)
      return ((now + 1) % size + size) % size
    }

    /** 在整本词库里前后挪：到头绕回，负数也绕（跟打条靠它一直往下打） */
    function stepIndex(index, length, delta = 1) {
      if (!length) return 0
      const next = (index + delta) % length
      return next < 0 ? next + length : next
    }

    /** 词条（{w,ipa,zh} 或字符串）→ 纯单词字符串数组 */
    function toWordList(list) {
      return (list || []).map((entry) => (typeof entry === 'string' ? entry : entry?.w)).filter(Boolean)
    }

    function ComposerTrainer({ useInput, inputActions, ctx }) {
      const t = useT(ctx)
      const isOpen = useSyncExternalStore(subscribeOpen, getOpen, getOpen)
      const draft = useInput((snapshot) => snapshot?.draft ?? '')
      const [dictId, setDictId] = useState(readDictId)
      const [round, setRound] = useState(0)
      // 跟打条是「一本词库顺着往下打」，不是抽 20 个就结束
      const [words, setWords] = useState(() => toWordList(wordsSync(dictId)))
      const [state, setState] = useState({
        index: 0, typed: '', flash: false, hits: 0, retries: 0, wordWrong: 0, finishedAt: null,
      })
      const [auto, setAuto] = useState(false)
      const [barWidth, setBarWidth] = useState(null)
      /** 我们自己写进 composer 的那句中文（关闭时要原样撤掉） */
      const wroteDraftRef = useRef('')
      /** 条真的渲染出来了才接管键盘：否则一律不 preventDefault，输入框必须照常能用 */
      const liveBarRef = useRef(false)
      const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings)
      const [loopOn, setLoopOn] = useState(false)
      const stateRef = useRef(state)
      const wordsRef = useRef(words)
      const lockRef = useRef({ locked: false, timer: null })
      const draftRef = useRef('')
      const startedAt = useRef(Date.now())

      // 词库词条按需加载：整本拿到，顺序往下打；失败退回内置兜底
      useEffect(() => {
        let cancelled = false
        loadDictWords(dictId)
          .then((all) => {
            if (!cancelled && all?.length) {
              setWords(toWordList(all))
              setState({ index: 0, typed: '', flash: false, hits: 0, retries: 0, wordWrong: 0, finishedAt: null })
            }
          })
          .catch((err) => {
            if (!cancelled) setWords(toWordList(err?.fallbackWords ?? wordsSync(dictId)))
          })
        return () => {
          cancelled = true
        }
      }, [dictId, round])

      useEffect(() => { stateRef.current = state }, [state])
      useEffect(() => { draftRef.current = draft }, [draft])
      useEffect(() => { wordsRef.current = words }, [words])
      useEffect(() => () => {
        if (lockRef.current.timer !== null) clearTimeout(lockRef.current.timer)
      }, [])

      // 宽度对齐 composer 正文：之前 setBarWidth 从没被调用过，整条所以不居中
      useEffect(() => {
        if (!isOpen) return undefined
        const measure = () => {
          const node = document.querySelector('[data-composer-input]')
          const width = node?.getBoundingClientRect?.().width ?? 0
          setBarWidth((prev) => {
            const next = width > 40 ? Math.round(width) : null
            return prev === next ? prev : next
          })
        }
        measure()
        const target = document.querySelector('[data-composer-input]')
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
        if (observer && target) observer.observe(target)
        window.addEventListener('resize', measure)
        return () => {
          observer?.disconnect?.()
          window.removeEventListener('resize', measure)
        }
      }, [isOpen])

      const total = words.length
      // 跟打条是流水线：没有「完成」态，索引绕圈
      const current = words[state.index % (total || 1)] ?? ''

      // 换词自动发音：跟打条也读，原来只有按钮能点，摘掉按钮就没声了
      const spokenRef = useRef({ word: '', index: -1 })
      useEffect(() => {
        // 条没开就一个字都不许读：这个组件跟着 dock 挂载，新开会话会重挂一次，
        // 少了这两道门禁就会「一进新会话就听到一个单词」。
        if (!isOpen) return
        if (getOpen() !== true) return
        if (!settings.voice) return
        if (!current) return
        if (spokenRef.current.word === current && spokenRef.current.index === state.index) return
        spokenRef.current = { word: current, index: state.index }
        speak(current)
      }, [current, isOpen, settings.voice, state.index])
      const done = false
      const judgeOptions = useMemo(
        () => ({ caseSensitive: settings.caseSensitive, ignorePunct: settings.ignorePunct }),
        [settings.caseSensitive, settings.ignorePunct],
      )
      const target = effectiveTarget(current, judgeOptions)
      const masked = maskLetters(target, settings.dictation, state.index)
      const entry = lookup(current)
      const ipa = entry?.ipa ?? ''
      const meaning = entry?.zh ?? ''

      const advance = useCallback(() => {
        // 循环当前词：原地重打
        if (loopRef.current) {
          setState((prev) => ({ ...prev, typed: '', flash: false, wordWrong: 0, hits: prev.hits + 1 }))
          return
        }
        // 打完最后一个就绕回开头接着打，跟原版一样一直往下
        const next = stepIndex(stateRef.current.index, wordsRef.current.length, 1)
        setState((prev) => ({
          ...prev,
          typed: '',
          flash: false,
          wordWrong: 0,
          hits: prev.hits + 1,
          index: next,
          finishedAt: null,
        }))
      }, [])

      const loopRef = useRef(false)
      const pausedRef = useRef(false)

      /** 暂停只意味着「不吃键」，条上没有计时器 */
      const applyPaused = useCallback((next) => {
        pausedRef.current = next
      }, [])

      const goPrev = useCallback(() => {
        const prev = Math.max(0, stateRef.current.index - 1)
        setState((state) => ({ ...state, index: prev, typed: '', flash: false, wordWrong: 0, finishedAt: null }))
      }, [])

      const goSkip = useCallback(() => {
        setState((state) => ({
          ...state,
          index: stepIndex(state.index, wordsRef.current.length, 1),
          typed: '',
          flash: false,
          wordWrong: 0,
          finishedAt: null,
        }))
      }, [])

      const goLoop = useCallback(() => {
        loopRef.current = !loopRef.current
        setLoopOn(loopRef.current)
      }, [])

      /** 吃下一个字符（键盘和自动打都走这里，判定只有一份） */
      const feed = useCallback((ch) => {
        if (pausedRef.current) return
        if (lockRef.current.locked) return
        const goal = effectiveTarget(wordsRef.current[stateRef.current.index] ?? '', judgeOptions)
        if (!goal) return
        const stepped = pushChar(goal, stateRef.current.typed, ch)
        if (stepped.result === 'over') return
        if (stepped.result === 'ok') {
          setState((prev) => ({ ...prev, typed: stepped.typed }))
          return
        }
        if (stepped.result === 'done') {
          playClick('hit')
          setState((prev) => ({ ...prev, typed: stepped.typed }))
          lockRef.current.locked = true
          lockRef.current.timer = setTimeout(() => {
            lockRef.current.timer = null
            lockRef.current.locked = false
            advance()
          }, 200)
          return
        }
        // 打错：标红抖动 → 清空 → 整词重打
        // 提示档位升了一档（第 3 / 4 / 5 次）就给一声更轻的提示音，否则仍是打错音
        const prevTip = tipState({ wrongCount: stateRef.current.wordWrong, word: goal, typed: stateRef.current.typed })
        const nextWrong = nextWrongCount(stateRef.current.wordWrong, 'miss')
        if (tipState({ wrongCount: nextWrong, word: goal, typed: '' }).level > prevTip.level) playClick('hint')
        else playClick('miss')
        lockRef.current.locked = true
        setState((prev) => ({ ...prev, typed: stepped.typed, flash: true }))
        lockRef.current.timer = setTimeout(() => {
          lockRef.current.timer = null
          lockRef.current.locked = false
          setState((prev) => ({
            ...prev, typed: '', flash: false, retries: prev.retries + 1, wordWrong: nextWrong,
          }))
        }, 320)
      }, [advance, judgeOptions.caseSensitive, judgeOptions.ignorePunct])

      // 打开时把焦点交给 composer 编辑器：用户直接就能打
      useEffect(() => {
        if (!isOpen) return
        const editor = document.querySelector(COMPOSER_EDITOR)
        if (editor && typeof editor.focus === 'function') editor.focus()
      }, [isOpen])

      // 和输入框对齐：量 composer 正文的宽度，条按同一宽度居中
      useEffect(() => {
        if (!isOpen) return undefined
        const measure = () => {
          const editor = findComposerEditor()
          if (!editor) return
          const width = Math.round(editor.getBoundingClientRect().width)
          if (width > 0) setBarWidth(width)
        }
        measure()
        window.addEventListener('resize', measure)
        let observer
        const editor = findComposerEditor()
        if (editor && typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(measure)
          observer.observe(editor)
        }
        return () => {
          window.removeEventListener('resize', measure)
          if (observer) observer.disconnect()
        }
      }, [isOpen])

      // 输入法上屏拦截：拼音/候选字落不进 composer，只留我们自己写的那句提示。
      // 注意这里只「拦事件」，绝不改 inputmode/lang/style —— 改属性会把输入法直接搞哑。
      useEffect(() => {
        if (!isOpen) return undefined
        const inComposer = (target) => target instanceof HTMLElement
          && (target.isContentEditable || target.closest(COMPOSER_EDITOR) !== null)

        const onBeforeInput = (event) => {
          // 双门禁：条必须真的在跑（live），且落点确实在 composer 里
          if (!liveBarRef.current) return
          if (getOpen() !== true) return
          if (!inComposer(event.target)) return
          event.preventDefault()
        }
        const onCompositionEnd = () => {
          if (!liveBarRef.current || getOpen() !== true) return
          const wanted = wroteDraftRef.current
          if (!wanted) return                // 没写过提示语就别碰草稿
          setTimeout(() => {
            try {
              if (draftRef.current !== wanted) inputActions?.setDraft?.(wanted)
            } catch {
              /* ignore */
            }
          }, 0)
        }
        const onSendClick = (event) => {
          if (!liveBarRef.current || getOpen() !== true) return
          if (!isSendTrigger(event.target)) return
          event.preventDefault()
          event.stopPropagation()
        }
        window.addEventListener('beforeinput', onBeforeInput, true)
        window.addEventListener('compositionend', onCompositionEnd, true)
        window.addEventListener('click', onSendClick, true)
        window.addEventListener('pointerdown', onSendClick, true)
        return () => {
          window.removeEventListener('beforeinput', onBeforeInput, true)
          window.removeEventListener('compositionend', onCompositionEnd, true)
          window.removeEventListener('click', onSendClick, true)
          window.removeEventListener('pointerdown', onSendClick, true)
        }
      }, [inputActions, isOpen])

      // 收起时顺手把可能残留的输入法属性擦掉（旧版本留下的坑）
      useEffect(() => {
        if (isOpen) return
        releaseStuckComposer()
      }, [isOpen])

      // 收起时把留在输入框里的中文撤掉：**只撤我们自己写进去的那一句**，而且只撤一次。
      // 注意：wrote 为空时必须直接返回。之前无条件清空，用户关掉跟打后每敲一个字
      // 都会被这里抹掉，表现就是「输入框打不了字」（换新输入框也一样，因为草稿是共享的）。
      useEffect(() => {
        if (isOpen) return
        const wrote = wroteDraftRef.current
        const clear = shouldClearDraft({ open: isOpen, draft, wrote })
        wroteDraftRef.current = ''
        if (!clear) return                     // 没写过 / 用户改过 → 一个字都不动
        try {
          inputActions?.setDraft?.('')
        } catch {
          /* ignore */
        }
      }, [draft, inputActions, isOpen])

      // 逃生热键：⌘/Ctrl + Alt + Q —— 不管卡在哪，强制关条、擦属性、清掉我们写的提示语
      useEffect(() => {
        const onPanic = (event) => {
          if (!(event.metaKey || event.ctrlKey) || !event.altKey) return
          if (String(event.key).toLowerCase() !== 'q') return
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          releaseStuckComposer()
          try {
            if (wroteDraftRef.current) inputActions?.setDraft?.('')
          } catch {
            /* ignore */
          }
          wroteDraftRef.current = ''
        }
        window.addEventListener('keydown', onPanic, true)
        return () => window.removeEventListener('keydown', onPanic, true)
      }, [inputActions])

      // Tab 快速启动：输入框为空、且跟打条没开时，按 Tab 打开
      useEffect(() => {
        const onKeyDown = (event) => {
          const target = event.target
          const inComposer = target instanceof HTMLElement
            && (target.isContentEditable
              || target.closest(COMPOSER_EDITOR) !== null
              || target.closest('[contenteditable="true"]') !== null)
          const allow = shouldStartOnTab({
            key: event.key,
            open: getOpen(),
            inComposer,
            draft: draftRef.current,
            ownDraft: wroteDraftRef.current,
            modifier: event.metaKey || event.ctrlKey || event.altKey || event.shiftKey,
          })
          if (!allow) return
          event.preventDefault()
          event.stopPropagation()
          setOpen(true)
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [])

      // 捕获阶段的键盘路由：只有 focus 在 composer 里才接管
      useEffect(() => {
        if (!isOpen) return undefined
        const onKeyDown = (event) => {
          const target = event.target
          if (!(target instanceof Node)) return
          const region = composerRegion()
          // Esc 必须先于任何门禁生效：条卡住时这是唯一的逃生口
          if (event.key === 'Escape') {
            const near = (target instanceof HTMLElement
              && (target.isContentEditable
                || target.closest(COMPOSER_EDITOR) !== null
                || target.closest('[contenteditable="true"]') !== null))
              || (region && region.contains(target))
            if (near) {
              event.preventDefault()
              event.stopPropagation()
              setOpen(false)
              releaseStuckComposer()
              return
            }
          }
          if (!liveBarRef.current) return
          const inComposer = target instanceof HTMLElement
            && (target.isContentEditable
              || target.closest(COMPOSER_EDITOR) !== null
              || target.closest('[contenteditable="true"]') !== null)
          // 回车/制表符：只要落在输入框区域，任何修饰键都吞掉（防 Cmd+Enter 把中文发出去）
          if ((event.key === 'Enter' || event.key === 'Tab') && (inComposer || (region && region.contains(target)))) {
            event.preventDefault()
            event.stopPropagation()
            return
          }
          if (event.key === 'Escape' && (inComposer || (region && region.contains(target)))) {
            event.preventDefault()
            setOpen(false)
            return
          }
          if (!inComposer) return
          const action = resolveHotkey({
            key: event.key,
            meta: event.metaKey,
            ctrl: event.ctrlKey,
            alt: event.altKey,
            shift: event.shiftKey,
          })
          if (action) {
            event.preventDefault()
            event.stopPropagation()
            if (action === 'prev') goPrev()
            else if (action === 'skip') goSkip()
            else if (action === 'loop') goLoop()
            else if (action === 'pause') applyPaused(!pausedRef.current)
            else if (action === 'close') {
              if (typeof onClose === 'function') onClose()
              else setOpen(false)
            }
            return
          }
          if (event.metaKey || event.ctrlKey || event.altKey) return
          if (event.key === 'Backspace') {
            event.preventDefault()
            event.stopPropagation()
            if (lockRef.current.locked) return
            setState((prev) => ({ ...prev, typed: prev.typed.slice(0, -1), flash: false }))
            return
          }
          if (event.key.length !== 1) return
          event.preventDefault()
          event.stopPropagation()
          feed(event.key)
        }
        // 练习期间，输入框那一排的按钮点击一并吃掉（发送键、附件键等）
        const onPointerDown = (event) => {
          if (!liveBarRef.current) return
          const target = event.target
          if (!(target instanceof Element)) return
          const region = composerRegion()
          if (!region || !region.contains(target)) return
          if (target.closest('[data-qat]') !== null) return
          if (target.closest('button, [role="button"]') === null) return
          event.preventDefault()
          event.stopPropagation()
        }
        window.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('pointerdown', onPointerDown, true)
        return () => {
          window.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('pointerdown', onPointerDown, true)
        }
      }, [feed, isOpen])

      // composer 里只放这一个词的中文：既当提示，又当"清场"——
      // 打进去的字永远不会留在输入框里（按键已被拦），所以回车没有东西可发。
      useEffect(() => {
        if (!isOpen) return
        if (!inputActions || typeof inputActions.setDraft !== 'function') return
        const desired = !done && meaning ? meaning : ''
        if (draft === desired) return
        // 没有词可提示时（词库空）别去动用户已经写下的草稿
        if (!desired && draft && draft !== wroteDraftRef.current) return
        wroteDraftRef.current = desired
        try {
          inputActions.setDraft(desired)
        } catch {
          /* 冻结态不允许改写草稿，忽略 */
        }
      }, [done, draft, inputActions, isOpen, meaning])

      // 自动打：逐字走同一条 feed，行为和手打一致
      useEffect(() => {
        if (!auto || done || total === 0) return undefined
        const id = setInterval(() => {
          const word = wordsRef.current[stateRef.current.index] ?? ''
          if (!word || lockRef.current.locked) return
          const next = word[stateRef.current.typed.length]
          if (next === undefined) return
          feed(next)
        }, 120)
        return () => clearInterval(id)
      }, [auto, done, feed, total])

      const restart = useCallback(() => {
        startedAt.current = Date.now()
        lockRef.current = { locked: false, timer: null }
        setAuto(false)
        setRound((value) => value + 1)
        setState({ index: 0, typed: '', flash: false, hits: 0, retries: 0, wordWrong: 0, finishedAt: null })
      }, [])

      /** 切换词库：存起来 + 立刻开新一轮 */
      const chooseDict = useCallback((id) => {
        setDictId(id)
        writeDictId(id)
        startedAt.current = Date.now()
        lockRef.current = { locked: false, timer: null }
        setAuto(false)
        setState({ index: 0, typed: '', flash: false, hits: 0, retries: 0, wordWrong: 0, finishedAt: null })
      }, [])

      liveBarRef.current = isOpen && total > 0 && Boolean(current)

      if (!isOpen) return null

      // 词库还在加载 / 空词库：给一个可见的占位条，别看起来像「按了没反应」
      if (total === 0) {
        return h('div', {
          className: 'qat-bar',
          'data-qat': '',
          style: barWidth === null ? undefined : { width: `${barWidth}px`, marginInline: 'auto' },
        },
          h(Styles),
          h('span', { className: 'qat-bar-center' },
            h('span', { className: 'qat-bar-empty' }, t('loading')),
          ),
          h('span', {
            ...pressable(() => setOpen(false)),
            className: 'qat-icon qat-bar-close',
            'data-act': 'close',
            title: t('close'),
            'aria-label': t('close'),
          }, '×'),
        )
      }

      // 位置按整本词库算：1 / 2607
      const position = (state.index % total) + 1
      const chars = target.split('')
      // 打错提示（跟打条）：3 / 4 / 5 次逐档揭示，打对后 wordWrong 归零
      const tip = tipState({ wrongCount: state.wordWrong, word: target, typed: state.typed })

      return h('div', {
        className: 'qat-bar',
        'aria-live': 'off',
        'data-qat': '',
        style: barWidth === null ? undefined : { width: `${barWidth}px`, marginInline: 'auto' },
      },
        h(Styles),
        // 进度与关闭都绝对定位在两侧，中间那块才是真正居中的
        h('span', { className: 'qat-bar-count', title: t('dictTitle') }, `${position}/${total}`),
        h('span', { className: 'qat-bar-center' },
          h('span', { className: 'qat-wordblock' },
          h('span', { className: 'qat-word', 'data-flash': state.flash ? 'true' : 'false' },
            chars.map((ch, i) => {
              const typedChar = state.typed[i]
              const letterState = typedChar === undefined ? 'idle' : typedChar === ch ? 'ok' : 'bad'
              const hidden = typedChar === undefined && masked[i]
              return h('span', {
                key: `${i}-${ch}`,
                className: 'qat-letter',
                'data-state': letterState,
                'data-mask': hidden ? 'true' : 'false',
              }, hidden ? '·' : (ch === ' ' ? '␣' : ch))
            }),
          ),
            ipa ? h('span', { className: 'qat-ipa' }, ipa) : null,
            h(TipLine, { tip, t, className: 'qat-bar-tip' }),
          ),
        ),
        h('span', {
          ...pressable(() => setOpen(false)),
          className: 'qat-icon qat-bar-close',
          'data-act': 'close',
          title: t('close'),
          'aria-label': t('close'),
        }, h(Icon, { name: 'close', size: 13 })),
      )
    }


    /* ------------------------------------------------------------------ panel */

    /** 侧栏图标：键盘（上游 ic:round-keyboard），内联 SVG，不依赖 CSS 遮罩、也不用图片 */
    function PanelGlyph({ size, active }) {
      const side = size ?? 20
      return h('svg', {
        className: 'qat-glyph',
        'data-active': active ? 'true' : 'false',
        width: side,
        height: side,
        viewBox: '0 0 24 24',
        'aria-hidden': 'true',
        focusable: 'false',
        fill: 'currentColor',
      }, GLYPH.d.map((d, index) => h('path', { key: index, d })))
    }

    /** 顶层面板：词库分类 + 大字跟打 */
    /** 词库选择器（面板内二级页）：搜索 + 分类 + 最近使用 + 列表 */
    function DictPicker({ t, dictId, query, category, recent, categories, list, onQuery, onCategory, onPick, onImported, onClose }) {
      const [importing, setImporting] = useState(false)
      const [draftName, setDraftName] = useState('')
      const [draftText, setDraftText] = useState('')
      const [flash, setFlash] = useState('')

      const submitImport = () => {
        const words = parseCustomWords(draftText)
        const id = saveCustomDict(draftName || `我的词 ${new Date().toISOString().slice(5, 10)}`, words)
        if (!id) {
          setFlash(t('customEmpty'))
          return
        }
        setFlash(t('customSaved', { n: words.length }))
        setImporting(false)
        setDraftText('')
        onImported?.(id)
      }

      const dictButton = (item, active) => h('button', {
        key: item.id,
        type: 'button',
        className: 'qat-dictrow',
        'data-active': active ? 'true' : 'false',
        onClick: () => onPick(item.id),
      },
        h('span', { className: 'qat-dictname' }, item.name),
        h('span', { className: 'qat-dictmeta' }, `${item.length} 词 · ${chapterCount(item)} 章`),
        isCustomId(item.id)
          ? h('span', {
            ...pressable(() => downloadText(`${item.name}.txt`, serializeCustomDict(item.id, 'txt'))),
            className: 'qat-icon',
            'data-act': 'custom-export',
            title: t('customExport'),
            'aria-label': t('customExport'),
          }, h(Icon, { name: 'download', size: 14 }))
          : null,
      )

      return h('div', { className: 'qat-picker' },
        h('div', { className: 'qat-picker-head' },
          h('input', {
            className: 'qat-search',
            value: query,
            placeholder: t('searchDict'),
            'aria-label': t('searchDict'),
            onInput: (event) => onQuery(event.target.value),
          }),
          h('span', {
            ...pressable(onClose),
            className: 'qat-btn',
          }, t('close')),
        ),
        h('div', { className: 'qat-chips' },
          h('button', {
            type: 'button',
            className: 'qat-chip',
            'data-active': category === '' ? 'true' : 'false',
            onClick: () => onCategory(''),
          }, t('allCategories')),
          categories.map((group) => h('button', {
            key: group.category,
            type: 'button',
            className: 'qat-chip',
            'data-active': category === group.category ? 'true' : 'false',
            onClick: () => onCategory(group.category),
          }, `${group.category} ${group.dicts.length}`)),
        ),
        !query.trim() && !category && recent.length
          ? h('div', { className: 'qat-dictgroup' },
            h('div', { className: 'qat-dictgroup-title' }, t('recent')),
            recent.map((item) => dictButton(item, item.id === dictId)),
          )
          : null,
        h('div', { className: 'qat-dictgroup' },
          h('div', { className: 'qat-dictgroup-title' }, query.trim() ? t('searchResult') : (category || t('allCategories'))),
          h('div', { className: 'qat-dictscroll' }, list.map((item) => dictButton(item, item.id === dictId))),
        ),
        importing
          ? h('div', { className: 'qat-import' },
            h('input', {
              className: 'qat-search',
              value: draftName,
              placeholder: t('customName'),
              'aria-label': t('customName'),
              onInput: (event) => setDraftName(event.target.value),
            }),
            h('textarea', {
              className: 'qat-textarea',
              value: draftText,
              placeholder: t('customPlaceholder'),
              'aria-label': t('customPlaceholder'),
              rows: 5,
              onInput: (event) => setDraftText(event.target.value),
            }),
            h('label', { className: 'qat-filepick' },
              t('customFile'),
              h('input', {
                type: 'file',
                accept: '.txt,.csv,.json,text/plain,text/csv,application/json',
                'data-act': 'custom-file',
                onChange: (event) => {
                  const file = event?.target?.files?.[0]
                  if (!file) return
                  if (typeof file.text === 'function') {
                    file.text().then((raw) => {
                      setDraftText(raw)
                      if (!draftName) setDraftName(file.name.replace(/\.[^.]+$/, '').slice(0, 24))
                      setFlash(t('customFileLoaded', { n: parseCustomFile(file.name, raw).length }))
                    })
                  }
                },
              }),
            ),
            h('div', { className: 'qat-databtns' },
              h('span', { ...pressable(submitImport), className: 'qat-btn', 'data-act': 'custom-save' }, t('customSave')),
              h('span', {
                ...pressable(() => {
                  setImporting(false)
                  setFlash('')
                }),
                className: 'qat-btn',
                'data-act': 'custom-cancel',
              }, t('cancel')),
            ),
          )
          : h('div', { className: 'qat-databtns qat-importopen' },
            h('span', { ...pressable(() => setImporting(true)), className: 'qat-btn', 'data-act': 'custom-new' }, t('customNew')),
          ),
        flash ? h('div', { className: 'qat-sethint', 'data-flash': 'true' }, flash) : null,
      )
    }

    /** 设置页里的一行开关 */
    function SettingRow({ t, label, hint, control }) {
      return h('div', { className: 'qat-setrow' },
        h('div', { className: 'qat-settext' },
          h('div', { className: 'qat-setlabel' }, label),
          hint ? h('div', { className: 'qat-sethint' }, hint) : null,
        ),
        h('div', { className: 'qat-setcontrol' }, control),
      )
    }

    /** 设置页：大小写 / 标点 / 发音 / 键音 / 默写形态 + 数据管理 */
    function SettingsSection() {
      const t = useT(PLUGIN_CTX)
      const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings)
      const [flash, setFlash] = useState('')
      const fileRef = useRef(null)

      const say = (message) => {
        setFlash(message)
        setTimeout(() => setFlash(''), 2600)
      }

      const onExport = () => {
        exportBackup().then((text) => {
          try {
            const blob = new Blob([text], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `qwerty-autotype-backup-${new Date().toISOString().slice(0, 10)}.json`
            document.body.appendChild(link)
            link.click()
            link.remove()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
            say(t('backupExported'))
          } catch {
            say(t('backupFailed'))
          }
        })
      }

      const onImportFile = (event) => {
        const file = event?.target?.files?.[0]
        if (!file || typeof file.text !== 'function') return
        file.text().then((text) => {
          let parsed
          try {
            parsed = parseBackup(text)
          } catch (error) {
            say(`${t('backupBadFile')} (${error.message})`)
            return
          }
          importData(parsed).then((result) => {
            for (const [key, value] of Object.entries(parsed.settings || {})) setSetting(key, value)
            if (parsed.mastered?.length) writeMastered(parsed.mastered)
            if (parsed.customDicts && Object.keys(parsed.customDicts).length) writeCustomDicts(parsed.customDicts)
            say(t('backupImported', { n: result.restored }))
          })
        })
      }

      const onClear = () => say(t('clearConfirm'))

      const [cache, setCache] = useState(null)
      const refreshCache = () => {
        cacheStats().then((stats) => setCache(stats)).catch(() => setCache({ count: 0, bytes: 0 }))
      }
      useEffect(() => {
        refreshCache()
      }, [])
      const toggle = (key) => h('span', {
        role: 'switch',
        tabIndex: 0,
        'aria-checked': settings[key] ? 'true' : 'false',
        className: 'qat-switch',
        'data-on': settings[key] ? 'true' : 'false',
        'data-setting': key,
        onClick: () => setSetting(key, !settings[key]),
      }, settings[key] ? '开' : '关')

      return h('div', { className: 'qat-settings' },
        h('div', { className: 'qat-settings-title' }, t('settingsTitle')),
        h(SettingRow, {
          t,
          label: t('settingCaseSensitive'),
          hint: t('settingCaseSensitiveHint'),
          control: toggle('caseSensitive'),
        }),
        h(SettingRow, {
          t,
          label: t('settingIgnorePunct'),
          hint: t('settingIgnorePunctHint'),
          control: toggle('ignorePunct'),
        }),
        h(SettingRow, {
          t,
          label: t('settingVoice'),
          hint: t('settingVoiceHint'),
          control: toggle('voice'),
        }),
        h(SettingRow, {
          t,
          label: t('settingAccent'),
          hint: t('settingAccentHint'),
          control: h('select', {
            className: 'qat-select',
            value: settings.accent,
            'data-setting': 'accent',
            onChange: (event) => setSetting('accent', event.target.value),
          }, ACCENTS.map((accent) => h('option', { key: accent, value: accent }, t(`accent_${accent}`)))),
        }),
        h(SettingRow, {
          t,
          label: t('settingSound'),
          hint: t('settingSoundHint'),
          control: toggle('sound'),
        }),
        h(SettingRow, {
          t,
          label: t('settingAutoNext'),
          hint: t('settingAutoNextHint'),
          control: toggle('autoNext'),
        }),
        h(SettingRow, {
          t,
          label: t('settingDictation'),
          hint: t('settingDictationHint'),
          control: h('select', {
            className: 'qat-select',
            value: settings.dictation,
            onChange: (event) => setSetting('dictation', event.target.value),
          }, DICTATION_MODES.map((mode) => h('option', { key: mode, value: mode }, t(`dictation_${mode}`)))),
        }),
        h('div', { className: 'qat-settings-title qat-datablock' }, t('hotkeysTitle')),
        h('div', { className: 'qat-sethint qat-hotkeys' }, t('hotkeysList')),
        h(SettingRow, {
          t,
          label: t('cacheLabel'),
          hint: cache
            ? t('cacheHint', { n: cache.count, size: `${(cache.bytes / 1048576).toFixed(1)} MB` })
            : t('cacheLoading'),
          control: h('span', {
            ...pressable(() => {
              clearDictCache().then(() => {
                refreshCache()
                say(t('cacheCleared'))
              })
            }),
            className: 'qat-btn',
            'data-act': 'cache-clear',
          }, t('cacheClear')),
        }),
        h('div', { className: 'qat-settings-title qat-datablock' }, t('dataTitle')),
        h('div', { className: 'qat-databtns' },
          h('span', {
            role: 'button',
            tabIndex: 0,
            className: 'qat-btn',
            'data-act': 'export',
            onClick: onExport,
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') onExport()
            },
          }, t('backupExport')),
          h('span', {
            role: 'button',
            tabIndex: 0,
            className: 'qat-btn',
            'data-act': 'import',
            onClick: () => fileRef.current?.click?.(),
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') fileRef.current?.click?.()
            },
          }, t('backupImport')),
          h('input', {
            ref: fileRef,
            type: 'file',
            accept: 'application/json,.json',
            style: { display: 'none' },
            onChange: onImportFile,
          }),
          h('span', {
            role: 'button',
            tabIndex: 0,
            className: 'qat-btn',
            'data-act': 'clear',
            onClick: () => {
              if (flash === t('clearConfirm')) {
                clearData().then(() => say(t('clearedDone')))
                return
              }
              onClear()
            },
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') onClear()
            },
          }, t('backupClear')),
        ),
        flash ? h('div', { className: 'qat-sethint', 'data-flash': 'true' }, flash) : null,
      )
    }

    /** 错词本浮层：列出打错过的词，可一键重练前 N 个 */
    /**
     * 词表抽屉：本章的词一列，当前词高亮、打过的标状态，点一行直接跳过去。
     * 行数据由 wordListRows 算好，这里只管画（所以测试能单独渲染它）。
     */
    function WordListPanel({ t, rows, hint, onPick, onClose }) {
      const list = Array.isArray(rows) ? rows : []
      return h('div', { className: 'qat-wordlist' },
        h('div', { className: 'qat-wordlist-head' },
          h('span', { className: 'qat-picker-title' }, t('wordListTitle', { n: list.length })),
          hint ? h('span', { className: 'qat-panel-sub' }, hint) : null,
          h('span', { className: 'qat-grow' }),
          h('button', {
            type: 'button',
            className: 'qat-iconbtn',
            title: t('close'),
            'aria-label': t('close'),
            'data-act': 'wordlist-close',
            onClick: () => onClose?.(),
          }, h(Icon, { name: 'close', size: 14 })),
        ),
        list.length === 0
          ? h('div', { className: 'qat-loading' }, t('wordListEmpty'))
          : h('div', { className: 'qat-wordlist-list' }, list.map((row) => h('button', {
            key: `${row.index}:${row.word}`,
            type: 'button',
            className: 'qat-wordlist-row',
            'data-state': row.state,
            'data-no': String(row.index + 1),
            'data-active': row.state === 'current' ? 'true' : 'false',
            title: `${row.word}${row.zh ? ` · ${row.zh}` : ''}`,
            'aria-label': `${row.index + 1} ${row.word}`,
            onClick: () => onPick?.(row),
          },
            h('span', { className: 'qat-wordlist-no' }, String(row.index + 1)),
            h('span', { className: 'qat-wordlist-word' }, row.word),
            row.ipa ? h('span', { className: 'qat-wordlist-ipa' }, row.ipa) : null,
            h('span', { className: 'qat-wordlist-zh' }, row.zh || ''),
            h('span', { className: 'qat-wordlist-state', 'data-state': row.state },
              t(WORDLIST_STATE_LABEL[row.state] ?? WORDLIST_STATE_LABEL.idle)),
          ))),
      )
    }

    function WrongBookPanel({ t, rows, query, sort, dicts, mastered, onQuery, onSort, onMastered, onReview, onClear, onClose }) {
      return h('div', { className: 'qat-picker' },
        h('div', { className: 'qat-picker-head' },
          h('span', { className: 'qat-picker-title' }, t('wrongTitle', { n: rows.length })),
          h('input', {
            className: 'qat-search qat-wrongsearch',
            type: 'text',
            value: query ?? '',
            placeholder: t('wrongSearch'),
            onChange: (event) => onQuery?.(event.target.value),
          }),
          dicts && dicts.length > 1
            ? h('span', { className: 'qat-chips' }, [
              h('span', {
                key: '__all',
                ...pressable(() => onSort?.({ dictId: '' })),
                className: 'qat-chip',
                'data-active': !dicts.find((item) => item.active) ? 'true' : 'false',
              }, t('allDicts')),
              ...dicts.map((item) => h('span', {
                key: item.id,
                ...pressable(() => onSort?.({ dictId: item.active ? '' : item.id })),
                className: 'qat-chip',
                'data-active': item.active ? 'true' : 'false',
              }, `${item.name} ${item.count}`)),
            ])
            : null,
          h('span', {
            ...pressable(() => onSort?.({ sort: sort === 'recent' ? 'count' : 'recent' })),
            className: 'qat-btn',
            'data-act': 'sort',
          }, sort === 'recent' ? t('sortRecent') : t('sortCount')),
          h('span', { className: 'qat-grow' }),
          rows.length
            ? h('span', {
              ...pressable(() => onReview(rows.slice(0, 20).map((row) => row.word))),
              className: 'qat-btn',
            }, t('reviewTop'))
            : null,
          rows.length
            ? h('span', {
              ...pressable(onClear),
              className: 'qat-btn',
            }, t('clearWrong'))
            : null,
          h('span', {
            ...pressable(onClose),
            className: 'qat-btn',
          }, t('close')),
        ),
        rows.length === 0
          ? h('div', { className: 'qat-loading' }, t('wrongEmpty'))
          : h('div', { className: 'qat-dictscroll' }, rows.map((row) => {
            const meta = lookup(row.word)
            return h('div', { key: `${row.dictId}:${row.word}`, className: 'qat-wrongrow' },
              h('span', { className: 'qat-wrongword' }, row.word),
              h('span', { className: 'qat-wrongzh' }, meta?.zh ?? ''),
              h('span', { className: 'qat-wrongcount' }, `×${row.wrongCount}`),
              h('span', {
                ...pressable(() => onMastered?.(row)),
                className: 'qat-icon',
                'data-act': 'mastered',
                'data-active': (mastered || []).includes(`${row.dictId || ''}:${row.word}`) ? 'true' : 'false',
                title: t('markMastered'),
                'aria-label': t('markMastered'),
              }, h(Icon, { name: 'check', size: 13 })),
            )
          })),
      )
    }

    /** 统计浮层：近 14 天柱状 + 汇总数字（纯 SVG/div，不引图表库） */
    function StatsPanel({ t, days, weeks, letters, summary, onClose }) {
      const max = Math.max(1, ...days.map((day) => day.words))
      return h('div', { className: 'qat-picker' },
        h('div', { className: 'qat-picker-head' },
          h('span', { className: 'qat-picker-title' }, t('statsTitle')),
          h('span', { className: 'qat-grow' }),
          h('span', {
            ...pressable(onClose),
            className: 'qat-btn',
          }, t('close')),
        ),
        h('div', { className: 'qat-stats-nums' },
          h('span', null, t('statWords', { n: summary.words })),
          h('span', null, t('statChapters', { n: summary.chapters })),
          h('span', null, t('accuracyShort', { n: summary.accuracy })),
          h('span', null, `WPM ${summary.wpm}`),
        ),
        letters && letters.length
          ? h('div', null,
            h('div', { className: 'qat-letters' },
              h('span', { className: 'qat-letters-label' }, t('lettersTitle')),
              ...letters.map((item) => h('span', {
                key: item.letter,
                className: 'qat-chip qat-letterchip',
              }, `${item.letter} ×${item.count}`))),
            h('div', { className: 'qat-kbd' }, keyboardHeat(letters).map((row, rowIndex) =>
              h('div', { key: rowIndex, className: 'qat-kbdrow' }, row.map((cell) => h('span', {
                key: cell.key,
                className: 'qat-key',
                'data-level': String(cell.level),
                title: `${cell.key} ×${cell.count}`,
              }, cell.key.toUpperCase()))))))
          : null,
        h('div', { className: 'qat-heat' }, (weeks || []).map((col, index) =>
          h('div', { key: index, className: 'qat-heatcol' }, col.days.map((day) =>
            h('div', {
              key: day.day,
              className: 'qat-heatcell',
              'data-level': day.future ? 'future' : String(day.level),
              title: `${day.day} · ${t('statWords', { n: day.words })}`,
            }))))),
        h('div', { className: 'qat-bars' }, days.map((day) =>
          h('div', { key: day.day, className: 'qat-barcol', title: `${day.day} · ${t('statWords', { n: day.words })}` },
            h('div', {
              className: 'qat-barfill',
              'data-empty': day.words === 0 ? 'true' : 'false',
              style: { height: `${Math.round((day.words / max) * 100)}%` },
            }),
            h('span', { className: 'qat-barlabel' }, day.day.slice(5)),
          ))),
      )
    }

    function PracticePanel({ ctx }) {
      const t = useT(ctx)
      const [dictId, setDictId] = useState(readDictId)
      const [chapter, setChapter] = useState(0)
      const [round, setRound] = useState(0)
      // 内置词库可直接同步出词条 → 首帧就能练；其余词库先显示加载态
      const [all, setAll] = useState(() => (builtinById(readDictId()) ?? {}).words ?? null)
      const [loading, setLoading] = useState(() => !(builtinById(readDictId()) ?? {}).words)
      const [error, setError] = useState('')
      const [picker, setPicker] = useState(false)
      const [query, setQuery] = useState('')
      const [category, setCategory] = useState('')
      const [progress, setProgress] = useState({})
      const [today, setToday] = useState(null)
      const [view, setView] = useState('practice')  // practice | wrong | stats
      const [wrongRows, setWrongRows] = useState([])
      const [wrongQuery, setWrongQuery] = useState('')
      const [wrongDict, setWrongDict] = useState('')
      const [wrongSort, setWrongSort] = useState('count')
      const [mastered, setMastered] = useState([])
      const [stats, setStats] = useState({ days: [], weeks: [], letters: [], summary: summarize([]) })
      const [review, setReview] = useState(null)
      /** 重练的「第几遍」：错词清单重练时词可能和上一遍完全一样，靠它把 Trainer 重新挂起来 */
      const [reviewNonce, setReviewNonce] = useState(0)
      /** 词表抽屉开没开 */
      const [listOpen, setListOpen] = useState(false)
      /** 词表里点中的行：每次点都换新对象，Trainer 的 effect 才会重跑 */
      const [jump, setJump] = useState(null)
      /** 卡片里的当前词索引（Trainer 上报，抽屉用它高亮） */
      const [activeIndex, setActiveIndex] = useState(0)
      /** wordRecords 原始记录：判断哪几个词「打过 / 打错过」 */
      const [records, setRecords] = useState([])

      const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings)
      const judgeOptions = useMemo(
        () => ({ caseSensitive: settings.caseSensitive, ignorePunct: settings.ignorePunct }),
        [settings.caseSensitive, settings.ignorePunct],
      )
      const meta = dictionaryById(dictId)
      const chapterTotal = chapterCount(meta)

      // 词库词条：内存 → IndexedDB → 网络；拉不到才退回内置采样
      useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError('')
        loadDictWords(dictId)
          .then((words) => {
            if (!cancelled) setAll(words)
          })
          .catch((err) => {
            if (cancelled) return
            setAll(err?.fallbackWords ?? wordsSync(dictId))
            setError(t('loadFailed'))
          })
          .finally(() => {
            if (!cancelled) setLoading(false)
          })
        return () => {
          cancelled = true
        }
      }, [dictId])

      // 进度（哪些章打完了）+ 今日统计
      const refreshStats = useCallback(() => {
        let cancelled = false
        Promise.all([readProgress(dictId), readChapterRecords(600), readWordRecords(4000)]).then(([rows, chapters, words]) => {
          if (cancelled) return
          const map = {}
          for (const row of rows || []) map[row.chapter] = row
          setProgress(map)
          setRecords(words || [])
          setMastered(readMastered())
          const [day] = lastDays(chapters, 1)
          setToday(day && day.words > 0 ? day : null)
          setWrongRows(collectWrongWords(words, 200))
          setStats({
            days: lastDays(chapters, 14),
            weeks: heatmapWeeks(chapters, 12),
            letters: topWrongLetters(chapters, 5),
            summary: summarize(chapters),
          })
        })
        return () => {
          cancelled = true
        }
      }, [dictId])

      useEffect(() => refreshStats(), [refreshStats])

      // 章内词条 → 单词字符串（音标/中文由 lookup 从已加载词库里查）
      const chapterWords = useMemo(() => {
        const words = all || []
        if (!words.length) return []
        const picked = round === 0 ? wordsOfChapter(words, chapter) : sampleFromWords(words, 20)
        return picked.map((entry) => (typeof entry === 'string' ? entry : entry.w))
      }, [all, chapter, round])

      // 词表抽屉的行：状态优先级 current > mastered > wrong > done > idle
      const wordRows = useMemo(
        () => wordListRows({ words: chapterWords, index: activeIndex, records, mastered, dictId }),
        [activeIndex, chapterWords, dictId, mastered, records],
      )
      const handleIndex = useCallback((value) => setActiveIndex(value), [])

      const choose = (id) => {
        if (!id) return
        setDictId(id)
        writeDictId(id)
        setChapter(0)
        setRound(0)
        setPicker(false)
        setQuery('')
        setCategory('')
        setJump(null)
        setListOpen(false)
      }
      const chooseChapter = (index) => {
        setChapter(index)
        setRound(0)
        setJump(null)
      }
      const again = () => {
        setJump(null)
        setRound((value) => value + 1)
      }

      // 打完一章自动接下一章：开着 autoNext 就不用每次点「下一章」
      const nextTimer = useRef(null)
      useEffect(() => () => {
        if (nextTimer.current !== null) clearTimeout(nextTimer.current)
      }, [])
      const finishChapter = useCallback(() => {
        setJump(null)
        refreshStats()
        if (!settings.autoNext) return
        if (nextTimer.current !== null) clearTimeout(nextTimer.current)
        nextTimer.current = setTimeout(() => {
          nextTimer.current = null
          setChapter((value) => (value + 1) % chapterTotal)
          setRound((value) => value + 1)
        }, 1200)
      }, [chapterTotal, refreshStats, settings.autoNext])

      const recent = readRecent()
        .map((id) => catalog().find((item) => item.id === id))
        .filter(Boolean)
      const categories = groupByCategory(catalog())
      const list = query.trim()
        ? searchCatalog(query, 80)
        : (category ? catalog().filter((item) => item.category === category) : catalog())

      return h('div', { className: 'qat-panel' },
        h(Styles),
        h('div', { className: 'qat-panel-head' },
          h('span', { className: 'qat-panel-title' }, t('title')),
          h('button', {
            type: 'button',
            className: 'qat-select qat-dictbtn',
            title: t('dictTitle'),
            'data-picker': picker ? 'open' : 'closed',
            onClick: () => {
              setReview(null)
              setView('practice')
              setPicker((value) => !value)
            },
          }, meta.name, h(Icon, { name: 'caret', size: 12 })),
          h('span', { className: 'qat-panel-sub' }, `${meta.category} · ${meta.length} 词 · ${chapterTotal} 章`),
          h('span', { className: 'qat-grow' }),
          h('button', {
            type: 'button',
            className: 'qat-iconbtn',
            title: t('wordListOpen'),
            'aria-label': t('wordListOpen'),
            'data-act': 'wordlist',
            'data-on': listOpen ? 'true' : 'false',
            onClick: () => {
              setView('practice')
              setReview(null)
              setListOpen((value) => !value)
            },
          }, h(Icon, { name: 'list', size: 15 })),
          h('button', {
            type: 'button',
            className: 'qat-iconbtn',
            title: t('wrongBook'),
            'aria-label': t('wrongBook'),
            'data-act': 'wrong',
            'data-on': view === 'wrong' ? 'true' : 'false',
            onClick: () => setView((current) => (current === 'wrong' ? 'practice' : 'wrong')),
          }, h(Icon, { name: 'book', size: 15 })),
          h('button', {
            type: 'button',
            className: 'qat-iconbtn',
            title: t('stats'),
            'aria-label': t('stats'),
            'data-act': 'stats',
            'data-on': view === 'stats' ? 'true' : 'false',
            onClick: () => setView((current) => (current === 'stats' ? 'practice' : 'stats')),
          }, h(Icon, { name: 'stats', size: 15 })),
          h('button', {
            type: 'button',
            className: 'qat-iconbtn',
            title: t('again'),
            'aria-label': t('again'),
            'data-act': 'again',
            onClick: again,
          }, h(Icon, { name: 'again', size: 15 })),
        ),
        h('div', { className: 'qat-tools' },
          h('select', {
            className: 'qat-select qat-chapter',
            value: chapter,
            title: t('chapterTitle'),
            onChange: (event) => chooseChapter(Number(event.target.value)),
          },
            Array.from({ length: chapterTotal }, (_, index) => {
              const done = progress[index]?.done
              return h('option', { key: index, value: index }, `${index + 1} / ${chapterTotal}${done ? ' ✓' : ''}`)
            }),
          ),
          h('select', {
            className: 'qat-select qat-dictation',
            value: settings.dictation,
            title: t('dictation'),
            onChange: (event) => setSetting('dictation', event.target.value),
          },
            DICTATION_MODES.map((mode) => h('option', { key: mode, value: mode }, t(`dictation_${mode}`))),
          ),
          h('span', { className: 'qat-grow' }),
          today
            ? h('span', { className: 'qat-panel-sub qat-today' },
              t('todayStats', { words: today.words, accuracy: today.accuracy, wpm: today.wpm }))
            : null,
        ),
        listOpen
          ? h(WordListPanel, {
            t,
            rows: wordRows,
            hint: t('wordListHint'),
            onPick: (row) => {
              setJump({ index: row.index })
              setListOpen(false)
            },
            onClose: () => setListOpen(false),
          })
          : null,
        error ? h('div', { className: 'qat-note' }, error) : null,
        review
          ? h(Trainer, {
            key: `review:${reviewNonce}:${review.join(',')}`,
            words: review,
            variant: 'panel',
            showMeta: true,
            options: judgeOptions,
            dictation: settings.dictation,
            dictId: '',
            chapter: null,
            onFinish: refreshStats,
            onReview: (words) => setReview(words),
            onRetryWrong: (words) => {
              setReview(words)
              setReviewNonce((value) => value + 1)
            },
            ctx,
          })
          : loading
          ? h('div', { className: 'qat-loading' }, t('loading'))
          : picker
            ? h(DictPicker, {
              t,
              dictId,
              query,
              category,
              recent,
              categories,
              list,
              onQuery: setQuery,
              onCategory: setCategory,
              onPick: choose,
              onImported: (id) => {
                // 新建完直接切到这个词表，省一次点击
                choose(id)
              },
              onClose: () => setPicker(false),
            })
            : view === 'wrong'
              ? h(WrongBookPanel, {
                t,
                rows: filterWrongWords(wrongRows, {
                  query: wrongQuery,
                  dictId: wrongDict,
                  sort: wrongSort,
                  mastered,
                }),
                mastered,
                onMastered: (row) => {
                  toggleMastered(row.dictId, row.word)
                  setMastered(readMastered())
                },
                query: wrongQuery,
                sort: wrongSort,
                dicts: [...new Set(wrongRows.map((row) => row.dictId))].filter(Boolean).map((id) => ({
                  id,
                  name: dictionaryById(id).name,
                  count: wrongRows.filter((row) => row.dictId === id).length,
                  active: wrongDict === id,
                })),
                onQuery: setWrongQuery,
                onSort: (patch) => {
                  if (patch.dictId !== undefined) setWrongDict(patch.dictId)
                  if (patch.sort !== undefined) setWrongSort(patch.sort)
                },
                onReview: (words) => {
                  setReview(words)
                  setView('practice')
                },
                onClear: refreshStats,
                onClose: () => setView('practice'),
              })
              : view === 'stats'
                ? h(StatsPanel, {
                  t,
                  days: stats.days,
                  weeks: stats.weeks,
                  letters: stats.letters,
                  summary: stats.summary,
                  onClose: () => setView('practice'),
                })
                : h(Trainer, {
              key: `${dictId}:${chapter}:${round}`,
              words: chapterWords,
              variant: 'panel',
              showMeta: true,
              options: judgeOptions,
              dictation: settings.dictation,
              dictId,
              chapter: round === 0 ? chapter : null,
              chapterTotal,
              jump,
              onIndex: handleIndex,
              onFinish: finishChapter,
              onReview: (words) => {
                setReview(words)
                setChapter(0)
              },
              // 本轮打错的词：原样丢给 review 通道，用这些词起一轮新的
              onRetryWrong: (words) => {
                if (!words?.length) return
                setReview(words)
                setReviewNonce((value) => value + 1)
              },
              // 走 chooseChapter：跟下拉选章同一条路（章内词表 + 进度才对得上）；
              // 末章由 nextChapterIndex 绕回第 1 章，不再置灰
              onNextChapter: () => chooseChapter(nextChapterIndex(chapter, chapterTotal)),
              ctx,
            }),
      )
    }

    /* ------------------------------------------------------------------ apply */

    return {
      // 纯逻辑导出，只给测试用；Harness 不读这个字段
      __test: {
        judgeTyping, parseWords, format, pushChar, lookup, dictionaries, sampleWords, groupByCategory,
        catalog, normalizeWord, normalizeWords, chapterCount, wordsOfChapter, sampleFromWords,
        searchCatalog, readRecent, catalogSize: () => catalog().length, wordsSync, loadDictWords,
        effectiveTarget, stripPunct, maskLetters, DICTATION_MODES, readSettings, getSettings, setSetting,
        subscribeSettings, SETTING_DEFAULTS, DICT, heatLevel,
        dayKey, aggregateDaily, summarize, lastDays, readProgress, readChapterRecords, readWordRecords,
        recordWord, recordChapter, saveProgress,
        dictSourceList, DICT_PIN, activeMs, resolveHotkey, calcWpm, calcAccuracy, shouldStartOnTab, saveSession, readSession, clearSession, sameSession,
        setOpen, getOpen, readDictId, writeDictId, releaseStuckComposer, ACCENTS, resolveAccent, shouldBlockSend, isSendTrigger, shouldClearDraft,
        ICONS, GLYPH, Icon,
        components: { Trainer, ResultScreen, PracticePanel, PanelGlyph, ComposerTrainer, SidebarButton, DictPicker, WrongBookPanel, StatsPanel, SettingsSection, SettingRow, WordListPanel, TipLine },
        tipState, tipKey, nextWrongCount, TIP_THRESHOLDS, TIP_MASK, CLICK_TONES,
        collectWrongWords, heatmapWeeks, heatLevel, filterWrongWords, DICT,
        wordListRows, WORDLIST_LIMIT, WORDLIST_STATES, WORDLIST_STATE_LABEL,
        serializeBackup, parseBackup, BACKUP_VERSION, BACKUP_LIMITS, playClick, pressable,
        topWrongLetters, readMastered, writeMastered, toggleMastered, masteredKey, MASTERED_KEY,
        readCustomDicts, writeCustomDicts, parseCustomWords, saveCustomDict, removeCustomDict,
        customWords, isCustomId, CUSTOM_PREFIX, CUSTOM_LIMIT, dictionaryById, chapterCount,
        exportBackup, importData, clearData, readMirror, writeMirror, MIRROR_KEY,
        keyboardHeat, KEY_ROWS, cacheStats, clearDictCache,
        parseCustomFile, serializeCustomDict, splitCsvLine, toCustomWord, downloadText, withSlashes,
        stepIndex, toWordList, isRoundDone, wordsOfRound, nextChapterIndex, pronunciationSrc, pronunciationType, speakWithTts,
        speak,
      },
      inject: ['slots', 'locale'],
      apply(ctx) {
        PLUGIN_CTX = ctx
        ctx.effect(() => ctx.locale.register(NS, 'zh', DICT.zh))
        ctx.effect(() => ctx.locale.register(NS, 'en', DICT.en))
        ctx.on('locale/change', bumpLocale)

        // 1) 侧栏左上角：和"插件"同一排的面板图标
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
          { name: 'sidebar.panellist', id: COMMAND, order: 5, label: () => '跟打' },
          (props) => h(PanelGlyph, props),
        )))

        // 2) 跟打面板：词库分类 + 大字
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register(
          { name: 'main', key: COMMAND },
          () => h(PracticePanel, { ctx }),
        )))

        // 2) 输入框正上方：跟打条（打字发生在真正的 composer 里）
        // 载入就先擦一遍：旧版本可能把 composer 的输入法属性写死过
        try {
          releaseStuckComposer()
        } catch {
          /* ignore */
        }

        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
          { name: 'conversation.input.dock', id: COMMAND, order: 10 },
          (props) => h(ComposerTrainer, { useInput: props.useInput, inputActions: props.inputActions, ctx }),
        )))

        // 3) 设置页：判定规则与默写形态
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register(
          { name: 'settings.section', id: `${COMMAND}-settings`, order: 25, label: () => '跟打' },
          () => h(SettingsSection),
        )))

        // 4) `/qwerty-autotype` 指令行：同一张卡片
        ctx.effect(() => ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register(
          { name: 'conversation.chat.commandview', key: COMMAND },
          (props) => h(Trainer, {
            words: parseWords(props?.node?.args),
            variant: 'command',
            ctx,
          }),
        )))

      },
    }
  },
})