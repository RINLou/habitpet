# 开发日志（DEVLOG）

> 约定：每次开发会话在顶部追加一节。写清楚「改了什么、为什么、怎么验证、遗留什么」，接手的人只看这一份就能续上。

---

## 2026-09-06 会话 3：P1 修正单执行（契约冻结 + P0×2 + P1×3 + 6 组新测试 + CI）

实施人：小虾米（WorkBuddy/GLM）。依据 Codex《workbuddy-p1-correction-plan.md》逐条执行；从基线 `06e0c44`（= `origin/codex/p0-habit-experience`）新建分支 `codex/p1-correction-review`，小步提交，未 force 任何现有分支。

> **语义勘误（以下节为准，覆盖下方会话 2 的旧描述）**：状态枚举以 `not_started | active | completed | expired` 为准（会话 2 写的 `idle` 已废弃）；`dismiss` 仅限 `not_started` 状态可用（active 时 dismiss 返回 409，并不存在"写 lastDismissedOn 回 idle"路径）；回归 gapKey 由服务端用 `previousLastSeenAt`（覆盖前的 lastSeenAt）生成，不是"孩子 id+日期"；确认幂等由 pendingGapKey 机制保证（见下）。权威契约：`docs/ONBOARDING_CONTRACT.md`。

### 提交链

- `ff8283e` 回归弹层在饿晕时 3.5s 自动淡出（不遮复活 CTA）
- `06719ce` 契约文档 `docs/ONBOARDING_CONTRACT.md`：状态机/枚举/409 语义/分数红线/pending ack 三重校验/保存顺序铁律/schema v6
- `7591a77` **P0 保存顺序**：全部路由改为「业务变更 → childMe() → store.save() → 返回」；P1 端点用 `saveNow()`（`save()` 是 150ms 防抖，响应后立即重启会丢数据）
- `453ac4e` **P0 pendingGapKey（schema v6）**：服务端决定展示回归提示时持久化 `pendingGapKey = previousLastSeenAt`；ack 三重校验（`key === pendingGapKey && lastShownForGap !== key && gapDays >= 3`）；成功后 `lastShownForGap = key`、`pendingGapKey = null`；新 gap 自动替换旧 pending（旧 key 永不吞新提示）；migration 补 `pendingGapKey` + 显式 `idle → not_started` 映射
- `8127983` **P1 local.js 本地投影**：`updateFromState` 缓存 `childStates[childId]` 的 onboarding/returnNudge 云端视图 + `S.lastState` 完整视图；`bootChild` 无 family 快照时回退 `lastState`（离线不丢计划卡）；补 `onboardingLocalView`/`obDayDiff`（server `onboardingView` 的本地复刻，惰性滚转只做视图级镜像、不落库，滚转永远由云端权威完成）
- `2fc83cd` **P1 测试可复现**：`scripts/run-tests.js` 启动器（临时数据目录 `HABITPET_DATA_DIR` + 主服务/worker 双随机端口 + 等 ready + 无论成败清理）；`.github/workflows/ci.yml`（push/PR 矩阵 Node 18/20，无 secrets）；`scripts/accept-360.js`（360px 浏览器验收三段式 setup/fixture/browser，手动运行不进 CI）
- `ffac216` 修正单要求的 6 组新测试（落点见下）

### 6 组新测试 → 落点

1. **端点调用后立刻重启持久化** → worker `persist` 相位：每个 P1 端点响应后立即 `fs.readFileSync(DB_FILE)` 断言磁盘内容（start 的 active+startedOn、complete 的 completedOn、ack 的 lastShownForGap+清 pending、回归展示即持久化 pending）
2. **旧/重复/跨设备延迟 key 全拒** → worker `oldkey` 相位（新 gap 替换旧 pending 后，延迟到达的旧 key ack 409、当前 key 200）+ 原有 staleAck409/badKey409/ack-幂等断言
3. **pending 重启后仍可确认** → worker `pendgap` → `pendack` 跨进程（进程边界 = 服务重启）：pending 落盘退出后，新进程对同一 key ack 成功且 ack 粘滞
4. **本地缓存含 onboarding/returnNudge、离线重启不丢计划卡** → `test_local_cache.js`（LSDB stub + 真 species/engine 模块 + fetch 全抛 = 永远离线）：updateFromState 缓存视图、lastState 落盘、无 family 快照回退 lastState、缓存视图优先于 raw 投影；另有浏览器级验收（在线建立计划 → 断网刷新/重启浏览器计划卡保留 → 恢复网络与服务端对齐，全部通过）
5. **migration 兼容 + idle 映射** → 冒烟第 16 节：注入 `status:'idle'` + 缺 `pendingGapKey` 的遗留数据 → migrate → 断言映射为 `not_started` 且 `pendingGapKey === null`
6. **红线回归** → 原 day7 断言 + `persist` 相位全流程（start/complete/dismiss/me/ack）后 intimacy/XP/feedStreak/ledger 零变化

