// store.js — 数据持久化 + 多租户账号 + 会话 + 绑定码 + 备份
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'habitpet.json');
const DB_TMP = DB_FILE + '.tmp';
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SCHEMA_VERSION = 4;

let db = null;

// —— 唯一 id（engine/battle 也会 require 本模块取用）—————————
function newId(prefix) {
  return (prefix || 'x') + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}

// —— 数据迁移（幂等，可重复执行）—————————————————————
function migrate(d) {
  if (!d || typeof d !== 'object') return d;
  // 战斗状态落盘（v3 新增）
  if (!d.battles) d.battles = {};
  if (!d.invites) d.invites = {};   // v4: 跨家庭对战邀请 {id, from:{familyId,childId,name,emoji,level}, toChildId, ts, expiresAt}
  d.prunedAt = d.prunedAt || 0;

  for (const f of Object.values(d.families || {})) {
    // 家庭级
    f.customRules = Array.isArray(f.customRules) ? f.customRules : [];
    // 证据照片的家庭归属不可只依赖 pending：审核/归档后事件可能不再留在待审列表。
    if (!Array.isArray(f.evidenceIds)) {
      f.evidenceIds = Object.values(f.children || {}).flatMap(c =>
        (c.pending || []).filter(e => e && e.hasPhoto && e.id).map(e => e.id)
      );
    }
    if (!Array.isArray(f.ledger)) f.ledger = [];
    for (const l of f.ledger) {
      if (!l.id) l.id = newId('l');
      if (typeof l.xp !== 'number') l.xp = 0;
      if (typeof l.reversed !== 'boolean') l.reversed = false;
    }

    const complaintPoints = (f.rules && f.rules.complaint) || 50;
    const nowTs = new Date().toISOString();

    for (const c of Object.values(f.children || {})) {
      // v2: complaints 是 {teacher,grandparent} 计数器 → v3: 记录数组
      if (!Array.isArray(c.complaints)) {
        const old = c.complaints || {};
        const arr = [];
        for (const src of ['teacher', 'grandparent']) {
          const n = Math.max(0, Math.round(Number(old[src]) || 0));
          for (let i = 0; i < n; i++) {
            arr.push({ id: newId('cp'), src, reason: '（历史迁移）', delta: complaintPoints, ts: nowTs, status: 'active' });
          }
        }
        c.complaints = arr;   // ⚠️ 必须保留历史，否则当月无投诉奖会误发
      }
      for (const cp of c.complaints) {
        if (!cp.id) cp.id = newId('cp');
        if (!cp.status) cp.status = 'active';
        if (typeof cp.delta !== 'number') cp.delta = complaintPoints;
      }

      // 兑换记录补状态机字段
      if (!Array.isArray(c.redemptions)) c.redemptions = [];
      for (const r of c.redemptions) {
        if (!r.id) r.id = newId('rd');
        if (!r.status) r.status = r.fulfilled ? 'fulfilled' : 'held';
        if (r.requestedAt === undefined) r.requestedAt = null;
      }

      // v4: 每孩子独立分值规则（继承家庭当前规则作起点，此后各自演化）
      if (!c.rules) c.rules = { ...(f.rules || {}) };
      if (!Array.isArray(c.customRules)) c.customRules = Array.isArray(f.customRules) ? f.customRules.map(x => ({ ...x })) : [];
      // v4: 饥饿/昏迷（饿死机制）
      if (typeof c.fainted !== 'boolean') c.fainted = false;
      if (c.hungerPenaltyDate === undefined) c.hungerPenaltyDate = '';   // 'applied' = 本轮饿肚子-10已发
      // v4: 学期觉醒史（S/SS 隐藏宠解锁依据）
      if (!Array.isArray(c.awakenedSemesters)) c.awakenedSemesters = [];
      // v4: 好友系统（friendCode 惰性生成保证全局唯一）
      if (!Array.isArray(c.friends)) c.friends = [];                     // [{familyId, childId, addedAt}]
      if (c.friendCode === undefined) c.friendCode = '';
      if (c.lastSeenAt === undefined) c.lastSeenAt = null;               // 对战大厅"最近活跃"
      if (!c.battleXp || typeof c.battleXp !== 'object') c.battleXp = { date: '', amount: 0 };
    }

    // v4.1: 每日对战经验上限
    if (f.config && f.config.battleXpDailyCap === undefined) f.config.battleXpDailyCap = 30;
    if (f.config && f.config.randomEventChance === undefined) f.config.randomEventChance = 0.12;   // v5: 随机灵汐事件

    // v5.1: 申报门槛可调（考试≥examMin 分 / 默写≥quizMin %）
    if (f.rules) {
      if (f.rules.examMin === undefined) f.rules.examMin = 80;
      if (f.rules.quizMin === undefined) f.rules.quizMin = 80;
    }
    for (const c of Object.values(f.children || {})) {
      if (c.rules) {
        if (c.rules.examMin === undefined) c.rules.examMin = 80;
        if (c.rules.quizMin === undefined) c.rules.quizMin = 80;
      }
    }

    // v4.1: PIN / 密保答案哈希化（此前明文存储，迁移一次性升级）
    if (f.parent) {
      if (typeof f.parent.pin === 'string' && !f.parent.pinHash) {
        const { salt, hash } = hashPassword(f.parent.pin);
        f.parent.pinSalt = salt; f.parent.pinHash = hash;
        delete f.parent.pin;
      }
      if (f.parent.securityA && !f.parent.securityAH) {
        const { salt, hash } = hashPassword(normAnswer(f.parent.securityA));
        f.parent.securityASalt = salt; f.parent.securityAH = hash;
        delete f.parent.securityA;
      }
    }
  }
  d.schemaVersion = SCHEMA_VERSION;
  return d;
}

