# ONBOARDING 契约（产品契约 · 冻结版）

> 本文件是「7 天微习惯计划 + 温和回归提示」的**唯一权威契约**。源码、迁移、测试、DEVLOG 与本文件冲突时，以源码+测试为准并回头修订本文件；改任何一处必须同步其余四处。
> 基线：P1 实现 `38ffd6d`，修正分支 `codex/p1-correction-review`。

## 1. 状态机

```
not_started ──start──▶ active ──第7自然日 complete──▶ completed
     ▲                    │                              │
     │                    └─超过 startedOn+6 天(读时惰性滚转)─▶ expired
     └────────── start(重新开始) ──────────┘（expired/completed 均可重开）
```

- 状态枚举（唯一合法值）：`not_started | active | completed | expired`。
  - 历史数据中若出现 `idle`（早期草稿命名），迁移层**必须映射为 `not_started`**。
- 计划 ID（唯一合法值）：`homework | reading | prepare`。
  - 文案：homework="写完作业后整理书桌 2 分钟"，reading="读 5 分钟"，prepare="明天要用的东西放进书包"。
  - 未知 planId 在迁移中重置为 `not_started + planId:null`。
- `active` 状态重复 `start` → **409**；`active` 状态 `dismiss` → **409**（dismiss 仅 `not_started`，即"稍后再说"）。
- 第 7 自然日 complete → `completed`（finishedOn=当天）；漏日不可补卡；第 8 自然日读时滚转为 `expired`。

## 2. 分数红线

计划**只记录行为**：任何 onboarding / return-nudge 端点**不得改变**亲密度（intimacy）、XP、ledger、feedStreak、宠物饥饿。测试有断言盯防（test_smoke 第 18 节）。

## 3. 回归提示（returnNudge）

- `gapKey` **由服务端生成**：取本次读取前的前值 `previousLastSeenAt`（child 覆盖 lastSeenAt 之前的值）。
- 触发：间隔 ≥ 3 个完整自然日（按 `engine.dateKey` 的本地 YYYY-MM-DD 差，不用 24h 时间戳差）且该 key 未被确认。
- **pending 机制**：服务端决定展示时把当前 key 持久化为 `returnNudge.pendingGapKey`；新 gap 出现即替换 pending。**旧/延迟 key 永远无法通过 ack**。
- `ack` 同时满足才成功：① `gapKey === pendingGapKey`；② key 未被确认；③ key 格式与日期差合法。成功后 `lastShownForGap = gapKey`、`pendingGapKey = null`；否则 **409 + 最新 state**。
- 客户端网络失败时不得把"已弹出"当"已确认"；服务端保留 pending，允许重试。

## 4. 数据与迁移

- schema 当前版本：**v6**（v5 = 引入 onboarding/returnNudge；v6 = returnNudge 补 `pendingGapKey`）。
- 迁移幂等：每孩子补齐 `onboarding`（status/planId/startedOn/completedOn/completedAt/finishedOn/lastDismissedOn/history）与 `returnNudge`（lastShownForGap/pendingGapKey）。
- 坏数据校验：completedOn 仅保留 `/^\d{4}-\d{2}-\d{2}$/` 唯一值；未知 planId 重置；history 截最近 3 条；`idle` → `not_started`。
- 运行时 `addChild` 不经过 migrate —— `childMe()` 入口做惰性兜底（新增字段必须同步加兜底）。

## 5. API（均 POST，孩子端）

| 端点 | 请求体 | 成功 | 失败 |
|---|---|---|---|
| `/api/onboarding/start` | `{planId}` | 200 `{ok,state}`；写 active/startedOn=today，旧周期先归档（history≤3） | 400 planId 非法；409 active 重复 start |
| `/api/onboarding/complete` | `{}` | 200 幂等（当天重复不追加）；第 7 自然日转 completed | 409 非 active / 不在计划窗口 |
| `/api/onboarding/dismiss` | `{}` | 200 写 lastDismissedOn=today（当日不再打扰） | 409 非 not_started |
| `/api/return-nudge/ack` | `{gapKey}` | 200 确认并清 pending | 409 key 非 pending / 已确认 / 非法 |

- 所有响应 `{ok:true, state:childMe}`；日期与幂等**全部服务端裁决**。
- 保存顺序铁律：**业务变更 → `childMe()` 生成 state（含 lastSeenAt 登记）→ `store.save()` → 返回**。禁止 save 先于 childMe。
- 家长端无此 API；parent token 调用 → 401。离线队列不得伪造计划端点结果。

## 6. 前端

- 计划卡为今日冒险下的**次级**操作，永不抢占投喂主 CTA；旧缓存无 onboarding 字段时不渲染不报错。
- 回归提示文案固定："好久不见，回来就很好。今天只做一小步也算开始。"按钮"看看今天能做什么"→ 关闭并聚焦今日冒险卡；饿晕时弹层 3.5s 自动淡出，不遮蔽复活 CTA。
- 本地优先缓存（local.js）必须投影 onboarding/returnNudge；离线只展示缓存状态，不伪造端点成功。
