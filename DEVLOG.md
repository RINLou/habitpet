# 开发日志（DEVLOG）

> 约定：每次开发会话在顶部追加一节。写清楚「改了什么、为什么、怎么验证、遗留什么」，接手的人只看这一份就能续上。

---

## 2026-10-16：v12.2 —— 试玩报告修正（语言逻辑统一 + Boss 数值重标定）

**改了什么**
1. **语言逻辑 94 处统一灵汐术语**：server.js / lib/* / public/app.js / local.js / admin.html 全量「宠物→灵伴」「亲密度→羁绊」「积分→心光」（仅用户可见文案与注释；字段名 c.pet / intimacy 不动）。UMD 重新生成。复跑模拟 langHits=0。
2. **Boss 技能解锁对称性修正**（lib/species.js makeBoss）：v9 赛季 Boss 换皮时把 n1/n2/n3（无 STAB，平均 power45）换成物种技能组且**无视解锁等级**，Boss 恒 STAB1.5 + Lv1 即可随机出 power65/80，输出 +79% → 试玩实测胜率 Lv5-9 仅 18-27%。现按 skill.unlockLv ≤ boss.level 过滤，与孩子同规则。
3. **BOSS_TUNE 网格重标定**（scripts/boss-recalibrate.js 324 组合粗筛 + boss-tune-verify.js 3 候选精比，三 Boss 克制/被克/中性平均、典型孩子 N=300/档）：statPerLevel 0.4 / mulA 0.9 / mulB 1.0 / mulC 1.05 / hpBase 1.15 / hpStep 0.01 / hpCap 1.25。胜率曲线：Lv1-7 66-67%、Lv8-10 44-48%、Lv12-14 53-64%、Lv15-20 41-44%（目标带见脚本头注）。敏感性：mulB±20% → Lv8 胜率 33-67%，是最敏感参数。
4. **基建**：species.js 新增 `setBossTune()`（标定脚本在线调参）；battle.js `startBattle` 新增第 6 参 `bossDefOverride`（注入指定 Boss，标定/未来活动用，向后兼容）。

**为什么**：试玩报告（docs/playtest-report-2026-10-16.md）两项 P1：语言逻辑不一致、Boss 胜率断崖。

**怎么验证**：npm test 408 项全绿；sim-playtest 10 家庭×10 天 0 异常 0 语言命中；boss-recalibrate/boss-tune-verify 明细在 docs/boss-recalibration.json。

**遗留**：APK 内 UMD 资产同步重打；老云（c95fc7cf.link）壮壮家误恢复的 3 娃待删（需家长凭据走 childDelete）。

---

## 2026-10-15（晚）：v12.1 收尾 —— 崩溃修复 + 数据迁移 + APK 云地址注入，全链路交付

接上节 v12 合并版，本次完成上线三件事（commit `f02534b`、`8b7e659`，分支 `merge/lingxi-base` 已推 GitHub）：

1. **启动 30 秒崩溃修复（P0）**：根因 `lib/lingxi_sync.js` 的 `dailyPull()` 首行 `ensureDir()` 同步调用在 try 外，沙盒数据目录异常时抛未捕获异常杀死进程。修复：函数整体 try/catch + `server.js` 定时器改 `Promise.resolve().then(() => dailyPull())` 包装 + `process.on('uncaughtException'/'unhandledRejection')` 兜底。本地模拟只读数据目录 35 秒存活验证；线上部署后 85 秒两次探活正常。
2. **测试 flaky 修复**：adventure-mvp 注册段加 `dailyQuestReward:false`（任务板 4 选 3 有 50% 概率同抽「投喂+探索」凑 2 发 +5 活跃奖污染硬编码断言）。最终全量 408 项断言全绿（295 主套件 + 73 星图 + 19 同步冒烟 + 21 admin）。
3. **数据迁移完成**：新云此前无柚子柠檬部落 → admin 通道三连（config 注入源云凭据 url=https://c95fc7cf...link → pull → apply create:true）。落地：家庭 `fb963ce1054fa`，孩子柠檬(Lv19)/柚子(Lv15)/孩子3(Lv5) 数值齐全，账本 276 条（admin list 核实 ledgerCount=276；登录接口显示 150 是 `ledger.slice(0,150)` 展示截断，非丢数据）。`louyilin2001/xc0tqozr` 新云登录通过，投喂窗口 19-21 等配置保留。
4. **APK runtime-config 注入**：APK 壳是 file:// 无法同源，`assets/www/runtime-config.js` 为空则连不上云。在已签名的 v12 包上用 python zipfile 替换该条目（`HABITPET_API_BASE='https://habitpet.app.workbuddy.host'`）→ zipalign → apksigner 重签（keystore habitpet/habitpet）。仓库 `webview-apk/assets/www/runtime-config.js` 同步写入云地址（public/ 下保持空串勿混淆）。云端 `/apk/habitpet-latest.apk` SHA256 与本地一致校验通过。

遗留：全家换装 v12 稳定运行后，废灵汐旧库（老开发云 c95fc7cf...link 保留作备份源，不急删）。



实施人：小虾米。老板裁决：合并以灵汐版本为主（被全家真实玩过、动画/世界观/温和缺席/Boss 重标定都经校验），把开发线（v7 试用反馈、第四章、v9 玩法深化、v10 管理后台、v11 灵汐同步迁移）移植上去。两条线在 GitHub 上无共同祖先，按文件逐个裁决。

### 裁决规则（冲突时）

- 世界观与玩法机制 → 灵汐为主：灵伴/心光/羁绊用语、温和缺席模式（唤醒免费）、Boss 难度重标定（BOSS_TUNE 分段倍率，防 Lv5+ 必败）、逐帧动画 + player、runtime-config 云地址通道、PWA/sw 缓存清单。
- 工程与运营功能 → 开发线移植：v7（上月月报/账本 after 结余/经验随等级封顶/APK 检测升级）、v8 第四章《说谎的结晶》、v9（Boss 赛季轮换+首杀图鉴+出战 4 选 3+每日任务板+遭遇图鉴+兄妹动态流+五维说明）、v10（admin 路由+admin.html+备份）、v11（lingxi_sync 每日同步+一键迁移+凭据通道）。
- 新移植文案统一改用灵汐术语（心光/羁绊/灵伴）。

### 关键合并点

- species.js：保留 BOSS_TUNE 标定公式，叠加 bossDef 参数 + BOSS_ROSTER + currentBoss（赛季 Boss 数值仍走标定，只换物种皮/技能组）。
- engine.js：缺席/唤醒整块保留灵汐温和版；叠加 monthSummary/月报存档/每日任务板。
- store.js：保留灵汐星图冒险 schema v7-v9 全部清洗；叠加月报字段 + v9 图鉴/出战/任务板字段 + v10 管理函数。
- server.js：灵汐为底 + admin/lingxi/appversion/recover 端点 + .env 加载 + 同步定时器；absenceMode 保留。
- 前端：app.js 灵汐底 + 任务板/动态卡/赛季 Boss/4 选 3/遭遇图鉴/月报/升级条；local.js 灵汐底（runtime-config 云地址）+ v9 离线投影；sw 缓存 hp-v21。
- 测试：test_smoke 采用开发线全量断言，16a 节恢复灵汐温和模式组；adventure-mvp 断言改四章 28 天动态口径；UMD 重新生成。
- 壳：MainActivity 取开发版（含 appInfo/downloadAndInstall 升级桥，灵汐版为其子集）；manifest versionCode 8 / versionName v12；应用名保留「灵汐大陆」。

### 验证

- npm test：295 + 星图 73 + 灵汐同步 19 + admin 21 = 408 断言全绿。
- npm run test:anim：68 断言全绿（动画资产/缓存清单完整）。
- APK：灵汐大陆-v12.apk（15.2MB，185 项动画资产入包），已放 public/apk/habitpet-latest.apk 作升级包。

### 遗留

- 部署后需线上验证 /api/appversion 返回 v12；全家换装 v12 稳定后再废灵汐旧库（每日同步持续镜像中）。

---

## 2026-09-13：三章 21 日主线与试玩就绪整合

实施人：Codex。以 `main` 的温和缺席与 Boss 修复为基线，叠加第一章叙事分支；未部署、未重打 APK、未合入 main，等待集中试玩。

### 已完成

- 主线扩展为三章、每章七日：第一章《熄灭的七盏灵灯》、第二章《月影回廊的回声》、第三章《星海归航》。
- 完成一章后由孩子主动点亮下一章；已完成章节仍可回访，且同日不能借切章多探索一次。
- 章节选择、星历、结语与相册按章节永久保存；`SCHEMA_VERSION` 升至 9，旧第一章存档自动迁移。
- 主线选择、章节切换与回访全部不改 XP、亲密度、战斗、账本或家庭奖励。
- `npm run test:anim` 改为自动启动随机端口的隔离服务，不再依赖本机 3000 服务；PWA 静态资源缓存升级 `hp-v19`。

### 验证

- `npm test`：主回归 **225 通过 / 0 失败**；星图回归新增三章 21 日推进、三次结语、切章边界、终章封顶及数值红线，共 **60 通过 / 0 失败**。
- `npm run test:anim`：**68 通过 / 0 失败**，使用独立服务启动器。

### 试玩范围

- 本次试玩先从第一章开始；可在每章毕业后的下一天点击“点亮下一章”继续。
- 试玩确认前不部署、不打 APK、不合 main。

---

## 2026-09-08：第一章《熄灭的七盏灵灯》叙事 MVP

实施人：Codex。基线为品牌与逐帧动画批次；本批只补连续故事、选择收藏与离线一致性，不动经验、亲密度、战斗、家庭奖励或商业化开关。

### 已完成

- 七日星图改为连续主线：每一日有短剧情、旧星历线索和无优劣选择；D7 提供三种章节结语。
- 八只普通灵伴均有“初见—分歧—确认”关系节点，焰狼不再是唯一有角色弧线的灵伴。
- 选择、星历、灵伴来信、结语和回访记录均持久化；`SCHEMA_VERSION` 升至 8，旧存档自动补齐字段。
- 本地优先投影与 Service Worker 统一为新章节，静态资源缓存升至 `hp-v18`，避免离线投喂后被旧星图覆盖。

### 验证

- `npm test`：**219 通过 / 0 失败**；包含伪造选择拦截、选择持久化、八只灵伴关系线、数值红线、旧存档迁移和本地缓存投影。
- `npm run test:anim`：**68 通过 / 0 失败**。
- Edge 360px：完成“投喂 → D1 二选一 → 反馈 → 旧星历/灵伴来信相册”实机流程，无横向溢出。

### 遗留

- 仍未重打 APK 或部署；`webview-apk/assets/www/` 是打包副本，试玩确认后再同步。
- 本章以现有 2D 逐帧资源承接；逐节点剧情演出和第二章内容留给下一批。

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

## 2026-10-16（下午）：壮壮家误恢复回滚 + 数据重置根因修复
- 事故：老板在老开发云误将柚子快照 apply 进壮壮家（f137a9525f46f/180907），多了柠檬/柚子/孩子3 + 276 条柚子账本。applyMigration 合并永不删除，无法逆向。
- 回滚路径：老云无 restore、pull 源锁死 LINGXI_URL → 改用「干净备份（10-16 00:57，误操作前状态，壮壮数值与线上一致零损失）→ 拼装 DB 种子（柚子家+壮壮家，families 必须为 dict 按 id 键）→ 随部署上云 → 老云污染家庭 admin/delete」。壮壮家新密码 zhuangzhuang2026 / PIN 1234（原密码 PIN 无人知晓，admin setpassword 端点在）。
- **数据重置根因破案**：本地 `data/habitpet.json`（49 个 9-06 测试家庭，schema 6）随部署目录上传覆盖云端 DB！.env 不在本地却能存活 = 部署是「合并覆盖不删除」。修复：本地 data/ 已清空（种子存 docs/db-seeds/，已 gitignore），今后部署=纯代码，云端运行时数据持久。**教训：部署前如需换数据，把 DB 种子放回 data/habitpet.json 再部署。**
- 附带收获：云端 49 个垃圾测试家庭一并清除，现仅 2 个真实家庭（柚子柠檬部落 f56ca89a0b03a 276账本/3娃 + 壮壮的成长故事 1娃）。
- 坑：①本会话部署工具把所有 deploy 绑定到同一 app/sandbox（domainPrefix 无效，第二个应用部署不了——曾把主应用覆盖成中转服务，立即重部署 habitpet 恢复）；②沙盒 `&` 后台进程会被回收，必须 run_in_background；③/admin/family 参数是 familyId 不是 id。
