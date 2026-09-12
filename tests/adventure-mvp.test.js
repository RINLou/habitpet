// adventure-mvp.test.js — 7 日星图章节、叙事选择、灵伴关系与随机奇遇回归
'use strict';
const B = process.env.BASE_URL || 'http://127.0.0.1:3000';
const RND = Math.floor(Math.random() * 1000000);
const adventure = require('../lib/adventure');
const adventureUmd = require('../public/lib/adventure.umd');
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
  ok('离线星图模块与服务端三章定义一致', JSON.stringify(adventureUmd.CHAPTERS) === JSON.stringify(adventure.CHAPTERS));
  const child = { id: 'unit-child', pet: { speciesId: 'firam' }, feedDate: '', xp: 17, intimacy: 222, ledger: { balance: 9 } };
  const before = { xp: child.xp, intimacy: child.intimacy, ledger: child.ledger.balance };
  for (let i = 0; i < 7; i++) {
    const day = `2026-01-0${i + 1}`;
    child.feedDate = day;
    const node = adventure.NODE_CATALOG[i];
    const choice = node.choices[i === 6 ? 2 : i % 2];
    const r = adventure.explore(child, node.id, day, choice.id);
    ok(`第 ${i + 1} 日章节探索`, r.ok && r.result.day === i + 1 && r.result.choice.id === choice.id);
  }
  const a = adventure.ensureState(child);
  ok('七日章节完成', a.completedDays.length === 7 && !!a.chapterCompletedAt && a.chapterCompletions.length === 1);
  ok('普通灵伴签名事件记录', a.signatureEvents.some(x => (x.speciesId || x) === 'firam'));
  ok('七日选择和旧星历均落盘', a.storyChoices.length === 7 && a.lorePages.length === 7);
  ok('章节结语由终点选择决定', a.chapterEnding && a.chapterEnding.id === 'return' && a.chapterCompletions[0].endingId === 'return');
  ok('灵伴三段关系线记录', a.companionBeats.length === 3 && a.companionBeats.every(x => x.speciesId === 'firam'));
  ok('章节探索不改数值', child.xp === before.xp && child.intimacy === before.intimacy && child.ledger.balance === before.ledger);
  ok('随机事件结果可复现', JSON.stringify(adventure.randomEventFor('unit-child', '2026-01-01', 'starlight-gate')) === JSON.stringify(adventure.randomEventFor('unit-child', '2026-01-01', 'starlight-gate')));
  const legacy = { adventure: { chapterDay: 1, completedDays: [] } };
  const legacyState = adventure.ensureState(legacy);
  ok('旧冒险数据迁移叙事默认字段', Array.isArray(legacyState.storyChoices) && Array.isArray(legacyState.lorePages) && legacyState.chapterEnding === null);
  const allArcEntries = Object.keys(adventure.COMPANION_ARCS).every(sid => {
    const childForArc = { pet: { speciesId: sid } };
    const diffDay = adventure.COMPANION_ARCS[sid].differenceDay;
    return ['meet', 'difference', 'resolve'].every((phase, index) => adventure.companionBeatFor(childForArc, adventure.NODE_CATALOG[index === 0 ? 0 : index === 1 ? diffDay - 1 : 6]).phase === phase);
  });
  ok('八只普通灵伴均有三段关系入口', allArcEntries);
})();