### 测试基础设施修复（执行中发现的真问题）

- `HABITPET_NO_TIMER=1`（启动器注入，server.js 测试模式关闭 60s 定时器）：主服务定时器会整库 saveNow **内存旧状态**，与共享数据文件的 worker 子进程互相覆盖；且两进程并发写 `DB_TMP` 在 Windows 上 rename EPERM → 定时器回调未捕获异常崩掉主服务。生产单进程不受影响，默认行为不变。
- `test_smoke.js` 的 `api()` 网络错误重试 3 次：P1 worker 段约 60s 无主服务流量后，undici 复用被服务端 keepalive 超时关闭的 socket 会 ECONNRESET；重试走新连接。
- 环境陷阱备忘：本机 git loose refs 会被吞 → 提交走 write-tree/commit-tree/packed-refs 管道；packed-refs 行必须带 `refs/heads/` 全前缀且文件以换行结尾。

### 验证

- `npm test` 干净环境连续两遍：**218 通过 / 0 失败**，无残留进程、无临时目录残留
- 浏览器冒烟（360px 视口，与 scripts/accept-360.js 同款断言）：过期温和重开 9/9、饿晕+回归共存 5/5
- 离线缓存验收：onlineCard / offlineCardKept / offlineStateOk / offlineNoFakeSuccess / backOnlineAligned 全 true
- CI：GitHub Actions 首跑已确认（commit `989a366`，push 与 pull_request 两条 run、Node 18/20 矩阵全部 **success**）

### 遗留

- `webview-apk/assets/www/lib/local.js` 为打包副本，下次出包时随 public/ 同步

---

实施人：小虾米（WorkBuddy/GLM）。接手自 Codex 的 P0 交接（4f947b3 → f086ef6，验收通过：168 冒烟全绿，v10.3 的 targetSdk=33 修复未丢失）。

### 分支状态

- 分支 `codex/p0-habit-experience`，3 个 commit：
  - `4f947b3` P0-child-parent-photo（Codex，归档快照基线之上的孩子/家长照片流程）
  - `f086ef6` P0-photo-auth-android-privacy（Codex，照片改 Authorization Bearer 拉 Blob + Android 隐私加固）
  - `38ffd6d` P1-onboarding-return-nudge（本次新增）
- 已 force push 到 `origin`（2026-09-06 晚）。push 前远端该分支不存在（Codex 只建了本地分支未上传）。

### 本次改动明细（commit 38ffd6d）

**lib/store.js**
- `SCHEMA_VERSION` 4 → 5。
- migrate 幂等补每个孩子的 `onboarding`（status 'idle'|'active'|'completed'|'expired'、planId、startedOn、completedOn、completedAt、finishedOn、lastDismissedOn、history[]）与 `returnNudge.lastShownForGap`。
- 坏数据校验：日期字段非 YYYY-MM-DD 的过滤去重；未知 planId 重置为 idle；history 截最近 3 条。

**server.js**
- 新增纯函数 `onboardingView(child, today)`（展开视图：status/planId/startedOn/dayIndex/finishedOn/history/lastDismissedOn）和 `rollOnboardingIfDue(child, today)`（active 且超期 → expired；completed 后第二天起重置回 idle，允许再次开始）。
- `childMe()` 咽喉处做了**惰性兜底初始化**——重要：运行时 `store.addChild` 建的孩子不走 migrate，缺 onboarding 字段会导致 childMe 崩，已在 childMe 入口兜底补齐。以后给 child 加新字段，兜底也要同步加。
- `childMe()` 返回体新增 `onboarding`（展开视图）与 `returnNudge`（gapDays 由 `previousLastSeenAt` 与 now 计算；仅当 gapDays>=3 且当日未展示过才 show=true；gapKey=孩子 id+日期）。注意 lastSeenAt 的覆盖点在 childMe 内部，gap 计算必须在其覆盖前读旧值。
- 新增 4 个 CHILD 端点（全部先 roll 再返回 `{ok:true,state:childMe}`，日期/幂等全服务端裁决）：
  - `POST /api/onboarding/start`（仅 idle/expired 可开始；active 重复 start 原样返回幂等；history 最多 3 条）
  - `POST /api/onboarding/complete`（仅 active；当天重复 complete 幂等不记重复；完成日 finishedOn=当天）
  - `POST /api/onboarding/dismiss`（active 可放弃，写 lastDismissedOn 并回 idle）
  - `POST /api/return-nudge/ack`（按 gapKey 幂等；旧 gapKey 返回 409）
