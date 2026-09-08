// playtest-15day.js — 家长/孩子双视角 15 日模拟试玩（隔离临时库，不触碰 data/）
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'habitpet-playtest-'));
  const port = await freePort();
  process.env.PORT = String(port);
  process.env.HABITPET_DATA_DIR = dataDir;
  process.env.HABITPET_NO_TIMER = '1';
  process.env.HABITPET_NO_RANDOM = '1';
  const engine = require('../lib/engine');
  const realDateKey = engine.dateKey;
  let offset = 0;
  engine.dateKey = function (d) {
    // server.js 有时传入“此刻”的 Date，有时不传；两种调用都要进入虚拟日历。
    if (d === undefined || (d && Math.abs(Date.now() - d.getTime()) < 300)) return realDateKey(new Date(Date.now() + offset * 86400000));
    return realDateKey(d);
  };
  engine.yesterdayKey = function () { return realDateKey(new Date(Date.now() + (offset - 1) * 86400000)); };
  require('../server');
  const base = `http://127.0.0.1:${port}`;
  async function api(url, body, token) {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) });
        return { status: r.status, body: await r.json() };
      } catch (e) { await sleep(50); }
    }
    throw new Error('server not ready');
  }
  const result = { days: [], parentObservations: [], childObservations: [], facts: {} };
  const reg = await api('/api/register', { username: 'playtest' + Date.now(), password: 'pass123', familyName: '星光试玩家长' });
  const parent = reg.body.token;
  const add = await api('/api/child', { name: '小岚', grade: 'G4' }, parent);
  const childId = add.body.childId;
  const bc = await api('/api/child/bindcode', { childId }, parent);
  const bind = await api('/api/bind', { code: bc.body.code });
  const child = bind.body.token;
  await api('/api/pet/select', { speciesId: 'luna' }, child);
  await api('/api/config', { holidayMode: true }, parent);

  for (let day = 0; day < 15; day++) {
    offset = day;
    const date = realDateKey(new Date(Date.now() + day * 86400000));
    const before = await api('/api/me', {}, child);
    const parentState = await api('/api/family', {}, parent);
    const row = { day: day + 1, date, feed: false, adventure: null, adventureError: null, chapter: before.body.adventure && { progress: `${before.body.adventure.completedDays.length}/7`, completed: before.body.adventure.chapterCompleted }, boss: null };
    result.parentObservations.push({ day: day + 1, children: (parentState.body.children || []).length, chapterProgress: row.chapter.progress });
    // 模拟真实家庭节奏：第 9 天漏投喂，第 10 天回来；其余日期完成投喂。
    if (day !== 8) {
      const feed = await api('/api/feed', {}, child);
      row.feed = !!feed.body.ok;
      const state = feed.body.state || before.body;
      const available = state.adventure && state.adventure.nodes.find(n => n.available);
      if (available) {
        const ex = await api('/api/adventure/explore', { nodeId: available.id }, child);
        row.adventure = ex.body.result ? { nodeId: ex.body.result.nodeId, mode: ex.body.result.mode, signature: !!ex.body.result.signature, randomEvent: !!ex.body.result.randomEvent } : null;
        if (ex.body.error) row.adventureError = ex.body.error;
      }
      // 第 1 天顺便试一次 Boss，验证新手难度与失败无惩罚。
      if (day === 0) {
        const bs = await api('/api/battle/start', { mode: 'boss' }, child);
        if (bs.body.battle) {
          let battle = bs.body.battle;
          for (let turn = 0; turn < 80 && battle.status === 'active'; turn++) {
            const mv = await api('/api/battle/move', { battleId: bs.body.battleId, skillIndex: 0 }, child);
            if (mv.body.battle) battle = mv.body.battle;
            if (mv.body.finished && mv.body.battle) battle = mv.body.battle;
          }
          row.boss = { started: true, bossLevel: bs.body.battle.fighters[1].level, bossHp: bs.body.battle.fighters[1].hpMax, outcome: battle.winner || battle.status };
        } else row.boss = { started: false, error: bs.body.error };
      }
    } else {
      const ex = await api('/api/adventure/explore', { nodeId: 'starlight-gate' }, child);
      row.adventureError = ex.body.error || null;
    }
    const after = await api('/api/me', {}, child);
    result.childObservations.push({ day: day + 1, fedToday: after.body.fedToday, feedStreak: after.body.feedStreak, chapterProgress: `${after.body.adventure.completedDays.length}/7`, completed: after.body.adventure.chapterCompleted, visited: after.body.adventure.visited.length, lastResult: after.body.adventure.lastResult && after.body.adventure.lastResult.nodeName });
    result.days.push(row);
  }
  const final = await api('/api/me', {}, child);
  result.facts = {
    childId,
    pet: final.body.pet && final.body.pet.name,
    xp: final.body.xp,
    intimacy: final.body.intimacy,
    chapterCompleted: final.body.adventure.chapterCompleted,
    chapterCompletions: final.body.adventure.completedChapters.length,
    visitedNodes: final.body.adventure.visited.length,
    revisitAvailableAfter15Days: final.body.adventure.revisitAvailable,
    randomEventsRecorded: final.body.adventure.randomEvents.length,
    signatureEventsRecorded: final.body.adventure.signatureEvents.length
  };
  console.log(JSON.stringify(result, null, 2));
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