// 三章主线：每章七日、完成后显式点亮下一章；全程不改变数值。
(() => {
  const child = { id: 'campaign-child', pet: { speciesId: 'volt' }, xp: 31, intimacy: 188 };
  const before = { xp: child.xp, intimacy: child.intimacy };
  let dayNo = 0;
  adventure.CHAPTERS.forEach((chapter, chapterIndex) => {
    chapter.nodes.forEach((node, nodeIndex) => {
      dayNo++;
      const today = `2026-02-${String(dayNo).padStart(2, '0')}`;
      child.feedDate = today;
      const choice = node.choices[nodeIndex === chapter.nodes.length - 1 ? 0 : nodeIndex % 2];
      const result = adventure.explore(child, node.id, today, choice.id);
      ok(`${chapter.title} D${node.day} 可完成`, result.ok && result.result.chapterId === chapter.id);
    });
    const state = adventure.ensureState(child);
    ok(`${chapter.title} 结语与章节记录落盘`, state.chapterId === chapter.id && state.chapterCompletedAt && state.chapterCompletions.some(x => x.chapterId === chapter.id) && state.chapterEndings.some(x => x.chapterId === chapter.id));
    if (chapterIndex < adventure.CHAPTERS.length - 1) {
      const advanced = adventure.advanceChapter(child, `2026-02-${String(dayNo).padStart(2, '0')}`);
      ok(`${chapter.title} 可显式点亮下一章`, advanced.ok && advanced.chapter.id === adventure.CHAPTERS[chapterIndex + 1].id);
    }
  });
  const view = adventure.adventureView(child, `2026-02-${String(dayNo + 1).padStart(2, '0')}`);
  ok('三章二十一日主线全部完成', view.campaign.completed && view.campaign.completedChapters.length === 3 && view.story.lorePages.length === 21 && view.story.chapterEndings.length === 3);
  ok('终章后不再允许点亮下一章', !!adventure.advanceChapter(child, '2026-02-22').error);
  const revisitDay = '2026-02-22';
  child.feedDate = revisitDay;
  const beforeRevisit = adventure.adventureView(child, revisitDay);
  ok('终章后星图展示全部 21 个已访问节点', beforeRevisit.nodes.length === 21 && beforeRevisit.nodes.every(n => n.status === 'revisit'));
  const signatureNodeId = adventure.SIGNATURE_BY_SPECIES.volt.nodeId;
  const revisit = adventure.explore(child, signatureNodeId, revisitDay, undefined);
  const afterRevisit = adventure.adventureView(child, revisitDay);
  ok('终章后可回访首章签名地点并推进伙伴灯火', revisit.ok && afterRevisit.weeklyQuest && afterRevisit.weeklyQuest.tasks.find(t => t.id === 'signature-lamp').done);
  const echoTask = afterRevisit.weeklyQuest && afterRevisit.weeklyQuest.tasks.find(t => t.id === 'echo-1');
  ok('回声邮局首发目标为一次奇遇', !!echoTask && echoTask.target === 1);
  ok('三章主线不改变数值', child.xp === before.xp && child.intimacy === before.intimacy);
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
  const prematureAdvance = await api('/api/adventure/advance', {}, token);
  ok('未完成章节不可点亮下一章', !!prematureAdvance.error && prematureAdvance.state && prematureAdvance.state.adventure.campaign.currentIndex === 1);
  ok('未投喂前星图不可出发', before.adventure && before.adventure.available === false);
  const locked = await api('/api/adventure/explore', { nodeId: 'starlight-gate' }, token);
  ok('未投喂探索被拦截', !!locked.error && locked.state && locked.state.adventure.available === false);

  const fed = await api('/api/feed', {}, token);
  const nodeId = fed.state.adventure.nodes[0].id;
  const intimacy = fed.state.intimacy, xp = fed.state.xp;
  ok('投喂后首日节点可出发', fed.state.adventure.available === true && fed.state.adventure.nodes[0].status === 'current');
  ok('当前节点提供故事与分支', fed.state.adventure.nodes[0].intro && fed.state.adventure.nodes[0].choices.length === 2);
  const wrong = await api('/api/adventure/explore', { nodeId: 'moon-tide' }, token);
  ok('不能跳过章节节点', !!wrong.error && wrong.state && wrong.state.adventure.completedDays.length === 0);
  const forged = await api('/api/adventure/explore', { nodeId, choiceId: 'not-a-choice' }, token);
  ok('服务端拒绝伪造剧情选择', !!forged.error && forged.state && forged.state.adventure.completedDays.length === 0);
  const explored = await api('/api/adventure/explore', { nodeId, choiceId: 'follow-spark' }, token);
  ok('选择首日节点成功', explored.ok && explored.result && explored.state.adventure.completedToday === true);
  ok('选择、旧星历与灵伴初见写入', explored.result.choice.id === 'follow-spark' && explored.state.adventure.story.choices.length === 1 && explored.state.adventure.story.lorePages.length === 1 && explored.state.adventure.story.companionBeats.length === 1);
  ok('探索不改亲密度/经验', explored.state.intimacy === intimacy && explored.state.xp === xp);
  ok('探索记录写入', explored.state.adventure.visited.includes(nodeId) && explored.state.adventure.lastResult.nodeId === nodeId);
  const repeat = await api('/api/adventure/explore', { nodeId: 'moon-tide', choiceId: 'return-shell' }, token);
  ok('当天第二次探索幂等返回', repeat.ok && repeat.repeated === true && repeat.result.nodeId === nodeId);
  const after = await api('/api/me', {}, token);
  ok('重读后探索状态持久', after.adventure.completedToday === true && after.adventure.lastResult.nodeId === nodeId && after.adventure.story.choices[0].choiceId === 'follow-spark');

  console.log(`星图冒险结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
