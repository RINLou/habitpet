'use strict';
// Boss 数值重标定（v12.2）——真实战斗代码蒙特卡洛 + 网格搜索
//
// 背景：v9 赛季 Boss 换皮（物种技能组）后 BOSS_TUNE 未重标，模拟试玩实测胜率
//   Lv0-4≈45% → Lv5-9≈18-27% → Lv10+≈8%（scripts/sim-playtest.js，2026-10-16）。
// 根因：Boss 技能从 n1/n2/n3（无 STAB，平均 power 45）换成物种技能组
//   （恒 STAB 1.5 + power80 狂暴 + 无视解锁等级），输出 +79%。
//
// 设计目标（首战胜率，典型孩子=均衡加点随机出招）：
//   Lv1-4: 55%~70%   （低级建立信心，新手教程期）
//   Lv5-9: 45%~60%   （中级有挑战）
//   Lv10-14: 40%~55%
//   Lv15+:  35%~50%  （高级仍可玩；首杀奖励是正向激励，不应成为挫败源）
// 评分 = 各档偏离目标带中值的归一化均方误差；「最强技能」画像仅作参考（乐观包络）。
//
// 用法：HABITPET_DATA_DIR=<临时目录> node scripts/boss-recalibrate.js [每档场次]

const path = require('path');
const store = require('../lib/store');
const E = require('../lib/engine');
const B = require('../lib/battle');
const { speciesById, skillById, setBossTune, BOSS_TUNE } = require('../lib/species');

const N = Number(process.argv[2]) || 400;

store.load();
const fr = store.createFamily('bosscalc' + Date.now(), 'pass123', '标定家', 'q', 'a');
const family = fr.family;
const child = store.addChild(family, '标定宝', '三年级');

const SPECIES_ID = process.env.SCAN_SPECIES || 'firam';   // 试玩数据里最常见
const sp = speciesById(SPECIES_ID);
// 三只代表 Boss：rime(ice)=克制我方、mount(rock)=我方被克、night(dark)=中性
const BOSS_DEFS = [
  require('../lib/species').BOSS_ROSTER.find(b => b.id === 'boss_rime'),
  require('../lib/species').BOSS_ROSTER.find(b => b.id === 'boss_mount'),
  require('../lib/species').BOSS_ROSTER.find(b => b.id === 'boss_night')
];

function allocPoints(stats, points, style) {
  const order = style === 'aggressive' ? ['atk', 'hp', 'spd', 'def', 'wis'] : ['atk', 'def', 'hp', 'spd', 'wis'];
  let i = 0;
  while (points > 0) { stats[order[i % order.length]] += 1; i++; points--; }
  return stats;
}

function resetChild(lv, style) {
  child.level = lv;
  child.xp = E.xpForLevel(lv);
  child.pet = {
    speciesId: sp.id, nickname: sp.name,
    stats: { ...sp.base }, freePoints: 0,
    skills: sp.skills.slice(), maxHpBonus: lv - 1
  };
  allocPoints(child.pet.stats, (lv - 1) * 2, style);   // 自由点 2/级
  child.intimacy = 70; child.fainted = false;
  child.feedDate = E.dateKey(new Date());
  child.battleCount = { date: '', count: 0 };
  child.pokedexKills = {}; child.pokedexSeen = {};
  child.battleXp = { date: E.dateKey(new Date()), amount: 0 };
}

function skillScore(sk, bossEl) {
  if (!sk) return -1;
  const mult = require('../lib/species').typeMult(sk.element, bossEl);
  const stab = sk.element === sp.element ? 1.5 : 1;
  return sk.power * stab * mult;
}
// publicBattle 的 skills 是 {id,name,element,power} 对象，可直接用
const bestIdx = (fighter, bossEl) => {
  let bi = 0, bs = -1;
  (fighter.skills || []).forEach((sk, i) => { const v = skillScore(sk, bossEl); if (v > bs) { bs = v; bi = i; } });
  return bi;
};

// 打一场完整 Boss 战，返回 { win, rounds }
function fightOne(lv, style, mode, bossDef) {
  resetChild(lv, style);
  // v12.2: startBattle 支持注入指定 Boss（避免 Date.now 轮换不确定性）
  let st = B.startBattle(family, 'boss', child, null, null, bossDef);
  let guard = 0;
  while (st.state.status === 'active' && guard++ < 120) {
    const me = st.state.fighters[0];
    const boss = st.state.fighters.find(f => f.side === 'boss');
    let idx;
    if (mode === 'best') {
      idx = bestIdx(me, boss.element);
    } else {
      idx = Math.floor(Math.random() * (me.skills || [1]).length);
    }
    st.state = B.playerMove(st.battleId, family, child, idx).state;
    if (!st.state) return { win: false, rounds: guard };
  }
  return { win: st.state && st.state.winner === 'kids', rounds: guard };
}

// 某参数组下扫描整条胜率曲线
function scan(tune, levels, n) {
  setBossTune(tune);
  const rows = [];
  for (const lv of levels) {
    const r = fightBatch(lv, 'balanced', 'random', n);
    const b = fightBatch(lv, 'aggressive', 'best', Math.round(n / 2));
    rows.push({ lv, typical: r.rate, optimistic: b.rate, rounds: r.avgRounds });
  }
  return rows;
}

