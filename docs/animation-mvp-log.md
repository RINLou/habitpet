# 焰狼 2D 动画 MVP 工作日志

> 计划来源：`D:/Documents/ChatGPT/灵汐大陆/.work-buddy/plan.json`
> 计划 ID：`habitpet-animation-mvp-20260907-7f3b2d`（已 completed）
> 修正计划 ID：`habitpet-animation-mvp-review-fix-20260907-93ac41`
> 执行端：WorkBuddy（小虾米）
> 时间：2026-09-07

## 一、仓库状态（基线与交付）

- **代码仓库**：`C:/Users/Administrator/WorkBuddy/宠物app/habitpet`

### 执行前基线（baseline）
- 分支：`main` @ `bf6f9ee`（v10.3 正式版），工作区干净
- 分支列表：本地 `main`、`rinlou-refactored-engine`；远端 `origin/main`

### 执行后交付（delivered）
- 分支：`feat/firam-anim-mvp`（自 main@bf6f9ee 切出）
- 提交：`6cd0a69`（动画 MVP 全部改动）
- `main` 未被修改；战斗系统、地图系统、P0/P1 持久化逻辑零改动（本修正计划批次亦不触碰）

## 二、焰狼参考图

- **文件**：`public/img/firam.webp`
- **内容**：三段进化图拼在一张 WebP 中
  - 左：幼体「小焰」
  - 中：成体「焰狼」
  - 右：觉醒「炎狱狼王」
- **物种 ID**：`firam`
- **物种名**：焰狼·弗拉姆
- **现有裁切逻辑**：`public/app.js` 中 `STAGE_POS = { juvenile:0, adult:1, awaken:2 }`，`petArtById()` 通过 `margin-left: -100% / -200%` 裁出对应阶段。

## 三、三个目标页面入口（执行前现状）

| 页面 | 函数 | 位置 | 执行前实现 |
|---|---|---|---|
| 今日冒险（主页面） | `renderChild()` → `childPetTab()` | `public/app.js` | 静态 `firam.webp` 裁切图 + `.idle` CSS 浮动动画 |
| 投喂成功 | `doFeed()` | `public/app.js` | 成功只弹 toast；若触发 `feedEvent` 则走 `showFx` 用 `img/reward.webp` |
| 升级提示 | `celebratePet()` | `public/app.js` | 阶段变化走 `showFx`（觉醒/进化）；普通升级只弹 `lvlBurst` + 音效 |
| 回归提示 | 无 | — | 执行前不存在，本批新增轻量 `localStorage` 最后访问检测 |

## 四、执行前动画实现

- **方式**：纯 CSS（`style.css` `@keyframes petIdle`，整张静态图上下浮动）
- **问题**：没有逐帧动作。

## 五、构建 / 测试 / 部署

- **启动**：`npm start` → `node server.js`
- **测试**：`npm test` → `node test_smoke.js`
- **构建**：无构建步骤（纯 Node + 静态前端）
- **部署**：`bash deploy/deploy.sh`（仅服务端部署脚本）
- **PWA 缓存**：`public/sw.js` 维护 `ASSETS` 硬编码清单；本批已升级 `?v=10` → `?v=11` 并纳入动画资源。

## 六、素材生成方案

- Codex 原技能 `generate2dsprite` 使用其内置 `image_gen` 生成带 `#FF00FF` 洋红底的原始精灵图，再由 Python 脚本做抠图/裁切/对齐/QC。
- WorkBuddy 端等价方案：使用 **ImageGen 工具**生成原始动作图（逐帧或整版），复用 `C:/Users/Administrator/.codex/skills/generate2dsprite/scripts/` 下的 Python 处理器做后期/QC，或自行编写等效 Pillow/NumPy 流水线。
- 计划动作：idle、happy、eat、tired、levelUp。
- 输出目录：`public/anim/firam/`。

## 七、动画资源契约（step-2 产出）

- **契约文件**：`public/anim/firam/contract.json`
- **输出目录**：`public/anim/firam/{idle,happy,eat,tired,levelUp}/`
- **规范摘要**：
  - idle/happy/eat/tired：4 帧、2×2 网格；levelUp：6 帧、2×3 网格
  - 单元尺寸：sourceCell 512×512（生成/QC 用）；运行时帧已缩放为 256×256（runtimeCell，见 contract.json `dimensions`）
  - canonicalStage：`adult`（动画仅对成体焰狼挂载；幼体/觉醒保持静态 WebP）
  - anchor：bottom-center
  - fallback：`/img/firam.webp` 静态 WebP；`prefers-reduced-motion`、低性能设备、加载失败均降级为静态
- **事件映射**：
  - 今日冒险 idle → `idle`
  - 投喂成功 → `eat` → `happy` → 回到 `idle`
  - 升级提示 → `levelUp` → 回到 `idle`
  - 回归提示 → `tired`（3 秒）→ 回到 `idle`

## 八、素材生成与 QC（step-3 产出）

