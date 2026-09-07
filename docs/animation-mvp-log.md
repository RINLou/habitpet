# 焰狼 2D 动画 MVP 工作日志

> 计划来源：`D:/Documents/ChatGPT/灵汐大陆/.work-buddy/plan.json`
> 计划 ID：`habitpet-animation-mvp-20260907-7f3b2d`
> 执行端：WorkBuddy（小虾米）
> 时间：2026-09-07

## 一、仓库状态

- **代码仓库**：`C:/Users/Administrator/WorkBuddy/宠物app/habitpet`
- **当前分支**：`main`
- **当前 HEAD**：`bf6f9ee`（v10.3 正式版）
- **工作区状态**：干净，无未提交改动
- **已有分支**：本地 `main`、`rinlou-refactored-engine`；远端 `origin/main`

## 二、焰狼参考图

- **文件**：`public/img/firam.webp`
- **内容**：三段进化图拼在一张 WebP 中
  - 左：幼体「小焰」
  - 中：成体「焰狼」
  - 右：觉醒「炎狱狼王」
- **物种 ID**：`firam`
- **物种名**：焰狼·弗拉姆
- **现有裁切逻辑**：`public/app.js` 中 `STAGE_POS = { juvenile:0, adult:1, awaken:2 }`，`petArtById()` 通过 `margin-left: -100% / -200%` 裁出对应阶段。

## 三、三个目标页面入口

| 页面 | 函数 | 文件位置 | 当前实现 |
|---|---|---|---|
| 今日冒险（主页面） | `renderChild()` → `childPetTab()` | `public/app.js:426`、`public/app.js:518` | 静态 `firam.webp` 裁切图 + `.idle` CSS 浮动动画 |
| 投喂成功 | `doFeed()` | `public/app.js:587` | 成功只弹 toast；若触发 `feedEvent` 则走 `showFx` 用 `img/reward.webp` |
| 升级提示 | `celebratePet()` | `public/app.js:405` | 阶段变化走 `showFx`（觉醒/进化）；普通升级只弹 `lvlBurst` + 音效 |
| 回归提示 | 无 | — | **当前不存在**，需在启动流程加轻量 `localStorage` 最后访问检测 |

## 四、当前动画实现

- **方式**：纯 CSS（`style.css:123`）
- 关键帧：`@keyframes petIdle { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-4px) scale(1.025); } }`
- **问题**：只是整张静态图的轻微上下浮动，没有逐帧动作。

## 五、构建 / 测试 / 部署

- **启动**：`npm start` → `node server.js`
- **测试**：`npm test` → `node test_smoke.js`
- **构建**：无构建步骤（纯 Node + 静态前端）
- **部署**：`bash deploy/deploy.sh`（仅服务端部署脚本）
- **PWA 缓存**：`public/sw.js` 维护 `ASSETS` 硬编码清单；本次新增动画资源后需同步加入并升级 `?v=10` → `?v=11`。

## 六、素材生成方案

- Codex 原技能 `generate2dsprite` 使用其内置 `image_gen` 生成带 `#FF00FF` 洋红底的原始精灵图，再由 Python 脚本做抠图/裁切/对齐/QC。
- WorkBuddy 端等价方案：使用 **ImageGen 工具**生成原始动作图（逐帧或整版），复用 `C:/Users/Administrator/.codex/skills/generate2dsprite/scripts/` 下的 Python 处理器做后期/QC，或自行编写等效 Pillow/NumPy 流水线。
- 计划动作：idle、happy、eat、tired、levelUp。
- 输出目录：`public/anim/firam/`。

## 九、素材生成与 QC（step-3 产出）

- **生成方式**：5 张动作整版由 ImageGen 图生图生成（参考 `firam-adult.png`），再用自定义脚本把背景强制替换为纯 #FF00FF，最后跑 `generate2dsprite.py process` 切分/对齐/QC。
- **输出目录**：`public/anim/firam/{idle,happy,eat,tired,levelUp}/`
- **每动作包含**：`raw-sheet.png`、`sheet-transparent.png`、`frame-0.png` .. `frame-N.png`、`animation.gif`、`pipeline-meta.json`
- **QC 报告**：`public/anim/firam/qc_report.json` —— 全部 5 动作通过 strict QC，无空帧、无 paste_clamped。
- **关键指标**：
  - idle：body_scale_cv 0.0015 / anchor_y_std 0.0014
  - happy：body_scale_cv 0.0013（source edge touch 为火焰尖，已允许）
  - eat：body_scale_cv 0.031（低头进食导致，可接受）
  - tired：body_scale_cv 0.0017
  - levelUp：body_scale_cv 0.034（姿态变化大，可接受）
- **资源总大小**：`public/anim/firam/` 约 22MB（含 raw-sheet 归档；运行时实际只加载 sheet-transparent + GIF，约 3MB）。
- **缺失重试**：happy 初次生成与 tired 文件名冲突被覆盖，已补生成一次。

## 八、动画资源契约（step-2 产出）

- **契约文件**：`public/anim/firam/contract.json`
- **输出目录**：`public/anim/firam/{idle,happy,eat,tired,levelUp}/`
- **规范摘要**：
  - idle/happy/eat/tired：4 帧、2×2 网格、512×512 单元
  - levelUp：6 帧、2×3 网格、512×512 单元
  - anchor：bottom-center
  - fallback：`/img/firam.webp` 静态 WebP；`prefers-reduced-motion`、低性能设备、加载失败均降级为静态
