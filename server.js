// server.js — 正式版入口：静态托管 + 全部 API（零依赖 Node）
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./lib/store');
const engine = require('./lib/engine');
const battle = require('./lib/battle');
const { SPECIES, speciesById, skillById, ELEMENT_NAMES, CHART } = require('./lib/species');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const PHOTO_DIR = path.join(__dirname, 'data', 'photos');

store.load();
fs.mkdirSync(PHOTO_DIR, { recursive: true });
store.dailyBackup();
// 测试确定性：HABITPET_NO_RANDOM=1 时随机事件 RNG 固定 0.99（chance=1 仍可强制触发）
if (process.env.HABITPET_NO_RANDOM) engine.setRng(() => 0.99);

// —— 工具 —————————————————————————————————
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
// 登录/找回限速（内存态）：key 连续失败 5 次锁 10 分钟
const failLog = {};
function rateOk(key) { const r = failLog[key]; return !r || Date.now() > r.until; }
function noteFail(key) { const r = failLog[key] = failLog[key] || { n: 0, until: 0 }; r.n++; if (r.n >= 5) { r.until = Date.now() + 10 * 60 * 1000; r.n = 0; } }
function clearFails(key) { delete failLog[key]; }
function readBody(req, limit = 3 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function auth(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  return token ? store.getSession(token) : null;
}
// 云端反向代理可能剥离 Authorization 头：三通道兜底（头 → 请求体 token → query token）
function authFlex(req, p, url) {
  return auth(req)
    || (p && p.token ? store.getSession(String(p.token).replace(/[^a-z0-9]/gi, '')) : null)
    || (url && url.searchParams.get('token') ? store.getSession(String(url.searchParams.get('token')).replace(/[^a-z0-9]/gi, '')) : null);
}
function ledger(family, child, delta, reason, by, xp) {
  family.ledger.unshift({
    id: store.newId('l'), ts: new Date().toISOString(),
    childId: child ? child.id : null, childName: child ? child.name : null,
    delta, xp: xp || 0, reason, by, reversed: false
  });
  if (family.ledger.length > 2000) family.ledger.length = 2000;
}
// 敏感操作二次确认（PIN）：结算 / 改规则 / 撤销账本 / 删投诉。PIN 只存哈希（v4.1）
function requirePin(f, p) {
  if (!store.verifyPin(f, p.pin)) return { code: 401, body: { error: 'PIN 错误' } };
  return null;
}
function saveEvidence(eventId, b64) {
  if (!b64 || typeof b64 !== 'string') return false;
  const m = b64.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!m) return false;
  fs.writeFileSync(path.join(PHOTO_DIR, eventId + '.img'), b64);
  return true;
}

// —— 业务辅助 ————————————————————————————
function petView(child) {
  if (!child.pet) return null;
  const sp = speciesById(child.pet.speciesId);
  if (!sp) return null;
  const st = engine.stageOf(child.level);
  const skills = sp.skills.map(id => skillById(id)).map(s => ({ ...s, unlocked: child.level >= s.unlockLv }));
  return {
    speciesId: sp.id, speciesName: sp.name, nickname: child.pet.nickname || sp.name,
    emoji: st.key === 'orb' ? '⚪' : sp.emoji, element: sp.element, elementName: ELEMENT_NAMES[sp.element],
    stats: child.pet.stats, freePoints: child.pet.freePoints || 0,
    skills, stage: st.name, stageKey: st.key,
    xp: child.xp, xpNext: engine.xpForLevel(child.level + 1), xpCur: engine.xpForLevel(child.level), level: child.level,
    tier: sp.tier || null, fainted: !!child.fainted
  };
}
// 好友列表视图（引用失效自动剔除）
function friendViews(child) {
  const out = [];
  for (const fr of child.friends || []) {
    const fam = store.familyById(fr.familyId);
    const c = fam && fam.children[fr.childId];
    if (!c) continue;
    out.push({
      familyId: fr.familyId, childId: c.id, name: c.name,
      friendCode: c.friendCode ? c.friendCode : store.ensureFriendCode(c),
      level: c.level, emoji: c.pet ? (speciesById(c.pet.speciesId) || {}).emoji : '⚪',
      lastSeenAt: c.lastSeenAt, online: !!(c.lastSeenAt && Date.now() - Date.parse(c.lastSeenAt) < 5 * 60 * 1000)
    });
  }
  return out;
}
// 发给我的未过期对战邀请
function pendingInvitesFor(child) {
  const now = Date.now(); const out = [];
  for (const inv of Object.values(store.allInvites())) {
    if (inv.toChildId !== child.id) continue;
    out.push({ id: inv.id, from: inv.from, ts: inv.ts, expiresAt: inv.expiresAt });
  }
  return out;
}
function complaintSrcName(rec) {
  return rec.src === 'teacher' ? '老师' : rec.src === 'grandparent' ? '爷爷奶奶' : (rec.srcName || '其他');
}
function childMe(family, child) {
  const now = new Date();
  engine.ensureSemester(family);
  engine.ensureMonth(family, child, now);
  child.lastSeenAt = now.toISOString();          // 对战大厅"最近活跃"
  const pausedDays = child.pausedAt ? Math.floor((Date.now() - child.pausedAt) / 86400000) : 0;
  return {
    id: child.id, name: child.name, grade: child.grade,
    intimacy: child.intimacy, xp: child.xp, level: child.level,
    pet: petView(child),
    fainted: !!child.fainted, faintedAt: child.faintedAt || null,
    hungerDays: (child.pet && !child.fainted && child.feedDate) ? engine.daysSince(child.feedDate, now) : 0,
    intimacyMult: engine.intimacyMult(child),
    feedStreak: child.feedStreak, fedToday: child.feedDate === engine.dateKey(),
    prideUsedThisWeek: child.prideWeekKey === engine.weekKey(),
    weekEarned: child.weekEarned || 0, weeklyCap: family.config.weeklyCap,
    battlesToday: child.battleCount?.date === engine.dateKey() ? child.battleCount.count : 0,
    battleDailyLimit: family.config.battleDailyLimit,
    holidayMode: family.config.holidayMode,
    paused: !!child.pausedAt, pausedDays,
    allowanceBase: family.config.baseAllowance,
    allowanceLocked: child.allowanceLocked,
    nextAllowance: family.config.baseAllowance + (child.allowanceLocked ? child.allowanceLocked.amount : 0),
    pending: child.pending, redemptions: child.redemptions.slice(0, 20), pokedex: child.pokedex,
    milestone: child.milestone, complaints: child.complaints,
    rules: child.rules || family.rules,
    rewards: family.rewards,
    semester: family.config.semester,
    eligibility: engine.hiddenPetEligibility(child),   // S/SS 解锁资格
    friendCode: store.ensureFriendCode(child),
    friends: friendViews(child),
    invites: pendingInvitesFor(child),
    siblings: Object.values(family.children).map(c => ({ id: c.id, name: c.name, intimacy: c.intimacy, level: c.level, petEmoji: c.pet ? (speciesById(c.pet.speciesId) || {}).emoji : '⚪' }))
  };
}
function ensureChild(family, childId) { return family.children[childId] || null; }

