// battle.umd.js — 自动生成（gen_umd.js，源：lib/battle.js）。勿手改，改源后重新生成。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../lib/species'), require('../../lib/engine'), require('../../lib/store'));
  } else {
    root.BattleMod = factory(root.SpeciesMod, root.EngineMod, root.LocalStore);
  }
})(typeof self !== 'undefined' ? self : this, function (species, engine, store) {
// battle.js — 回合制对战：兄妹1v1(打AI分身) / 单人Boss / 兄妹联手Boss / 好友跨家庭真人对战
// v3：统一为「1 个真人 + N 个 AI」；战斗状态落盘持久化
// v4：动态经验（随对方等级浮动）+ 好友跨家庭真人对战（turn 轮换，双方各自轮询）
'use strict';
var speciesById = species.speciesById; var skillById = species.skillById; var makeBoss = species.makeBoss; var typeMult = species.typeMult; var ELEMENT_NAMES = species.ELEMENT_NAMES; var currentBoss = species.currentBoss; var BOSS_ROSTER = species.BOSS_ROSTER;
var addXP = engine.addXP; var addIntimacy = engine.addIntimacy; var stageOf = engine.stageOf; var dateKey = engine.dateKey;
var store = store;

// 战斗状态存 db.battles（随 save() 防抖落盘，服务重启不丢）
const battles = {
  get: id => store.getBattle(id),
  set: (id, st) => store.putBattle(id, st),
  delete: id => store.delBattle(id)
};

function snapshot(child, isAI, familyId) {
  const sp = speciesById(child.pet.speciesId);
  const unlocked = (child.pet.skills || []).filter(id => { const s = skillById(id); return s && s.unlockLv <= child.level; });
  // v9: 技能出战配置（4 选 3）——合法配置取交集，未配置/非法则默认全带（向后兼容）
  const lo = child.battleLoadout;
  const loadout = (Array.isArray(lo) && lo.length >= 1 && lo.length <= 3 && lo.every(id => unlocked.includes(id)))
    ? unlocked.filter(id => lo.includes(id)) : unlocked;
  return {
    childId: child.id, familyId: familyId || null, name: child.name, speciesName: sp.name, emoji: sp.emoji, element: sp.element,
    speciesId: child.pet.speciesId,
    stageKey: stageOf(child.level).key,   // v5: 前端按形态裁立绘
    level: child.level,
    stats: { ...child.pet.stats },
    hpMax: child.pet.stats.hp * 5 + (child.pet.maxHpBonus || 0) * 3 + child.level * 4,
    hp: 0,
    skills: loadout,
    isAI: !!isAI,          // true = AI 分身/盟友，其战斗结果不回写真实孩子数据
    side: null
  };
}

// GBA 简化伤害公式（v4.1: 6% 暴击 ×1.5）
function calcDamage(attacker, defender, skill) {
  const isWis = skill.element === 'psy';
  const A = isWis ? attacker.stats.wis : attacker.stats.atk;
  const D = isWis ? defender.stats.wis : defender.stats.def;
  const stab = (attacker.element === skill.element) ? 1.5 : 1;
  const mult = typeMult(skill.element, defender.element);
  const rand = 0.85 + Math.random() * 0.15;
  let dmg = Math.floor(((2 * attacker.level / 5 + 2) * skill.power * A / Math.max(1, D) / 50 + 2) * stab * mult * rand);
  if (mult > 1) dmg = Math.max(dmg, 2); else dmg = Math.max(dmg, 1);
  const crit = Math.random() < 0.06;
  if (crit) dmg = Math.floor(dmg * 1.5);
  return { dmg, mult, crit };
}

// v4.1: 敏捷接入战斗——闪避率 = 双方 spd 差 × 2%，下限 0 上限 15%
function dodgeChance(attacker, defender) {
  return Math.max(0, Math.min(0.15, (defender.stats.spd - attacker.stats.spd) * 0.02));
}

function aiPick(fighter, rage) {
  const usable = fighter.skills.map(id => skillById(id)).filter(Boolean);
  if (!usable.length) return null;
  if (rage) return usable.reduce((a, b) => (b.power > a.power ? b : a));   // Boss 狂暴：血量<30% 改用最强技能
  return usable[Math.floor(Math.random() * usable.length)];
}

// mode: 'sibling' | 'boss' | 'coop' | 'friend'
// sibling/boss/coop：1 真人(下标0) + N 个 AI，turn 恒为 0
// friend：跨家庭真人 1v1，两个真人轮流出招（各自轮询接口）
function startBattle(family, mode, childA, childB, familyB, bossDefOverride) {
  if ((mode === 'sibling' || mode === 'coop' || mode === 'friend') && !childB) return { error: '需要指定对手' };

  const fa = snapshot(childA, false, family.id);            // 真人
  let fb = null, boss = null;
  if (mode === 'sibling' || mode === 'coop') {
    fb = snapshot(childB, true, family.id);                 // AI 分身/盟友
  } else if (mode === 'friend') {
    fb = snapshot(childB, false, familyB ? familyB.id : null);   // 跨家庭真人
  }
  const lvl = mode === 'coop' ? Math.max(childA.level, childB.level) + 1 : childA.level;
  let bossDef = null;
  if (mode === 'boss' || mode === 'coop') {
    bossDef = bossDefOverride || currentBoss();   // v9: 赛季轮换 Boss；v12.2: 可注入指定 Boss（标定脚本/未来活动用）
    boss = makeBoss(lvl, mode === 'coop', bossDef);
    boss.isAI = true; boss.childId = null; boss.side = 'boss';
  }

  let fighters;
  if (mode === 'boss') fighters = [fa, boss];
  else if (mode === 'coop') fighters = [fa, fb, boss];
  else fighters = [fa, fb];

  const state = {
    id: 'bt' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
    familyId: family.id, mode, status: 'active', round: 1,
    familyIds: mode === 'friend' ? [family.id, familyB ? familyB.id : null] : [family.id],
    fighters,
    bossId: bossDef ? bossDef.id : null,   // v9: 首杀图鉴用
    turn: 0,                    // 开局先手为发起方
    actedThisRound: false,
    log: [], createdAt: Date.now(), finishedAt: null, rewarded: false
  };
  state.fighters.forEach(f => { f.hp = f.hpMax || (f.stats.hp * 5); });
  if (mode === 'sibling' || mode === 'friend') { fa.side = 'me'; fb.side = 'foe'; }
  if (mode === 'coop') { fa.side = 'me'; fb.side = 'ally'; }
  // v4.1: 好友对战按敏捷定先手（平局发起方先手）；其余模式真人恒先
  if (mode === 'friend') state.turn = (fb.stats.spd > fa.stats.spd) ? 1 : 0;

  // v9: 遭遇图鉴——开战即点亮对方物种剪影（Boss / 兄妹分身 / 好友灵伴）
  recordEncounters(family, childA, state);

  battles.set(state.id, state);
  return { battleId: state.id, state: publicBattle(state) };
}

// v9: 遭遇图鉴——把这场战斗里遇到的物种写进 child.pokedexSeen（幂等）
function recordEncounters(family, childA, st) {
  if (!childA.pet) return;
  if (!childA.pokedexSeen || typeof childA.pokedexSeen !== 'object') childA.pokedexSeen = {};
  let changed = false;
  for (const f of st.fighters) {
    if (f === st.fighters[0] || !f.speciesId) continue;   // 只记对手方
    if (!childA.pokedexSeen[f.speciesId]) { childA.pokedexSeen[f.speciesId] = new Date().toISOString(); changed = true; }
  }
  return changed;
}

// v9: 首杀图鉴——首次击败某 Boss：点亮图鉴 + 一次性羁绊奖励（幂等）
const FIRST_KILL_REWARD = 5;
function bossDefById(bossId) { return BOSS_ROSTER.find(b => b.id === bossId) || null; }
function recordBossKill(fam, child, bossId, bossName) {
  if (!fam || !child || !bossId) return null;
  if (!child.pokedexKills || typeof child.pokedexKills !== 'object') child.pokedexKills = {};
  if (!child.pokedexSeen || typeof child.pokedexSeen !== 'object') child.pokedexSeen = {};
  if (child.pokedexKills[bossId]) return null;   // 只奖一次
  child.pokedexKills[bossId] = new Date().toISOString();
  const def = bossDefById(bossId);
  const spId = def ? def.speciesId : null;
  if (spId && !child.pokedexSeen[spId]) child.pokedexSeen[spId] = new Date().toISOString();
  addIntimacy(child, FIRST_KILL_REWARD);
  fam.ledger.unshift({
    id: store.newId('l'), ts: new Date().toISOString(),
    childId: child.id, childName: child.name, delta: FIRST_KILL_REWARD, xp: 0,
    reason: `🏅 首杀图鉴：首次击败「${bossName || (def && def.name) || bossId}」（图鉴点亮 +${FIRST_KILL_REWARD} 羁绊）`,
    by: 'system', after: child.intimacy
  });
  return { bossId, reward: FIRST_KILL_REWARD };
}

// 玩家出招：真人出招 → AI 依次行动 →（好友对战）轮转到对方真人
function playerMove(battleId, family, child, skillIndex) {
  const st = battles.get(battleId);
  if (!st) return { error: '战斗不存在或已结束' };
  if (!st.familyIds.includes(family.id)) return { error: '战斗不存在或已结束' };
  if (st.status !== 'active') return { error: '战斗已结束' };

  const fi = st.fighters.findIndex(f => f.childId === child.id && !f.isAI);
  if (fi < 0) return { error: '你不在这场战斗中' };
  if (st.turn !== fi) return { error: '还没轮到你' };

  const me = st.fighters[fi];
  const skill = skillById((me.skills || [])[skillIndex]);
  if (!skill) return { error: '技能不存在' };

  // 1) 真人出招：选一个存活的敌方目标
  const foes = st.fighters.filter(f => f !== me && f.side !== 'ally' && f.hp > 0);
  if (!foes.length) return { error: '没有可攻击的目标' };
  doAttack(st, me, foes[0], skill);
  if (checkEnd(st, family)) return finishWrap(st);

  // 2) 所有 AI 依次行动
  for (const f of st.fighters) {
    if (!f.isAI || f.hp <= 0) continue;
    let target;
    if (f.side === 'boss') {
      const alive = st.fighters.filter(x => x !== f && x.side !== 'boss' && x.hp > 0);
      if (!alive.length) break;
      target = alive[Math.floor(Math.random() * alive.length)];
    } else {
      // AI 敌人/AI 盟友 都打对面
      const opposed = st.fighters.filter(x => x !== f && ((f.side === 'foe') ? x.side !== 'foe' : x.side === 'boss') && x.hp > 0);
      if (!opposed.length) continue;
      target = opposed[0];
    }
    const rage = f.side === 'boss' && f.hpMax && f.hp <= f.hpMax * 0.3;
    const sk = aiPick(f, rage);
    if (!sk) continue;
    doAttack(st, f, target, sk);
    if (checkEnd(st, family)) return finishWrap(st);
  }

  st.round++;
  if (st.round > 100) { st.status = 'finished'; st.winner = st.mode === 'sibling' || st.mode === 'friend' ? 1 : 'boss'; checkEnd(st, family); return finishWrap(st); }
  if (checkEnd(st, family)) return finishWrap(st);
  // 好友对战：轮转到对方真人；其余模式真人恒为下标 0
  if (st.mode === 'friend') {
    const other = st.fighters.findIndex(f => !f.isAI && f.childId !== child.id);
    st.turn = other >= 0 ? other : fi;
  } else {
    st.turn = fi;
  }
  battles.set(st.id, st);
  return { ok: true, state: publicBattle(st) };
}

function doAttack(st, attacker, defender, skill) {
  if (Math.random() < dodgeChance(attacker, defender)) {
    st.log.unshift(`R${st.round} ${defender.name} 闪避了 ${attacker.name} 的【${skill.name}】`);
    if (st.log.length > 60) st.log.length = 60;
    return;
  }
  const { dmg, mult, crit } = calcDamage(attacker, defender, skill);
  defender.hp = Math.max(0, defender.hp - dmg);
  const eff = mult === 2 ? '效果绝佳！' : mult === 0.5 ? '效果不佳…' : '';
  st.log.unshift(`R${st.round} ${attacker.name}的【${skill.name}】(${ELEMENT_NAMES[skill.element]}) 对 ${defender.name} 造成 ${dmg} 伤害${crit ? ' 暴击！' : ''}${eff ? '（' + eff + '）' : ''}`);
  if (st.log.length > 60) st.log.length = 60;
}

function checkEnd(st, family) {
  if (st.status !== 'active') return true;
  if (st.mode === 'sibling' || st.mode === 'friend') {
    if (st.fighters[0].hp <= 0 || st.fighters[1].hp <= 0) {
      st.status = 'finished';
      st.winner = st.fighters[0].hp > 0 ? 0 : 1;
      st.finishedAt = Date.now();
    }
  } else {
    const boss = st.fighters.find(f => f.side === 'boss');
    const kids = st.fighters.filter(f => f.side !== 'boss');
    if (boss && boss.hp <= 0) { st.status = 'finished'; st.winner = 'kids'; st.finishedAt = Date.now(); }
    else if (kids.length && kids.every(k => k.hp <= 0)) { st.status = 'finished'; st.winner = 'boss'; st.finishedAt = Date.now(); }
  }
  if (st.status === 'finished') {
    st.finishedAt = st.finishedAt || Date.now();
    if (!st.rewarded) { st.rewarded = true; grantBattleRewards(st); }
    battles.set(st.id, st);
  }
  return st.status === 'finished';
}

function finishWrap(st) { battles.set(st.id, st); return { ok: true, finished: true, state: publicBattle(st) }; }

// 发放对战经验（v4 动态）：只发真人；绝不碰羁绊。
// 胜 = 6 + 对方(或Boss)等级；负 = 2 + 对方(或Boss)等级÷2（向下取整）
// v4.1: 每日对战经验有上限（config.battleXpDailyCap，默认 30），防止对战刷级反超习惯养成主线
// 好友对战按各 fighter 自己的家庭写账本（snapshot.familyId）
function grantBattleRewards(st) {
  const results = [];
  const humans = st.fighters.filter(f => f.childId && !f.isAI);
  for (const f of humans) {
    const fam = store.familyById(f.familyId);
    if (!fam) continue;
    const child = fam.children[f.childId];
    if (!child) continue;
    const opp = st.fighters.find(x => x !== f && x.side !== 'ally');
    const oppLv = opp ? opp.level : child.level;
    let win;
    if (st.mode === 'sibling' || st.mode === 'friend') win = (st.winner === st.fighters.indexOf(f));
    else win = (st.winner === 'kids');
    const xp = win ? 6 + oppLv : 2 + Math.floor(oppLv / 2);
    // 每日经验上限：家长设置值为 Lv1 基础，随等级提升每级 +3（v7：封顶不再一档到底）
    const base = (fam.config && fam.config.battleXpDailyCap !== undefined) ? fam.config.battleXpDailyCap : 30;
    const cap = base + Math.max(0, child.level - 1) * 3;
    const today = dateKey();
    if (!child.battleXp || child.battleXp.date !== today) child.battleXp = { date: today, amount: 0 };
    const remaining = Math.max(0, cap - (child.battleXp.amount || 0));
    const actual = Math.min(xp, remaining);
    child.battleXp.amount = (child.battleXp.amount || 0) + actual;
    const capped = actual < xp;
    if (actual > 0) addXP(child, actual);
    // v9: Boss 赛季首杀——击败当前轮换 Boss 且首次，点亮图鉴 + 一次性奖励
    let firstKill = null;
    if (win && (st.mode === 'boss' || st.mode === 'coop') && st.bossId) {
      firstKill = recordBossKill(fam, child, st.bossId);
    }
    results.push({ childId: f.childId, childName: f.name, win, xp: actual, capped, stage: stageOf(child.level).name, firstKill });
    fam.ledger.unshift({
      id: store.newId('l'), ts: new Date().toISOString(),
      childId: child.id, childName: child.name, delta: 0, xp: actual,
      reason: `对战${win ? '胜利' : '失败'}（${st.mode === 'friend' ? '好友对战' : st.mode === 'sibling' ? '兄妹切磋' : 'Boss挑战'} vs Lv${oppLv}，+${xp} 经验${capped ? `，今日对战经验已达上限 ${cap}，实发 ${actual}` : ''}）`,
      by: 'system', after: child.intimacy
    });
  }
  return results;
}

function publicBattle(st) {
  if (!st) return null;
  return {
    id: st.id, mode: st.mode, status: st.status, round: st.round, turn: st.turn,
    winner: st.winner === undefined ? null : st.winner, log: st.log.slice(0, 12),
    fighters: st.fighters.map(f => ({
      childId: f.childId || null, name: f.name, emoji: f.emoji, element: f.element,
      speciesName: f.speciesName || f.name, level: f.level,
      hp: f.hp, hpMax: f.hpMax, stats: f.stats, isAI: !!f.isAI, side: f.side || null,
      skills: (f.skills || []).map(id => { const s = skillById(id); return s ? { id: s.id, name: s.name, element: s.element, power: s.power } : null; }).filter(Boolean)
    }))
  };
}

function getBattle(battleId, family) {
  const st = battles.get(battleId);
  if (!st || !st.familyIds.includes(family.id)) return null;
  // 结束但未发奖的战斗补发（如进程在结算前重启）
  if (st.status === 'finished' && !st.rewarded) { st.rewarded = true; grantBattleRewards(st); battles.set(st.id, st); }
  return publicBattle(st);
}

// 每日场次（防沉迷）
function battleTodayKey() { const d = new Date(); return d.toISOString().slice(0, 10); }
function canBattleToday(child, limit) {
  if (!limit || limit <= 0) return true;
  const k = battleTodayKey();
  if (child.battleCount?.date !== k) return true;
  return child.battleCount.count < limit;
}
function noteBattle(child) {
  const k = battleTodayKey();
  if (child.battleCount?.date !== k) child.battleCount = { date: k, count: 0 };
  child.battleCount.count++;
}

return { startBattle, playerMove, getBattle, canBattleToday, noteBattle, publicBattle, recordBossKill, bossDefById, FIRST_KILL_REWARD };

});
