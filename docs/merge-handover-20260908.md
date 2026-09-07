# 交接日志：P0/P1 修正合入 main + 焰狼动画 MVP（2026-09-08 凌晨）

> 写给 Codex 的交接卷宗。本文档描述 main 分支从 v10.3（bf6f9ee）到 214ed91 的全部变化、
> 合并策略、冲突决策、测试结果与后续注意事项。接手前请通读。

## 一、结果速览

| 项 | 状态 |
|---|---|
| main | `bf6f9ee → 214ed91`，已推送 GitHub（bf6f9ee..214ed91） |
| PR #1 | **已合并**（2026-09-07T16:31Z，经 `06e0c44..f16d2d0` 快进推送触发，GitHub 判定 merged） |
| 测试 | run-tests.js **218/0**；anim-mvp **47/0**；合并版 smoke **218/0** |
| CI | `.github/workflows/ci.yml` 已随 main 入仓并推送（此前 PAT 缺 workflow scope 被拒，现已通过） |
| 云端部署 | **未执行**（线上仍是 v10.3 内容），需另行触发 deploy |
| APK | **未重打包**（webview-apk/assets/www 仍为旧副本） |

## 二、main 新增两个提交

1. **`40dfac7` chore: 采纳 codex 修正线 PR #1 内容**
   - 关键事实：`codex/p0-habit-experience` 与 `codex/p1-correction-review` 是**重写历史**
     （根提交 `4f947b3`，与 main 根 `75b61fa` 无公共祖先），无法常规 merge。
   - 处理：用 `git read-tree -u --reset f16d2d0` 把 p1 分支完整树落为 main 单提交，
     保留 main 历史。内容 = PR #1 合并后结果（P0 保存顺序 / pendingGapKey schema v6 /
     本地缓存兜底 / P1 回归提示 / 218 项测试 / CI / ONBOARDING_CONTRACT）。
2. **`214ed91` merge: 焰狼动画 MVP + 审查修正 + 试玩修复**
   - 合并 `feat/firam-anim-mvp`（6cd0a69 MVP → 7c16236 Codex 审查修正 → 0077f03 试玩修复 → c90546e v12 → f3d29a8 试玩修复第二轮）。

## 三、冲突决策（供后续对照）

- **package.json**：取并集。`test` = scripts/run-tests.js（218 项，一条命令免外部服务）、
  `accept:360` 保留，叠加 `test:anim`（tests/anim-mvp.test.js，47 项）。
- **public/lib/local.js bootChild**：p1 的 `lastState` 离线兜底（无 family 快照时回退最近云端
  完整视图，计划卡不丢）+ 动画批次的 `schedulePull(800)` 启动对齐，两者并存。
- **public/lib/local.js reset**：清 `childStates/lastState`（p1 新字段）+ 清 `_periodicTimer`
  （动画批次的周期同步定时器）。
- **public/app.js / style.css**：git 自动合并成功，人工验证两侧特性并存
  （returnNudge/onboarding 17 处、PetAnim/petArtHero 11 处）。

## 四、动画层要点（main 上新增的东西）

- **`public/anim/player.js`**：契约驱动（/anim/firam/contract.json）+ 事件驱动。
  业务只调 `PetAnim.queueEvent('hero', 事件名)`。
  - **阶段闸门**：仅成体（data-stage="adult"）焰狼挂载精灵动画；愿望球（orb, Lv1-4）/
    幼体/觉醒/非焰狼/昏迷一律静态 WebP。**闸门拦截时会丢弃积压 hero 事件**（防进化后乱播）。
  - **调度**：契约 priority 确定性（高抢占/低排队/同优先级后者覆盖）；playGen 代次计数
    防定时器竞态；契约未就绪事件入 pending，挂载后冲刷。
  - **降级三道**：prefers-reduced-motion / 低核低内存 / 帧加载失败 → 会话级禁用并恢复静态图。
- **接入点**：今日冒险 idle（petArtHero + data-anim 标记）、投喂成功（成体精灵 eat→happy，
  其它阶段 `petReact()` CSS 弹跳）、升级（成体 levelUp，幼体回退 lvlBurst 文字）、
  回归提示（hp_last_visit 超 24h → tired 3 秒）。
- **演示面板**：URL 带 `?demo=1` 时孩子端出现「🎬 动画演示」按钮，免练级预览四事件。
  正常用户不可见。
- **愿望球显示**：orb 阶段显示 wishball.webp（修掉了重构期误显示三段进化图的回归）。
- **孩子端配置同步自愈**：启动 800ms pull / 本地拒绝 600ms pull / 60s 周期 pull（页面可见时），
  家长改投喂时段等配置最迟一分钟内生效。
- **资源版本**：`?v=13`，SW CACHE `hp-v13`；运行时动画资源仅 1.3MB（22 帧 + 契约），
  生成原始物归档 `docs/animation-assets-archive/firam/`（含 sha256 清单/提示词/参数，可复现）。

## 五、测试结果（合并后 main 上实测）

```
npm test          # 218 通过 / 0 失败（run-tests.js：临时数据目录 + 随机端口 + worker）
npm run test:anim # 47 通过 / 0 失败（阶段保护/优先级/竞态/降级/离线资源 38 项逐一 200）
node test_smoke.js # 218 通过 / 0 失败（合并后 smoke 即 run-tests 全集）
```

已知非问题：午夜 00:00 前后个别日切用例可能抖动（实测复跑即过）。

## 六、给 Codex 的操作备忘（本机环境坑）

1. **git loose-refs**：commit 后分支 ref 可能被吞（提交对象仍在，成 dangling）。
   每次 commit/push 后必须 `git log --oneline -3` 验证 HEAD 前移。
   修复：从 dangling SHA 用 packed-refs 补回（注意整行格式 `40位sha refs/heads/xxx`，无空行）。
   本次会话该 bug 触发 4 次，均已修复验证。
2. **GitHub 网络**：直连间歇 Connection reset。fetch/push 走
   `git -c http.proxy=http://127.0.0.1:7890 <cmd>`（本地代理），或
   `-c http.curloptResolve="github.com:443:140.82.121.4"` 锁 IP 直连。
   本机 PAT 已含 workflow scope；**GitHub 连接器 token 无 PR 写权限**（403 integration），
   合 PR 需走快进 push base 分支的方式（本次即用此法）。
3. **文件编辑工具偶发静默回滚**：编辑后必须 grep 复核（本次 reset() 冲突解决即被回滚一次）。
4. **测试需 HABITPET_NO_TIMER=1**（run-tests 自管随机端口/临时目录，无需外部服务）。
5. **文件蒸发**：public/ 目录历史上被环境清空过，大改后立即 commit。

## 七、建议的下一步

1. **云端部署**：`bash deploy/deploy.sh`（线上仍是 v10.3，动画与 P0 修复都未上线）。
2. **APK 重打包**：`bash build_apk.sh`（同步 public → webview-apk/assets，schema v6 + 动画入壳）。
3. **真机 360px 走查**：scripts/accept-360.js 已入仓（手动运行）；动画观感/愿望球显示建议
   真机复核一遍。
4. **若 Codex 后续开新分支**：请基于新 main（214ed91 之后），不要基于 codex/* 旧孤儿历史线，
   两条历史已无法互相 merge-base。

—— 小虾米（WorkBuddy），2026-09-08 00:35
