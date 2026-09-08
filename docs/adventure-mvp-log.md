# 星图冒险 MVP 工作日志（2026-09-08）

## 本批目标

把“灵汐大陆”从背景文案推进为可玩的每日轻冒险：完成真实投喂后，每天可选择一个星图节点，获得一段剧情/发现记录，再回到明日目标。

## 已完成

- 新增 `lib/adventure.js`：星海关口、赤曜荒原、月见潮汐 3 个节点。
- 新增孩子端 API：
  - `POST /api/adventure/state`
  - `POST /api/adventure/explore`
- 星图状态随孩子数据持久化，schema v6 → v7。
- 每天最多探索一次；未投喂、暂停计、昏迷或无灵伴时不能出发。
- 探索只写节点、故事和发现记录，不改变 XP、亲密度、feedStreak 或账本。
- 孩子端今日冒险卡显示节点、地域、剧情反馈和已发现数量。
- 预留 `contentId/assetRef` 方向，后续可接地图章节、物种签名事件和非战力外观；当前不收费、不接支付。

## 验证

- `npm test`：218/218。
- `tests/adventure-mvp.test.js`：9/9。
- `node --check server.js lib/adventure.js lib/store.js public/app.js public/anim/player.js public/sw.js`：通过。
- 已覆盖：未投喂拦截、投喂后解锁、节点探索、重复请求幂等、状态持久化和数值红线。

## 下一批建议

1. 把 3 个节点扩展成 1 条 7 日章节路线。
2. 给每只普通灵伴增加一个签名节点/事件，不改变数值平衡。
3. 加入地图连线和章节完成记录，毕业后保留回访。
4. 真机 360px 走查卡片、剧情弹层和低端机帧率。
