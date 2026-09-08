# 商业化接入契约（只留接口，不接支付）

来源：WorkBuddy 的 `docs/monetization-plan.md`（提交 `a95c754`，讨论稿 v1）。当前阶段只做制作预留，默认关闭，不收费、不接支付。

## 原则

- 付费主体是家长，使用主体是孩子。
- 核心习惯、基础宠物、基础地图、基础图鉴和成长循环永久免费。
- 付费只做家庭协作能力、深度报告和外观/区域等非战力内容。
- 孩子端可以看到家长按表现发放的零花钱、奖励额度和兑换结果；但不出现运营方的价格、余额、会员按钮、广告或支付状态。
- 当前版本不接微信/应用商店支付，不展示会员/内购入口，也不在客户端伪造购买成功。

## 预留的四层接口

### 1. 家庭权益（server authoritative）

未来在 family 根对象增加：

```js
entitlements: {
  tier: 'free',
  features: [],
  source: 'none',
  expiresAt: null,
  updatedAt: null
}
```

服务端统一提供 `hasEntitlement(family, feature)`，默认 free；业务逻辑不得散落 `if (isVip)`。

### 2. 内容目录与能力投影

未来内容项统一使用：

```js
{
  id, type: 'map|skin|effect|report',
  assetRef, requiredEntitlement: null,
  childVisible: true,
  parentOnly: false
}
```

- parent API 可以得到完整目录、权益和价格（接入支付后再增加）。
- child API 只得到经过服务端过滤的 `capabilities` 和可见内容，不得到运营方价格、订单或会员字段；家庭奖励金额仍可按现有规则返回。
- 地图主线与基础图鉴不得因为会员失去已获得进度。

### 3. 家长意愿/确认流

复用现有奖励申请与家长确认思路，新增内容愿望时采用 `wishRequest` 状态机：

`requested → parent_confirmed → granted | rejected | expired`

孩子只提出愿望；家长确认后才产生外观/区域权益。任何支付动作都必须发生在家长会话 + PIN/系统确认之后。

### 4. 订单适配器（未来实现）

只定义接口，不实现供应商：

```text
createOrder(parentSession, sku)
verifyCallback(providerPayload)
grantEntitlement(orderId)
refund(orderId)
```

订单必须具备幂等键、状态机、退款回收权益、审计日志和跨设备恢复；绝不能依赖客户端回调或本地 localStorage。

## 当前阶段应该留下的非付费埋点

- `contentId` / `assetRef` 与动画 `contract.json` 解耦，后续皮肤可替换资源而不改玩法。
- 地图节点使用稳定 ID，进度只存 ID，不把会员状态写进成长数值。
- 家长侧只记录匿名聚合指标：周留存、周报打开、多人家庭占比、愿望提出/确认率。
- 商业化 feature flag 默认关闭；关闭时应用表现必须等同当前免费版本。
- 任何商业化配置即使未来加入，也必须在默认配置下不可见、不可触发、不可改变现有核心玩法。

## 上线前门槛

- child token、child API、离线快照和 DOM 都不包含运营方价格/订单/会员字段；家长奖励金额不属于这条红线。
- 核心习惯与成长离线可用，付费只影响非核心内容。
- 家长确认、退款、换设备恢复和撤销权益均有自动化测试。
- 通过儿童隐私、监护人同意、数据保留和宣传合规评审后，再接真实支付。