- **红线：计划不发积分、不加经验、不写 ledger、不动 feedStreak**（测试有断言盯着）。

**public/app.js + public/style.css**
- `childPetTab()`：在今日冒险主 CTA 之后、today-pending 之前插入次级计划卡 `.onboarding-card`（idle 显示"开始 7 天小计划"入口；active 显示第 N/7 天 + 七格进度；completed 显示温和完成语）。不抢投喂主 CTA。
- `ONBOARDING_PLANS` 常量 3 选 1（读 5 分钟 / 散步 10 分钟 / 收拾小角落），`openOnboardingPicker()` 复用现有 `openModal`。
- `startOnboarding/completeOnboarding/dismissOnboarding` 走现有 `api()`，成功后 `refreshMe()` 重渲染。
- 回归提示 `maybeShowReturnNudge()`：boot 与 refreshMe 后调用；同一会话 sessionStorage 防重；展示过即调 ack；local.js 未动（LocalRT.dispatch 对未知路由返回 null 走网络，符合预期）。
- style.css 仅新增 `.onboarding-card` 系局部样式（卡片/七格/次级按钮），未动全局。

**test_smoke.js / test_p1_worker.js**
- 原 schema 断言 v4 → v5；新增第 18 节 P1 用例，覆盖规格全部 6 组验收：
  - 迁移后字段齐全且幂等；
  - start 非法 planId/重复 start/重开 + history≤3；
  - 当天 complete 幂等；
  - 第 7 天完成 status=completed 且**亲密度/XP/ledger/feedStreak 全不变**（红线）；
  - 第 8 天 roll → expired；漏日不可补卡；
  - returnNudge：3 天触发 / ack 幂等 / 旧 gapKey 409；child token 仅本人可见；parent token 401；服务重启后状态持久。
- `test_p1_worker.js` 是**子进程"时间旅行"worker**：猴补丁 `engine.dateKey` 和 `Date.prototype.toISOString`（新鲜度窗口 300ms，勿放大，否则 returnNudge 的"当日已展示"判定会误伤）。用 `P1_PORT`/`P1_OFFSET`/phase(day1|day7|nudge) 驱动，输出 `P1RESULT {json}`。
- **测试结果：195 通过 / 0 失败**（PORT=3400 HABITPET_NO_RANDOM=1 BASE_URL=http://127.0.0.1:3400）。另做了真浏览器冒烟（360px 视口：计划卡渲染、弹窗可选、连点幂等、刷新不丢、无横向溢出）。

### 环境备忘（这台机器特有，接手必读）

1. **本工作目录的 .git 会"吃"loose refs**：写 `refs/heads/...` 后会被环境回滚吞掉（packed-refs 不受影响）。如果发现分支丢失：`git write-tree` + `git commit-tree -p <parent>` 建提交，再写 `.git/packed-refs`（格式 `<sha> refs/heads/codex/p0-habit-experience`）恢复。
2. **完整备份副本**（含 .git 全部对象）：`C:\Users\Administrator\WorkBuddy\2026-09-04-22-41-49\habitpet-git-backup\habitpet`（同内容，commit f400334 与 38ffd6d 等价）。
3. **GitHub push 需要"锁 IP 直连"**：本机对 github.com 直连/走系统代理都会失败（DNS 污染 + 代理 502），但指定 IP 可通：
   ```
   git -c http.curloptResolve="github.com:443:140.82.121.4" -c http.proxy= -c https.proxy= push --force origin codex/p0-habit-experience
   ```
   失效就换 IP（140.82.112.3 / 20.205.243.166 也验证可用）。
4. **3400 端口曾驻留旧代码测试服务器**，其 60 秒定时落盘会用旧 schema 覆盖数据文件——跑测试前先 `netstat -ano | grep :3400` 确认没有僵尸进程。数据目录在 `data/`（已 gitignore）。

### 下一步建议

- 远端 main 与本分支无祖先关系（归档初始化），合并走 PR：https://github.com/RINLou/habitpet/pull/new/codex/p0-habit-experience
- P1 前端回归提示的文案可按 WORLDVIEW.md 的语调再润一遍（当前是保守措辞）。
- 历史遗留："观感修"清单（登录按钮宽扁比、登录卡片收窄、登录页底部空白）在 v10.3 根治屏幕兼容模式后待重新评估。