function defaultDb() {
  return { schemaVersion: SCHEMA_VERSION, families: {}, sessions: {}, binds: {}, battles: {}, invites: {} };
}
// 主文件损坏时找最新备份恢复，避免"损坏→清空→覆盖好数据"的连锁灾难
function latestBackup() {
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort().reverse();
    return files.length ? path.join(BACKUP_DIR, files[0]) : null;
  } catch (e) { return null; }
}
function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = null;
  if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
    catch (e) { console.error('[store] 数据文件损坏，尝试从备份恢复:', e.message); db = null; }
  }
  if (!db || !db.families) {
    const bak = latestBackup();
    if (bak) {
      try { db = JSON.parse(fs.readFileSync(bak, 'utf8')); console.error('[store] 已从最新备份恢复:', bak); }
      catch (e) { console.error('[store] 备份也损坏:', e.message); db = null; }
    }
  }
  if (!db || !db.families) db = defaultDb();
  migrate(db);
  return db;
}
let saveTimer = null;
// 原子写盘：先写临时文件再 rename 替换，杜绝"写一半断电→JSON 损坏"
function writeDb() {
  fs.writeFileSync(DB_TMP, JSON.stringify(db, null, 1));
  fs.renameSync(DB_TMP, DB_FILE);
}
function save() { // 防抖写盘
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { writeDb(); }
    catch (e) { console.error('[store] 写盘失败', e.message); }
  }, 150);
}
function saveNow() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } try { writeDb(); } catch (e) { console.error('[store] 写盘失败', e.message); } }

// —— 每日自动备份（保留 30 天）————————————————————
function dailyBackup() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const dst = path.join(BACKUP_DIR, `habitpet-${today}.json`);
    if (!fs.existsSync(dst) && fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, dst);
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort();
    while (files.length > 30) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
  } catch (e) { console.error('[store] 备份失败', e.message); }
}
setInterval(dailyBackup, 6 * 3600 * 1000).unref();