// —— 各 API ————————————————————————————————
const routes = {
  // 公共
  async register(sess, p) {
    const r = store.createFamily(p.username, p.password, p.familyName, p.securityQ, p.securityA);
    if (r.error) return { code: 400, body: r };
    const token = store.createSession(r.family.id, 'parent');
    return { code: 200, body: { ok: true, token, family: familyView(r.family) } };
  },
  // 自助找回第 1 步：拿密保问题
  async forgotQuestion(sess, p) {
    const f = store.findFamilyByUsername(p.username);
    if (!f) return { code: 404, body: { error: '账号不存在' } };
    if (!f.parent.securityQ) return { code: 404, body: { error: '该账号未设置密保问题，无法自助找回' } };
    return { code: 200, body: { ok: true, question: f.parent.securityQ } };
  },
  // 自助找回第 2 步：验答案 → 重置密码或 PIN（带限速防暴力枚举）
  async forgotReset(sess, p) {
    const f = store.findFamilyByUsername(p.username);
    if (!f || !f.parent.securityQ) return { code: 404, body: { error: '该账号未设置密保问题' } };
    const rk = 'fg:' + String(p.username || '').toLowerCase();
    if (!rateOk(rk)) return { code: 429, body: { error: '尝试次数过多，请 10 分钟后再试' } };
    if (!store.verifySecurityAnswer(f, p.answer)) { noteFail(rk); return { code: 401, body: { error: '密保答案错误' } }; }
    clearFails(rk);
    if (p.mode === 'pin') {
      if (!/^\d{4,8}$/.test(String(p.value || ''))) return { code: 400, body: { error: '新 PIN 需 4-8 位数字' } };
      const { salt, hash } = store.hashPassword(String(p.value));
      f.parent.pinSalt = salt; f.parent.pinHash = hash; f.parent.pinChanged = true;
    } else {
      if (!p.value || String(p.value).length < 6) return { code: 400, body: { error: '新密码至少 6 位' } };
      const { salt, hash } = store.hashPassword(p.value);
      f.parent.salt = salt; f.parent.hash = hash;
    }
    store.save(); return { code: 200, body: { ok: true } };
  },
  // 登录限速：同账号连续失败 5 次锁 10 分钟（防 PIN/密码暴力枚举；内存态，重启即清）
  async login(sess, p) {
    const fk = 'lg:' + String(p.username || '').trim().toLowerCase();
    if (!rateOk(fk)) return { code: 429, body: { error: '尝试次数过多，请 10 分钟后再试' } };
    const f = store.findFamilyByUsername(p.username);
    if (!f || !store.verifyPassword(p.password, f.parent.salt, f.parent.hash)) { noteFail(fk); return { code: 401, body: { error: '账号或密码错误' } }; }
    clearFails(fk);
    const token = store.createSession(f.id, 'parent');
    return { code: 200, body: { ok: true, token, family: familyView(f) } };
  },
  async bind(sess, p) {
    const r = store.consumeBindCode(p.code);
    if (r.error) return { code: 400, body: r };
    const token = store.createSession(r.familyId, 'child', r.childId);
    return { code: 200, body: { ok: true, token } };
  },

  // 孩子端
  async me(sess) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, sess.childId);
    if (!c) return { code: 404, body: { error: '孩子不存在' } };
    return { code: 200, body: childMe(f, c) };
  },
  async feed(sess) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, sess.childId);
    if (!c.pet) return { code: 400, body: { error: '先选一只宠物吧！' } };
    if (c.fainted) return { code: 400, body: { error: '宠物饿晕了，先复活再投喂' } };
    if (c.pausedAt) return { code: 400, body: { error: '暂停计期间休息养病，不扣分不计连击' } };
    if (!engine.inFeedWindow(f)) return { code: 400, body: { error: `投喂时间：${f.config.feedWindow.startHour}:00-${f.config.feedWindow.endHour}:00` } };
    const today = engine.dateKey();
    if (c.feedDate === today) return { code: 400, body: { error: '今天已经投喂过啦' } };
    const pts = (c.rules && c.rules.feed !== undefined) ? c.rules.feed : f.rules.feed;
    if (!engine.canEarnWeek(c, f.config.weeklyCap, pts)) return { code: 400, body: { error: `本周加分已达上限 ${f.config.weeklyCap}` } };
    c.feedStreak = (c.feedDate === engine.yesterdayKey()) ? c.feedStreak + 1 : 1;
    c.feedDate = today;
    engine.addIntimacy(c, pts); engine.addXP(c, pts); engine.noteWeekEarn(c, pts);
    ledger(f, c, pts, `每日作业投喂（连续第${c.feedStreak}天）`, 'auto');
    let bonus = 0;
    if (c.feedStreak > 0 && c.feedStreak % 7 === 0) {
      bonus = (c.rules && c.rules.streak !== undefined) ? c.rules.streak : f.rules.streak;
      engine.addIntimacy(c, bonus); engine.addXP(c, bonus); engine.noteWeekEarn(c, bonus);
      ledger(f, c, bonus, `连续打卡 ${c.feedStreak} 天奖励`, 'auto');
    }
    const feedEvent = engine.rollFeedEvent(f, c);   // v5: 随机灵汐奇遇（心光雨等）
    store.save();
    return { code: 200, body: { ok: true, intimacy: c.intimacy, streakBonus: bonus, feedEvent, state: childMe(f, c) } };
  },
  async submit(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, sess.childId);
    if (!c.pet) return { code: 400, body: { error: '先选一只宠物吧！' } };
    if (c.pausedAt) return { code: 400, body: { error: '暂停计期间好好休息～' } };
    const exMin = (c.rules && c.rules.examMin !== undefined) ? c.rules.examMin : (f.rules.examMin !== undefined ? f.rules.examMin : 80);
    const qzMin = (c.rules && c.rules.quizMin !== undefined) ? c.rules.quizMin : (f.rules.quizMin !== undefined ? f.rules.quizMin : 80);
    const types = { exam: [`考试≥${exMin}分`, 'exam'], quiz: [`默写/出门测≥${qzMin}%`, 'quiz'], pride: ['自豪的事', 'pride'], holiday: ['假期课外成就', 'pride'] };
    const t = types[p.type];
    if (!t) return { code: 400, body: { error: '未知类型' } };
    if (!f.config.holidayMode && p.type === 'holiday') return { code: 400, body: { error: '当前不在假期模式' } };
    if ((p.type === 'pride' || p.type === 'holiday') && c.prideWeekKey === engine.weekKey()) {
      return { code: 400, body: { error: '自豪的事/假期成就每周只能申报 1 次' } };
    }
    const pts = (c.rules && c.rules[t[1]] !== undefined) ? c.rules[t[1]] : f.rules[t[1]];
    const ev = { id: 'e' + Date.now() + Math.floor(Math.random() * 100), childId: c.id, childName: c.name, type: p.type, label: t[0], note: String(p.note || '').slice(0, 200), points: pts, status: 'pending', ts: new Date().toISOString(), hasPhoto: false };
    if (saveEvidence(ev.id, p.evidence)) ev.hasPhoto = true;
    c.pending.push(ev);
    if (p.type === 'pride' || p.type === 'holiday') c.prideWeekKey = engine.weekKey();
    store.save();
    return { code: 200, body: { ok: true, eventId: ev.id, state: childMe(f, c) } };
  },
  async redeem(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, sess.childId);
    const r = f.rewards.find(x => x.id === p.rewardId);
    if (!r) return { code: 400, body: { error: '奖励不存在' } };
    if (c.intimacy < r.cost) return { code: 400, body: { error: `亲密度不够，还差 ${r.cost - c.intimacy} 分` } };
    if (r.type === 'cash') {
      const mk = engine.monthKey();
      if (c.allowanceLocked && c.allowanceLocked.monthKey === mk) return { code: 400, body: { error: '本月已锁定过一次零花钱加成' } };
      c.allowanceLocked = { amount: r.cost, monthKey: mk };
    }
    // 现金类一次性锁定下月零花钱，直接视为已核销（不走核销流程，防重复核销）
    const status = r.type === 'cash' ? 'fulfilled' : 'held';
    c.intimacy -= r.cost;
    c.redemptions.unshift({ id: 'rd' + Date.now() + Math.floor(Math.random() * 100), name: r.name, cost: r.cost, type: r.type, ts: new Date().toISOString(), status, requestedAt: null, fulfilled: status === 'fulfilled' });
    ledger(f, c, -r.cost, `兑换奖励：${r.name}${r.type === 'cash' ? '（锁定下月零花钱加成 ' + r.cost + ' 元）' : ''}`, 'child');
    store.save();
    return { code: 200, body: { ok: true, state: childMe(f, c) } };
  },
  // 孩子申请核销：held → requested
  async redeemRequest(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, sess.childId);
    const rd = c.redemptions.find(x => x.id === p.redemptionId);
    if (!rd) return { code: 404, body: { error: '兑换记录不存在' } };
    if (rd.status === 'fulfilled') return { code: 400, body: { error: '该奖励已核销' } };
    if (rd.status === 'requested') return { code: 400, body: { error: '已申请过核销，等待家长处理' } };
    rd.status = 'requested'; rd.requestedAt = new Date().toISOString();
    store.save(); return { code: 200, body: { ok: true, state: childMe(f, c) } };
  },
  async selectPet(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, sess.childId);
    if (c.pet) return { code: 400, body: { error: '本学期已选定宠物，学期结束后才能重挑' } };
    const sp = speciesById(p.speciesId);
    if (!sp) return { code: 400, body: { error: '物种不存在' } };
    if (sp.hidden) {   // S/SS 隐藏宠物需学期门槛
      const el = engine.hiddenPetEligibility(c);
      if (sp.tier === 'S' && !el.s) return { code: 403, body: { error: 'S 级隐藏宠物需曾任一学期觉醒（Lv20）' } };
      if (sp.tier === 'SS' && !el.ss) return { code: 403, body: { error: 'SS 级隐藏宠物需连续两个学期觉醒（Lv20）' } };
    }
    c.pet = { speciesId: sp.id, nickname: sp.name, stats: { ...sp.base }, freePoints: 0, skills: sp.skills.slice(), maxHpBonus: 0 };
    store.save();
    return { code: 200, body: { ok: true, state: childMe(f, c) } };
  },
  async nickname(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, sess.childId);
    if (!c.pet) return { code: 400, body: { error: '还没有宠物' } };
    c.pet.nickname = String(p.nickname || '').slice(0, 10) || speciesById(c.pet.speciesId).name;
    store.save(); return { code: 200, body: { ok: true, state: childMe(f, c) } };
  },
  async allocate(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, sess.childId);
    if (!c.pet) return { code: 400, body: { error: '还没有宠物' } };
    const stat = p.stat; const pts = Math.floor(Number(p.points) || 0);
    if (!['atk', 'def', 'hp', 'spd', 'wis'].includes(stat)) return { code: 400, body: { error: '无效属性' } };
    if (pts <= 0 || pts > (c.pet.freePoints || 0)) return { code: 400, body: { error: '点数不足' } };
    c.pet.stats[stat] += pts; c.pet.freePoints -= pts;
    store.save(); return { code: 200, body: { ok: true, state: childMe(f, c) } };
  },
  async battleStart(sess, p) {
    const f = store.familyById(sess.familyId); const me = ensureChild(f, sess.childId);
    if (!me.pet) return { code: 400, body: { error: '先选宠物才能对战' } };
    if (me.fainted) return { code: 400, body: { error: '宠物饿晕了，先复活才能对战' } };
    const mode = p.mode;
    let opp = null;
    if (mode === 'sibling' || mode === 'coop') {
      opp = ensureChild(f, p.opponentId);
      if (!opp || opp.id === me.id) return { code: 400, body: { error: '对手不存在' } };
      if (!opp.pet) return { code: 400, body: { error: '对方还没有宠物' } };
      // v3：对手以 AI 分身参战，不消耗对方场次（对方未真实参与）
    } else if (mode !== 'boss') return { code: 400, body: { error: '未知模式' } };
    if (!battle.canBattleToday(me, f.config.battleDailyLimit)) return { code: 400, body: { error: `今日对战次数已满（上限${f.config.battleDailyLimit}场）` } };
    battle.noteBattle(me);
    const r = battle.startBattle(f, mode, me, opp);
    if (r.error) return { code: 400, body: r };
    store.save();
    return { code: 200, body: { ok: true, battleId: r.battleId, battle: r.state } };
  },
  // —— v4: 好友对战 ————————————————————————————————
  async battleInvite(sess, p) {
    const f = store.familyById(sess.familyId); const me = ensureChild(f, sess.childId);
    if (!me.pet) return { code: 400, body: { error: '先选宠物才能对战' } };
    if (me.fainted) return { code: 400, body: { error: '宠物饿晕了，先复活才能对战' } };
    const t = store.findChildByFriendCode(p.code);
    if (!t) return { code: 404, body: { error: '对战码不存在' } };
    if (t.child.id === me.id) return { code: 400, body: { error: '不能邀请自己' } };
    if (!t.child.pet) return { code: 400, body: { error: '对方还没有宠物' } };
    if (t.child.fainted) return { code: 400, body: { error: '对方的宠物饿晕了，等 ta 复活吧' } };
    if (t.child.pausedAt) return { code: 400, body: { error: '对方暂停计分中，不能对战' } };
    const sp = speciesById(me.pet.speciesId);
    const inv = store.createInvite({ familyId: f.id, childId: me.id, name: me.name, emoji: sp.emoji, level: me.level, speciesName: sp.name }, t.child.id);
    return { code: 200, body: { ok: true, inviteId: inv.id, toName: t.child.name } };
  },
  async battleInviteAccept(sess, p) {
    const f = store.familyById(sess.familyId); const me = ensureChild(f, sess.childId);
    const inv = store.getInvite(p.inviteId);
    if (!inv || inv.toChildId !== me.id) return { code: 404, body: { error: '邀请不存在或已过期' } };
    const fromFam = store.familyById(inv.from.familyId);
    const fromChild = fromFam && fromFam.children[inv.from.childId];
    if (!fromChild || !fromChild.pet) { store.delInvite(inv.id); return { code: 400, body: { error: '对方状态已变化，邀请失效' } }; }
    if (!me.pet) return { code: 400, body: { error: '先选宠物才能对战' } };
    if (me.fainted || fromChild.fainted) return { code: 400, body: { error: '有宠物饿晕了，先复活' } };
    if (!battle.canBattleToday(me, f.config.battleDailyLimit)) return { code: 400, body: { error: `今日对战次数已满（上限${f.config.battleDailyLimit}场）` } };
    // v4.1: 发起方也要校验场次（此前只查接收方，可绕过每日上限）
    if (!battle.canBattleToday(fromChild, fromFam.config.battleDailyLimit)) { store.delInvite(inv.id); return { code: 400, body: { error: '对方今日对战次数已满，这场打不了' } }; }
    battle.noteBattle(me); battle.noteBattle(fromChild);
    const r = battle.startBattle(fromFam, 'friend', fromChild, me, f);
    store.delInvite(inv.id);
    if (r.error) return { code: 400, body: r };
    store.save();
    return { code: 200, body: { ok: true, battleId: r.battleId, battle: r.state, state: childMe(f, me) } };
  },
  async battleInviteDecline(sess, p) {
    const inv = store.getInvite(p.inviteId);
    if (inv && inv.toChildId === sess.childId) store.delInvite(inv.id);
    return { code: 200, body: { ok: true, state: (() => { const f = store.familyById(sess.familyId); const c = ensureChild(f, sess.childId); return c ? childMe(f, c) : null; })() } };
  },
  // 好友：加好友 / 删好友 / 我的对战码
  async friendAdd(sess, p) {
    const f = store.familyById(sess.familyId); const me = ensureChild(f, sess.childId);
    const t = store.findChildByFriendCode(p.code);
    if (!t) return { code: 404, body: { error: '对战码不存在' } };
    if (t.child.id === me.id) return { code: 400, body: { error: '不能加自己' } };
    if ((me.friends || []).some(x => x.familyId === t.family.id && x.childId === t.child.id)) return { code: 400, body: { error: '已经是好友了' } };
    if ((me.friends || []).length >= 20) return { code: 400, body: { error: '好友已满 20 个' } };
    me.friends.push({ familyId: t.family.id, childId: t.child.id, addedAt: new Date().toISOString() });
    t.child.friends = t.child.friends || [];
    if (!t.child.friends.some(x => x.familyId === f.id && x.childId === me.id)) {
      t.child.friends.push({ familyId: f.id, childId: me.id, addedAt: new Date().toISOString() });
    }
    store.save();
    return { code: 200, body: { ok: true, friend: friendViews(me).find(x => x.childId === t.child.id), state: childMe(f, me) } };
  },
  async friendDel(sess, p) {
    const f = store.familyById(sess.familyId); const me = ensureChild(f, sess.childId);
    me.friends = (me.friends || []).filter(x => !(x.familyId === p.familyId && x.childId === p.childId));
    const of = store.familyById(p.familyId);
    const oc = of && of.children[p.childId];
    if (oc) oc.friends = (oc.friends || []).filter(x => !(x.familyId === f.id && x.childId === me.id));
    store.save();
    return { code: 200, body: { ok: true, state: childMe(f, me) } };
  },
  async friendCode(sess) {
    const f = store.familyById(sess.familyId); const me = ensureChild(f, sess.childId);
    return { code: 200, body: { ok: true, code: store.ensureFriendCode(me), state: childMe(f, me) } };
  },
  // 饿死复活：'level' 降 5 级 / 'intimacy' 扣 50 亲密度
  async petRevive(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, sess.childId);
    if (!c.pet) return { code: 400, body: { error: '还没有宠物' } };
    const r = engine.revivePet(f, c, p.mode === 'intimacy' ? 'intimacy' : 'level');
    if (r.error) return { code: 400, body: r };
    store.save();
    return { code: 200, body: { ok: true, state: childMe(f, c) } };
  },
  async battleMove(sess, p) {
    const f = store.familyById(sess.familyId); const me = ensureChild(f, sess.childId);
    const cur = battle.getBattle(p.battleId, f);
    if (!cur) return { code: 404, body: { error: '战斗不存在' } };
    const res = battle.playerMove(p.battleId, f, me, p.skillIndex);
    if (res.error) return { code: 400, body: res };
    store.save();
    return { code: 200, body: { ok: true, battle: res.state, finished: !!res.finished, state: childMe(f, me) } };
  },
  async battleState(sess, p) {
    const f = store.familyById(sess.familyId);
    const st = battle.getBattle(p.battleId, f);
    if (!st) return { code: 404, body: { error: '战斗不存在' } };
    return { code: 200, body: { ok: true, battle: st } };
  },
  async milestoneApply(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, sess.childId);
    if (!c.milestone.unlocked) return { code: 400, body: { error: '宠物觉醒后才能申请学期大奖' } };
    if (c.milestone.used) return { code: 400, body: { error: '本学期申请权已使用' } };
    if (c.milestone.applications.some(a => a.status === 'pending')) return { code: 400, body: { error: '已有待审核的申请' } };
    c.milestone.applications.push({ note: String(p.note || '').slice(0, 200), ts: new Date().toISOString(), status: 'pending' });
    store.save(); return { code: 200, body: { ok: true, state: childMe(f, c) } };
  },
  // —— v10: 本地优先同步 ——————————————————————————————
  // 全量快照（脱敏）：本地优先客户端登录后拉取，本地跑游戏逻辑，云端保持权威副本
  async syncFull(sess) {
    const f = store.familyById(sess.familyId);
    engine.ensureSemester(f);
    for (const c of Object.values(f.children)) engine.ensureMonth(f, c, new Date());
    const copy = JSON.parse(JSON.stringify(f));
    const p = copy.parent || {};
    delete p.salt; delete p.hash; delete p.pinSalt; delete p.pinHash; delete p.securityASalt; delete p.securityAH;
    delete copy.sessions;
    return { code: 200, body: { ok: true, family: copy, ts: Date.now() } };
  },
  // 本地对战结束后的云端结算：服务端按同一公式重算经验（每日上限钳制），不可被客户端刷分
  async battleFinish(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, sess.childId);
    if (!c.pet) return { code: 400, body: { error: '还没有宠物' } };
    const mode = ['sibling', 'boss', 'coop'].includes(p.mode) ? p.mode : null;
    if (!mode) return { code: 400, body: { error: '未知对战模式' } };
    const oppLevel = Math.max(1, Math.min(80, Math.floor(Number(p.oppLevel) || 1)));
    const win = !!p.win;
    if (!c.pausedAt) battle.noteBattle(c);
    let actual = 0, capped = false;
    if (c.pausedAt) {
      // 暂停期对战不发经验，但仍记录场次与流水
      f.ledger.unshift({ id: store.newId('l'), ts: new Date().toISOString(), childId: c.id, childName: c.name, delta: 0, xp: 0, reason: `对战（暂停计分期间，未发经验）`, by: 'system' });
    } else if (!battle.canBattleToday(c, f.config.battleDailyLimit)) {
      capped = true;   // 场次超限（多设备漂移）：只记数不发经验
    } else {
      const xp = win ? 6 + oppLevel : 2 + Math.floor(oppLevel / 2);
      const cap = (f.config && f.config.battleXpDailyCap !== undefined) ? f.config.battleXpDailyCap : 30;
      const today = engine.dateKey();
      if (!c.battleXp || c.battleXp.date !== today) c.battleXp = { date: today, amount: 0 };
      const remaining = Math.max(0, cap - (c.battleXp.amount || 0));
      actual = Math.min(xp, remaining);
      c.battleXp.amount = (c.battleXp.amount || 0) + actual;
      capped = actual < xp;
      if (actual > 0) engine.addXP(c, actual);
      f.ledger.unshift({
        id: store.newId('l'), ts: new Date().toISOString(),
        childId: c.id, childName: c.name, delta: 0, xp: actual,
        reason: `对战${win ? '胜利' : '失败'}（${mode === 'sibling' ? '兄妹切磋' : 'Boss挑战'} vs Lv${oppLevel}，+${xp} 经验${capped ? `，今日对战经验已达上限 ${cap}，实发 ${actual}` : ''}）`,
        by: 'system'
      });
    }
    store.save();
    return { code: 200, body: { ok: true, xp: actual, capped, state: childMe(f, c) } };
  },

  // 家长端
  async family(sess) {
    const f = store.familyById(sess.familyId);
    engine.ensureSemester(f);
    for (const c of Object.values(f.children)) engine.ensureMonth(f, c);
    return { code: 200, body: familyView(f) };
  },
  async pinVerify(sess, p) {
    const f = store.familyById(sess.familyId);
    if (!store.verifyPin(f, p.pin)) return { code: 401, body: { error: 'PIN 错误' } };
    return { code: 200, body: { ok: true, pinChanged: f.parent.pinChanged } };
  },
  async pinChange(sess, p) {
    const f = store.familyById(sess.familyId);
    if (!store.verifyPin(f, p.oldPin)) return { code: 400, body: { error: '旧 PIN 错误' } };
    if (!/^\d{4,8}$/.test(String(p.newPin || ''))) return { code: 400, body: { error: '新 PIN 需 4-8 位数字' } };
    const { salt, hash } = store.hashPassword(String(p.newPin));
    f.parent.pinSalt = salt; f.parent.pinHash = hash; f.parent.pinChanged = true;
    store.save(); return { code: 200, body: { ok: true } };
  },
  async addChild(sess, p) {
    const f = store.familyById(sess.familyId);
    if (Object.keys(f.children).length >= 6) return { code: 400, body: { error: '最多 6 个孩子' } };
    const c = store.addChild(f, p.name, p.grade);
    return { code: 200, body: { ok: true, childId: c.id, family: familyView(f) } };
  },
  // v4: 修改孩子信息（名字/年级）
  async childEdit(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, p.childId);
    if (!c) return { code: 400, body: { error: '孩子不存在' } };
    if (p.name !== undefined) c.name = String(p.name).trim().slice(0, 12) || c.name;
    if (p.grade !== undefined) c.grade = String(p.grade).trim().slice(0, 12);
    store.save(); return { code: 200, body: { ok: true, family: familyView(f) } };
  },
  // v4: 删除孩子（敏感操作需 PIN；历史账本保留留痕，会话吊销、好友引用清理）
  async childDelete(sess, p) {
    const f = store.familyById(sess.familyId);
    const bad = requirePin(f, p); if (bad) return bad;
    const c = ensureChild(f, p.childId);
    if (!c) return { code: 400, body: { error: '孩子不存在' } };
    if (Object.keys(f.children).length <= 1) return { code: 400, body: { error: '至少要保留一个孩子' } };
    const name = c.name;
    delete f.children[p.childId];
    store.revokeChildSessions(f.id, p.childId);
    store.removeFriendRefs(f.id, p.childId);
    ledger(f, null, 0, `删除孩子「${name}」（历史账本保留）`, 'parent');
    store.save(); return { code: 200, body: { ok: true, family: familyView(f) } };
  },
  // v4: 设置密保问题（自助找回密码/PIN 用；答案只存哈希）
  async securitySet(sess, p) {
    const f = store.familyById(sess.familyId);
    const q = String(p.question || '').trim().slice(0, 60);
    const a = String(p.answer || '').trim().slice(0, 60);
    if (!q || !a) return { code: 400, body: { error: '问题和答案都要填' } };
    const { salt, hash } = store.hashPassword(store.normAnswer(a));
    f.parent.securityQ = q; f.parent.securityASalt = salt; f.parent.securityAH = hash;
    store.save(); return { code: 200, body: { ok: true, family: familyView(f) } };
  },
  async bindcode(sess, p) {
    const f = store.familyById(sess.familyId);
    const c = ensureChild(f, p.childId);
    if (!c) return { code: 400, body: { error: '孩子不存在' } };
    const code = store.createBindCode(f, c.id);
    return { code: 200, body: { ok: true, code, expiresIn: Math.floor(store.BIND_TTL / 1000) } };
  },
  async approve(sess, p) {
    const f = store.familyById(sess.familyId);
    for (const c of Object.values(f.children)) {
      const ev = c.pending.find(e => e.id === p.eventId);
      if (!ev) continue;
      if (p.decision === 'approve') {
        if (!engine.canEarnWeek(c, f.config.weeklyCap, ev.points)) return { code: 400, body: { error: `${c.name} 本周加分已达上限` } };
        engine.addIntimacy(c, ev.points); engine.addXP(c, ev.points); engine.noteWeekEarn(c, ev.points);
        ev.status = 'approved';
        ledger(f, c, ev.points, `${ev.label}${ev.note ? '：' + ev.note : ''}`, 'parent');
      } else {
        ev.status = 'rejected'; ev.reason = String(p.reason || '').slice(0, 100);
        if (ev.type === 'pride' || ev.type === 'holiday') c.prideWeekKey = ''; // 驳回可本周重提
        ledger(f, c, 0, `驳回${ev.label}${ev.reason ? '：' + ev.reason : ''}`, 'parent');
      }
      store.save();
      return { code: 200, body: { ok: true, family: familyView(f) } };
    }
    return { code: 404, body: { error: '事件不存在' } };
  },
  async manual(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, p.childId);
    if (!c) return { code: 400, body: { error: '孩子不存在' } };
    // 自定义快捷规则：直接取规则自带分值（可正可负）；v4: 优先该孩子的自定义项
    if (p.ruleId) {
      const rule = (c.customRules && c.customRules.find(r => r.id === p.ruleId)) || (f.customRules || []).find(r => r.id === p.ruleId);
      if (!rule) return { code: 404, body: { error: '自定义规则不存在' } };
      p.delta = rule.delta;
      p.reason = rule.name;
    }
    const d = Math.round(Number(p.delta) || 0);
    if (!d) return { code: 400, body: { error: '无效数值' } };
    if (d > 0) {
      if (!engine.canEarnWeek(c, f.config.weeklyCap, d)) return { code: 400, body: { error: '本周加分已达上限' } };
      engine.addXP(c, d); engine.noteWeekEarn(c, d);
    }
    if (d < 0 && c.pausedAt) return { code: 400, body: { error: '暂停计期间不扣分' } };
    engine.addIntimacy(c, d);
    ledger(f, c, d, `家长手动：${String(p.reason || '无说明').slice(0, 100)}`, 'parent', d > 0 ? d : 0);
    store.save(); return { code: 200, body: { ok: true, family: familyView(f) } };
  },
  // —— 投诉记录（v3：数组化，可增删改查，次数不限；v4：支持"其他"来源+自定义扣分）——
  async complaint(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, p.childId);
    if (!c) return { code: 400, body: { error: '孩子不存在' } };
    if (c.pausedAt) return { code: 400, body: { error: '暂停计期间不扣分' } };
    const srcMap = { teacher: '老师', grandparent: '爷爷奶奶' };
    const src = srcMap[p.source] ? p.source : 'other';
    const srcName = srcMap[src] || (String(p.srcName || '').trim().slice(0, 10) || '其他');
    // 次数不限；扣分默认取该孩子的规则值，可自定义（1~200 防手滑）
    const defaultDelta = (c.rules && c.rules.complaint !== undefined) ? c.rules.complaint : f.rules.complaint;
    const delta = p.delta !== undefined ? Math.min(200, Math.max(1, Math.round(Number(p.delta) || 0))) : defaultDelta;
    const reason = String(p.reason || '').slice(0, 100);
    const rec = { id: store.newId('cp'), src, srcName: src === 'other' ? srcName : undefined, reason, delta, ts: new Date().toISOString(), monthKey: engine.monthKey(), status: 'active' };
    if (!Array.isArray(c.complaints)) c.complaints = [];
    c.complaints.push(rec);
    engine.addIntimacy(c, -delta);
    ledger(f, c, -delta, `${srcName}投诉${reason ? '：' + reason : ''}`, 'parent');
    store.save(); return { code: 200, body: { ok: true, complaintId: rec.id, family: familyView(f) } };
  },
  async complaintEdit(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, p.childId);
    if (!c) return { code: 400, body: { error: '孩子不存在' } };
    const rec = (c.complaints || []).find(x => x.id === p.recId);
    if (!rec) return { code: 404, body: { error: '投诉记录不存在' } };
    const oldDelta = rec.delta;
    if (p.src === 'teacher' || p.src === 'grandparent' || p.src === 'other') rec.src = p.src;
    if (p.srcName !== undefined) rec.srcName = String(p.srcName).trim().slice(0, 10) || '其他';
    if (p.reason !== undefined) rec.reason = String(p.reason).slice(0, 100);
    if (p.delta !== undefined) rec.delta = Math.min(200, Math.max(0, Math.round(Number(p.delta) || 0)));
    const diff = oldDelta - rec.delta;   // 正数=少扣了要补回给孩子
    if (diff !== 0 && rec.status === 'active') {
      engine.addIntimacy(c, diff);
      ledger(f, c, diff, `调整${complaintSrcName(rec)}投诉扣分（${oldDelta}→${rec.delta}）`, 'parent');
    }
    store.save(); return { code: 200, body: { ok: true, family: familyView(f) } };
  },
  // 取消：留痕 + 退分（记录标 cancelled，仍可查）
  async complaintCancel(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, p.childId);
    if (!c) return { code: 400, body: { error: '孩子不存在' } };
    const rec = (c.complaints || []).find(x => x.id === p.recId);
    if (!rec) return { code: 404, body: { error: '投诉记录不存在' } };
    if (rec.status !== 'active') return { code: 400, body: { error: '该投诉已取消或已归档' } };
    rec.status = 'cancelled'; rec.cancelledAt = new Date().toISOString();
    engine.addIntimacy(c, rec.delta);
    ledger(f, c, rec.delta, `取消${complaintSrcName(rec)}投诉，退回扣分${rec.reason ? '：' + rec.reason : ''}`, 'parent');
    store.save(); return { code: 200, body: { ok: true, family: familyView(f) } };
  },
  // 删除：彻底抹掉 + 退分（敏感操作，需 PIN）
  async complaintDelete(sess, p) {
    const f = store.familyById(sess.familyId);
    const bad = requirePin(f, p); if (bad) return bad;
    const c = ensureChild(f, p.childId);
    if (!c) return { code: 400, body: { error: '孩子不存在' } };
    const idx = (c.complaints || []).findIndex(x => x.id === p.recId);
    if (idx < 0) return { code: 404, body: { error: '投诉记录不存在' } };
    const rec = c.complaints[idx];
    c.complaints.splice(idx, 1);
    if (rec.status === 'active') {
      engine.addIntimacy(c, rec.delta);
      ledger(f, c, rec.delta, `删除${complaintSrcName(rec)}投诉记录，退回扣分`, 'parent');
    }
    store.save(); return { code: 200, body: { ok: true, family: familyView(f) } };
  },
  // v4: 分值规则下沉到每个孩子（childId 传了就改该孩子的；不传改家庭默认模板，新建孩子时继承）
  async rules(sess, p) {
    const f = store.familyById(sess.familyId);
    const target = p.childId ? ensureChild(f, p.childId) : null;
    if (p.childId && !target) return { code: 400, body: { error: '孩子不存在' } };
    const rulesObj = target ? (target.rules = target.rules || { ...f.rules }) : f.rules;
    const customs = target ? (target.customRules = target.customRules || []) : f.customRules;
    const touching = p.core || p.customAdd || p.customDel || Object.keys(rulesObj).some(k => p[k] !== undefined);
    if (touching) { const bad = requirePin(f, p); if (bad) return bad; }   // 改规则属敏感操作
    // 兼容扁平传法 + core 对象传法
    for (const k of Object.keys(rulesObj)) if (p[k] !== undefined) rulesObj[k] = Math.max(0, Math.round(Number(p[k]) || 0));
    if (p.core) for (const k of Object.keys(rulesObj)) if (p.core[k] !== undefined) rulesObj[k] = Math.max(0, Math.round(Number(p.core[k]) || 0));
    // 自定义快捷加减分项
    if (!Array.isArray(customs)) { if (target) target.customRules = []; else f.customRules = []; }
    if (p.customAdd) {
      const name = String(p.customAdd.name || '').trim().slice(0, 20);
      const delta = Math.round(Number(p.customAdd.delta) || 0);
      if (!name || !delta) return { code: 400, body: { error: '自定义项需填名称和非 0 分值' } };
      customs.push({ id: store.newId('cr'), name, delta });
    }
    if (p.customDel) {
      if (target) target.customRules = customs.filter(r => r.id !== p.customDel);
      else f.customRules = customs.filter(r => r.id !== p.customDel);
    }
    store.save(); return { code: 200, body: { ok: true, family: familyView(f) } };
  },
  async config(sess, p) {
    const f = store.familyById(sess.familyId);
    if (p.initialIntimacy !== undefined) f.config.initialIntimacy = Math.max(0, Math.round(Number(p.initialIntimacy) || 0));
    if (p.baseAllowance !== undefined) f.config.baseAllowance = Math.max(0, Math.round(Number(p.baseAllowance) || 0));
    if (p.pointsToYuan !== undefined) f.config.pointsToYuan = Math.max(0.1, Number(p.pointsToYuan) || 1);
    if (p.weeklyCap !== undefined) f.config.weeklyCap = Math.max(0, Math.round(Number(p.weeklyCap) || 0));
    if (p.battleDailyLimit !== undefined) f.config.battleDailyLimit = Math.max(0, Math.round(Number(p.battleDailyLimit) || 0));
    if (p.battleXpDailyCap !== undefined) f.config.battleXpDailyCap = Math.max(0, Math.round(Number(p.battleXpDailyCap) || 0));
    if (p.randomEventChance !== undefined) f.config.randomEventChance = Math.max(0, Math.min(1, Number(p.randomEventChance) || 0));   // v5
    if (p.holidayMode !== undefined) f.config.holidayMode = !!p.holidayMode;
    if (p.feedWindow) f.config.feedWindow = { startHour: Math.max(0, Math.min(23, Math.round(Number(p.feedWindow.startHour) || 0))), endHour: Math.max(1, Math.min(24, Math.round(Number(p.feedWindow.endHour) || 24))) };
    if (p.semesterStartDate !== undefined) { f.config.semester.startDate = p.semesterStartDate || null; f.config.semester.autoDone = false; }
    if (p.semesterName !== undefined) f.config.semester.name = String(p.semesterName).slice(0, 30);
    store.save(); return { code: 200, body: { ok: true, family: familyView(f) } };
  },
  async reward(sess, p) {
    const f = store.familyById(sess.familyId);
    if (p.delete) {
      f.rewards = f.rewards.filter(r => r.id !== p.id);
    } else if (p.id) {
      const r = f.rewards.find(x => x.id === p.id);
      if (r) { r.name = String(p.name || r.name).slice(0, 30); r.cost = Math.max(1, Math.round(Number(p.cost) || r.cost)); r.desc = String(p.desc || '').slice(0, 60); r.type = ['cash', 'ticket', 'thing'].includes(p.type) ? p.type : r.type; }
    } else {
      f.rewards.push({ id: 'r' + Date.now(), name: String(p.name || '新奖励').slice(0, 30), cost: Math.max(1, Math.round(Number(p.cost) || 10)), type: ['cash', 'ticket', 'thing'].includes(p.type) ? p.type : 'ticket', desc: String(p.desc || '').slice(0, 60) });
    }
    store.save(); return { code: 200, body: { ok: true, family: familyView(f) } };
  },
  async fulfill(sess, p) {
    const f = store.familyById(sess.familyId);
    for (const c of Object.values(f.children)) {
      const rd = c.redemptions.find(r => r.id === p.redemptionId);
      if (rd) {
        if (rd.status === 'fulfilled') return { code: 400, body: { error: '该奖励已核销' } };
        rd.status = 'fulfilled'; rd.fulfilled = true; rd.fulfilledAt = new Date().toISOString();
        ledger(f, c, 0, `核销奖励：${rd.name}`, 'parent');
        store.save(); return { code: 200, body: { ok: true, family: familyView(f) } };
      }
    }
    return { code: 404, body: { error: '兑换记录不存在' } };
  },
  // 账本撤销（敏感操作，需 PIN）：反向调亲密度/经验，留对冲行
  async ledgerUndo(sess, p) {
    const f = store.familyById(sess.familyId);
    const bad = requirePin(f, p); if (bad) return bad;
    const e = f.ledger.find(l => l.id === p.ledgerId);
    if (!e) return { code: 404, body: { error: '账目不存在' } };
    if (e.reversed) return { code: 400, body: { error: '该账目已撤销过' } };
    if (e.by === 'system') return { code: 400, body: { error: '系统结算账目不可撤销' } };
    if (!e.ts || !e.ts.startsWith(engine.monthKey())) return { code: 400, body: { error: '仅可撤销当月账目' } };
    const c = e.childId ? ensureChild(f, e.childId) : null;
    if (!c) return { code: 400, body: { error: '该账目未关联孩子，无法撤销' } };
    if (e.delta < 0 && c.pausedAt) return { code: 400, body: { error: '暂停计期间不扣分，无法撤销该账目' } };
    engine.addIntimacy(c, -e.delta);
    if (e.xp) engine.subXP(c, e.xp);   // 经验可回退；五维成长点不回收（UI 已注明）
    e.reversed = true;
    ledger(f, c, -e.delta, `撤销：${e.reason}`, 'parent');
    store.save(); return { code: 200, body: { ok: true, family: familyView(f) } };
  },
  // 解绑设备：吊销该孩子全部登录（换手机/丢手机）
  async unbind(sess, p) {
    const f = store.familyById(sess.familyId);
    const c = ensureChild(f, p.childId);
    if (!c) return { code: 400, body: { error: '孩子不存在' } };
    const n = store.revokeChildSessions(f.id, c.id);
    return { code: 200, body: { ok: true, revoked: n, family: familyView(f) } };
  },
  async pause(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, p.childId);
    if (!c) return { code: 400, body: { error: '孩子不存在' } };
    if (p.on) c.pausedAt = Date.now(); else c.pausedAt = null;
    store.save(); return { code: 200, body: { ok: true, family: familyView(f) } };
  },
  async settleMonth(sess, p) {
    const f = store.familyById(sess.familyId);
    const bad = requirePin(f, p); if (bad) return bad;
    for (const c of Object.values(f.children)) { c.monthKey = null; engine.ensureMonth(f, c); }
    store.save(); return { code: 200, body: { ok: true, family: familyView(f) } };
  },
  async settleSemester(sess, p) {
    const f = store.familyById(sess.familyId);
    const bad = requirePin(f, p); if (bad) return bad;
    const entries = engine.settleSemester(f);
    store.save(); return { code: 200, body: { ok: true, entries: entries.length, family: familyView(f) } };
  },
  async report(sess) {
    const f = store.familyById(sess.familyId);
    const mk = engine.monthKey();
    const lines = [`【${f.name}·月报 ${mk}】`];
    for (const c of Object.values(f.children)) {
      const items = f.ledger.filter(l => l.childId === c.id && l.ts.startsWith(mk));
      const earned = items.filter(l => l.delta > 0).reduce((s, l) => s + l.delta, 0);
      const spent = items.filter(l => l.delta < 0).reduce((s, l) => s + l.delta, 0);
      const complain = (Array.isArray(c.complaints) ? c.complaints : []).filter(x => x.status === 'active' && x.ts && x.ts.startsWith(mk)).length;
      lines.push(`\n${c.name}（${c.grade || '—'}）：`);
      lines.push(`· 当前亲密度 ${c.intimacy}（本月 +${earned} ${spent}）`);
      lines.push(`· 宠物：${c.pet ? (speciesById(c.pet.speciesId)?.name || '?') + ' Lv' + c.level + '（' + engine.stageOf(c.level).name + '）' : '未选'}`);
      lines.push(`· 连续投喂 ${c.feedStreak} 天${complain ? `，本月投诉 ${complain} 次` : '，本月无投诉'}`);
      lines.push(`· 图鉴收藏 ${c.pokedex.length} 只，下月零花钱预计 ${f.config.baseAllowance + (c.allowanceLocked ? c.allowanceLocked.amount : 0)} 元`);
    }
    lines.push(`\n生成时间：${new Date().toLocaleString('zh-CN')}`);
    return { code: 200, body: { ok: true, text: lines.join('\n') } };
  },
  async milestoneApprove(sess, p) {
    const f = store.familyById(sess.familyId); const c = ensureChild(f, p.childId);
    if (!c) return { code: 400, body: { error: '孩子不存在' } };
    const app = c.milestone.applications.find(a => a.status === 'pending');
    if (!app) return { code: 400, body: { error: '没有待审申请' } };
    if (p.decision === 'approve') { app.status = 'approved'; app.decidedAt = new Date().toISOString(); c.milestone.used = true; ledger(f, c, 0, '学期大奖申请通过', 'parent'); }
    else { app.status = 'rejected'; app.reason = String(p.reason || '').slice(0, 100); }
    store.save(); return { code: 200, body: { ok: true, family: familyView(f) } };
  }
};

