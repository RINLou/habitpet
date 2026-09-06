// test_p1_worker.js — P1「7天微习惯计划 + 温和回归」状态机 worker
// 由 test_smoke.js 以子进程运行：node test_p1_worker.js <phase> [username] [childId]
// 时间旅行：猴补丁 engine.dateKey + Date.prototype.toISOString（仅本进程内存），
// 不直接改共享数据文件；每期结束 saveNow 保证落盘可被下一期子进程读到（持久化断言）。
'use strict';
process.env.PORT = process.env.P1_PORT || '3998';
const path = require('path');
const engine = require('./lib/engine');
const realDateKey = engine.dateKey;
let fakeOffsetDays = Number(process.env.P1_OFFSET || 0);
let fakeToday = fakeOffsetDays ? realDateKey(new Date(Date.now() + fakeOffsetDays * 86400000)) : null;
function setOffset(n) {
  fakeOffsetDays = n;
  fakeToday = n ? realDateKey(new Date(Date.now() + n * 86400000)) : null;
}
engine.dateKey = function (d) {   // "现在"的调用走假日历；对具体历史时间戳（回归 gap）走真日历
  if (fakeToday && (d === undefined || Math.abs(Date.now() - d.getTime()) < 300)) return fakeToday;
  return realDateKey(d);
};
const _toISO = Date.prototype.toISOString;
Date.prototype.toISOString = function () {   // childMe 写 lastSeenAt 用，配合假日历自洽
  if (fakeOffsetDays && Math.abs(Date.now() - this.getTime()) < 300) {
    return new Date(this.getTime() + fakeOffsetDays * 86400000).toISOString();
  }
  return _toISO.call(this);
};
require('./server.js');   // worker 专用实例（独立端口，读写共享 data/habitpet.json）
const B = 'http://127.0.0.1:' + process.env.PORT;
async function api(pathname, body, token) {
  const res = await fetch(B + pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body || {})
  });
  return { status: res.status, body: await res.json() };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = {};   // 模块层：finally 兜底打印时也要能访问