// —— 密码（scrypt）————————————————————————————
function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return { salt, hash };
}
function verifyPassword(pw, salt, hash) {
  const h = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash));
}
// 密保答案统一规范化后哈希（不存明文）
function normAnswer(a) { return String(a || '').trim().toLowerCase(); }
function verifyPin(f, pin) {
  if (f.parent.pinHash) return verifyPassword(String(pin || ''), f.parent.pinSalt, f.parent.pinHash);
  return String(pin) === f.parent.pin;   // 兜底（正常迁移后不会走到）
}
function verifySecurityAnswer(f, answer) {
  if (f.parent.securityAH) return verifyPassword(normAnswer(answer), f.parent.securityASalt, f.parent.securityAH);
  return normAnswer(answer) === normAnswer(f.parent.securityA || '');   // 兜底
}

// —— 会话 token ————————————————————————————
// 孩子端：每部手机固定绑一个孩子 → 长会话（1年，基本终身免登录）
// 家长端：涉及钱和规则 → 短会话（30天，定期重新验证）
const SESSION_TTL = 30 * 24 * 3600 * 1000;
const CHILD_SESSION_TTL = 365 * 24 * 3600 * 1000;
function createSession(familyId, role, childId) {
  const token = crypto.randomBytes(24).toString('hex');
  const ttl = role === 'child' ? CHILD_SESSION_TTL : SESSION_TTL;
  db.sessions[token] = { familyId, role, childId: childId || null, expiresAt: Date.now() + ttl };
  save();
  return token;
}
// 解绑某孩子的全部登录设备（换手机 / 丢手机）
function revokeChildSessions(familyId, childId) {
  let n = 0;
  for (const [t, s] of Object.entries(db.sessions)) {
    if (s.familyId === familyId && s.role === 'child' && s.childId === childId) { delete db.sessions[t]; n++; }
  }
  if (n) save();
  return n;
}
// 列出某孩子的在线设备数（按 expiresAt 粗判）
function childDeviceCount(familyId, childId) {
  const now = Date.now();
  return Object.values(db.sessions).filter(s =>
    s.familyId === familyId && s.role === 'child' && s.childId === childId && s.expiresAt > now).length;
}
function getSession(token) {
  const s = db.sessions[token];
  if (!s) return null;
  if (Date.now() > s.expiresAt) { delete db.sessions[token]; save(); return null; }
  return s;
}
function dropSession(token) { if (db.sessions[token]) { delete db.sessions[token]; save(); } }
// 定期清理过期会话：过期 session 原本只在被访问时才删，长期会积累拖慢全量写盘
function pruneSessions() {
  const now = Date.now(); let n = 0;
  for (const [k, s] of Object.entries(db.sessions)) {
    if (!s || now > s.expiresAt) { delete db.sessions[k]; n++; }
  }
  if (n) save();
  return n;
}

// —— 家庭（租户）———————————————————————————
function newFamilyId() { return 'f' + crypto.randomBytes(6).toString('hex'); }
function newChildId() { return 'c' + crypto.randomBytes(5).toString('hex'); }