- **事件映射**：
  - 今日冒险 idle → `idle`
  - 投喂成功 → `eat` → `happy` → 回到 `idle`
  - 升级提示 → `levelUp` → 回到 `idle`
  - 回归提示 → `tired`（3 秒）→ 回到 `idle`

## 七、变更清单（已全部执行）

1. ✅ 生成 5 套焰狼动画资源（raw-sheet、transparent-sheet、逐帧 PNG、GIF 预览、meta）。
2. ✅ 新增 `public/anim/firam/` 资源目录（22 个帧 PNG + contract.json + QC 报告）。
3. ✅ 新增播放器 `public/anim/player.js`（契约驱动、事件驱动、三道降级）。
4. ✅ 接入 `childPetTab()`（idle）、`doFeed()`（eat→happy）、`celebratePet()`（levelUp）、启动流程（return/tired）。
5. ✅ 更新 `public/sw.js` 缓存清单（`CACHE` 与全部 `?v=` 升到 `v11`，新增 anim 资源）。
6. ✅ 创建特性分支 `feat/firam-anim-mvp` 并提交，运行 `npm test` 通过（165/0）。
7. ✅ 回写 `.work-buddy/result.json` 为 completed。

## 十、实现细节（step-4 / step-5）

### 播放器 `public/anim/player.js`
- 自执行模块，挂载到 `window.PetAnim`，对外 API：`ready()`（加载契约）、`scan(root)`（挂载 + 冲刷挂起事件）、`queueEvent(target, event)`（业务抛事件）、`canAnimate(sid)`、`isEnabled()`。
- 内部状态：`contract`、`imgCache`（动作→预载 Image）、`pending`（target→event，最后写入者生效）、单一全局 `currentTimer`（同一时刻只跑一个 interval，杜绝多实例泄漏/卡死）。
- 播放原语：`startLoop(el, action)`（循环帧）、`playOnce(el, action, holdLast)`（单次到末帧定格）、`playEvent(el, event)`（按契约 events 解析 sequence / 单动作 / loop + maxDurationMs，结束 autoReturnToIdle）。
- 三道降级（任一触发即保留原静态 WebP，不动页面核心操作）：
  1. `prefers-reduced-motion: reduce`
  2. 低性能（`hardwareConcurrency ≤ 2` 或 `deviceMemory ≤ 2`）
  3. 精灵帧 `onerror` 加载失败
- **只服务主视觉焰狼（`data-species === 'firam'`）**；其它种族 / 昏迷态保持原静态图，战斗/地图/持久化逻辑一概不动。

### 接入点（`public/app.js`）
- 新增 `petArtHero(p, fainted)`：渲染 `.pet-art.idle[data-anim="hero"]`，内部自带静态 WebP 降级图（断网/低性能直接显示它）。
- `boot()`：`if (window.PetAnim) PetAnim.ready();` 提前拉契约。
- `renderChild()` 末尾：`checkReturnEvent()` + `PetAnim.scan(#tabbody)`。
  - `checkReturnEvent()`：用 `localStorage('hp_last_visit')` 检测距上次打开 > 24h 且宠物在线 → 抛 `return` 事件（仅首屏触发一次，绝不阻塞任何确认）。
- `childPetTab()`：hero 改由 `petArtHero()` 渲染。
- `doFeed()`：`feedEvent` 分支不变；普通投喂成功 `queueEvent('hero','feed_success')`（优先级低于 level_up）。
- `celebratePet()`：普通升级分支改为「firam 且 enabled 时 `queueEvent('hero','level_up')`，否则回退 `lvlBurst` 文字」，保留 `Sfx.levelup()`。

### 样式 `public/style.css`
- 新增 `.pet-art .pa-sprite { width:100%;height:100%;object-fit:contain;object-position:bottom center }`，覆盖 `.pet-art img` 的 300% 裁切。
- 新增 `.pet-art.idle img.pa-sprite { animation:none }`，避免精灵帧被 idle CSS 浮动动画干扰。

### PWA `public/sw.js`
- `CACHE` 与全部 `?v=` 由 `v10` → `v11`；`ASSETS` 新增 `anim/player.js?v=11`、`anim/firam/contract.json` 及 5 动作共 22 张帧 PNG（离线兜底）。

## 十一、验证结果
- `node --check`：`player.js` / `app.js` / `sw.js` 语法均通过。
- 22 张帧 PNG 全部存在且非空；server 实测 `/anim/firam/contract.json`→200 json、`/anim/firam/idle/frame-0.png`→200 image/png、`/anim/firam/levelUp/frame-5.png`→200 image/png、`/anim/player.js`→200 js。
- `npm test`（`test_smoke.js`，server 起在 :3000）：**165 通过 / 0 失败**，无回归。
- 无头集成校验（node + 最小 DOM 桩 + 真实 server）：`level_up`、`feed_success`(eat→happy→idle)、`return`(tired→idle) 三个事件均顺利播放并最终回到 idle 帧，无异常抛出。

## 十二、回滚说明
- 本次改动全部落在新增文件（`public/anim/player.js`、`public/anim/firam/*`、`docs/animation-mvp-log.md`）与前端展示层（`index.html`、`app.js`、`style.css`、`sw.js`），**未触碰** 战斗系统、地图系统、P0/P1 持久化逻辑。
- 若需回滚：因改动在未合并的特性分支 `feat/firam-anim-mvp`，直接 `git checkout main` 或删分支即可；主视觉仍由 `firam.webp` 静态图兜底，播放器任意失败都自动降级为原静态图，不影响核心玩法。