- **生成方式**：5 张动作整版由 ImageGen 图生图生成（参考 `firam-adult.png`，即 `firam.webp` 中段成体裁切），再用自定义脚本把背景强制替换为纯 #FF00FF，最后跑 `generate2dsprite.py process` 切分/对齐/QC。
- **每动作包含**：`raw-sheet.png`、`sheet-transparent.png`、`frame-0.png` .. `frame-N.png`、`animation.gif`、`pipeline-meta.json`
- **QC 报告**：`public/anim/firam/qc_report.json` —— 全部 5 动作通过 strict QC，无空帧、无 paste_clamped。
- **关键指标**：
  - idle：body_scale_cv 0.0015 / anchor_y_std 0.0014
  - happy：body_scale_cv 0.0013（source edge touch 为火焰尖，已允许）
  - eat：body_scale_cv 0.031（低头进食导致，可接受）
  - tired：body_scale_cv 0.0017
  - levelUp：body_scale_cv 0.034（姿态变化大，可接受）
- **缺失重试**：happy 初次生成与 tired 文件名冲突被覆盖，已补生成一次。
- **归档说明**（修正计划 step-4）：raw-sheet / clean-sheet / GIF / 参考图已移至 `docs/animation-assets-archive/firam/`（非运行时路径），`public/anim/firam/` 仅保留运行时必需资源，详见第十章。

## 九、变更清单（首版 MVP，已全部执行）

1. ✅ 生成 5 套焰狼动画资源（raw-sheet、transparent-sheet、逐帧 PNG、GIF 预览、meta）。
2. ✅ 新增 `public/anim/firam/` 资源目录（22 个帧 PNG + contract.json + QC 报告）。
3. ✅ 新增播放器 `public/anim/player.js`（契约驱动、事件驱动、三道降级）。
4. ✅ 接入 `childPetTab()`（idle）、`doFeed()`（eat→happy）、`celebratePet()`（levelUp）、启动流程（return/tired）。
5. ✅ 更新 `public/sw.js` 缓存清单（`CACHE` 与全部 `?v=` 升到 `v11`，新增 anim 资源）。
6. ✅ 创建特性分支 `feat/firam-anim-mvp` 并提交（`6cd0a69`），`npm test` 通过（165/0）。
7. ✅ 回写 `.work-buddy/result.json` 为 completed。

## 十、实现细节（step-4 / step-5，含修正计划更新）

### 播放器 `public/anim/player.js`
- 自执行模块，挂载到 `window.PetAnim`，对外 API：`ready()`（加载契约）、`scan(root)`（挂载 + 冲刷挂起事件）、`queueEvent(target, event)`（业务抛事件）、`canAnimate(sid)`、`isEnabled()`。
- 内部状态：`contract`、`imgCache`、`pending`（target→挂起事件队列，按契约 priority 确定性调度）、单一全局 `currentTimer`。
- 播放原语：`startLoop` / `playOnce` / `playEvent`（按契约 events 解析 sequence / loop + maxDurationMs，结束 autoReturnToIdle）。
- **阶段保护（修正计划 step-2）**：仅在 `data-stage === contract.canonicalStage`（adult）时挂载精灵动画；幼体（juvenile）/ 觉醒（awaken）/ 非 firam 种族 / 昏迷态一律保持原静态 WebP。
- 三道降级（任一触发即保留原静态 WebP，不动页面核心操作）：
  1. `prefers-reduced-motion: reduce`
  2. 低性能（`hardwareConcurrency ≤ 2` 或 `deviceMemory ≤ 2`）
  3. 精灵帧 `onerror` 加载失败（含已挂载后单帧失败：恢复静态图并标记动作不可用）

### 接入点（`public/app.js`）
- 新增 `petArtHero(p, fainted)`：渲染 `.pet-art.idle[data-anim="hero"]`，内部自带静态 WebP 降级图（断网/低性能直接显示它）。
- `boot()`：`if (window.PetAnim) PetAnim.ready();` 提前拉契约。
- `renderChild()` 末尾：`checkReturnEvent()` + `PetAnim.scan(#tabbody)`。
  - `checkReturnEvent()`：用 `localStorage('hp_last_visit')` 检测距上次打开 > 24h 且宠物在线 → 抛 `return` 事件（仅首屏触发一次，绝不阻塞任何确认）。
- `childPetTab()`：hero 改由 `petArtHero()` 渲染。
- `doFeed()`：`feedEvent` 分支不变；普通投喂成功 `queueEvent('hero','feed_success')`（优先级低于 level_up）。
- `celebratePet()`：普通升级分支改为「firam 成体且 enabled 时 `queueEvent('hero','level_up')`，否则回退 `lvlBurst` 文字」，保留 `Sfx.levelup()`。

### 样式 `public/style.css`
- 新增 `.pet-art .pa-sprite { width:100%;height:100%;object-fit:contain;object-position:bottom center }`，覆盖 `.pet-art img` 的 300% 裁切。
- 新增 `.pet-art.idle img.pa-sprite { animation:none }`，避免精灵帧被 idle CSS 浮动动画干扰。