function createFamily(username, password, familyName, securityQ, securityA) {
  username = String(username || '').trim();
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) return { error: '账号名需 3-32 位字母/数字/下划线' };
  if (!password || String(password).length < 6) return { error: '密码至少 6 位' };
  if (Object.values(db.families).some(f => f.parent.username.toLowerCase() === username.toLowerCase())) return { error: '账号名已被注册' };
  const { salt, hash } = hashPassword(password);
  const pinH = hashPassword('1234');          // 初始 PIN 也只存哈希
  const sq = String(securityQ || '').trim().slice(0, 60);
  const sa = String(securityA || '').trim().slice(0, 60);
  const saH = sa ? hashPassword(normAnswer(sa)) : null;
  const family = {
    id: newFamilyId(), name: familyName || '我的家', createdAt: new Date().toISOString(),
    parent: {
      username, salt, hash, pinSalt: pinH.salt, pinHash: pinH.hash, pinChanged: false,
      securityQ: sq,                                          // 密保问题（自助找回密码/PIN）
      securityASalt: saH ? saH.salt : undefined,
      securityAH: saH ? saH.hash : undefined
    },
    config: {
      initialIntimacy: 100,       // 月初亲密度
      baseAllowance: 100,         // 基础零花钱（老板家口径：原固定300 → 100+加成）
      pointsToYuan: 1,            // 1分=1元
      feedWindow: { startHour: 19, endHour: 21 },
      weeklyCap: 0,               // 每周加分上限（0=不限制）
      battleDailyLimit: 5,        // 每日对战场次上限
      randomEventChance: 0.12,    // 投喂后随机灵汐事件概率（0~1，家长可调）
      holidayMode: false,         // 假期模式（投喂全天+换申报目录）
      semester: { name: '2026 秋季学期', index: 1, startDate: null, autoDone: false }
    },
    rules: { feed: 1, quiz: 10, exam: 50, pride: 10, noComplaint: 100, complaint: 50, streak: 10, battleWin: 8, battleLose: 3, coopWin: 10, examMin: 80, quizMin: 80 },
    customRules: [],   // 自定义快捷加减分项 [{id,name,delta}]，家长端可增删
    rewards: [
      { id: 'r1', name: '现金（下月零花钱加成）', cost: 200, type: 'cash', desc: '1分=1元，锁定下月零花钱' },
      { id: 'r2', name: '游戏时间券（1小时）',     cost: 30,  type: 'ticket', desc: '兑换后7天内使用' },
      { id: 'r3', name: '电脑游戏充值（50元档）',  cost: 60,  type: 'ticket', desc: '家长审核后充值' },
      { id: 'r4', name: '漂流一次',                cost: 150, type: 'ticket', desc: '周末成行' }
    ],
    children: {}, ledger: [], reports: []
  };
  db.families[family.id] = family;
  save();
  return { family };
}
function findFamilyByUsername(username) {
  return Object.values(db.families).find(f => f.parent.username.toLowerCase() === String(username).trim().toLowerCase()) || null;
}
function familyById(id) { return db.families[id] || null; }

function addChild(family, name, grade) {
  const id = newChildId();
  const now = new Date();
  const mk = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'); // 创建即锚定当月，防止首次访问误发无投诉奖
  family.children[id] = {
    id, name: String(name || '孩子').slice(0, 12), grade: grade || '',
    intimacy: family.config.initialIntimacy, xp: 0, level: 1,
    pet: null,                       // {speciesId, nickname, stats, freePoints, skills, maxHpBonus}
    monthKey: mk, complaints: [],          // v3: 投诉记录数组 [{id,src,reason,delta,ts,status}]
    feedDate: '', feedStreak: 0,
    prideWeekKey: '',
    pausedAt: null, weekEarned: 0,
    allowanceLocked: null,           // {amount, monthKey}
    milestone: { unlocked: false, used: false, applications: [] },
    battleCount: { date: '', count: 0 },
    pending: [], redemptions: [], pokedex: [],
    // v4: 独立规则 / 饥饿 / 学期觉醒史 / 好友
    rules: { ...(family.rules || {}) },
    customRules: (family.customRules || []).map(x => ({ ...x })),
    fainted: false, faintedAt: null, hungerPenaltyDate: '',
    awakenedSemesters: [],
    friends: [], friendCode: '', lastSeenAt: null
  };
  save();
  return family.children[id];
}

// —— 孩子端一次性绑定码（8 位 / 30 分钟失效 / 防冲突）———————————
const BIND_TTL = 30 * 60 * 1000;
function createBindCode(family, childId) {
  let code;
  do {
    code = String(Math.floor(1e7 + Math.random() * 9e7));   // 8 位
  } while (db.binds[code]);                                  // 撞码重生成
  db.binds[code] = { familyId: family.id, childId, expiresAt: Date.now() + BIND_TTL };
  save();
  return code;
}
function consumeBindCode(code) {
  const key = String(code).trim();
  const b = db.binds[key];
  if (!b) { pruneBinds(); return { error: '绑定码不存在' }; }
  if (Date.now() > b.expiresAt) { delete db.binds[key]; save(); return { error: '绑定码已过期（30分钟有效）' }; }
  delete db.binds[key]; save();
  return b;
}
// 清理过期绑定码，防止 db.binds 无限膨胀
function pruneBinds() {
  const now = Date.now();
  let n = 0;
  for (const [k, v] of Object.entries(db.binds)) {
    if (!v || now > v.expiresAt) { delete db.binds[k]; n++; }
  }
  if (n) save();
  return n;
}

