'use strict';
// v12.2 微调验证：推荐参数 vs 2 个候选（抬升 Lv15+ 胜率 3-6pp），快扫 12 档
const path = require('path');
const store = require('../lib/store');
const E = require('../lib/engine');
const B = require('../lib/battle');
const { speciesById, skillById, setBossTune, BOSS_ROSTER } = require('../lib/species');

const N = Number(process.argv[2]) || 300;
store.load();
const family = store.createFamily('tune' + Date.now(), 'pass123', '微调家', 'q', 'a').family;
const child = store.addChild(family, '微调宝', '三年级');
const sp = speciesById('firam');
const BOSS_DEFS = ['boss_rime', 'boss_mount', 'boss_night'].map(id => BOSS_ROSTER.find(b => b.id === id));

function resetChild(lv) {
  child.level = lv; child.xp = E.xpForLevel(lv);
  child.pet = { speciesId: sp.id, nickname: sp.name, stats: { ...sp.base }, freePoints: 0, skills: sp.skills.slice(), maxHpBonus: lv - 1 };
  const order = ['atk', 'def', 'hp', 'spd', 'wis']; let p = (lv - 1) * 2, i = 0;
  while (p > 0) { child.pet.stats[order[i % 5]] += 1; i++; p--; }
  child.intimacy = 70; child.fainted = false; child.feedDate = E.dateKey(new Date());
  child.battleCount = { date: '', count: 0 }; child.pokedexKills = {}; child.pokedexSeen = {};
  child.battleXp = { date: E.dateKey(new Date()), amount: 0 };
}

const LEVELS = [1, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20];
const CANDS = {
  A_推荐: { statPerLevel: 0.4, mulA: 0.9, mulB: 1, mulC: 1.1, hpBase: 1.15, hpStep: 0.01, hpCap: 1.25 },
  B_mulC105: { statPerLevel: 0.4, mulA: 0.9, mulB: 1, mulC: 1.05, hpBase: 1.15, hpStep: 0.01, hpCap: 1.25 },
  C_hpCap118: { statPerLevel: 0.4, mulA: 0.9, mulB: 1, mulC: 1.1, hpBase: 1.15, hpStep: 0.008, hpCap: 1.18 }
};
const BANDS = [[1, 4, 0.55, 0.70], [5, 9, 0.45, 0.60], [10, 14, 0.40, 0.55], [15, 20, 0.35, 0.50]];
const score = rows => rows.reduce((s, r) => {
  const b = BANDS.find(x => r.lv >= x[0] && r.lv <= x[1]);
  const dev = Math.max(0, Math.abs(r.typical - (b[2] + b[3]) / 2) - (b[3] - b[2]) / 2);
  return s + dev * dev;
}, 0);

for (const [name, tune] of Object.entries(CANDS)) {
  setBossTune(tune);
  const rows = [];
  for (const lv of LEVELS) {
    let win = 0, tot = 0, rnd = 0;
    for (const bd of BOSS_DEFS) {
      const k = Math.round(N / BOSS_DEFS.length);
      for (let i = 0; i < k; i++) {
        resetChild(lv);
        let st = B.startBattle(family, 'boss', child, null, null, bd);
        let guard = 0;
        while (st.state.status === 'active' && guard++ < 120) {
          const me = st.state.fighters[0];
          const idx = Math.floor(Math.random() * (me.skills || [1]).length);
          const r2 = B.playerMove(st.battleId, family, child, idx);
          if (!r2.state) break;
          st.state = r2.state;
        }
        store.delBattle(st.battleId);
        if (st.state.winner === 'kids') win++;
        rnd += guard; tot++;
      }
    }
    rows.push({ lv, typical: win / tot, rounds: rnd / tot });
  }
  const s = score(rows);
  console.log(`\n== ${name} ==  评分 ${s.toFixed(4)}`);
  console.log(rows.map(r => `Lv${r.lv}:${(r.typical * 100).toFixed(0)}%(${r.rounds.toFixed(1)}回合)`).join('  '));
}