function familyView(f) {
  engine.ensureSemester(f);
  return {
    id: f.id, name: f.name, username: f.parent.username, pinChanged: f.parent.pinChanged,
    securityQ: f.parent.securityQ || '',
    config: f.config, rules: f.rules, customRules: f.customRules || [], rewards: f.rewards,
    ledger: f.ledger.slice(0, 150),
    children: Object.values(f.children).map(c => ({
      ...childMe(f, c), pending: c.pending, redemptions: c.redemptions.slice(0, 20),
      rules: c.rules || f.rules, customRules: c.customRules || [],
      devices: store.childDeviceCount(f.id, c.id)
    }))
  };
}

// —— 路由表 & 鉴权 ————————————————————————————
const PUBLIC = { '/api/register': 'register', '/api/login': 'login', '/api/bind': 'bind', '/api/species': null, '/api/forgot/question': 'forgotQuestion', '/api/forgot/reset': 'forgotReset' };
const CHILD = { '/api/me': 'me', '/api/feed': 'feed', '/api/submit': 'submit', '/api/redeem': 'redeem', '/api/redeem/request': 'redeemRequest', '/api/pet/select': 'selectPet', '/api/pet/nickname': 'nickname', '/api/pet/allocate': 'allocate', '/api/pet/revive': 'petRevive', '/api/battle/start': 'battleStart', '/api/battle/move': 'battleMove', '/api/battle/state': 'battleState', '/api/battle/finish': 'battleFinish', '/api/battle/invite': 'battleInvite', '/api/battle/invite/accept': 'battleInviteAccept', '/api/battle/invite/decline': 'battleInviteDecline', '/api/friend/code': 'friendCode', '/api/friend/add': 'friendAdd', '/api/friend/del': 'friendDel', '/api/milestone/apply': 'milestoneApply', '/api/sync/full': 'syncFull' };
const PARENT = { '/api/family': 'family', '/api/sync/full': 'syncFull', '/api/pin/verify': 'pinVerify', '/api/pin/change': 'pinChange', '/api/security': 'securitySet', '/api/child': 'addChild', '/api/child/edit': 'childEdit', '/api/child/delete': 'childDelete', '/api/child/bindcode': 'bindcode', '/api/child/unbind': 'unbind', '/api/approve': 'approve', '/api/manual': 'manual', '/api/complaint': 'complaint', '/api/complaint/edit': 'complaintEdit', '/api/complaint/cancel': 'complaintCancel', '/api/complaint/delete': 'complaintDelete', '/api/ledger/undo': 'ledgerUndo', '/api/rules': 'rules', '/api/config': 'config', '/api/reward': 'reward', '/api/fulfill': 'fulfill', '/api/pause': 'pause', '/api/settle/month': 'settleMonth', '/api/settle/semester': 'settleSemester', '/api/report': 'report', '/api/milestone/approve': 'milestoneApprove' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pathname = url.pathname;
  try {
    if (req.method === 'GET' && pathname === '/api/species') {
      return json(res, 200, { ok: true, species: SPECIES.map(s => ({ ...s, elementName: ELEMENT_NAMES[s.element] })), chart: CHART, elementNames: ELEMENT_NAMES });
    }
    if (req.method === 'GET' && pathname === '/api/photo') {
      let sess = auth(req);
      if (!sess) { const t = url.searchParams.get('token'); if (t) sess = store.getSession(t); }
      if (!sess || sess.role !== 'parent') return json(res, 401, { error: 'unauthorized' });
      const id = String(url.searchParams.get('id') || '').replace(/[^a-z0-9]/gi, '');
      const file = path.join(PHOTO_DIR, id + '.img');
      if (!id || !fs.existsSync(file)) return json(res, 404, { error: 'not found' });
      const raw = fs.readFileSync(file, 'utf8');
      const m = raw.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
      if (!m) return json(res, 404, { error: 'not found' });
      const buf = Buffer.from(m[2], 'base64');
      res.writeHead(200, { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=86400' });
      return res.end(buf);
    }
    if (pathname.startsWith('/api/')) {
      if (req.method !== 'POST') return json(res, 405, { error: 'method' });
      let p; try { p = await readBody(req); } catch (e) { return json(res, 413, { error: '请求体过大（照片请压缩后上传）' }); }
      const sess = authFlex(req, p, url);
      let role = PUBLIC[pathname] !== undefined ? 'public' : CHILD[pathname] !== undefined ? 'child' : PARENT[pathname] !== undefined ? 'parent' : null;
      if (pathname === '/api/sync/full' && sess) role = sess.role;   // 双端共享：按会话角色分派
      if (!role) return json(res, 404, { error: 'not found' });
      if (role === 'child' && (!sess || sess.role !== 'child')) return json(res, 401, { error: 'unauthorized' });
      if (role === 'parent' && (!sess || sess.role !== 'parent')) return json(res, 401, { error: 'unauthorized' });
      const fnName = role === 'public' ? PUBLIC[pathname] : role === 'child' ? CHILD[pathname] : PARENT[pathname];
      if (!fnName) return json(res, 404, { error: 'not found' });
      const out = await routes[fnName](sess, p || {});
      return json(res, out.code, out.body);
    }
    // 静态文件
    let file = pathname === '/' ? '/index.html' : pathname;
    file = path.normalize(file).replace(/^([/\\])/, '');
    const full = path.join(PUBLIC_DIR, file);
    if (!full.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'forbidden' });
    if (!fs.existsSync(full)) return json(res, 404, { error: 'not found' });
    const stat = fs.statSync(full);
    if (!stat.isFile()) return json(res, 404, { error: 'not found' });
    const ext = path.extname(full).toLowerCase();
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' }[ext] || 'application/octet-stream';
    // no-cache：每次都向服务器校验新旧（配合 304 不浪费流量），杜绝改版后浏览器还跑旧 JS
    const ims = req.headers['if-modified-since'];
    if (ims && Math.floor(new Date(ims).getTime() / 1000) === Math.floor(stat.mtimeMs / 1000)) {
      res.writeHead(304, { 'Cache-Control': 'no-cache' });
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache', 'Last-Modified': stat.mtime.toUTCString() });
    fs.createReadStream(full).pipe(res);
  } catch (e) {
    console.error('[server]', e);
    json(res, 500, { error: '服务器开小差了：' + e.message });
  }
});

// 60 秒定时器：落盘 + 过期清理（绑定码/战斗/邀请/会话）+ 饿死检查（3 天没投喂 -10 / 5 天昏迷）
setInterval(() => {
  store.saveNow();
  store.pruneBinds(); store.pruneBattles(); store.pruneInvites(); store.pruneSessions();
  let hungerEvents = 0;
  for (const f of Object.values(store.dbGet().families)) {
    for (const c of Object.values(f.children)) {
      const ev = engine.hungerCheck(f, c);
      if (ev) hungerEvents++;
    }
  }
  if (hungerEvents) { store.save(); console.log(`[hunger] 触发 ${hungerEvents} 次饥饿事件`); }
}, 60 * 1000).unref();
process.on('SIGINT', () => { store.saveNow(); console.log('已保存退出'); process.exit(0); });

server.listen(PORT, () => console.log(`habitpet 正式版已启动: http://localhost:${PORT}`));
