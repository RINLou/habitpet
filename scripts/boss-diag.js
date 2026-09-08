'use strict';
// 诊断：为什么 Boss 胜率从 Lv2 96% 断崖到 Lv4 0%
// 对比 孩子 vs Boss 的属性/血量/期望每回合伤害的成长速率
const store = require('../lib/store');
const E = require('../lib/engine');
const { speciesById, skillById, makeBoss } = require('../lib/species');

store.load();
const fr = store.createFamily('diag' + Date.now(), 'pass123', '诊断家', 'q', 'a');
const family = fr.family;
const child = store.addChild(family, '诊断宝', '');
const sp = speciesById('firam');

console.log('=== 灵伴基础 ===');
console.log('base:', JSON.stringify(sp.base));
console.log('skills:');
sp.skills.forEach(id => {
  const s = skillById(id);
  console.log(`  ${id} ${s ? s.name : '?'} power=${s ? s.power : '?'} unlockLv=${s ? s.unlockLv : '?'} elem=${s ? s.element : '?'}`);
});

function childAt(lv) {
  const stats = { ...sp.base };
  const pts = (lv - 1) * 2;
  const order = ['atk', 'def', 'hp', 'spd', 'wis'];
  for (let i = 0; i < pts; i++) stats[order[i % 5]] += 1;
  return {
    lv,
    stats,
    hpMax: stats.hp * 5 + lv * 4,
    skills: sp.skills.map(id => skillById(id)).filter(s => s && s.unlockLv <= lv)
  };
}

// 复现 battle.js 的伤害公式（期望值，rand 取中 0.925，无暴击）
function expDamage(attackerLv, A, D, power, stab) {
  return ((2 * attackerLv / 5 + 2) * power * A / Math.max(1, D) / 50 + 2) * (stab || 1) * 0.925;
}

console.log('\n═══ 成长对比（均衡加点）═══');
console.log('Lv | 孩子 atk/def/hp  hpMax 技能 | Boss atk/def/hp hpMax | 孩子DPS→Boss回合 | BossDPS→孩子回合 | 谁赢');
console.log('-'.repeat(110));

for (const lv of [1, 2, 3, 4, 5, 6, 8, 10, 12]) {
  const c = childAt(lv);
  const b = makeBoss(lv, false);
  const bestSkill = c.skills.reduce((a, s) => (!a || s.power > a.power ? s : a), null);
  const bossPower = Math.max(...b.skills.map(id => (skillById(id) || { power: 0 }).power));

  const cDmg = bestSkill ? expDamage(lv, c.stats.atk, b.stats.def, bestSkill.power, 1.5) : 0;
  const bDmg = expDamage(lv, b.stats.atk, c.stats.def, bossPower, 1);

  const roundsToKillBoss = cDmg > 0 ? b.hpMax / cDmg : Infinity;
  const roundsToKillKid = bDmg > 0 ? c.hpMax / bDmg : Infinity;

  const verdict = roundsToKillBoss < roundsToKillKid ? '孩子' : 'Boss';
  console.log(
    String(lv).padStart(2) + ' | ' +
    `${String(c.stats.atk).padStart(2)}/${String(c.stats.def).padStart(2)}/${String(c.stats.hp).padStart(2)}`.padEnd(15) +
    String(c.hpMax).padStart(5) + String(c.skills.length).padStart(3) + '  | ' +
    `${String(b.stats.atk).padStart(2)}/${String(b.stats.def).padStart(2)}/${String(b.stats.hp).padStart(2)}`.padEnd(14) +
    String(b.hpMax).padStart(5) + ' | ' +
    (isFinite(roundsToKillBoss) ? roundsToKillBoss.toFixed(1) : '∞').padStart(14) + ' | ' +
    (isFinite(roundsToKillKid) ? roundsToKillKid.toFixed(1) : '∞').padStart(14) + ' | ' + verdict
  );
}

console.log('\n═══ 成长速率 ═══');
const c1 = childAt(1), c12 = childAt(12);
const b1 = makeBoss(1, false), b12 = makeBoss(12, false);
const sum = s => s.atk + s.def + s.hp + s.spd + s.wis;
console.log(`孩子 Lv1→Lv12: 五维和 ${sum(c1.stats)} → ${sum(c12.stats)}  (+${sum(c12.stats) - sum(c1.stats)})`);
console.log(`Boss Lv1→Lv12: 五维和 ${sum(b1.stats)} → ${sum(b12.stats)}  (+${sum(b12.stats) - sum(b1.stats)})`);
console.log(`孩子 hpMax ${c1.hpMax} → ${c12.hpMax}  (×${(c12.hpMax / c1.hpMax).toFixed(2)})`);
console.log(`Boss hpMax ${b1.hpMax} → ${b12.hpMax}  (×${(b12.hpMax / b1.hpMax).toFixed(2)})`);
console.log(`\n结论：Boss 五维成长 ${sum(b12.stats) - sum(b1.stats)} vs 孩子 ${sum(c12.stats) - sum(c1.stats)}`);
