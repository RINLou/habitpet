'use strict';
// Boss 首战胜率蒙特卡洛扫描 —— 用**真实战斗代码**取代模拟里的概率假设
//
// 背景：scripts/playtest-cohort-5families.js 里 Boss 战是 `rng() < pBossFirstWin`
// 的纯概率抽样（参数 0.72/0.80），样本只有 5 个孩子，因此报出的"60%"是小样本噪声，
// 不能用来判断真实难度。本脚本直接驱动 lib/battle.js 与 makeBoss()，
// 得到各等级的真实胜率曲线，作为是否调整渐进难度的依据。
//
// 用法：HABITPET_DATA_DIR=<临时目录> node scripts/boss-winrate-scan.js [每级场次]

const path = require('path');
const store = require('../lib/store');
const E = require('../lib/engine');
const B = require('../lib/battle');
const { speciesById, skillById } = require('../lib/species');

const N = Number(process.argv[2]) || 300;
const MAX_LV = Number(process.argv[3]) || 12;

store.load();

const fr = store.createFamily('boss' + Date.now(), 'pass123', 'Boss扫描家', 'q', 'a');
const family = fr.family;
const child = store.addChild(family, '扫描宝', '三年级');

const SPECIES = process.env.SCAN_SPECIES || 'firam';
const sp = speciesById(SPECIES);

// 加点画像：真实孩子的分配不可控，取两种极端包络
// - balanced：五维均分（保守）
// - aggressive：atk/hp 优先（乐观）
function allocPoints(stats, points, style) {
  if (style === 'aggressive') {
    const order = ['atk', 'hp', 'spd', 'def', 'wis'];
    let i = 0;
    while (points > 0) { stats[order[i % order.length]] += 1; i++; points--; }
  } else {
    const order = ['atk', 'def', 'hp', 'spd', 'wis'];
    let i = 0;
    while (points > 0) { stats[order[i % order.length]] += 1; i++; points--; }
  }
  return stats;
}

function resetChild(lv, style) {
  child.level = lv;
  child.xp = E.xpForLevel(lv);
  child.pet = {
    speciesId: sp.id,
    nickname: sp.name,
    stats: { ...sp.base },
    freePoints: 0,
    skills: sp.skills.slice(),
    maxHpBonus: 0
  };
  allocPoints(child.pet.stats, (lv - 1) * 2, style);
  child.intimacy = 70;
  child.fainted = false;
  child.feedDate = E.dateKey(new Date());
  child.battleCount = { date: '', count: 0 };
}

// 玩家出招策略
// - random：孩子乱点（保守下界）
// - best：总选威力最大（乐观上界）
function pickSkillIndex(usable, strategy) {
  if (!usable.length) return 0;
  if (strategy === 'best') {
    let bi = 0;
    usable.forEach((s, i) => { if (s.power > usable[bi].power) bi = i; });
    return bi;
  }
  return Math.floor(Math.random() * usable.length);
}

function runOneBattle(lv, style, strategy) {
  resetChild(lv, style);
  const started = B.startBattle(family, 'boss', child);
  if (!started || started.error) return { error: started && started.error };
  const battleId = started.battleId;

  const usable = (child.pet.skills || [])
    .map(id => skillById(id))
    .filter(s => s && s.unlockLv <= lv);
  if (!usable.length) return { error: '该等级无可用技能' };

  let guard = 0;
  let st = started.state;
  while (st.status === 'active' && guard++ < 300) {
    const idx = pickSkillIndex(usable, strategy);
    const r = B.playerMove(battleId, family, child, idx);
    if (r && r.error) return { error: r.error };
    st = r.state || st;
    if (st.status === 'finished') break;
  }
  const winner = st.winner;
  // 清理战斗状态，避免累积
  try { store.delBattle(battleId); } catch (e) { /* ignore */ }
  return { winner, rounds: st.round };
}

function winRate(lv, style, strategy) {
  let win = 0, err = 0, rounds = 0;
  for (let i = 0; i < N; i++) {
    const r = runOneBattle(lv, style, strategy);
    if (r.error) { err++; continue; }
    if (r.winner === 'kids') win++;
    rounds += r.rounds || 0;
  }
  const done = N - err;
  return {
    rate: done ? win / done : 0,
    avgRounds: done ? (rounds / done) : 0,
    err
  };
}

console.log('════════ Boss 首战胜率扫描（真实战斗代码）════════');
console.log(`灵伴 ${sp.name}(${SPECIES}) · 每级 ${N} 场 · 目标带 70%~85%`);
console.log('加点：balanced=五维均分（保守） / aggressive=攻血优先（乐观）');
console.log('出招：random=乱点（下界） / best=最强（上界）\n');
console.log('Lv  保守下界  保守上界  乐观下界  乐观上界  均回合  判定');
console.log('─'.repeat(64));

const rows = [];
for (let lv = 1; lv <= MAX_LV; lv++) {
  const bR = winRate(lv, 'balanced', 'random');
  const bB = winRate(lv, 'balanced', 'best');
  const aR = winRate(lv, 'aggressive', 'random');
  const aB = winRate(lv, 'aggressive', 'best');
  const avgRounds = (bR.avgRounds + bB.avgRounds + aR.avgRounds + aB.avgRounds) / 4;

  // 判定：以「保守下界 ~ 乐观上界」区间是否落在目标带为准
  const lo = Math.min(bR.rate, aR.rate);
  const hi = Math.max(bB.rate, aB.rate);
  const mid = (bR.rate + bB.rate) / 2;   // 典型孩子（均衡加点）
  let verdict;
  if (mid >= 0.70 && mid <= 0.85) verdict = '✅ 目标带';
  else if (mid < 0.70) verdict = `⚠️ 偏难 (${(mid * 100).toFixed(0)}%)`;
  else verdict = `⚠️ 偏易 (${(mid * 100).toFixed(0)}%)`;

  const p = x => (x * 100).toFixed(1).padStart(6) + '%';
  console.log(
    String(lv).padStart(2) + '  ' +
    p(bR.rate) + '  ' + p(bB.rate) + '  ' + p(aR.rate) + '  ' + p(aB.rate) + '  ' +
    avgRounds.toFixed(1).padStart(6) + '  ' + verdict
  );
  rows.push({ lv, balancedRandom: bR.rate, balancedBest: bB.rate, aggressiveRandom: aR.rate, aggressiveBest: aB.rate, mid, avgRounds });
}

console.log('\n── 典型孩子（均衡加点，随机/最强之间取中）──');
const bad = rows.filter(r => r.mid < 0.70 || r.mid > 0.85);
if (!bad.length) {
  console.log(`✅ Lv1~Lv${MAX_LV} 全部落在 70%~85% 目标带，渐进难度无需调整。`);
} else {
  console.log('⚠️ 偏离目标带的等级：' + bad.map(r => `Lv${r.lv}(${(r.mid * 100).toFixed(0)}%)`).join('、'));
}

const out = path.join(__dirname, '..', 'tmpdata', 'boss-winrate.json');
try {
  require('fs').mkdirSync(path.dirname(out), { recursive: true });
  require('fs').writeFileSync(out, JSON.stringify({ species: SPECIES, n: N, rows }, null, 2));
  console.log('\n明细已写入 ' + out);
} catch (e) { /* ignore */ }
