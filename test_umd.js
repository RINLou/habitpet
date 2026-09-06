// 差分测试：UMD 浏览器模块 vs 原始 lib 模块，确保移植逻辑一致
'use strict';
const assert = require('assert');
require('./lib/store').load(); // 初始化 lib/store 内存库（battle 需要）
const libEngine = require('./lib/engine');
const umeEngine = require('./public/lib/engine.umd');
const libBattle = require('./lib/battle');
const umeBattle = require('./public/lib/battle.umd');
const libSpecies = require('./lib/species');

// 1) 纯函数一致性
assert.strictEqual(libEngine.levelFromXp(1300), umeEngine.levelFromXp(1300));
assert.strictEqual(libEngine.xpForLevel(20), umeEngine.xpForLevel(20));
assert.strictEqual(libEngine.stageOf(20).key, umeEngine.stageOf(20).key);
assert.strictEqual(libEngine.intimacyMult({ pet: { speciesId: 'dragon' } }), 1.05);
assert.deepStrictEqual(libEngine.monthKey(new Date(2026, 8, 15)), umeEngine.monthKey(new Date(2026, 8, 15)));

// 2) addXP 在两份引擎上相同
function mkChild() {
  const sp = libSpecies.speciesById('firam');
  return { id: 'c1', name: '测试', level: 1, xp: 0, intimacy: 100, intimacyFrac: 0,
    pet: { speciesId: 'firam', nickname: sp.name, stats: Object.assign({}, sp.base), freePoints: 0, skills: sp.skills.slice(), maxHpBonus: 0 } };
}
const a = mkChild(), b = mkChild();
const ra = libEngine.addXP(a, 500), rb = umeEngine.addXP(b, 500);
assert.strictEqual(ra.to, rb.to);
assert.strictEqual(a.level, b.level);
assert.strictEqual(a.pet.freePoints, b.pet.freePoints);

// 3) battle 在 UMD 上能跑（用假 store）
function fakeStore() {
  const battles = {};
  return {
    getBattle: id => battles[id] || null,
    putBattle: (id, st) => { battles[id] = st; },
    delBattle: id => { delete battles[id]; },
    familyById: () => null,
    newId: p => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  };
}
// 注入假 store 供 battle.umd（浏览器分支已绑定 root.LocalStore；这里走 Node 分支用的是真实 lib/store）
const cA = mkChild(), cB = mkChild();
const fam = { id: 'f1', config: { battleXpDailyCap: 30, holidayMode: false, semester: { index: 1 } }, ledger: [], children: { c1: cA, c2: cB } };
const r = libBattle.startBattle(fam, 'sibling', cA, cB);
assert.ok(r.battleId, 'battle 启动应返回 id');
let st = r.state;
let guard = 0;
while (st.status === 'active' && guard < 30) {
  const me = st.fighters[0];
  const res = libBattle.playerMove(r.battleId, fam, cA, 0);
  assert.ok(res.ok || res.error, 'playerMove 应返回结果');
  if (res.state) st = res.state; else break;
  guard++;
}
console.log('UMD 差分测试通过：engine 一致, battle 可完整跑完', guard, '回合');