// —— 战斗状态持久化（v3：落 db.battles，重启不丢）—————————————
function getBattle(id) { return db.battles[id] || null; }
function putBattle(id, st) { db.battles[id] = st; save(); }
function delBattle(id) { if (db.battles[id]) { delete db.battles[id]; save(); } }
function allBattles() { return db.battles; }
// 清理：已结束 >10 分钟，或创建 >2 小时的僵死战斗
function pruneBattles() {
  const now = Date.now();
  let n = 0;
  for (const [k, st] of Object.entries(db.battles)) {
    const age = now - (st.createdAt || now);
    const doneAge = st.finishedAt ? now - st.finishedAt : 0;
    if ((st.status === 'finished' && doneAge > 10 * 60 * 1000) || age > 2 * 60 * 60 * 1000) {
      delete db.battles[k]; n++;
    }
  }
  if (n) save();
  return n;
}

// —— v4: 跨家庭对战邀请（10 分钟失效）———————————————————————
const INVITE_TTL = 10 * 60 * 1000;
function createInvite(from, toChildId) {
  const id = newId('iv');
  db.invites[id] = { id, from, toChildId, ts: new Date().toISOString(), expiresAt: Date.now() + INVITE_TTL };
  save(); return db.invites[id];
}
function getInvite(id) {
  const iv = db.invites[id];
  if (!iv) return null;
  if (Date.now() > iv.expiresAt) { delete db.invites[id]; save(); return null; }
  return iv;
}
function delInvite(id) { if (db.invites[id]) { delete db.invites[id]; save(); } }
function allInvites() { pruneInvites(); return db.invites; }
function pruneInvites() {
  const now = Date.now(); let n = 0;
  for (const [k, v] of Object.entries(db.invites)) if (!v || now > v.expiresAt) { delete db.invites[k]; n++; }
  if (n) save(); return n;
}

// —— v4: 好友系统（全局唯一 6 位对战码）————————————————————
function ensureFriendCode(child) {
  if (child.friendCode && /^\d{6}$/.test(child.friendCode)) return child.friendCode;
  let code;
  do { code = String(Math.floor(100000 + Math.random() * 900000)); }
  while (allChildren().some(c => c.friendCode === code));
  child.friendCode = code; save();
  return code;
}
function allChildren() {
  const out = [];
  for (const f of Object.values(db.families)) for (const c of Object.values(f.children)) out.push(c);
  return out;
}
function dbGet() { return db; }   // 供 server 定时任务遍历家庭（不重读文件）
function findChildByFriendCode(code) {
  code = String(code || '').trim();
  if (!/^\d{6}$/.test(code)) return null;
  for (const f of Object.values(db.families)) {
    for (const c of Object.values(f.children)) if (c.friendCode === code) return { family: f, child: c };
  }
  return null;
}
function removeFriendRefs(familyId, childId) {   // 删除孩子时清掉别人的好友列表引用
  let n = 0;
  for (const c of allChildren()) {
    const before = c.friends.length;
    c.friends = (c.friends || []).filter(x => !(x.familyId === familyId && x.childId === childId));
    if (c.friends.length !== before) n++;
  }
  if (n) save();
  return n;
}

module.exports = { load, save, saveNow, dailyBackup, hashPassword, verifyPassword, verifyPin, verifySecurityAnswer, normAnswer, createSession, getSession, dropSession, pruneSessions, revokeChildSessions, childDeviceCount, createFamily, findFamilyByUsername, familyById, addChild, createBindCode, consumeBindCode, pruneBinds, getBattle, putBattle, delBattle, allBattles, pruneBattles, newId, ensureFriendCode, findChildByFriendCode, removeFriendRefs, allChildren, createInvite, getInvite, delInvite, allInvites, pruneInvites, dbGet, BIND_TTL, SESSION_TTL, CHILD_SESSION_TTL, DB_FILE, DATA_DIR };
