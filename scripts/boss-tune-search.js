'use strict';
// Boss 渐进难度参数搜索 v2 —— 按技能解锁台阶分段标定
//
// v1 用单一倍率，无法消除锯齿。根因：孩子技能 power 在 Lv8/Lv15 跃升（25→45→65，
// 全物种统一），而 Boss 强度只随等级线性变化，导致
//   Lv1-3 ≈82-85%（正常） · Lv4-7 ≈18-32%（崩，只有 power25 却要面对越来越肉的 Boss）
//   Lv8+ ≈85-96%（偏易，解锁 power45 后反过来碾压）
// 因此 v2 按技能台阶把 Boss 倍率分段，并放慢段内属性增长，让各段都落回目标带。
//
// 用法：HABITPET_DATA_DIR=<临时目录> TUNE_N=50 node scripts/boss-tune-search.js

const store = require('../lib/store');
const E = require('../lib/engine');
const species = require('../lib/species');
const { skillById } = require('../lib/species');

// —— 参数化 makeBoss（分段倍率）——
function makeBossP(level, forCoop, P) {
  const safeLevel = Math.max(1, Number(level) || 1);
  let soloMul;
  if (safeLevel < 8) soloMul = P.mulA;        // 只有 power25
  else if (safeLevel < 15) soloMul = P.mulB;  // 解锁 power45
  else soloMul = P.mulC;                      // 解锁 power65
  const mul = forCoop ? Math.min(1.2, 1.02 + Math.max(0, safeLevel - 1) * 0.025) : soloMul;
  const hpMul = forCoop ? 1 : Math.min(P.hpCap, P.hpBase + Math.max(0, safeLevel - 1) * P.hpStep);
  const s = n => Math.max(1, Math.round((n + (safeLevel - 1) * P.statPerLevel) * mul));
  return {
    name: forCoop ? '远古守护兽' : '荒野挑战者',
    element: 'none', emoji: '👹', level: safeLevel,
    stats: { atk: s(11), def: s(9), hp: s(10), spd: s(10), wis: s(10) },
    hpMax: Math.round((s(10) * 5 + safeLevel * 4) * (forCoop ? 1.8 : hpMul)),
    skills: ['n1', 'n2', 'n3']
  };
}

let CURRENT = null;
species.makeBoss = (level, forCoop) => makeBossP(level, forCoop, CURRENT);
const B = require('../lib/battle');   // 必须在替换之后加载

store.load();
const fr = store.createFamily('tune' + Date.now(), 'pass123', '调参家', 'q', 'a');
const family = fr.family;
const child = store.addChild(family, '调参宝', '');
const sp = species.speciesById('firam');

function resetChild(lv) {
  child.level = lv;
  child.xp = E.xpForLevel(lv);
  const stats = { ...sp.base };
  const pts = (lv - 1) * 2;
  const order = ['atk', 'def', 'hp', 'spd', 'wis'];
  for (let i = 0; i < pts; i++) stats[order[i % 5]] += 1;
  child.pet = { speciesId: sp.id, nickname: sp.name, stats, freePoints: 0, skills: sp.skills.slice(), maxHpBonus: 0 };
  child.intimacy = 70; child.fainted = false;
  child.feedDate = E.dateKey(new Date());
  child.battleCount = { date: '', count: 0 };
}

// strategy: 'random' 乱点（下界） / 'best' 选最强（上界）。真实孩子介于两者之间，
// 故每级两种策略各跑一半，合并胜率作为「典型」口径。
function runOne(lv, strategy) {
  resetChild(lv);
  const started = B.startBattle(family, 'boss', child);
  if (!started || started.error) return null;
  const id = started.battleId;
  const usable = (child.pet.skills || []).map(x => skillById(x)).filter(s => s && s.unlockLv <= lv);
  let guard = 0, st = started.state;
  while (st.status === 'active' && guard++ < 300) {
    let idx;
    if (strategy === 'best') { idx = 0; usable.forEach((s, i) => { if (s.power > usable[idx].power) idx = i; }); }
    else idx = Math.floor(Math.random() * usable.length);
    const r = B.playerMove(id, family, child, idx);
    if (r && r.error) break;
    st = r.state || st;
    if (st.status === 'finished') break;
  }
  try { store.delBattle(id); } catch (e) { /* ignore */ }
  return st.winner === 'kids';
}

