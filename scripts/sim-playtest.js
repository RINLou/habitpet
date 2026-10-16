// sim-playtest.js — 模拟试玩：10 组家庭 × 10 天（2026-10-23 ~ 2026-11-01，跨月）
// 进程内启动 v12 服务器 + 冻结/推进系统时间 + HTTP 驱动真实接口，全程确定性随机（可复现）。
// 产出：docs/playtest-data-<date>.json + docs/playtest-report-<date>.md
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

// —— 1) Date 冻结补丁（必须在 require server 之前；仅本进程生效）——————————
const RealDate = Date;
let simNowMs = Date.now();
class SimDate extends RealDate {
  constructor(...args) { if (args.length === 0) super(simNowMs); else super(...args); }
  static now() { return simNowMs; }
}
globalThis.Date = SimDate;
function setSimNow(iso) { simNowMs = new RealDate(iso).getTime(); }

// —— 2) 隔离环境（dotenv 不覆盖已存在的 env，故这里设置的一律胜出）————————
const DATA_DIR = path.join(os.tmpdir(), 'habitpet-sim');
process.env.HABITPET_DATA_DIR = DATA_DIR;
process.env.PORT = '8899';
process.env.ADMIN_KEY = 'sim-admin-key';
fs.rmSync(DATA_DIR, { recursive: true, force: true });

// —— 3) 确定性随机（battle/engine/store 内部都走 Math.random）——————————————
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SIM_SEED = 20261016;
Math.random = mulberry32(SIM_SEED);

// —— 4) 启动服务器（require 即监听 8899）——————————————————————————————
const BASE = 'http://127.0.0.1:8899';
require('../server.js');
const engine = require('../lib/engine');
const SPECIES_IDS = ['firam', 'volt', 'tidal', 'night', 'luna', 'mount', 'thorn', 'rime'];