### PWA `public/sw.js`
- `CACHE` 与全部 `?v=` 由 `v10` → `v11`；`ASSETS` 新增 `anim/player.js?v=11`、`anim/firam/contract.json` 及 5 动作共 22 张帧 PNG（离线兜底）。

### 素材归档（修正计划 step-4）
- 运行时 `public/anim/firam/` 仅保留：`contract.json`、`qc_report.json`、`assets-manifest.json`、各动作 `frame-*.png`。
- raw-sheet / clean sheet / transparent sheet / GIF / 参考图 / pipeline-meta 移至 `docs/animation-assets-archive/firam/`（不进部署包，不删唯一原始素材，保留可追溯路径）。

## 十一、验证结果

### 首版 MVP（6cd0a69）
- `node --check`：`player.js` / `app.js` / `sw.js` 语法均通过。
- 22 张帧 PNG 全部存在且非空；server 实测关键资源均 200。
- `npm test`（`test_smoke.js`）：**165 通过 / 0 失败**，无回归。
- 无头集成校验：`level_up`、`feed_success`、`return` 三事件播放后均回 idle，无异常。

### 修正批次（review-fix，本批）
- `node --check`：`player.js` / `app.js` / `tests/anim-mvp.test.js` 语法通过；`contract.json` / `package.json` JSON 解析通过。
- **新增回归测试** `tests/anim-mvp.test.js`（`npm run test:anim`）：**47 通过 / 0 失败**，覆盖：
  - 阶段保护：juvenile / awaken / 非 firam 不挂载精灵，adult 挂载且原 WebP 保留可恢复；`canAnimate(sid, stage)` 四种组合断言
  - 尺寸契约：`sourceCell=512` / `runtimeCell=256`，实际帧 PNG IHDR 与 runtimeCell 一致
  - 事件优先级：feed(10) 抢占 idle(0)、level_up(20) 抢占 feed(10)、低优先级排队且按优先级保留最高者、播完回 idle、pending 冲刷
  - 首载竞态：契约未就绪时 `queueEvent('hero','level_up')` 入 pending 不丢失，挂载后冲刷播放
  - 失败降级：eat 帧 404 → 恢复原静态 WebP、会话级禁用、无残留定时器、后续事件保持静态
  - 降级开关：`prefers-reduced-motion` / 低核数低内存（2核2G）不挂载，`isEnabled()=false`
  - 定时器：全程活跃 interval ≤ 1，无泄漏
  - SW 离线：`sw.js` ASSETS 38 项逐一 HTTP 200，anim 资源 24 项纳入
- `npm test`（test_smoke.js）：**165 通过 / 0 失败**，无回归。
- 360px 视口说明：精灵帧经 `.pa-sprite { object-fit: contain; object-position: bottom center }` 自适应容器，无固定像素尺寸；页面骨架未改动，360px 适配由既有响应式布局承载（CSS 静态断言 + 冒烟覆盖；真实浏览器走查建议试玩时确认）。
- 已知限制：动画素材仅成体形态（幼体/觉醒按契约保持静态 WebP，为有意设计）；AI 生成存在随机性，重跑生成需按 `docs/animation-assets-archive/firam/assets-manifest.json` 重录哈希。

### 修正批次变更清单（review-fix 提交）
1. ✅ `docs/animation-mvp-log.md`：基线/交付状态拆分、章节顺序修正（step-1）。
2. ✅ `public/anim/firam/contract.json`：`baseCell` → `sourceCell` + `runtimeCell`；`format` 反映归档路径（step-2）。
3. ✅ `public/anim/player.js`：阶段保护闸门 + 事件优先级队列 + 首载竞态 pending + 失败恢复静态 + playGen 定时器安全（step-2/3）。
4. ✅ `public/app.js`：`celebratePet` 的 `canAnimate` 调用传入 `stageKey`（step-2）。
5. ✅ `tests/anim-mvp.test.js` 新增 + `package.json` `test:anim` 脚本（step-2/3/5）。
6. ✅ 素材归档：`public/anim/firam/` 22MB → 1.3MB（仅帧+契约），raw/GIF/参考图/元数据移至 `docs/animation-assets-archive/firam/`，新增 `assets-manifest.json` 哈希清单（step-4）。

## 十二、回滚说明
- 全部改动落在新增文件（`public/anim/player.js`、`public/anim/firam/*`、`docs/animation-*`）与前端展示层（`index.html`、`app.js`、`style.css`、`sw.js`），**未触碰** 战斗系统、地图系统、P0/P1 持久化逻辑。
- 若需回滚：改动在未合并的特性分支 `feat/firam-anim-mvp`，直接 `git checkout main` 或删分支即可；主视觉仍由 `firam.webp` 静态图兜底，播放器任意失败都自动降级为原静态图，不影响核心玩法。
