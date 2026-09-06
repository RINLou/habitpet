// test_local_cache.js — P1 修正单测试组④：本地缓存包含 onboarding/returnNudge；离线重启不丢计划卡
// node 层验收 public/lib/local.js（本地优先运行时）：
//   - LSDB 用内存 kv stub（模拟 localStorage/IndexedDB 持久化）
//   - SpeciesMod/EngineMod 用真模块（与浏览器 UMD 同源），BattleMod 用 stub（本测试不涉及对战）
//   - fetch 全程抛错 = 永远离线
// 由 test_smoke.js 以子进程运行；env LOCAL_FAMILY_FILE 指向 {family, childId} 快照 JSON；
// 输出单行 'LOCALCACHE {...}' JSON 供父进程断言。
'use strict';
const fs = require('fs');
const LOCAL = './public/lib/local.js';
const mem = {};   // kv 存储（跨“重启”保留）

function stubEnv() {
  global.window = {};
  window.LSDB = {
    kvGet: async k => (k in mem ? mem[k] : null),
    kvSet: async (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); },   // 深拷贝模拟真实序列化落盘
    kvDel: async k => { delete mem[k]; }
  };
  window.LocalStore = { newId: p => p + 'x' + Math.random().toString(36).slice(2), familyById: () => null, getBattle: () => null, putBattle: () => {}, delBattle: () => {} };
  window.SpeciesMod = require('./lib/species');
  window.EngineMod = require('./lib/engine');
  window.BattleMod = { canBattleToday: () => true, noteBattle: () => {}, startBattle: () => ({}), playerMove: () => ({}), getBattle: () => null };
  global.location = { protocol: 'http:' };
  global.fetch = async () => { throw new Error('offline'); };
  window.LocalRT = null;
}
function freshRT() {   // 模拟页面/浏览器重启：清 require 缓存重新加载 IIFE
  delete require.cache[require.resolve(LOCAL)];
  stubEnv();
  require(LOCAL);
  return window.LocalRT;
}

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n); } };
const R = { projectedViewFields: false, cachedViews: false, lastStatePersisted: false, offlineBootKeptCard: false, offlineCachePriority: false };

(async () => {
  const fixture = JSON.parse(fs.readFileSync(process.env.LOCAL_FAMILY_FILE, 'utf8'));
  const fam = fixture.family, cid = fixture.childId;
  const seed = over => Object.assign({ family: fam, oplog: [], pendingFinishes: [], token: 'tk1', role: 'child', childId: cid, childStates: {}, lastState: null }, over || {});

  // —— 场景1：有 family 快照、无缓存视图 → bootChild 走 onboardingLocalView 本地投影 ——
  mem['state'] = seed();
  let RT = freshRT();
  const me1 = await RT.bootChild('tk1');
  const ob1 = me1 && me1.onboarding, rn1 = me1 && me1.returnNudge;
  R.projectedViewFields = !!(ob1 && ['status', 'planId', 'startedOn', 'finishedOn', 'dayIndex', 'completedOn', 'todayComplete', 'canCompleteToday', 'canStart', 'showStartPrompt', 'canRestart', 'historySummary'].every(k => k in ob1))
    && !!(rn1 && rn1.show === false && rn1.gapDays === 0 && rn1.gapKey === null);
  ok('本地投影 onboarding 字段齐全(与 server onboardingView 对齐)', !!(ob1 && ['status', 'planId', 'startedOn', 'finishedOn', 'dayIndex', 'completedOn', 'todayComplete', 'canCompleteToday', 'canStart', 'showStartPrompt', 'canRestart', 'historySummary'].every(k => k in ob1)));
  ok('本地投影 returnNudge 兜底(show=false,服务端裁决)', !!(rn1 && rn1.show === false && rn1.gapDays === 0 && rn1.gapKey === null));

  // —— 场景2：云端 childMe 视图回来 → updateFromState 缓存 childStates + lastState 并落盘 ——
  RT.updateFromState({ id: cid, name: me1.name, friends: [], invites: [], onboarding: { status: 'active', planId: 'homework', startedOn: '2026-09-01', dayIndex: 2, completedOn: [], canCompleteToday: true }, returnNudge: { show: true, gapDays: 4, gapKey: 'L0x' } });
  const S2 = RT.state;
  R.cachedViews = !!(S2.childStates[cid] && S2.childStates[cid].onboarding && S2.childStates[cid].onboarding.status === 'active' && S2.childStates[cid].returnNudge && S2.childStates[cid].returnNudge.show === true);
  ok('updateFromState 缓存 onboarding/returnNudge', R.cachedViews);
  const disk1 = mem['state'];
  R.lastStatePersisted = !!(S2.lastState && S2.lastState.id === cid && S2.lastState.onboarding && S2.lastState.returnNudge && disk1.lastState && disk1.childStates && disk1.childStates[cid]);
  ok('lastState 完整视图 + persist 落盘含 childStates/lastState', R.lastStatePersisted);

  // —— 场景3：离线重启，无 family 快照（从未 sync/full）→ bootChild 回退 lastState，计划卡仍在 ——
  mem['state'] = seed({ family: null, childStates: disk1.childStates, lastState: disk1.lastState });
  RT = freshRT();
  const me3 = await RT.bootChild('tk1');
  R.offlineBootKeptCard = !!(me3 && me3.id === cid && me3.onboarding && me3.onboarding.status === 'active' && me3.returnNudge && me3.returnNudge.show === true && me3.returnNudge.gapKey === 'L0x');
  ok('离线重启(无family快照)回退 lastState 不丢计划卡', R.offlineBootKeptCard);

  // —— 场景4：有 family 快照 + 缓存视图 → 缓存优先于 raw 本地投影（raw=not_started，缓存=active/homework） ——
  mem['state'] = seed({ childStates: disk1.childStates, lastState: disk1.lastState });
  RT = freshRT();
  const me4 = await RT.bootChild('tk1');
  R.offlineCachePriority = !!(me4 && me4.onboarding && me4.onboarding.status === 'active' && me4.onboarding.planId === 'homework' && me4.returnNudge && me4.returnNudge.show === true && me4.returnNudge.gapKey === 'L0x');
  ok('重启后缓存视图优先于 raw 投影(onboarding+returnNudge)', R.offlineCachePriority);

})().catch(e => { R.crash = (e && e.message) || String(e); })
  .finally(() => {
    console.log('LOCALCACHE ' + JSON.stringify(R));
    process.exit(R.crash || fail ? 1 : 0);
  });
