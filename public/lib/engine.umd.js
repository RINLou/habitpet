// engine.umd.js — 自动生成（gen_umd.js，源：lib/engine.js）。勿手改，改源后重新生成。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../lib/species'), require('../../lib/store'));
  } else {
    root.EngineMod = factory(root.SpeciesMod, root.LocalStore);
  }
})(typeof self !== 'undefined' ? self : this, function (species, store) {
// engine.js — 数值引擎：经验/等级/进化/五维 + 月度/学期懒结算
'use strict';
var speciesById = species.speciesById;
var newId = store.newId;

// —— 投诉记录（v3：数组化）———————————————————————
// status: active（生效中）/ cancelled（已取消）/ archived（已随月度归档）
function activeComplaints(child, mk) {
  if (!Array.isArray(child.complaints)) return [];
  return child.complaints.filter(c => c.status === 'active' && (!mk || c.monthKey === mk));
}

// —— 经验与等级 ——————————————————————————————
// 曲线：level = floor(sqrt(xp/3.2))，校准目标：
//   正常孩子一学期约 1300 经验 → Lv20 恰好觉醒
//   只投喂不搞大项（约135经验）→ Lv6 幼体
function levelFromXp(xp) { return Math.max(1, Math.floor(Math.sqrt(xp / 3.2))); }
function xpForLevel(lv) { return Math.ceil(3.2 * lv * lv); }

const STAGES = [
  { lv: 1,  key: 'orb',      name: '愿望球' },   // v4: 蛋→原创改版精灵球（狼不从蛋里出来）
  { lv: 5,  key: 'juvenile', name: '幼体' },
  { lv: 12, key: 'adult',    name: '成体' },
  { lv: 20, key: 'awaken',   name: '觉醒' }
];
function stageOf(lv) {
  let st = STAGES[0];
  for (const s of STAGES) if (lv >= s.lv) st = s;
  return st;
}

// 加经验 → 升级 → 五维自动成长 + 自由点
function addXP(child, xp) {
  if (!child.pet || xp <= 0) return { leveled: false, from: child.level, to: child.level };
  const from = child.level;
  child.xp += xp;
  child.level = levelFromXp(child.xp);
  if (child.level > from) {
    const sp = speciesById(child.pet.speciesId);
    let gi = 0;
    for (let lv = from + 1; lv <= child.level; lv++) {
      // 每升 1 级：按种族倾向轮转自动 +1，另给 2 点自由分配
      child.pet.stats[sp.growth[gi % sp.growth.length]] += 1; gi++;
      child.pet.freePoints = (child.pet.freePoints || 0) + 2;
      child.pet.maxHpBonus = (child.pet.maxHpBonus || 0) + 1; // 体力额外+1保血量成长
    }
    return { leveled: true, from, to: child.level };
  }
  return { leveled: false, from, to: child.level };
}

// 扣经验（撤销账本时使用）：只回退 xp 与等级，不回收已加到五维的成长点
function subXP(child, xp) {
  if (!child.pet || xp <= 0) return { from: child.level, to: child.level };
  const from = child.level;
  child.xp = Math.max(0, child.xp - xp);
  child.level = levelFromXp(child.xp);
  return { from, to: child.level };
}

// —— 亲密度（月度零花钱货币，只来自真实好习惯）———————
// 亲密度加成（不叠加取最高）：觉醒形态 +3%；S/SS 隐藏宠物 +5%
function intimacyMult(child) {
  const sp = child.pet ? speciesById(child.pet.speciesId) : null;
  if (sp && (sp.tier === 'S' || sp.tier === 'SS')) return 1.05;
  if (stageOf(child.level).key === 'awaken') return 1.03;
  return 1;
}
// 正向加分享受加成；小数部分挂在 intimacyFrac 累积，凑整发放（保证长期恰为 3%/5%）
function addIntimacy(child, delta) {
  if (delta > 0) {
    const m = intimacyMult(child);
    if (m > 1) {
      child.intimacyFrac = (child.intimacyFrac || 0) + delta * (m - 1);
      const whole = Math.floor(child.intimacyFrac);
      if (whole > 0) { child.intimacyFrac -= whole; delta += whole; }
    }
  }
  child.intimacy = Math.max(0, child.intimacy + delta);
}

// —— 饿死机制（v4）：3 天没投喂 -10 亲密度（一次性）；5 天 → 昏迷 ————
// 「不动」= 没投喂（对战/申报不算吃饭）；生病暂停 / 假期模式冻结计时
function daysSince(dateStr, now = new Date()) {
  if (!dateStr) return 0;
  const last = new Date(dateStr + 'T00:00:00');
  if (isNaN(last)) return 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - last) / 86400000);
}
function hungerCheck(family, child, now = new Date()) {
  if (!child.pet || child.fainted || child.pausedAt || family.config.holidayMode) return null;
  if (!child.feedDate) return null;                 // 新领养从未投喂：不倒扣
  const days = daysSince(child.feedDate, now);
  if (days >= 5) {
    child.fainted = true; child.faintedAt = now.toISOString();
    family.ledger.unshift({ id: newId('l'), ts: now.toISOString(), childId: child.id, childName: child.name, delta: 0, xp: 0, reason: `宠物饿晕了（${days} 天没投喂），需要复活`, by: 'system' });
    return { type: 'faint', days };
  }
  if (days >= 3 && child.hungerPenaltyDate !== 'applied') {
    child.hungerPenaltyDate = 'applied';            // 一次性，投喂后重置
    addIntimacy(child, -10);
    family.ledger.unshift({ id: newId('l'), ts: now.toISOString(), childId: child.id, childName: child.name, delta: -10, xp: 0, reason: '宠物饿肚子（3 天没投喂）', by: 'system' });
    return { type: 'hungry', days };
  }
  return null;
}
// 复活二选一：'level' 降 5 级（xp/等级回退，五维成长不回收，与账本撤销口径一致）；'intimacy' 扣 50 亲密度
function revivePet(family, child, mode, now = new Date()) {
  if (!child.pet || !child.fainted) return { error: '宠物没有昏迷' };
  if (mode === 'intimacy') {
    if (child.intimacy < 50) return { error: '亲密度不足 50，只能选择降级复活' };
    addIntimacy(child, -50);
    family.ledger.unshift({ id: newId('l'), ts: now.toISOString(), childId: child.id, childName: child.name, delta: -50, xp: 0, reason: '宠物复活（消耗 50 亲密度）', by: 'system' });
  } else {
    const from = child.level;
    const to = Math.max(1, from - 5);
    child.xp = xpForLevel(to);
    child.level = levelFromXp(child.xp);
    family.ledger.unshift({ id: newId('l'), ts: now.toISOString(), childId: child.id, childName: child.name, delta: 0, xp: 0, reason: `宠物复活（降级 Lv${from} → Lv${child.level}）`, by: 'system' });
  }
  child.fainted = false; child.faintedAt = null;
  child.hungerPenaltyDate = '';
  child.feedDate = dateKey(now);                    // 复活当天算"吃过饭"，防止立刻再晕
  return { ok: true, level: child.level };
}
// S/SS 隐藏宠解锁资格：S=曾任一完整学期觉醒；SS=连续两个完整学期觉醒
function hiddenPetEligibility(child) {
  const aw = child.awakenedSemesters || [];
  const ss = aw.some(i => aw.includes(i + 1));
  return { s: aw.length >= 1, ss };
}