function fightBatch(lv, style, mode, n) {
  let win = 0, rounds = 0, total = 0;
  for (const bd of BOSS_DEFS) {
    const k = Math.max(1, Math.round(n / BOSS_DEFS.length));
    for (let i = 0; i < k; i++) {
      const r = fightOne(lv, style, mode, bd);
      if (r.win) win++;
      rounds += r.rounds; total++;
    }
  }
  return { rate: win / total, avgRounds: rounds / total };
}

// 目标带评分（典型孩子）
const BANDS = [[1, 4, 0.55, 0.70], [5, 9, 0.45, 0.60], [10, 14, 0.40, 0.55], [15, 20, 0.35, 0.50]];
function score(rows) {
  let s = 0, worst = null;
  for (const r of rows) {
    const band = BANDS.find(b => r.lv >= b[0] && r.lv <= b[1]);
    const mid = (band[2] + band[3]) / 2;
    const dev = Math.max(0, Math.abs(r.typical - mid) - (band[3] - band[2]) / 2);   // 出带才罚
    s += dev * dev;
    if (!worst || dev > worst.dev) worst = { lv: r.lv, dev, rate: r.typical };
  }
  return { s, worst };
}

const LEVELS = [1, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20];

// ── 0) 复现基线：当前参数（技能解锁已修，先看修复本身救回多少）──
console.log('== 基线扫描（BOSS_TUNE 现值 + 技能按等级解锁修复后）==');
console.log('参数:', JSON.stringify(BOSS_TUNE));
const base = scan(BOSS_TUNE, LEVELS, N);
for (const r of base) console.log(`Lv${String(r.lv).padStart(2)}  典型 ${(r.typical * 100).toFixed(1)}%  乐观 ${(r.optimistic * 100).toFixed(1)}%  均回合 ${r.rounds.toFixed(1)}`);
console.log('评分:', score(base).s.toFixed(4), '最差档:', JSON.stringify(score(base).worst));

// ── 1) 网格搜索 ──
console.log('\n== 网格搜索（每格 ' + N + ' 场/档，共 ' + LEVELS.length + ' 档）==');
const grid = [];
for (const statPerLevel of [0.4, 0.7, 1.0, 1.3]) {
  for (const mulA of [0.9, 1.1, 1.3]) {
    for (const mulB of [1.0, 1.2, 1.4]) {
      for (const mulC of [1.1, 1.3, 1.5]) {
        for (const hpBase of [0.85, 1.0, 1.15]) {
          grid.push({ statPerLevel, mulA, mulB, mulC, hpBase, hpStep: 0.01, hpCap: 1.25 });
        }
      }
    }
  }
}
console.log('候选组合:', grid.length, '—— 先粗筛（N/4），取前 6 精筛');

const coarse = [];
for (const t of grid) {
  const rows = scan(t, [3, 8, 12, 17], Math.max(60, Math.round(N / 4)));
  const sc = score(rows);
  coarse.push({ t, s: sc.s });
}
coarse.sort((a, b) => a.s - b.s);
console.log('粗筛前 6:', coarse.slice(0, 6).map(c => `(${c.s.toFixed(4)}) ${JSON.stringify(c.t)}`).join('\n'));

console.log('\n── 精筛 ──');
const fine = [];
for (const c of coarse.slice(0, 6)) {
  const rows = scan(c.t, LEVELS, N);
  const sc = score(rows);
  fine.push({ t: c.t, s: sc.s, rows, worst: sc.worst });
  console.log(`评分 ${sc.s.toFixed(4)} 最差档 Lv${sc.worst.lv}=${(sc.worst.rate * 100).toFixed(1)}%  参数 ${JSON.stringify(c.t)}`);
}
fine.sort((a, b) => a.s - b.s);
const best = fine[0];

console.log('\n== 最优参数胜率曲线（典型孩子）==');
for (const r of best.rows) console.log(`Lv${String(r.lv).padStart(2)}  典型 ${(r.typical * 100).toFixed(1)}%  乐观 ${(r.optimistic * 100).toFixed(1)}%  均回合 ${r.rounds.toFixed(1)}`);

console.log('\n== 敏感性：最优参数 ±20% 单因素扰动（Lv8 典型胜率）==');
const lv8base = fightBatch(8, 'balanced', 'random', N).rate;
for (const key of ['statPerLevel', 'mulB', 'hpBase']) {
  for (const f of [0.8, 1.2]) {
    const t2 = { ...best.t, [key]: best.t[key] * f };
    setBossTune(t2);
    const r = fightBatch(8, 'balanced', 'random', Math.round(N / 2));
    console.log(`${key}×${f} (${best.t[key].toFixed(3)}→${t2[key].toFixed(3)}): Lv8 ${(r.rate * 100).toFixed(1)}% (基线 ${(lv8base * 100).toFixed(1)}%)`);
  }
}

setBossTune(best.t);
console.log('\n推荐参数:', JSON.stringify(best.t));
const fs = require('fs');
const out = path.join(__dirname, '..', 'docs', 'boss-recalibration.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ date: new Date().toISOString(), n: N, levels: LEVELS, recommended: best.t, score: best.s, curve: best.rows, coarseTop: coarse.slice(0, 6) }, null, 1));
console.log('明细已写入', out);
