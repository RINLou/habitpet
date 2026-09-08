// adventure-mvp.test.js — 星图冒险 MVP API 回归
'use strict';
const B = process.env.BASE_URL || 'http://127.0.0.1:3000';
const RND = Math.floor(Math.random() * 1000000);
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name, extra !== undefined ? JSON.stringify(extra) : ''); }
  else { fail++; console.log('  ✗ FAIL:', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
async function api(path, body, token) {
  const res = await fetch(B + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) });
  return res.json();
}
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
  ok('孩子状态包含星图节点', before.adventure && before.adventure.nodes.length === 3);
  const stateApi = await api('/api/adventure/state', {}, token);
  ok('星图状态端点可读', stateApi.ok && stateApi.state && stateApi.state.nodes.length === 3);
  ok('未投喂前星图不可出发', before.adventure && before.adventure.available === false);
  const locked = await api('/api/adventure/explore', { nodeId: 'starlight-gate' }, token);
  ok('未投喂探索被拦截', !!locked.error && locked.state && locked.state.adventure.available === false);

  const fed = await api('/api/feed', {}, token);
  const nodeId = fed.state.adventure.nodes[0].id;
  const intimacy = fed.state.intimacy, xp = fed.state.xp;
  ok('投喂后星图可出发', fed.state.adventure.available === true);
  const explored = await api('/api/adventure/explore', { nodeId }, token);
  ok('选择节点成功', explored.ok && explored.result && explored.state.adventure.completedToday === true);
  ok('探索不改亲密度/经验', explored.state.intimacy === intimacy && explored.state.xp === xp);
  ok('探索记录写入', explored.state.adventure.visited.includes(nodeId) && explored.state.adventure.lastResult.nodeId === nodeId);
  const repeat = await api('/api/adventure/explore', { nodeId: 'moon-tide' }, token);
  ok('当天第二次探索幂等返回', repeat.ok && repeat.repeated === true && repeat.result.nodeId === nodeId);
  const after = await api('/api/me', {}, token);
  ok('重读后探索状态持久', after.adventure.completedToday === true && after.adventure.lastResult.nodeId === nodeId);

  console.log(`星图冒险结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