async function makeFamily(tag) {   // 建家 → 娃 → 绑定 → 返回 {PT, TX, childId}
  const ts = Date.now();
  const reg = await api('/api/register', { username: 'p1' + tag + ts, password: 'pass123', familyName: 'P1家' + tag, securityQ: 'q', securityA: 'a' });
  const PT = reg.body.token;
  const add = await api('/api/child', { name: '计划娃' + tag, grade: 'G3' }, PT);
  const childId = add.body.childId;
  const bc = await api('/api/child/bindcode', { childId }, PT);
  const TX = (await api('/api/bind', { code: bc.body.code })).body.token;
  return { PT, TX, childId, username: 'p1' + tag + ts };
}
(async () => {
  for (let i = 0; i < 50; i++) {   // 等自己的 server 就绪
    try { const r = await fetch(B + '/api/species'); if (r.ok) break; } catch (e) {}
    await sleep(100);
  }
  const phase = process.argv[2] || 'day1';

  if (phase === 'day1') {   // 迁移默认态 + 开始/完成/幂等/权限（offset 0）
    const fam = await makeFamily('A');
    const m0 = await api('/api/me', {}, fam.TX);
    R.migrated = !!(m0.body.onboarding && m0.body.onboarding.status === 'not_started' && m0.body.returnNudge && m0.body.returnNudge.show === false);
    const bad = await api('/api/onboarding/start', { planId: 'hack' }, fam.TX);
    R.badPlanRejected = bad.status === 400;
    const dm = await api('/api/onboarding/dismiss', {}, fam.TX);
    R.dismissOk = !!dm.body.ok && dm.body.state.onboarding.showStartPrompt === false;
    const st = await api('/api/onboarding/start', { planId: 'reading' }, fam.TX);
    R.started = !!st.body.ok && st.body.state.onboarding.status === 'active' && st.body.state.onboarding.planId === 'reading' && st.body.state.onboarding.dayIndex === 1;
    const dup = await api('/api/onboarding/start', { planId: 'homework' }, fam.TX);
    R.dupStart409 = dup.status === 409 && dup.body.state.onboarding.planId === 'reading';
    const dm2 = await api('/api/onboarding/dismiss', {}, fam.TX);
    R.dismissWhileActive409 = dm2.status === 409;
    const cm = await api('/api/onboarding/complete', {}, fam.TX);
    R.day1Complete = !!cm.body.ok && cm.body.state.onboarding.todayComplete === true && cm.body.state.onboarding.completedOn.length === 1;
    const cm2 = await api('/api/onboarding/complete', {}, fam.TX);
    R.completeIdempotent = !!cm2.body.ok && cm2.body.state.onboarding.completedOn.length === 1;
    const asParent = await api('/api/onboarding/complete', {}, fam.PT);
    R.parentToken401 = asParent.status === 401;
    const m1 = await api('/api/me', {}, fam.TX);
    R.stateSelf = m1.body.id === fam.childId && m1.body.onboarding.todayComplete === true;
    R.username = fam.username; R.childId = fam.childId;

  } else if (phase === 'day7') {   // 重启持久化 + 第7自然日完成 + 分数红线（offset 6）
    const username = process.argv[3], childId = process.argv[4];
    const lg = await api('/api/login', { username, password: 'pass123' });
    const PT = lg.body.token;
    const bc = await api('/api/child/bindcode', { childId }, PT);
    const bindRes = await api('/api/bind', { code: bc.body.code });
    R._dbg0 = { lgErr: lg.body.error || null, bcErr: bc.body.error || null, bindErr: bindRes.body.error || null };
    const TX = bindRes.body.token;
    const m0 = await api('/api/me', {}, TX);
    if (!m0.body.onboarding) R._dbg0.me = m0.body;   // 401/异常时留证据
    R.persistedActive = !!(m0.body.onboarding && m0.body.onboarding.status === 'active' && m0.body.onboarding.dayIndex === 7);
    const before = { intimacy: m0.body.intimacy, xp: m0.body.xp, streak: m0.body.feedStreak };
    const fam0 = await api('/api/family', {}, PT);
    R._dbg0 = R._dbg0 || {}; R._dbg0.famErr = fam0.body.error || null;
    const ledgerCount = (fam0.body.ledger || []).length;
    const cm = await api('/api/onboarding/complete', {}, TX);
    R.day7Completed = !!cm.body.ok && cm.body.state.onboarding.status === 'completed' && !!cm.body.state.onboarding.finishedOn;
    R._dbg_cm = { status: cm.status, err: cm.body.error || null, ob: cm.body.state ? cm.body.state.onboarding : null, startedOn: m0.body.onboarding.startedOn, today: null };
    const m1 = await api('/api/me', {}, TX);
    R.noScoreChange = m1.body.intimacy === before.intimacy && m1.body.xp === before.xp && m1.body.feedStreak === before.streak;
    const fam1 = await api('/api/family', {}, PT);
    R.ledgerUntouched = fam1.body.ledger.length === ledgerCount;
    const hs = m1.body.onboarding.historySummary;
    R.historyArchived = hs.length === 1 && hs[0].status === 'completed' && hs[0].completedCount === 2;

  } else if (phase === 'expired') {   // 漏完滚转 expired + 重新开始 + history 截断（中途切 offset）
    const fam = await makeFamily('C');
    await api('/api/onboarding/start', { planId: 'prepare' }, fam.TX);
    setOffset(7);
    let m = await api('/api/me', {}, fam.TX);
    R.rolledExpired = m.body.onboarding.status === 'expired' && m.body.onboarding.canRestart === true;
    const cm = await api('/api/onboarding/complete', {}, fam.TX);
    R.completeAfterExpiry409 = cm.status === 409;
    const st = await api('/api/onboarding/start', { planId: 'reading' }, fam.TX);
    R.restartOk = !!st.body.ok && st.body.state.onboarding.status === 'active' && st.body.state.onboarding.historySummary.length === 1;
    setOffset(15);
    m = await api('/api/me', {}, fam.TX);
    R.expiredAgain = m.body.onboarding.status === 'expired';
    R.historyCapped = m.body.onboarding.historySummary.length === 2 && m.body.onboarding.historySummary.length <= 3;

  } else if (phase === 'missed') {   // 漏日不可补填、当日可完成（offset 0 → 2）
    const fam = await makeFamily('D');
    const st = await api('/api/onboarding/start', { planId: 'homework' }, fam.TX);
    setOffset(2);
    const m = await api('/api/me', {}, fam.TX);
    const canDo = m.body.onboarding.canCompleteToday === true && m.body.onboarding.dayIndex === 3;
    const cm = await api('/api/onboarding/complete', {}, fam.TX);
    R.missedNotBackfilled = !!st.body.ok && canDo && !!cm.body.ok
      && cm.body.state.onboarding.completedOn.length === 1
      && cm.body.state.onboarding.completedOn[0] === fakeToday;

  } else if (phase === 'nudge') {   // 温和回归：3天触发 / ack 幂等 / 旧 key 拒绝 / <3天不提示
    const fam = await makeFamily('E');
    const m0 = await api('/api/me', {}, fam.TX);   // offset 0：lastSeenAt=现在
    R.nudgeShown = false; R.noRepeatAfterAck = false;
    setOffset(3);
    await sleep(600);   // 拉开真实时间差，避免 dateKey 新鲜度窗口误判历史时间戳
    const m1 = await api('/api/me', {}, fam.TX);   // 距上次 3 个自然日
    const n = m1.body.returnNudge || {};
    R._dbg_nudge = JSON.stringify(n);
    R.nudgeShown = n.show === true && n.gapDays >= 3 && typeof n.gapKey === 'string' && n.gapKey.length > 0;
    if (R.nudgeShown) {
      const ack = await api('/api/return-nudge/ack', { gapKey: n.gapKey }, fam.TX);
      R.ackOk = !!ack.body.ok;
      const m2 = await api('/api/me', {}, fam.TX);   // 上次访问已是"今天"，不再提示
      R.noRepeatAfterAck = m2.body.returnNudge.show === false;
      const ack2 = await api('/api/return-nudge/ack', { gapKey: n.gapKey }, fam.TX);
      R.staleAck409 = ack2.status === 409;
      const ackBad = await api('/api/return-nudge/ack', { gapKey: 'garbage' }, fam.TX);
      R.badKey409 = ackBad.status === 409;
    }
    const add2 = await api('/api/child', { name: '二娃', grade: 'G4' }, fam.PT);
    const bc2 = await api('/api/child/bindcode', { childId: add2.body.childId }, fam.PT);
    const TX2 = (await api('/api/bind', { code: bc2.body.code })).body.token;
    await api('/api/me', {}, TX2);
    setOffset(2);
    const m3 = await api('/api/me', {}, TX2);      // 只隔 2 天
    R.lessThan3DaysNoNudge = m3.body.returnNudge.show === false;
  }

})().catch(e => { R.crash = (e && e.message) || String(e); })
  .finally(() => {
    try { console.log('P1RESULT ' + JSON.stringify(R)); require('./lib/store').saveNow(); } catch (e) { console.error('flush fail', e.message); }
    process.exit(R.crash ? 1 : 0);
  });
