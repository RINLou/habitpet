'use strict';
// 单场战斗逐回合追踪：核对解析模型与实际战斗是否一致
const store = require('../lib/store');
const E = require('../lib/engine');
const B = require('../lib/battle');
const { speciesById, skillById, makeBoss } = require('../lib/species');

store.load();
const fr = store.createFamily('trace' + Date.now(), 'pass123', '追踪家', 'q', 'a');
const family = fr.family;
const child = store.addChild(family, '追踪宝', '');
const sp = speciesById('firam');

const LV = Number(process.argv[2]) || 6;

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

resetChild(LV);
const boss = makeBoss(LV, false);
console.log(`=== Lv${LV} 对阵快照 ===`);
console.log(`孩子 stats=${JSON.stringify(child.pet.stats)} hpMax=${child.pet.stats.hp * 5 + LV * 4}`);
console.log(`  可用技能: ${sp.skills.map(id => skillById(id)).filter(s => s.unlockLv <= LV).map(s => `${s.name}(power${s.power})`).join(', ')}`);
console.log(`Boss  stats=${JSON.stringify(boss.stats)} hpMax=${boss.hpMax} skills=${boss.skills.join('/')}`);
console.log(`  Boss 技能 power: ${boss.skills.map(id => skillById(id).power).join('/')}`);

const usable = (child.pet.skills || []).map(x => skillById(x)).filter(s => s && s.unlockLv <= LV);

function playOne(verbose) {
  resetChild(LV);
  const started = B.startBattle(family, 'boss', child);
  if (!started || started.error) return null;
  const id = started.battleId;
  let round = 0;
  let st = store.getBattle(id);
  while (st && st.status === 'active' && round++ < 60) {
    const r = B.playerMove(id, family, child, Math.floor(Math.random() * usable.length));
    if (r && r.error) break;
    st = store.getBattle(id);
    if (!st) break;
    if (verbose) {
      const kid = st.fighters.find(f => f.side !== 'boss');
      const bo = st.fighters.find(f => f.side === 'boss');
      console.log(`R${String(st.round).padStart(2)} 孩子 ${String(kid.hp).padStart(3)}/${kid.hpMax}  ·  Boss ${String(bo.hp).padStart(3)}/${bo.hpMax}`);
    }
  }
  st = store.getBattle(id);
  const res = { winner: st && st.winner, rounds: st && st.round };
  try { store.delBattle(id); } catch (e) { /* ignore */ }
  return res;
}

const TRACE_N = Number(process.env.TRACE_N) || 0;
if (TRACE_N > 0) {
  let win = 0, total = 0, rsum = 0;
  for (let i = 0; i < TRACE_N; i++) {
    const r = playOne(false);
    if (!r) continue;
    total++; rsum += r.rounds || 0;
    if (r.winner === 'kids') win++;
  }
  console.log(`\n=== Lv${LV} 跑 ${total} 场（原始 state 读取）===`);
  console.log(`孩子胜率 ${(win / total * 100).toFixed(1)}%  平均回合 ${(rsum / total).toFixed(1)}`);
} else {
  console.log('\n=== 逐回合 ===');
  const r = playOne(true);
  console.log(`\n结果: winner=${r && r.winner}  回合=${r && r.rounds}`);
}
