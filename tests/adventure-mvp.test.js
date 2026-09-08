// adventure-mvp.test.js — 7 日星图章节、签名事件与随机奇遇回归
'use strict';
const B = process.env.BASE_URL || 'http://127.0.0.1:3000';
const RND = Math.floor(Math.random() * 1000000);
const adventure = require('../lib/adventure');
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name, extra !== undefined ? JSON.stringify(extra) : ''); }
  else { fail++; console.log('  ✗ FAIL:', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
async function api(path, body, token) {
  const res = await fetch(B + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) });
  return res.json();
}

// 纯函数回归：7 天连续完成不会碰数值，并且签名事件只记一次。
(() => {
  const child = { id: 'unit-child', pet: { speciesId: 'firam' }, feedDate: '', xp: 17, intimacy: 222, ledger: { balance: 9 } };
  const before = { xp: child.xp, intimacy: child.intimacy, ledger: child.ledger.balance };
  for (let i = 0; i < 7; i++) {
    const day = `2026-01-0${i + 1}`;
    child.feedDate = day;
    const r = adventure.explore(child, adventure.NODE_CATALOG[i].id, day);
    ok(`第 ${i + 1} 日章节探索`, r.ok && r.result.day === i + 1);
  }
  const a = adventure.ensureState(child);
  ok('七日章节完成', a.completedDays.length === 7 && !!a.chapterCompletedAt && a.chapterCompletions.length === 1);
  ok('普通灵伴签名事件记录', a.signatureEvents.some(x => (x.speciesId || x) === 'firam'));
  ok('章节探索不改数值', child.xp === before.xp && child.intimacy === before.intimacy && child.ledger.balance === before.ledger);
  ok('随机事件结果可复现', JSON.stringify(adventure.randomEventFor('unit-child', '2026-01-01', 'starlight-gate')) === JSON.stringify(adventure.randomEventFor('unit-child', '2026-01-01', 'starlight-gate')));
})();

(async () => {
  const reg = await api('/api/register', { username: 'adventure' + RND, password: 'pass123', familyName: '星图测试家' });
  const parent = reg.token;
  const child = await api('/api/child', { name: '星图测试娃', grade: 'G1' }, parent);
  const code = await api('/api/child/bindcode', { childId: child.childId }, parent);
  const bind = await api('/api/bind', { code: code.code });
  const token = bind.token;
  await api('/api/pet/select', { speciesId: 'luna' }, token);
  await api('/api/config', { holidayMode: true }, parent);

  const before = await api('/api/me', {}, token);
  ok('孩子状态包含 7 日星图', before.adventure && before.adventure.nodes.length === 7 && before.adventure.totalDays === 7);
  const stateApi = await api('/api/adventure/state', {}, token);
  ok('星图状态端点可读', stateApi.ok && stateApi.state && stateApi.state.nodes.length === 7);
  ok('未投喂前星图不可出发', before.adventure && before.adventure.available === false);
  const locked = await api('/api/adventure/explore', { nodeId: 'starlight-gate' }, token);
  ok('未投喂探索被拦截', !!locked.error && locked.state && locked.state.adventure.available === false);

  const fed = await api('/api/feed', {}, token);
  const nodeId = fed.state.adventure.nodes[0].id;
  const intimacy = fed.state.intimacy, xp = fed.state.xp;
  ok('投喂后首日节点可出发', fed.state.adventure.available === true && fed.state.adventure.nodes[0].status === 'current');
  const wrong = await api('/api/adventure/explore', { nodeId: 'moon-tide' }, token);
  ok('不能跳过章节节点', !!wrong.error && wrong.state && wrong.state.adventure.completedDays.length === 0);
  const explored = await api('/api/adventure/explore', { nodeId }, token);
  ok('选择首日节点成功', explored.ok && explored.result && explored.state.adventure.completedToday === true);
  ok('探索不改亲密度/经验', explored.state.intimacy === intimacy && explored.state.xp === xp);
  ok('探索记录写入', explored.state.adventure.visited.includes(nodeId) && explored.state.adventure.lastResult.nodeId === nodeId);
  const repeat = await api('/api/adventure/explore', { nodeId: 'moon-tide' }, token);
  ok('当天第二次探索幂等返回', repeat.ok && repeat.repeated === true && repeat.result.nodeId === nodeId);
  const after = await api('/api/me', {}, token);
  ok('重读后探索状态持久', after.adventure.completedToday === true && after.adventure.lastResult.nodeId === nodeId);

  console.log(`星图冒险结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
