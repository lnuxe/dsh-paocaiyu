# 多 agent 并行开发流程

> 从 v0.6.0 起，每个版本的功能缺口都用「多个子 agent 各开一个分支并行做、主 agent 逐个合并」的方式推。
> 这份文档是那套流程的操作手册，也是踩过的坑的清单。

## 1. 为什么这么做

`client.js` 是单文件（37 万字节 / 约 9,000 行），多个 agent 直接改同一个工作区会互相踩。
所以每个子任务一个 `git worktree` + 一个分支，物理隔离；主 agent 只做合并、验证、发版。

## 2. 开工

```bash
# 每个子任务一条分支 + 一个独立工作树（放在 /tmp，不污染仓库目录）
git worktree add -q -b feat/<name> /tmp/qat-wt/<name> main
```

给子 agent 的 brief 必须写全这六项，否则它会自己发明设计：

1. **目标**：要补的具体缺口（能落到函数名/class 名最好）
2. **边界**：只改自己工作树的哪几个文件；不许动 `CHANGELOG` / `package.json` / 版本号
3. **口径**：纯函数优先、断言条数下限、`node --check` + `node test-client-logic.mjs` 必须绿
4. **数据**：要用的真实样本（真实 id、真实词条），别用占位
5. **冲突预判**：预计会碰到的共享区域（`Styles` CSS 区、`__test` 导出块、两份 `DICT` 字典、锚点相同的测试段）
6. **署名**：`GIT_AUTHOR_NAME=lnuxe` 等四个环境变量，禁 `Co-authored-by`

## 3. 收工

子 agent 交回来时必须带：分支名、commit sha、改动行数、测试条数变化、`client.js` 字节数、
**冲突清单（具体到函数/行号）**、以及**和任务描述有偏差的设计决定**。

偏差那一条最容易漏，也最容易出问题 —— 例：v0.7.0 里 `us`/`uk` 只在各自 phone 字段存在时才填，
不能把合并过的 `ipa` 灌进 `us`，否则会给 `route /ruːt/` 打上假的美音前缀。

## 4. 合并

```bash
git merge --no-ff -m "merge: feat/<name>（一句话说清）" feat/<name>
```

**冲突一律按并集**：两边都是新功能，谁都不该被丢。并集之后必须再读一遍合并结果，因为
「并集」经常把语义拼坏，而不是把代码拼坏。v0.7.0 实测到的三类：

| 症状 | 例子 | 修法 |
| --- | --- | --- |
| 括号/花括号被并集吃掉 | d0 与 d2 的测试段插在同一锚点，d0 那段的 `}` 掉了 | 补回来，跑 `node --check` |
| 两份实现并存，语义退化 | `lookup` 一边是 WeakMap 索引、一边是 `hitOf` 整形 | 保留索引实现，把整形接进去 |
| CSS 互相抢 | d1 的 `[data-long]` 写死 `font-size`，d2 用 inline style 算字号 | 删掉抢的那几条，只留互补属性（行距/字距） |

## 5. 验证门槛

合并完、发版前，这三条都要过：

```bash
npm run verify                                  # node --check + 995 条断言
node scripts/audit-dicts.mjs --upstream <dir>   # 词库丢词率没退
git worktree list                               # 只剩主工作树
```

## 6. 收尾

```bash
git worktree remove --force /tmp/qat-wt/<name>    # 逐个删
git branch --merged main | grep -v main | xargs -r git branch -d
```

版本号：新增 Slot/交互 → minor；修判定/样式 → patch；改 Slot id / exports / props → `0.x` minor + BREAKING。

## 7. 并行写同一个仓库的风险

同一个仓库被**两个 session 同时提交**时，会出现「一条不认识但署名正确的 commit」。
处理办法：`git fetch` 后先看 `origin/main` 落后多少，读一眼那些 commit 的内容，能合就合、
有问题就先 stash 自己的改动。**每次 `git commit` 前先 `git status`**，不要盲信自己的上下文。