const LEVELS = [1, 2, 3, 5, 7, 8, 10, 12, 15, 18];
const N = Number(process.env.TUNE_N) || 50;

function evaluate(P) {
  CURRENT = P;
  const rates = LEVELS.map(lv => {
    let w = 0, n = 0;
    const half = Math.ceil(N / 2);
    for (let i = 0; i < half; i++) { const r = runOne(lv, 'random'); if (r !== null) { n++; if (r) w++; } }
    for (let i = 0; i < half; i++) { const r = runOne(lv, 'best'); if (r !== null) { n++; if (r) w++; } }
    return n ? w / n : 0;
  });
  let score = 0;
  rates.forEach(r => {
    if (r < 0.70) score += (0.70 - r);
    else if (r > 0.85) score += (r - 0.85);
  });
  return { P, rates, score };
}

const grid = [];
for (const statPerLevel of [0.20, 0.30, 0.40])
  for (const mulA of [0.72, 0.78, 0.84, 0.90])
    for (const mulB of [0.88, 0.96, 1.04])
      for (const mulC of [0.98, 1.06, 1.14])
        for (const hpStep of [0.0, 0.01])
          grid.push({ statPerLevel, mulA, mulB, mulC, hpBase: 0.85, hpStep, hpCap: 1.05 });

console.log(`搜索 ${grid.length} 组（分段倍率）· 每级 ${N * 2} 场 · 等级 ${LEVELS.join('/')}`);

const results = [];
let i = 0;
for (const P of grid) {
  results.push(evaluate(P));
  if (++i % 60 === 0) process.stdout.write(`  已评估 ${i}/${grid.length}\r`);
}
results.sort((a, b) => a.score - b.score);

console.log('\n\n═══ Top 10 ═══');
console.log('stat/lv  mulA(<8) mulB(8-14) mulC(15+) hpStep | ' + LEVELS.map(l => ('Lv' + l).padStart(5)).join('') + ' | 评分');
console.log('-'.repeat(110));
results.slice(0, 10).forEach(r => {
  const P = r.P;
  console.log(
    P.statPerLevel.toFixed(2).padStart(7) + '  ' +
    P.mulA.toFixed(2).padStart(8) + '  ' +
    P.mulB.toFixed(2).padStart(10) + '  ' +
    P.mulC.toFixed(2).padStart(9) + '  ' +
    P.hpStep.toFixed(2).padStart(6) + ' | ' +
    r.rates.map(x => ((x * 100).toFixed(0) + '%').padStart(5)).join('') + ' | ' +
    r.score.toFixed(3)
  );
});

console.log('\n═══ 对照：v1 最佳（单一段率 0.85）═══');
const v1 = evaluate({ statPerLevel: 0.5, mulA: 0.85, mulB: 0.85, mulC: 0.85, hpBase: 0.85, hpStep: 0.01, hpCap: 1.05 });
console.log(' → ' + v1.rates.map((x, k) => `Lv${LEVELS[k]}=${(x * 100).toFixed(0)}%`).join(' ') + ` | 评分 ${v1.score.toFixed(3)}`);

const best = results[0];
console.log('\n═══ 最佳参数（建议采用）═══');
console.log(JSON.stringify(best.P));
console.log('胜率：' + best.rates.map((x, k) => `Lv${LEVELS[k]}=${(x * 100).toFixed(0)}%`).join(' '));
console.log('评分：' + best.score.toFixed(3));