// —— HTTP 助手 ————————————————————————————————————————————————————————————
async function api(method, p, body, token) {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let j = null; try { j = await res.json(); } catch (e) { /* 非 JSON */ }
  return { status: res.status, body: j };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// —— 采集结构 ————————————————————————————————————————————————————————————
const anomalies = [];      // { level, tag, family, day, detail }
const expected = { gateFeedBeforeExplore: 0, weeklyCapHit: 0, prideWeeklyLimit: 0 };  // 规则生效计数（非异常）
const metrics = { families: [], days: [] };
const langHits = [];       // 响应文案里的遗留术语
function anomaly(level, tag, detail, fam, day) { anomalies.push({ level, tag, family: fam || null, day: day || null, detail: String(detail).slice(0, 300) }); }
function checkResp(tag, r, fam, day) {
  if (r.status >= 500) anomaly('P0', tag + ':5xx', JSON.stringify(r.body).slice(0, 200), fam, day);
  const txt = JSON.stringify(r.body || {});
  LEGACY_TERMS.forEach(t => { if (txt.includes(t.word)) langHits.push({ term: t.word, should: t.should, tag, family: fam, day }); });
}
const LEGACY_TERMS = [
  { word: '宠物', should: '灵伴' }, { word: '亲密度', should: '羁绊/心光' },
  { word: '积分', should: '心光' }, { word: '养成好习惯', should: '灵汐大陆' },
  ];
function expect(cond, tag, detail, fam, day) { if (!cond) anomaly('P1', tag, detail, fam, day); }

// —— 10 组家庭画像（覆盖真实家庭档 + 9 种典型配置）——————————————————————————
const FAMILY_DEFS = [
  { key: 'F01', name: '柚子柠檬部落(模拟)', user: 'sim_f01', kids: [{ n: '模拟柠檬', g: '5年级' }, { n: '模拟柚子', g: '初二' }, { n: '模拟三娃', g: '6年级' }], cfg: { feedWindow: { startHour: 19, endHour: 21 }, baseAllowance: 100, pointsToYuan: 1, weeklyCap: 0, battleDailyLimit: 5, randomEventChance: 0.12, holidayMode: false }, species: ['luna', 'night', 'volt'] },
  { key: 'F02', name: '学龄前单娃', user: 'sim_f02', kids: [{ n: '小豆', g: 'G1' }], cfg: { feedWindow: { startHour: 0, endHour: 24 }, baseAllowance: 50, pointsToYuan: 2, weeklyCap: 0, battleDailyLimit: 5, randomEventChance: 0.12 }, species: ['mount'] },
  { key: 'F03', name: '二娃同行', user: 'sim_f03', kids: [{ n: '阿姐', g: 'G3' }, { n: '二弟', g: 'G6' }], cfg: { feedWindow: { startHour: 18, endHour: 20 }, baseAllowance: 80, pointsToYuan: 1, weeklyCap: 400, battleDailyLimit: 5, randomEventChance: 0.12 }, species: ['tidal', 'rime'] },
  { key: 'F04', name: '严格虎爸', user: 'sim_f04', kids: [{ n: '小严', g: 'G4' }], cfg: { feedWindow: { startHour: 7, endHour: 9 }, baseAllowance: 30, pointsToYuan: 1, weeklyCap: 300, battleDailyLimit: 2, randomEventChance: 0.06 }, species: ['firam'] },
  { key: 'F05', name: '宽松放养', user: 'sim_f05', kids: [{ n: '悠悠', g: 'G2' }, { n: '乐乐', g: 'G5' }], cfg: { feedWindow: { startHour: 0, endHour: 24 }, baseAllowance: 100, pointsToYuan: 5, weeklyCap: 0, battleDailyLimit: 10, randomEventChance: 0.2 }, species: ['thorn', 'luna'] },
  { key: 'F06', name: '假期模式', user: 'sim_f06', kids: [{ n: '假宝', g: 'G5' }], cfg: { feedWindow: { startHour: 8, endHour: 22 }, baseAllowance: 60, pointsToYuan: 2, weeklyCap: 0, battleDailyLimit: 8, randomEventChance: 0.12, holidayMode: true }, species: ['night'] },
  { key: 'F07', name: '对战狂人', user: 'sim_f07', kids: [{ n: '战仔', g: 'G6' }], cfg: { feedWindow: { startHour: 17, endHour: 19 }, baseAllowance: 50, pointsToYuan: 1, weeklyCap: 0, battleDailyLimit: 10, randomEventChance: 0.12 }, species: ['firam'] },
  { key: 'F08', name: '冷静陪学', user: 'sim_f08', kids: [{ n: '静静', g: 'G2' }], cfg: { feedWindow: { startHour: 20, endHour: 22 }, baseAllowance: 40, pointsToYuan: 1, weeklyCap: 200, battleDailyLimit: 1, randomEventChance: 0.05 }, species: ['tidal'] },
  { key: 'F09', name: '祖辈带娃', user: 'sim_f09', kids: [{ n: '奶宝', g: 'G1' }], cfg: { feedWindow: { startHour: 17, endHour: 19 }, baseAllowance: 20, pointsToYuan: 1, weeklyCap: 0, battleDailyLimit: 3, randomEventChance: 0.1 }, species: ['mount'] },
  { key: 'F10', name: '默认配置', user: 'sim_f10', kids: [{ n: '普通娃', g: 'G4' }], cfg: {}, species: ['volt'] }
];
const DAYS = [];
for (let i = 0; i < 10; i++) { const d = new RealDate('2026-10-23T12:00:00'); d.setDate(d.getDate() + i); DAYS.push(d); }
const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// —— 家庭初始化 ————————————————————————————————————————————————————————————
async function setupFamily(def) {
  const reg = await api('POST', '/api/register', { username: def.user, password: 'sim123456', familyName: def.name, securityQ: 'q', securityA: 'a' });
  checkResp('register', reg, def.key, 'setup');
  expect(reg.status === 200, 'register 应 200', reg.body && reg.body.error, def.key, 'setup');
  const ptoken = reg.body.token;
  const kids = [];
  for (let i = 0; i < def.kids.length; i++) {
    const kd = def.kids[i];
    const add = await api('POST', '/api/child', { name: kd.n, grade: kd.g }, ptoken);
    checkResp('addChild', add, def.key, 'setup');
    const childId = add.body.childId;
    const bc = await api('POST', '/api/child/bindcode', { childId }, ptoken);
    const bind = await api('POST', '/api/bind', { code: bc.body.code });
    checkResp('bind', bind, def.key, 'setup');
    expect(bind.status === 200, 'bind 应 200', bind.body && bind.body.error, def.key, 'setup');
    const sel = await api('POST', '/api/pet/select', { speciesId: def.species[i % def.species.length] }, bind.body.token);
    checkResp('pet/select', sel, def.key, 'setup');
    expect(sel.status === 200, 'pet/select 应 200', sel.body && sel.body.error, def.key, 'setup');
    kids.push({ id: childId, name: kd.n, grade: kd.g, token: bind.body.token });
  }
  // 应用家庭配置
  if (Object.keys(def.cfg).length) {
    const cfg = await api('POST', '/api/config', def.cfg, ptoken);
    checkResp('config', cfg, def.key, 'setup');
    expect(cfg.status === 200, 'config 应 200', cfg.body && cfg.body.error, def.key, 'setup');
  }
  // 加一个奖励（供兑换测试）
  const rw = await api('POST', '/api/reward', { name: '模拟小奖励', cost: 15, type: 'ticket', desc: '试玩' }, ptoken);
  checkResp('reward', rw, def.key, 'setup');
  return { def, ptoken, kids };
}

// —— 单日单娃行为 ——————————————————————————————————————————————————————————
async function kidDay(fam, kid, dayIdx, dayD) {
  const dk = dayKey(dayD);
  const hour = 8 + Math.floor(Math.random() * 15);   // 08..22（避开 UTC/本地跨日边界）
  setSimNow(dk + 'T' + String(hour).padStart(2, '0') + ':30:00');
  const snap0 = { level: 0, xp: 0, intimacy: 0 };
  const me0 = await api('POST', '/api/me', null, kid.token);
  checkResp('me', me0, fam.def.key, dk);
  expect(me0.status === 200, 'me 应 200', me0.body && me0.body.error, fam.def.key, dk);
  const m0 = me0.body || {};
  snap0.level = m0.level; snap0.xp = m0.xp; snap0.intimacy = m0.intimacy;
  // 投喂（窗口内 85% 尝试；窗口外由配置自然拒绝）
  let feedOk = false;
  if (Math.random() < 0.85) {
    const fd = await api('POST', '/api/feed', null, kid.token);
    checkResp('feed', fd, fam.def.key, dk);
    if (fd.status === 200) feedOk = true;
    else expect(fd.status === 400 && /投喂时间|已经投喂|加分已达上限|暂停|休眠茧/.test(fd.body.error || ''), 'feed 拒绝原因应可预期', fd.body && fd.body.error, fam.def.key, dk);
  }
  // 冒险探索 1-3 次
  const nodes = (m0.adventure && m0.adventure.nodes) || [];
  let explores = 0;
  const nEx = 1 + Math.floor(Math.random() * 3);
  const curNode = nodes.find(n => n.status === 'current') || null;
  for (let i = 0; i < nEx && curNode; i++) {
    const node = curNode;
    const ex = await api('POST', '/api/adventure/explore', { nodeId: node.id }, kid.token);
    checkResp('adventure/explore', ex, fam.def.key, dk);
    if (ex.status === 200) explores++;
    else if (ex.status === 409 && /今天先照顾灵伴/.test(ex.body.error || '')) expected.gateFeedBeforeExplore++;
    else anomaly('P2', 'adventure/explore 非 200', `${node.id} → ${ex.status} ${JSON.stringify(ex.body).slice(0, 120)}`, fam.def.key, dk);
  }
  // 章节推进（低概率，同日重复推进会 409 —— 预期内）
  if (Math.random() < 0.12) {
    const ad = await api('POST', '/api/adventure/advance', null, kid.token);
    checkResp('adventure/advance', ad, fam.def.key, dk);
    if (ad.status !== 200 && ad.status !== 409) anomaly('P2', 'adventure/advance 状态异常', `${ad.status} ${JSON.stringify(ad.body).slice(0, 120)}`, fam.def.key, dk);
  }
  // 对战（45%）：Boss 或兄妹；当日打满上限后第 N+1 次应 400
  let battleResult = null;
  if (Math.random() < 0.45) {
    const useSibling = fam.kids.length > 1 && Math.random() < 0.4;
    const sib = useSibling ? fam.kids.find(k => k.id !== kid.id) : null;
    const st = await api('POST', '/api/battle/start', useSibling ? { mode: 'sibling', opponentId: sib.id } : { mode: 'boss' }, kid.token);
    checkResp('battle/start', st, fam.def.key, dk);
    if (st.status === 200) {
      const battleId = st.body.battleId;
      const nSkills = (st.body.battle.fighters[0].skills || []).length;
      let finished = false, moves = 0;
      while (!finished && moves < 60) {
        const mv = await api('POST', '/api/battle/move', { battleId, skillIndex: Math.floor(Math.random() * nSkills) }, kid.token);
        checkResp('battle/move', mv, fam.def.key, dk);
        moves++;
        if (mv.status !== 200) { anomaly('P2', 'battle/move 非 200', `${mv.status} ${JSON.stringify(mv.body).slice(0, 120)}`, fam.def.key, dk); break; }
        finished = !!mv.body.finished;
      }
      if (finished) {
        const bs = await api('POST', '/api/battle/state', { battleId }, kid.token);
        checkResp('battle/state', bs, fam.def.key, dk);
        const winner = bs.body && bs.body.battle && bs.body.battle.winner;
        battleResult = { mode: useSibling ? 'sibling' : 'boss', win: useSibling ? winner === 0 : winner === 'kids', moves };
      }
    } else {
      expect(st.status === 400 && /次数已满|先选宠物|休眠茧|暂停/.test(st.body.error || ''), 'battle/start 拒绝原因应可预期', st.body && st.body.error, fam.def.key, dk);
    }
  }
  // 申报（40%）
  let submitted = null;
  if (Math.random() < 0.4) {
    const types = ['exam', 'quiz', 'pride'];
    if (m0.holidayMode) types.push('holiday');
    const type = types[Math.floor(Math.random() * types.length)];
    const sb = await api('POST', '/api/submit', { type, note: '模拟申报' }, kid.token);
    checkResp('submit', sb, fam.def.key, dk);
    if (sb.status === 200) submitted = { eventId: sb.body.eventId, type };
    else if (sb.status === 400 && /每周只能申报 1 次/.test(sb.body.error || '')) expected.prideWeeklyLimit++;
    else anomaly('P2', 'submit 非 200', `${type} → ${sb.status} ${JSON.stringify(sb.body).slice(0, 120)}`, fam.def.key, dk);
  }
  // 兑换（羁绊够且 25%）
  if (m0.intimacy >= 15 && Math.random() < 0.25) {
    const rd = await api('POST', '/api/redeem', { rewardId: (m0.rewards || [])[0] ? m0.rewards[0].id : 'x' }, kid.token);
    checkResp('redeem', rd, fam.def.key, dk);
    if (rd.status !== 200 && rd.status !== 400) anomaly('P2', 'redeem 状态异常', `${rd.status} ${JSON.stringify(rd.body).slice(0, 120)}`, fam.def.key, dk);
  }
  // 出战配置（第 5 天，4 选 3 合法值）
  if (dayIdx === 4) {
    const owned = ((m0.pet && m0.pet.skills) || []).filter(x => x.unlocked).map(x => x.id);
    if (owned.length >= 3) {
      const lo = await api('POST', '/api/battle/loadout', { loadout: owned.slice(0, 3) }, kid.token);
      checkResp('battle/loadout', lo, fam.def.key, dk);
      if (lo.status !== 200) anomaly('P2', 'battle/loadout 非 200', `${lo.status} ${JSON.stringify(lo.body).slice(0, 120)}`, fam.def.key, dk);
    }
  }
  // 唤醒（若休眠）
  if (m0.fainted) {
    const rv = await api('POST', '/api/pet/revive', { mode: 'level' }, kid.token);
    checkResp('pet/revive', rv, fam.def.key, dk);
    if (rv.status !== 200) anomaly('P2', 'pet/revive 非 200', `${rv.status} ${JSON.stringify(rv.body).slice(0, 120)}`, fam.def.key, dk);
  }
  // 日终快照 + 一致性校验
  const me1 = await api('POST', '/api/me', null, kid.token);
  const m1 = me1.body || {};
  expect(m1.level === engine.levelFromXp(m1.xp), 'level 应与 xp 公式一致', `xp=${m1.xp} level=${m1.level}`, fam.def.key, dk);
  expect(m1.intimacy >= 0, '羁绊不应为负', `intimacy=${m1.intimacy}`, fam.def.key, dk);
  const q = m1.dailyQuests;
  if (q && q.quests && q.quests.every(x => x.done) && !q.rewarded) anomaly('P1', '任务板全完成但未发活跃奖', `${dk} ${kid.name} reward=${q.reward}`, fam.def.key, dk);
  return { day: dk, hour, level: m1.level, xp: m1.xp, intimacy: m1.intimacy, feedStreak: m1.feedStreak, feedOk, explores, battle: battleResult, submitted, questsDone: q ? q.quests.filter(x => x.done).length : 0, questsTotal: q ? q.quests.length : 0, questRewarded: q ? !!q.rewarded : null };
}

// —— 家长端当日行为 ————————————————————————————————————————————————————————
async function parentDay(fam, dayIdx, dayD) {
  const dk = dayKey(dayD);
  setSimNow(dk + 'T21:30:00');
  const fam1 = await api('POST', '/api/family', null, fam.ptoken);
  checkResp('family', fam1, fam.def.key, dk);
  // 审核全部待审事件（85% 批准）
  // 待审事件从孩子端 me 拿（childMe.pending）
  for (const kid of fam.kids) {
    const me = await api('POST', '/api/me', null, kid.token);
    for (const ev of (me.body.pending || [])) {
      const decision = Math.random() < 0.85 ? 'approve' : 'reject';
      const ap = await api('POST', '/api/approve', { eventId: ev.id, decision, reason: decision === 'reject' ? '模拟驳回' : undefined }, fam.ptoken);
      checkResp('approve', ap, fam.def.key, dk);
      if (ap.status !== 200 && /本周加分已达上限/.test(ap.body.error || '')) expected.weeklyCapHit++;
      else if (ap.status !== 200) anomaly('P2', 'approve 非 200', `${ev.id} → ${ap.status} ${JSON.stringify(ap.body).slice(0, 120)}`, fam.def.key, dk);
    }
  }
  // 手动加减分（30%）
  if (Math.random() < 0.3 && fam.kids.length) {
    const kid = fam.kids[Math.floor(Math.random() * fam.kids.length)];
    const delta = Math.random() < 0.7 ? 2 + Math.floor(Math.random() * 5) : -(1 + Math.floor(Math.random() * 3));
    const mn = await api('POST', '/api/manual', { childId: kid.id, delta, reason: '模拟手动' }, fam.ptoken);
    checkResp('manual', mn, fam.def.key, dk);
    if (mn.status !== 200) anomaly('P2', 'manual 非 200', `${delta} → ${mn.status} ${JSON.stringify(mn.body).slice(0, 120)}`, fam.def.key, dk);
  }
  // 投诉（15%）
  if (Math.random() < 0.15 && fam.kids.length) {
    const kid = fam.kids[Math.floor(Math.random() * fam.kids.length)];
    const cp = await api('POST', '/api/complaint', { childId: kid.id, source: 'teacher', reason: '模拟投诉', delta: 2 }, fam.ptoken);
    checkResp('complaint', cp, fam.def.key, dk);
    if (cp.status !== 200) anomaly('P2', 'complaint 非 200', `${cp.status} ${JSON.stringify(cp.body).slice(0, 120)}`, fam.def.key, dk);
  }
  // 第 3 天微调投喂窗口
  if (dayIdx === 2) {
    const w = fam.def.cfg.feedWindow || { startHour: 18, endHour: 20 };
    const cf = await api('POST', '/api/config', { feedWindow: { startHour: w.startHour, endHour: w.endHour } }, fam.ptoken);
    checkResp('config(day3)', cf, fam.def.key, dk);
  }
  // 第 1/10 天全量同步（双端）
  if (dayIdx === 0 || dayIdx === 9) {
    const sf = await api('POST', '/api/sync/full', null, fam.ptoken);
    checkResp('sync/full(parent)', sf, fam.def.key, dk);
    if (sf.status !== 200 || !sf.body.family) anomaly('P2', 'sync/full 家长端异常', `${sf.status}`, fam.def.key, dk);
    const kid = fam.kids[0];
    const sc = await api('POST', '/api/sync/full', null, kid.token);
    checkResp('sync/full(child)', sc, fam.def.key, dk);
    if (sc.status !== 200 || !sc.body.family) anomaly('P2', 'sync/full 孩子端异常', `${sc.status}`, fam.def.key, dk);
    const sec = sc.body.family.parent || {};
    expect(!sec.salt && !sec.hash && !sec.pinSalt && !sec.pinHash && !sec.securityAH, 'sync/full 应脱敏', '敏感字段泄漏', fam.def.key, dk);
  }
  // 末日：月报 + 报告 + 跨月结算校验
  if (dayIdx === 9) {
    const mo = await api('POST', '/api/monthly', null, fam.ptoken);
    checkResp('monthly', mo, fam.def.key, dk);
    if (mo.status !== 200) anomaly('P2', 'monthly 非 200', `${mo.status}`, fam.def.key, dk);
    else for (const c of (mo.body.children || [])) {
      const reps = c.reports || [];
      expect(reps.some(r => (r.monthKey || '').startsWith('2026-10')), '跨月应生成 10 月历史月报', `${c.childName} reports=${JSON.stringify(reps.map(r => r.monthKey))}`, fam.def.key, dk);
    }
    const rp = await api('POST', '/api/report', null, fam.ptoken);
    checkResp('report', rp, fam.def.key, dk);
    if (rp.status !== 200) anomaly('P2', 'report 非 200', `${rp.status}`, fam.def.key, dk);
  }
}

// —— 接口契约负例（只跑一次，用 F01）—————————————————————————————————————
async function contractNegativeTests(fam) {
  setSimNow('2026-10-24T20:30:00');
  const k = fam.kids[0];
  const cases = [];
  // 无 token
  cases.push(['无 token 访问 /api/me', await api('POST', '/api/me'), r => r.status === 401]);
  // 假 token
  cases.push(['假 token', await api('POST', '/api/me', null, 'deadbeef'), r => r.status === 401]);
  // 未知路由
  cases.push(['未知路由', await api('POST', '/api/nope', {}), r => r.status === 404]);
  // 重复注册
  cases.push(['重复用户名', await api('POST', '/api/register', { username: fam.def.user, password: 'x', familyName: 'x' }), r => r.status === 400]);
  // 未知申报类型
  cases.push(['未知 submit 类型', await api('POST', '/api/submit', { type: 'nope' }, k.token), r => r.status === 400]);
  // 非假期模式申报 holiday
  cases.push(['非假期申报假期成就', await api('POST', '/api/submit', { type: 'holiday' }, k.token), r => r.status === 400]);
  // 不存在的兑换
  cases.push(['兑换不存在奖励', await api('POST', '/api/redeem', { rewardId: 'nope' }, k.token), r => r.status === 400]);
  // 审核不存在事件
  cases.push(['审核不存在事件', await api('POST', '/api/approve', { eventId: 'nope', decision: 'approve' }, fam.ptoken), r => r.status === 404]);
  // 出战 4 技能（超限）
  cases.push(['出战 4 技能应拒', await api('POST', '/api/battle/loadout', { loadout: ['f1', 'f2', 'f3', 'f4'] }, k.token), r => r.status === 400]);
  // 出战未学会技能
  cases.push(['出战未学会技能应拒', await api('POST', '/api/battle/loadout', { loadout: ['h1'] }, k.token), r => r.status === 400]);
  // PIN 保护接口无 PIN
  cases.push(['结算无 PIN 应拒', await api('POST', '/api/settle/month', {}, fam.ptoken), r => r.status === 401]);
  // 冒险节点不存在
  cases.push(['冒险节点不存在', await api('POST', '/api/adventure/explore', { nodeId: 'nope' }, k.token), r => r.status === 400]);
  for (const [tag, r, pred] of cases) {
    checkResp('契约:' + tag, r, fam.def.key, 'neg');
    expect(pred(r), '契约负例: ' + tag, `实际 ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`, fam.def.key, 'neg');
  }
}

// —— 主流程 ——————————————————————————————————————————————————————————————
(async () => {
  await sleep(300);   // 等 listen 就绪
  const families = [];
  for (const def of FAMILY_DEFS) families.push(await setupFamily(def));
  // 负例（在试玩开始前，避免污染日程）
  await contractNegativeTests(families[0]);

  const bossStats = { total: 0, win: 0, byLevel: {} };
  for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
    const dayD = DAYS[dayIdx];
    const dk = dayKey(dayD);
    for (const fam of families) {
      const kidRows = [];
      for (const kid of fam.kids) kidRows.push(await kidDay(fam, kid, dayIdx, dayD));
      await parentDay(fam, dayIdx, dayD);
      for (const row of kidRows) {
        if (row.battle && row.battle.mode === 'boss') {
          bossStats.total++;
          if (row.battle.win) bossStats.win++;
          const b = Math.floor(row.level / 5) * 5;
          bossStats.byLevel[b] = bossStats.byLevel[b] || { total: 0, win: 0 };
          bossStats.byLevel[b].total++; if (row.battle.win) bossStats.byLevel[b].win++;
        }
      }
      metrics.days.push({ day: dk, family: fam.def.key, kids: kidRows });
    }
    process.stderr.write(`[sim] ${dk} 完成（累计异常 ${anomalies.length}）\n`);
  }
  // 末日终态
  const finals = [];
  for (const fam of families) {
    const famV = await api('POST', '/api/family', null, fam.ptoken);
    finals.push({ key: fam.def.key, name: fam.def.name, ledger: (famV.body.ledger || []).length, children: (famV.body.children || []).map(c => ({ name: c.name, level: c.level, xp: c.xp, intimacy: c.intimacy })) });
  }
  // 静态语言扫描（用户可见文案里的遗留术语）
  const staticScan = [];
  const files = ['server.js', 'public/app.js', 'public/lib/local.js', 'public/index.html', 'public/style.css'];
  for (const f of files) {
    const txt = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    LEGACY_TERMS.forEach(t => {
      const re = new RegExp(t.word, 'g');
      const n = (txt.match(re) || []).length;
      if (n) staticScan.push({ file: f, term: t.word, should: t.should, count: n });
    });
  }
  metrics.families = finals;
  const out = { seed: SIM_SEED, days: DAYS.map(dayKey), dayRows: metrics.days, anomalies, expected, langHits: langHits.slice(0, 200), bossStats, staticScan, families: finals };
  const stamp = '2026-10-16';
  fs.mkdirSync(path.join(__dirname, '..', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', `docs/playtest-data-${stamp}.json`), JSON.stringify(out, null, 1));
  console.log('SIM_DONE anomalies=' + anomalies.length + ' langHits=' + langHits.length);
  process.exit(0);
})().catch(e => { console.error('SIM_FATAL', e); process.exit(1); });