// —— 时间工具 ——————————————————————————————
function monthKey(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function dateKey(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function weekKey(d = new Date()) { // ISO 周标识（自豪每周限1次）
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return t.getUTCFullYear() + '-W' + wk;
}
function yesterdayKey() { const d = new Date(Date.now() - 86400000); return dateKey(d); }

// —— 周上限（防刷分；仅约束加分项）————————————————
function canEarnWeek(child, weeklyCap, amount) {
  if (!weeklyCap || weeklyCap <= 0) return true;
  return (child.weekEarned || 0) + amount <= weeklyCap;
}
function noteWeekEarn(child, amount) { if (amount > 0) child.weekEarned = (child.weekEarned || 0) + amount; }

// —— 月度懒结算（首次访问新月时触发；暂停计期间冻结）——————
function ensureMonth(family, child, now = new Date()) {
  if (child.pausedAt) return;                    // 暂停计：不重置不计连击不扣分
  const mk = monthKey(now);
  if (child.monthKey === mk) return;
  const lastMk = child.monthKey;                          // 尚未更新，即"上月"
  const complained = activeComplaints(child, lastMk).length > 0;
  child.monthKey = mk;
  // 归档上月投诉：保留历史可查，但不再计入新月
  if (Array.isArray(child.complaints)) {
    for (const c of child.complaints) {
      if (c.status === 'active' && (c.monthKey || lastMk) === lastMk) c.status = 'archived';
    }
  }
  child.weekEarned = 0;
  const rule = (child.rules && child.rules.noComplaint !== undefined) ? child.rules.noComplaint : family.rules.noComplaint;   // v4: 每孩子独立规则
  child.intimacy = family.config.initialIntimacy; // 先重置
  if (!complained) {                              // 再发上月无投诉奖 → 新月 100+100
    addIntimacy(child, rule);
    addXP(child, rule);
    family.ledger.unshift({ id: newId('l'), ts: now.toISOString(), childId: child.id, childName: child.name, delta: rule, xp: rule, reason: '上月无投诉奖励', by: 'system' });
  }
  family.ledger.unshift({ id: newId('l'), ts: now.toISOString(), childId: child.id, childName: child.name, delta: 0, xp: 0, reason: `月度结算：进入 ${mk}，亲密度重置为 ${family.config.initialIntimacy}${complained ? '（上月有投诉，无奖励）' : '（含无投诉+' + rule + '）'}`, by: 'system' });
}

// —— 学期懒结算（到开学日期自动；或家长手动）————————————
function settleSemester(family) {
  const sem = family.config.semester;
  const entries = [];
  for (const child of Object.values(family.children)) {
    if (child.pet) {
      const sp = speciesById(child.pet.speciesId);
      const entry = {
        childId: child.id, childName: child.name,
        speciesId: sp.id, speciesName: sp.name, emoji: sp.emoji,
        level: child.level, stats: { ...child.pet.stats }, freePoints: child.pet.freePoints || 0,
        semester: sem.name, archivedAt: new Date().toISOString()
      };
      child.pokedex.unshift(entry); entries.push(entry);
      // v4: 记录学期觉醒史（S/SS 解锁依据）
      if (stageOf(child.level).key === 'awaken' && !child.awakenedSemesters.includes(sem.index)) {
        child.awakenedSemesters.push(sem.index);
      }
    }
    child.xp = 0; child.level = 1; child.pet = null;
    child.fainted = false; child.faintedAt = null; child.hungerPenaltyDate = '';   // 新学期饿死状态清零
    child.milestone = { unlocked: false, used: false, applications: [] };
  }
  family.config.semester = { name: '新学期', index: sem.index + 1, startDate: null, autoDone: false };
  family.ledger.unshift({ id: newId('l'), ts: new Date().toISOString(), childId: null, childName: null, delta: 0, xp: 0, reason: `学期结算：${sem.name} 毕业 ${entries.length} 只宠物进图鉴`, by: 'system' });
  return entries;
}
function ensureSemester(family) {
  const c = family.config;
  if (c.semester.startDate && !c.semester.autoDone && Date.now() >= Date.parse(c.semester.startDate)) {
    settleSemester(family);
    return true;
  }
  return false;
}

// —— 投喂窗口（假期模式全天）————————————————————
function inFeedWindow(family, now = new Date()) {
  if (family.config.holidayMode) return true;
  const h = now.getHours();
  return h >= family.config.feedWindow.startHour && h < family.config.feedWindow.endHour;
}

// —— 随机灵汐事件（v5）：投喂后小概率触发彩蛋，经验/亲密度小额奖励 ————
// RNG 可注入：HABITPET_NO_RANDOM=1 时服务端固定为 0.99（测试确定性）；chance>=1 时必定触发
let rng = Math.random;
function setRng(f) { rng = typeof f === 'function' ? f : Math.random; }
const FEED_EVENTS = [
  { id: 'rain',     icon: '🌟', name: '心光雨',     desc: '月神路过，洒下一阵心光雨！',           xp: 5, intimacy: 0 },
  { id: 'smile',    icon: '🌙', name: '月神的微笑', desc: '灵伴讨人喜欢，被月神偷偷亲了一口',     xp: 2, intimacy: 3 },
  { id: 'stardust', icon: '✨', name: '星屑加餐',   desc: '一撮星屑落进食盆，嘎嘣脆！',           xp: 4, intimacy: 0 },
  { id: 'meteor',   icon: '☄️', name: '流星的尾巴', desc: '灵伴抓住了流星的尾巴，沾了一身好运',   xp: 3, intimacy: 0 }
];
function rollFeedEvent(family, child, now = new Date()) {
  if (!child.pet || child.fainted || child.pausedAt) return null;
  const chance = Number(family.config.randomEventChance);
  if (!(chance > 0)) return null;
  if (rng() >= Math.min(1, chance)) return null;
  const ev = FEED_EVENTS[Math.floor(rng() * FEED_EVENTS.length)];
  if (ev.xp) addXP(child, ev.xp);
  if (ev.intimacy) addIntimacy(child, ev.intimacy);
  family.ledger.unshift({
    id: newId('l'), ts: now.toISOString(), childId: child.id, childName: child.name,
    delta: ev.intimacy, xp: ev.xp,
    reason: `灵汐奇遇：${ev.name}（投喂时随机降临${ev.xp ? '，+' + ev.xp + ' 经验' : ''}${ev.intimacy ? '，+' + ev.intimacy + ' 亲密度' : ''}）`,
    by: 'system'
  });
  return ev;
}

return { levelFromXp, xpForLevel, stageOf, addXP, subXP, addIntimacy, intimacyMult, activeComplaints, monthKey, dateKey, weekKey, yesterdayKey, canEarnWeek, noteWeekEarn, ensureMonth, settleSemester, ensureSemester, inFeedWindow, STAGES, daysSince, hungerCheck, revivePet, hiddenPetEligibility, setRng, rollFeedEvent, FEED_EVENTS };

});
