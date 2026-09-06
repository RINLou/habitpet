// test_smoke.js — habitpet 正式版全链路冒烟测试 v3（十项改动后）
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const B = process.env.BASE_URL || 'http://127.0.0.1:3000';
const RND = Math.floor(Math.random()*1000000);
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name, extra !== undefined ? JSON.stringify(extra) : ''); }
  else { fail++; console.log('  ✗ FAIL:', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
async function api(path, body, token) {
  const res = await fetch(B + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) });
  return await res.json();
}

(async () => {
  console.log('== 1 注册/孩子/绑定（绑定码 8 位 30 分钟） ==');
  const reg = await api('/api/register', { username: 'testboss' + RND, password: 'pass123', familyName: '测试家', securityQ: '我的小学叫什么', securityA: '新华小学' });
  ok('注册家庭(含密保)', reg.ok && reg.token);
  const PT = reg.token;
  const dup = await api('/api/register', { username: 'testboss' + RND, password: 'xxxxxx' });
  ok('重复账号被拒', !!dup.error);
  const bad = await api('/api/login', { username: 'testboss' + RND, password: 'wrong' });
  ok('错密码被拒', !!bad.error);

  const add1 = await api('/api/child', { name: '测试娃A', grade: 'G1' }, PT);
  const add2 = await api('/api/child', { name: '测试娃B', grade: 'G2' }, PT);
  ok('添加两个孩子', add1.ok && add2.ok);
  const C1 = add1.childId, C2 = add2.childId;

  const bc = await api('/api/child/bindcode', { childId: C1 }, PT);
  ok('绑定码 8 位', bc.ok && /^[0-9]{8}$/.test(bc.code), bc.code);
  ok('绑定码有效期 30 分钟', bc.expiresIn === 1800, bc.expiresIn);
  const bd = await api('/api/bind', { code: bc.code });
  ok('孩子绑定', bd.ok && bd.token);
  const T1 = bd.token;
  const bd2 = await api('/api/bind', { code: bc.code });
  ok('绑定码一次性', !!bd2.error);
  const bc2 = await api('/api/child/bindcode', { childId: C2 }, PT);
  const T2 = (await api('/api/bind', { code: bc2.code })).token;
  ok('娃B绑定', !!T2);
  const noAuth = await api('/api/family', {});
  ok('无token访问被拒', !!noAuth.error);
  const childAsParent = await api('/api/family', {}, T1);
  ok('孩子token进不了家长端', !!childAsParent.error);

  console.log('== 2 选宠/投喂 ==');
  let me = await api('/api/me', {}, T1);
  ok('孩子状态', me.id === C1);
  const feedNoPet = await api('/api/feed', {}, T1);
  ok('没宠物不能投喂', !!feedNoPet.error);
  const sel = await api('/api/pet/select', { speciesId: 'firam' }, T1);
  ok('娃A选焰狼', sel.ok && sel.state.pet.speciesName.includes('焰狼'));
  const sel2 = await api('/api/pet/select', { speciesId: 'luna' }, T2);
  ok('娃B选灵狐', sel2.ok);
  const selDup = await api('/api/pet/select', { speciesId: 'volt' }, T1);
  ok('学期中不能换宠', !!selDup.error);
  const hour = new Date().getHours();
  await api('/api/config', { feedWindow: { startHour: (hour + 1) % 24, endHour: (hour + 2) % 24 } }, PT);

  const feedWin = await api('/api/feed', {}, T1); // 凌晨测试 → 窗口外
  ok('投喂时段拦截(凌晨)', !!feedWin.error, feedWin.error);
  await api('/api/config', { holidayMode: true }, PT);
  const feed1 = await api('/api/feed', {}, T1);
  ok('假期模式投喂成功 +1', feed1.ok && feed1.intimacy === 101, feed1.intimacy);
  const feed2 = await api('/api/feed', {}, T1);
  ok('每日投喂限1次', !!feed2.error);

  console.log('== 3 申报/审核 ==');
  const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const sub = await api('/api/submit', { type: 'exam', note: '数学 85', evidence: PHOTO }, T1);
  ok('提交考试(带照片)', sub.ok && sub.eventId);
  const subP = await api('/api/submit', { type: 'pride', note: '自己洗碗' }, T1);
  ok('提交自豪', subP.ok);
  const subP2 = await api('/api/submit', { type: 'pride', note: '又洗碗' }, T1);
  ok('自豪每周限1次', !!subP2.error);
  const approve = await api('/api/approve', { eventId: sub.eventId, decision: 'approve' }, PT);
  ok('审核通过 考试+50 → 151', approve.ok && approve.family.children.find(c=>c.id===C1).intimacy === 151);
  const approveP = await api('/api/approve', { eventId: subP.eventId, decision: 'approve' }, PT);
  ok('自豪+10 → 161', approveP.ok && approveP.family.children.find(c=>c.id===C1).intimacy === 161);
  const meAfter = await api('/api/me', {}, T1);
  ok('经验入账 61xp → Lv4', meAfter.pet.xp === 61 && meAfter.pet.level === 4, { xp: meAfter.pet.xp, lv: meAfter.pet.level });
  ok('升级送自由点', meAfter.pet.freePoints === 6, meAfter.pet.freePoints);

  const subQ = await api('/api/submit', { type: 'quiz', note: '单词默写 90%' }, T1);
  const rej = await api('/api/approve', { eventId: subQ.eventId, decision: 'reject', reason: '没到80%' }, PT);
  ok('驳回', rej.ok);
  const photoUnauth = await fetch(B + '/api/photo?id=' + sub.eventId);
  ok('照片无权限不可看', photoUnauth.status === 401);
  const photoWithQueryToken = await fetch(B + '/api/photo?id=' + sub.eventId + '&token=' + PT);
  ok('照片不接受 URL token', photoWithQueryToken.status === 401);
  const photoAuth = await fetch(B + '/api/photo?id=' + sub.eventId, { headers: { Authorization: 'Bearer ' + PT } });
  ok('家长 Bearer token 可看照片', photoAuth.status === 200);
  const other = await api('/api/register', { username: 'photoother' + RND, password: 'pass123', familyName: '照片隔离家' });
  const photoOtherFamily = await fetch(B + '/api/photo?id=' + sub.eventId, { headers: { Authorization: 'Bearer ' + other.token } });
  ok('其他家庭不可读取照片', photoOtherFamily.status === 404);
  const otherFamily = await api('/api/register', { username: 'otherboss' + RND, password: 'pass123', familyName: '其他测试家', securityQ: '我的小学叫什么', securityA: '新华小学' });
  const foreignPhoto = await fetch(B + '/api/photo?id=' + sub.eventId, { headers: { Authorization: 'Bearer ' + otherFamily.token } });
  ok('其他家庭不能读取猜中的照片 ID', foreignPhoto.status === 404, foreignPhoto.status);

  console.log('== 4 手动/投诉（不限次 + 取消/删除/编辑都调分） ==');
  const man = await api('/api/manual', { childId: C1, delta: 100, reason: '主动学习' }, PT);
  ok('手动+100 → 261', man.ok && man.family.children.find(c=>c.id===C1).intimacy === 261);
  const comp = await api('/api/complaint', { childId: C1, source: 'teacher', reason: '上课讲话' }, PT);
  ok('老师投诉 -50 → 211', comp.ok && comp.family.children.find(c=>c.id===C1).intimacy === 211);
  const comp2 = await api('/api/complaint', { childId: C1, source: 'teacher', reason: '又讲话' }, PT);
  ok('第二次投诉成功（不限次）-50 → 161', comp2.ok && comp2.family.children.find(c=>c.id===C1).intimacy === 161);
  // 取消第 2 条 → 退 50
  const cc = await api('/api/complaint/cancel', { childId: C1, recId: comp2.complaintId }, PT);
  ok('取消投诉退分 → 211（留痕）', cc.ok && cc.family.children.find(c=>c.id===C1).intimacy === 211);
  const meCC = await api('/api/me', {}, T1);
  ok('取消后记录仍可查 status=cancelled', meCC.complaints.some(x => x.id === comp2.complaintId && x.status === 'cancelled'));
  const ccRe = await api('/api/complaint/cancel', { childId: C1, recId: comp2.complaintId }, PT);
  ok('重复取消被拒', !!ccRe.error);
  // 删除第 1 条 → 需 PIN，退 50
  const cdNoPin = await api('/api/complaint/delete', { childId: C1, recId: comp.complaintId }, PT);
  ok('删除投诉需 PIN', !!cdNoPin.error);
  const cdBadPin = await api('/api/complaint/delete', { childId: C1, recId: comp.complaintId, pin: '9999' }, PT);
  ok('删除投诉错 PIN 被拒', !!cdBadPin.error);
  const cd = await api('/api/complaint/delete', { childId: C1, recId: comp.complaintId, pin: '1234' }, PT);
  ok('删除投诉退分 → 261', cd.ok && cd.family.children.find(c=>c.id===C1).intimacy === 261);
  // 编辑：新录一条再改扣分 50→20 补差 30
  const comp3 = await api('/api/complaint', { childId: C1, source: 'grandparent', reason: '作业没签' }, PT);
  ok('爷爷奶奶投诉 -50 → 211', comp3.ok && comp3.family.children.find(c=>c.id===C1).intimacy === 211);
  const ce = await api('/api/complaint/edit', { childId: C1, recId: comp3.complaintId, delta: 20, reason: '改判：只漏签一次' }, PT);
  ok('编辑投诉 50→20 补回 30 → 241', ce.ok && ce.family.children.find(c=>c.id===C1).intimacy === 241);
  const ceC = await api('/api/complaint/cancel', { childId: C1, recId: comp3.complaintId }, PT);
  ok('再取消退 20 → 261', ceC.ok && ceC.family.children.find(c=>c.id===C1).intimacy === 261);

  console.log('== 5 对战（AI 分身 + 动态经验） ==');
  const meX0 = await api('/api/me', {}, T1);   // 战前经验基线（§4 的手动加分也计经验）
  const xp0 = meX0.pet.xp;
  const bSib = await api('/api/battle/start', { mode: 'sibling', opponentId: C2 }, T1);
  ok('兄妹1v1开战(对手是AI分身)', bSib.ok && bSib.battle.fighters.length === 2 && bSib.battle.fighters[1].isAI === true);
  const oppLv = bSib.battle.fighters[1].level;
  let bid = bSib.battleId, rounds = 0, last;
  while (rounds++ < 80) {
    const mv = await api('/api/battle/move', { battleId: bid, skillIndex: 0 }, T1);
    if (mv.error) { last = mv; break; }
    if (mv.finished) { last = mv.battle; break; }
  }
  ok('1v1 打完分出胜负(仅娃A出招)', last && last.status === 'finished');
  const meB = await api('/api/me', {}, T1);
  const xpGain = meB.pet.xp - xp0;
  ok('动态对战经验(胜6+对方Lv/负2+对方Lv÷2)', xpGain === 6 + oppLv || xpGain === 2 + Math.floor(oppLv / 2), { xpGain, oppLv });
  ok('对战不碰亲密度', meB.intimacy === 261, meB.intimacy);

  const bSib2 = await api('/api/battle/start', { mode: 'sibling', opponentId: C1 }, T2);
  ok('娃B自己开一场(打娃A AI分身)', bSib2.ok && bSib2.battle.fighters[1].isAI === true);
  let bid1b = bSib2.battleId, r1b = 0, last1b;
  while (r1b++ < 80) {
    const mv = await api('/api/battle/move', { battleId: bid1b, skillIndex: 0 }, T2);
    if (mv.error) { last1b = mv; break; }
    if (mv.finished) { last1b = mv.battle; break; }
  }
  ok('娃B 1v1结算', last1b && last1b.status === 'finished');
  const meB2 = await api('/api/me', {}, T2);
  ok('娃B经验到账(动态)', meB2.pet.xp >= 2, { xp: meB2.pet.xp });

  const bBoss = await api('/api/battle/start', { mode: 'boss' }, T1);
  ok('单人Boss开战', bBoss.ok && bBoss.battle.fighters.length === 2);
  let bid2 = bBoss.battleId, r2 = 0, last2;
  while (r2++ < 80) {
    const mv = await api('/api/battle/move', { battleId: bid2, skillIndex: 0 }, T1);
    if (mv.error) { last2 = mv; break; }
    if (mv.finished) { last2 = mv.battle; break; }
  }
  ok('Boss战结算', last2 && (last2.status === 'finished' || last2.error));

  const bCoop = await api('/api/battle/start', { mode: 'coop', opponentId: C2 }, T1);
  ok('联手Boss开战(娃B以AI分身参战)', bCoop.ok && bCoop.battle.fighters.length === 3 && bCoop.battle.fighters[1].isAI === true);
  let bid3 = bCoop.battleId, r3 = 0, last3;
  while (r3++ < 100) {
    const mv = await api('/api/battle/move', { battleId: bid3, skillIndex: 0 }, T1);
    if (mv.error) { last3 = mv; break; }
    if (mv.finished) { last3 = mv.battle; break; }
  }
  ok('联手Boss结算(仅娃A出招)', last3 && (last3.status === 'finished' || last3.error));

  const lim = await api('/api/config', { battleDailyLimit: 3 }, PT);
  const bLimit = await api('/api/battle/start', { mode: 'boss' }, T1);
  ok('每日场次上限拦截', !!bLimit.error, bLimit.error);

  console.log('== 6 兑换/核销状态机 ==');
  const rd1 = await api('/api/redeem', { rewardId: 'r1' }, T1); // 现金200
  ok('现金兑换锁定下月加成', rd1.ok && rd1.state.allowanceLocked && rd1.state.allowanceLocked.amount === 200);
  ok('下月零花钱 = 基础100+200', rd1.state.nextAllowance === 300, rd1.state.nextAllowance);
  const rdCashSt = rd1.state.redemptions[0];
  ok('现金类直接已核销(不走核销流程)', rdCashSt.status === 'fulfilled', rdCashSt.status);
  const fulCash = await api('/api/fulfill', { redemptionId: rdCashSt.id }, PT);
  ok('现金类重复核销被拒', !!fulCash.error);
  const rdCash2 = await api('/api/redeem', { rewardId: 'r1' }, T1);
  ok('本月现金只能锁一次', !!rdCash2.error);
  const rd2 = await api('/api/redeem', { rewardId: 'r2' }, T1); // 券 30 → 231
  ok('券类兑换 held', rd2.ok && rd2.state.redemptions[0].status === 'held', rd2.state.redemptions[0].status);
  const rq = await api('/api/redeem/request', { redemptionId: rd2.state.redemptions[0].id }, T1);
  ok('孩子申请核销 held→requested', rq.ok);
  const rqDup = await api('/api/redeem/request', { redemptionId: rd2.state.redemptions[0].id }, T1);
  ok('重复申请被拒', !!rqDup.error);
  const ful = await api('/api/fulfill', { redemptionId: rd2.state.redemptions[0].id }, PT);
  ok('家长核销 requested→fulfilled', ful.ok);
  const fulRe = await api('/api/fulfill', { redemptionId: rd2.state.redemptions[0].id }, PT);
  ok('已核销再核销被拒', !!fulRe.error);
  const rdPoor = await api('/api/redeem', { rewardId: 'r4' }, T2); // 娃B亲密度不足
  ok('亲密度不足拦截', !!rdPoor.error);
  // 投诉把娃A打到 0（下限验证），保留 active 供结算测无投诉奖
  const compG = await api('/api/complaint', { childId: C1, source: 'grandparent' }, PT);
  ok('爷爷奶奶投诉-50 触底（下限0）', compG.ok && compG.family.children.find(c=>c.id===C1).intimacy === 0);

  console.log('== 7 加点/改名 ==');
  const meForAlloc = await api('/api/me', {}, T1);
  const atkBefore = meForAlloc.pet.stats.atk;
  const al = await api('/api/pet/allocate', { stat: 'atk', points: 2 }, T1);
  ok('自由加点', al.ok && al.state.pet.stats.atk === atkBefore + 2, al.state.pet.stats.atk);
  const nm = await api('/api/pet/nickname', { nickname: '小星星' }, T1);
  ok('宠物改名', nm.ok && nm.state.pet.nickname === '小星星');

  console.log('== 8 规则修改（每孩子独立+需 PIN）+ 自定义规则 ==');
  const rlNoPin = await api('/api/rules', { childId: C1, exam: 60 }, PT);
  ok('改规则无 PIN 被拒', !!rlNoPin.error);
  const rlBadPin = await api('/api/rules', { childId: C1, exam: 60, pin: '0000' }, PT);
  ok('改规则错 PIN 被拒', !!rlBadPin.error);
  const rl = await api('/api/rules', { childId: C1, exam: 60, pin: '1234' }, PT);
  const c1AfterRl = rl.family.children.find(c => c.id === C1);
  const c2AfterRl = rl.family.children.find(c => c.id === C2);
  ok('改娃A考试分值60', rl.ok && c1AfterRl.rules.exam === 60);
  ok('娃B规则独立不受影响(仍50)', c2AfterRl.rules.exam === 50, c2AfterRl.rules.exam);
  const cr = await api('/api/rules', { childId: C1, customAdd: { name: '帮忙整理书架', delta: 5 }, pin: '1234' }, PT);
  const c1Custom = cr.family.children.find(c => c.id === C1).customRules || [];
  ok('新增娃A自定义快捷项', cr.ok && c1Custom.some(r => r.name === '帮忙整理书架'));
  const crRule = c1Custom.find(r => r.name === '帮忙整理书架');
  const subE2 = await api('/api/submit', { type: 'exam', note: '物理 92' }, T1);
  const ap2 = await api('/api/approve', { eventId: subE2.eventId, decision: 'approve' }, PT);
  ok('按新分值+60 → 60（此前已触底）', ap2.ok && ap2.family.children.find(c=>c.id===C1).intimacy === 60);
  const manRule = await api('/api/manual', { childId: C1, ruleId: crRule.id }, PT);
  ok('快捷项记分 +5 → 65', manRule.ok && manRule.family.children.find(c=>c.id===C1).intimacy === 65);
  const crDel = await api('/api/rules', { childId: C1, customDel: crRule.id, pin: '1234' }, PT);
  ok('删除自定义项', crDel.ok && !(crDel.family.children.find(c=>c.id===C1).customRules || []).some(r => r.id === crRule.id));
  const manRuleGone = await api('/api/manual', { childId: C1, ruleId: crRule.id }, PT);
  ok('已删快捷项不可用', !!manRuleGone.error);

  console.log('== 9 账本撤销（需 PIN） ==');
  const famNow = await api('/api/family', {}, PT);
  const target = famNow.ledger.find(l => l.by === 'parent' && l.delta === 5 && !l.reversed);
  ok('找到快捷项账目', !!target);
  const undoNoPin = await api('/api/ledger/undo', { ledgerId: target.id }, PT);
  ok('撤销无 PIN 被拒', !!undoNoPin.error);
  const undo = await api('/api/ledger/undo', { ledgerId: target.id, pin: '1234' }, PT);
  ok('撤销成功 -5 → 60', undo.ok && undo.family.children.find(c=>c.id===C1).intimacy === 60);
  ok('对冲行已写', undo.family.ledger[0].reason.includes('撤销') && undo.family.ledger[0].delta === -5);
  const undoRe = await api('/api/ledger/undo', { ledgerId: target.id, pin: '1234' }, PT);
  ok('重复撤销被拒', !!undoRe.error);

  console.log('== 10 暂停计 ==');
  const pz = await api('/api/pause', { childId: C2, on: true }, PT);
  ok('开启暂停计', pz.ok);
  const compPaused = await api('/api/complaint', { childId: C2, source: 'teacher' }, PT);
  ok('暂停期间不扣分', !!compPaused.error);
  const pz2 = await api('/api/pause', { childId: C2, on: false }, PT);
  ok('关闭暂停计', pz2.ok);

  console.log('== 10.5 投诉其他来源 + 自定义扣分 ==');
  const compO = await api('/api/complaint', { childId: C1, source: 'other', srcName: '钢琴老师', delta: 30, reason: '练琴态度差' }, PT);
  ok('其他来源自定义扣分-30 → 30', compO.ok && compO.family.children.find(c=>c.id===C1).intimacy === 30);
  const ccO = await api('/api/complaint/cancel', { childId: C1, recId: compO.complaintId }, PT);
  ok('取消其他来源投诉退30 → 60', ccO.ok && ccO.family.children.find(c=>c.id===C1).intimacy === 60);

  console.log('== 11 结算（需 PIN） ==');
  const smNoPin = await api('/api/settle/month', {}, PT);
  ok('月度结算无 PIN 被拒', !!smNoPin.error);
  const sm = await api('/api/settle/month', { pin: '1234' }, PT);
  ok('月度结算完成', sm.ok);
  // 娃A当月有 active 投诉（爷爷奶奶那条）→ 无投诉奖不发 → 100；娃B无投诉 → 100+100=200
  const c1v = sm.family.children.find(c => c.id === C1), c2v = sm.family.children.find(c => c.id === C2);
  ok('有投诉者不加 / 无投诉者+100', c1v.intimacy === 100 && c2v.intimacy === 200, { 娃A: c1v.intimacy, 娃B: c2v.intimacy });
  const ssNoPin = await api('/api/settle/semester', {}, PT);
  ok('学期结算无 PIN 被拒', !!ssNoPin.error);
  const ss = await api('/api/settle/semester', { pin: '1234' }, PT);
  ok('学期结算→图鉴', ss.ok && ss.entries === 2);
  const meNew = await api('/api/me', {}, T1);
  ok('新学期重挑宠物(宠物清空)', meNew.pet === null);
  ok('经验清零等级归1', meNew.level === 1 && meNew.xp === 0, { level: meNew.level, xp: meNew.xp });
  const selNew = await api('/api/pet/select', { speciesId: 'volt' }, T1);
  ok('新学期可选新宠', selNew.ok);

  console.log('== 12 周上限 ==');
  const cap = await api('/api/config', { weeklyCap: 50 }, PT);
  ok('设周上限50', cap.ok && cap.family.config.weeklyCap === 50);
  const over = await api('/api/manual', { childId: C2, delta: 100, reason: '超上限测试' }, PT);
  ok('超周上限加分被拦截', !!over.error, over.error);
  const within = await api('/api/manual', { childId: C2, delta: 30, reason: '范围内加分' }, PT);
  ok('未超上限加分通过 → 230', within.ok && within.family.children.find(c=>c.id===C2).intimacy === 230);

  console.log('== 13 月报（投诉统计改记录数组） ==');
  const rep = await api('/api/report', {}, PT);
  ok('月报生成', rep.ok && rep.text.includes('月报'));

  console.log('== 14 PIN ==');
  const pv = await api('/api/pin/verify', { pin: '1234' }, PT);
  ok('默认PIN可过', pv.ok && pv.pinChanged === false);
  const pc = await api('/api/pin/change', { oldPin: '1234', newPin: '888888' }, PT);
  ok('改PIN', pc.ok);
  const pv2 = await api('/api/pin/verify', { pin: '888888' }, PT);
  ok('新PIN生效', pv2.ok);
  const rlNew = await api('/api/rules', { feed: 1, pin: '888888' }, PT);
  ok('敏感操作可用新 PIN', rlNew.ok);

  console.log('== 14.5 孩子编辑 ==');
  const ce1 = await api('/api/child/edit', { childId: C2, name: '测试娃B改', grade: 'G2改' }, PT);
  ok('编辑孩子信息', ce1.ok && ce1.family.children.find(c=>c.id===C2).name === '测试娃B改');
  const ceBack = await api('/api/child/edit', { childId: C2, name: '测试娃B', grade: 'G2' }, PT);
  ok('改回名字', ceBack.ok);

  console.log('== 14.6 密保找回密码/PIN ==');
  const fqBad = await api('/api/forgot/question', { username: 'nosuch' + RND });
  ok('不存在账号找不到问题', !!fqBad.error);
  const fq = await api('/api/forgot/question', { username: 'testboss' + RND });
  ok('拿到密保问题', fq.ok && fq.question.includes('小学'), fq.question);
  const frBad = await api('/api/forgot/reset', { username: 'testboss' + RND, answer: '错的答案', mode: 'pin', value: '5678' });
  ok('密保答案错误被拒', !!frBad.error);
  const fr = await api('/api/forgot/reset', { username: 'testboss' + RND, answer: '新华小学', mode: 'pin', value: '5678' });
  ok('答对重置 PIN', fr.ok);
  const pvN = await api('/api/pin/verify', { pin: '5678' }, PT);
  ok('重置后的 PIN 生效', pvN.ok);
  const frPw = await api('/api/forgot/reset', { username: 'testboss' + RND, answer: '新华小学', mode: 'password', value: 'newpass99' });
  ok('重置登录密码', frPw.ok);
  const lgN = await api('/api/login', { username: 'testboss' + RND, password: 'newpass99' });
  ok('新密码可登录', lgN.ok);

  console.log('== 14.7 好友/对战码/跨家庭对战 ==');
  await api('/api/config', { battleDailyLimit: 99 }, PT);
  const regF2 = await api('/api/register', { username: 'friend' + RND, password: 'pass123', familyName: '朋友家' });
  const PT2 = regF2.token;
  const addF2 = await api('/api/child', { name: '小明', grade: '初一' }, PT2);
  const CF2 = addF2.childId;
  const bdF2 = await api('/api/child/bindcode', { childId: CF2 }, PT2);
  const TF2 = (await api('/api/bind', { code: bdF2.code })).token;
  const selF2 = await api('/api/pet/select', { speciesId: 'rime' }, TF2);
  ok('朋友家孩子选宠', selF2.ok);
  const me1 = await api('/api/me', {}, T1);
  const code1 = me1.friendCode;
  ok('对战码 6 位', /^\d{6}$/.test(code1), code1);
  const meF2v0 = await api('/api/me', {}, TF2);
  const code2 = meF2v0.friendCode;
  ok('两家对战码不同', code1 !== code2);
  const fAdd = await api('/api/friend/add', { code: code2 }, T1);
  ok('输码加好友(双向)', fAdd.ok && fAdd.friend && fAdd.friend.childId === CF2);
  const meF2v = await api('/api/me', {}, TF2);
  ok('对方好友列表也有我', (meF2v.friends || []).some(x => x.childId === C1));
  const fDup = await api('/api/friend/add', { code: code2 }, T1);
  ok('重复加好友被拒', !!fDup.error);
  const inv = await api('/api/battle/invite', { code: code2 }, T1);
  ok('发起对战邀请', inv.ok && inv.inviteId);
  const meF2i = await api('/api/me', {}, TF2);
  ok('对方收到邀请', (meF2i.invites || []).some(x => x.id === inv.inviteId));
  const acc = await api('/api/battle/invite/accept', { inviteId: inv.inviteId }, TF2);
  ok('应战开局(双方真人 friend 模式)', acc.ok && acc.battle.mode === 'friend' && acc.battle.fighters.every(f => !f.isAI));
  const fbid = acc.battleId;
  let fbLast = null, fbRounds = 0;
  while (fbRounds++ < 150) {
    const stq = await api('/api/battle/state', { battleId: fbid }, T1);
    if (stq.error) { fbLast = stq; break; }
    if (stq.battle.status === 'finished') { fbLast = stq.battle; break; }
    const mover = stq.battle.fighters[stq.battle.turn];
    const curT = mover.childId === C1 ? T1 : TF2;
    const mv = await api('/api/battle/move', { battleId: fbid, skillIndex: 0 }, curT);
    if (mv.error) { fbLast = mv; break; }
    if (mv.finished) { fbLast = mv.battle; break; }
  }
  ok('好友对战打完(双方轮流出招)', fbLast && fbLast.status === 'finished');
  const meAf = await api('/api/me', {}, T1);
  ok('好友对战经验到账', meAf.pet.xp > 0, meAf.pet.xp);
  const inv2 = await api('/api/battle/invite', { code: code2 }, T1);
  const dec = await api('/api/battle/invite/decline', { inviteId: inv2.inviteId }, TF2);
  ok('拒绝邀请', dec.ok);
  const fDel = await api('/api/friend/del', { familyId: regF2.family.id, childId: CF2 }, T1);
  ok('删好友(双向清除)', fDel.ok && !(fDel.state.friends || []).some(x => x.childId === CF2));
  const meF2After = await api('/api/me', {}, TF2);
  ok('对方好友列表同步清除', !(meF2After.friends || []).some(x => x.childId === C1));

  console.log('== 15 解绑设备（孩子端长会话/家长端短会话） ==');
  const famDev = await api('/api/family', {}, PT);
  const devC1 = famDev.children.find(c => c.id === C1);
  ok('设备数可见', typeof devC1.devices === 'number' && devC1.devices >= 1, devC1.devices);
  const ub = await api('/api/child/unbind', { childId: C1 }, PT);
  ok('解绑娃A设备', ub.ok && ub.revoked >= 1, ub.revoked);
  const meGone = await api('/api/me', {}, T1);
  ok('被解绑的 token 立即失效', !!meGone.error);
  const meT2 = await api('/api/me', {}, T2);
  ok('娃B登录不受影响', meT2.id === C2);

  console.log('== 15.5 孩子删除（含最后一个孩子守卫） ==');
  const addT = await api('/api/child', { name: '三宝', grade: '一年级' }, PT);
  const C3 = addT.childId;
  const bcT = await api('/api/child/bindcode', { childId: C3 }, PT);
  const T3 = (await api('/api/bind', { code: bcT.code })).token;
  const cdNoPin2 = await api('/api/child/delete', { childId: C3 }, PT);
  ok('删除孩子需 PIN', !!cdNoPin2.error);
  const cdOk = await api('/api/child/delete', { childId: C3, pin: '5678' }, PT);
  ok('删除孩子成功', cdOk.ok && !cdOk.family.children.find(c=>c.id===C3));
  const meT3 = await api('/api/me', {}, T3);
  ok('被删孩子的会话已吊销', !!meT3.error);
  const cdC2 = await api('/api/child/delete', { childId: C2, pin: '5678' }, PT);
  ok('删除娃B（还剩娃A一个）', cdC2.ok);
  const cdLast = await api('/api/child/delete', { childId: C1, pin: '5678' }, PT);
  ok('最后一个孩子不可删', !!cdLast.error, cdLast.error);

  console.log('== 16a 饿死/复活/加成/隐藏宠资格（单元直测） ==');
  {
    const storeU = require('./lib/store');
    const engineU = require('./lib/engine');
    storeU.load();
    const frH = storeU.createFamily('hunger' + RND, 'pass123', '饿肚家', 'q', 'a');
    const famH = frH.family;
    const cH = storeU.addChild(famH, '饿宝', '三年级');
    cH.pet = { speciesId: 'firam', nickname: '焰狼', stats: { atk: 12, def: 8, hp: 10, spd: 10, wis: 8 }, freePoints: 0, skills: ['f1', 'f2', 'f3', 'f4'], maxHpBonus: 0 };
    cH.feedDate = engineU.dateKey(new Date(Date.now() - 4 * 86400000));
    const ev1 = engineU.hungerCheck(famH, cH);
    ok('4天没投喂触发饿肚子', !!ev1 && ev1.type === 'hungry');
    ok('一次性-10 → 90', cH.intimacy === 90, cH.intimacy);
    ok('同轮不重复扣', engineU.hungerCheck(famH, cH) === null);
    cH.feedDate = engineU.dateKey(new Date(Date.now() - 6 * 86400000));
    const ev2 = engineU.hungerCheck(famH, cH);
    ok('5天+饿晕', !!ev2 && ev2.type === 'faint' && cH.fainted === true);
    const rv1 = engineU.revivePet(famH, cH, 'intimacy');
    ok('扣50亲密度复活 → 40', rv1.ok && cH.intimacy === 40 && !cH.fainted, cH.intimacy);
    cH.xp = engineU.xpForLevel(12); cH.level = 12; cH.fainted = true;
    const rv2 = engineU.revivePet(famH, cH, 'level');
    ok('降5级复活 Lv12→Lv7', rv2.ok && cH.level === 7, cH.level);
    ok('复活当天算吃过饭', engineU.daysSince(cH.feedDate) === 0);
    cH.feedDate = engineU.dateKey(new Date(Date.now() - 9 * 86400000));
    cH.pausedAt = Date.now();
    ok('暂停计冻结饥饿', engineU.hungerCheck(famH, cH) === null);
    cH.pausedAt = null; famH.config.holidayMode = true;
    ok('假期模式冻结饥饿', engineU.hungerCheck(famH, cH) === null);
    famH.config.holidayMode = false;
    const b4 = cH.intimacy;
    cH.level = 20; cH.xp = engineU.xpForLevel(20);
    engineU.addIntimacy(cH, 100);
    ok('觉醒+3%加成 100→103', cH.intimacy === b4 + 103, { b4, after: cH.intimacy });
    ok('未觉醒无S/SS资格', engineU.hiddenPetEligibility(cH).s === false && engineU.hiddenPetEligibility(cH).ss === false);
    cH.awakenedSemesters.push(1, 2);
    const elg = engineU.hiddenPetEligibility(cH);
    ok('连续两学期觉醒 → S+SS 资格', elg.s === true && elg.ss === true, elg);
    const hiddenSpecies = require('./lib/species').SPECIES.filter(s => s.hidden);
    ok('S/SS 隐藏种族存在', hiddenSpecies.length === 2 && hiddenSpecies.every(s => s.tier === 'S' || s.tier === 'SS'));
  }

  console.log('== 16 迁移幂等（重复 migrate 不改数据） ==');
  const DB_FILE = path.join(__dirname, 'data', 'habitpet.json');
  const countCp = d => Object.values(d.families || {}).flatMap(f => Object.values(f.children || {})).reduce((n, c) => n + (Array.isArray(c.complaints) ? c.complaints.length : 0), 0);
  const ledgerIds = d => Object.values(d.families || {}).flatMap(f => (f.ledger || []).map(l => l.id)).sort().join(',');
  const redStatus = d => Object.values(d.families || {}).flatMap(f => Object.values(f.children || {})).flatMap(c => (c.redemptions || []).map(r => r.id + ':' + r.status)).sort().join(',');
  const MIGRATE = "const s=require('./lib/store'); s.load(); s.saveNow();";
  execFileSync(process.execPath, ['-e', MIGRATE], { cwd: __dirname });
  const snap1 = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  execFileSync(process.execPath, ['-e', MIGRATE], { cwd: __dirname });
  const snap2 = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  ok('schema v5', snap1.schemaVersion === 5 && snap2.schemaVersion === 5);
  ok('投诉记录数不变', countCp(snap1) === countCp(snap2), { m1: countCp(snap1), m2: countCp(snap2) });
  ok('账本 id 集不变', ledgerIds(snap1) === ledgerIds(snap2));
  ok('兑换状态集不变', redStatus(snap1) === redStatus(snap2));
  const v5fields = d => Object.values(d.families || {}).flatMap(f => Object.values(f.children || {}));
  ok('迁移补齐 onboarding/returnNudge', v5fields(snap2).every(c =>
    c.onboarding && ['not_started', 'active', 'completed', 'expired'].includes(c.onboarding.status)
    && Array.isArray(c.onboarding.completedOn) && Array.isArray(c.onboarding.history)
    && c.returnNudge && (c.returnNudge.lastShownForGap === null || typeof c.returnNudge.lastShownForGap === 'string')));
  ok('迁移保留 rules/pending/feedStreak', v5fields(snap2).every(c =>
    !!c.rules && Array.isArray(c.pending) && typeof c.feedStreak === 'number'));

  console.log('== 17 随机灵汐事件（心光雨；服务端以 HABITPET_NO_RANDOM=1 启动 → RNG 固定 0.99，chance=1 必触发） ==');
  {
    const rcSet = await api('/api/config', { randomEventChance: 1 }, PT);
    ok('家长可配置随机事件概率', !rcSet.error);
    const nc = await api('/api/child', { name: '三宝' }, PT);
    const bcN = await api('/api/child/bindcode', { childId: nc.childId }, PT);
    const TN = (await api('/api/bind', { code: bcN.code })).token;
    const selN = await api('/api/pet/select', { speciesId: 'volt' }, TN);
    ok('三宝选雷隼', selN.ok);
    const fd = await api('/api/feed', {}, TN);
    ok('随机事件触发（chance=1）', fd.ok && fd.feedEvent && !!fd.feedEvent.name, fd.feedEvent && fd.feedEvent.name);
    ok('事件带奖励数值', fd.feedEvent && (fd.feedEvent.xp > 0 || fd.feedEvent.intimacy > 0), fd.feedEvent);
    ok('奇遇写入账本', (await api('/api/family', {}, PT)).ledger.some(l => l.reason.includes('灵汐奇遇')));
    ok('概率归零可关闭', !(await api('/api/config', { randomEventChance: 0 }, PT)).error);
  }

  console.log('== 18 本地优先同步（v10：/api/sync/full + /api/battle/finish） ==');
  {
    // 自包含独立家庭，不依赖前序 section 的状态
    const regX = await api('/api/register', { username: 'syncboss' + RND, password: 'pass123', familyName: '同步测试家' });
    const PX = regX.token;
    const addX = await api('/api/child', { name: '同步娃', grade: 'G3' }, PX);
    const bcX = await api('/api/child/bindcode', { childId: addX.childId }, PX);
    const TX = (await api('/api/bind', { code: bcX.code })).token;
    await api('/api/pet/select', { speciesId: 'firam' }, TX);

    const sfP = await api('/api/sync/full', {}, PX);
    ok('家长拉全量快照', sfP.ok && sfP.family && sfP.family.id);
    ok('快照已脱敏（无密码/PIN 哈希）', !sfP.family.parent.salt && !sfP.family.parent.hash && !sfP.family.parent.pinHash && !sfP.family.parent.securityASalt);
    const sfC = await api('/api/sync/full', {}, TX);
    ok('孩子拉全量快照（含宠物）', sfC.ok && sfC.family.children[addX.childId] && !!sfC.family.children[addX.childId].pet);
    const sfNo = await api('/api/sync/full', {});
    ok('未登录拉快照被拒', !!sfNo.error);
    // 对战结算：服务端重算经验（胜 6+对方等级），新家庭无历史消耗 → 实发 16
    const fin = await api('/api/battle/finish', { battleId: 'bt_local_test', mode: 'boss', oppLevel: 10, win: true }, TX);
    ok('本地对战云端结算（胜 6+10）', fin.ok && fin.xp === 16, fin.xp);
    const famLed = (await api('/api/family', {}, PX)).ledger;
    ok('结算写入账本', famLed.some(l => l.reason.includes('Boss挑战')));
    const badMode = await api('/api/battle/finish', { battleId: 'x', mode: 'friend', oppLevel: 5, win: true }, TX);
    ok('好友对战不走本地结算通道', !!badMode.error);
    const badLv = await api('/api/battle/finish', { battleId: 'y', mode: 'boss', oppLevel: 9999, win: true }, TX);
    // 9999 钳到 80 → 名义 86，但每日经验上限 30，首场已发 16 → 实发 14
    ok('异常等级被钳制 + 每日经验上限生效', badLv.ok && badLv.xp === 14 && badLv.capped, badLv.xp);
  }

  console.log('== 18 P1 微习惯计划 + 温和回归（子进程时间旅行，规格验收） ==');
  {
    const run = (phase, offset, args) => {
      let out = '';
      try {
        out = execFileSync(process.execPath, ['test_p1_worker.js', phase, ...(args || [])], {
          cwd: __dirname, encoding: 'utf8', timeout: 90000,
          env: { ...process.env, P1_PORT: '3998', P1_OFFSET: String(offset) }
        });
      } catch (e) {
        out = (e.stdout || '') + '\nP1CRASH ' + String(e.message).slice(0, 200);
      }
      const line = out.split('\n').find(l => l.startsWith('P1RESULT '));
      return line ? JSON.parse(line.slice(9)) : { crash: out.slice(0, 200) };
    };
    const a = run('day1', 0);
    ok('迁移:新孩子 onboarding/returnNudge 就位', a.migrated === true, a.crash);
    ok('非法模板被拒', a.badPlanRejected === true);
    ok('稍后再说生效(当日不再打扰)', a.dismissOk === true);
    ok('开始计划(第1天)', a.started === true);
    ok('active 重复 start 409', a.dupStart409 === true);
    ok('active 时 dismiss 409', a.dismissWhileActive409 === true);
    ok('当天完成小步', a.day1Complete === true);
    ok('重复完成幂等(不追加)', a.completeIdempotent === true);
    ok('家长 token 调孩子端点 401', a.parentToken401 === true);
    ok('状态归属本人', a.stateSelf === true);
    const b = run('day7', 6, [a.username, String(a.childId)]);
    ok('重启服务器后计划仍在(持久化)', b.persistedActive === true, b.crash);
    ok('第7自然日完成→completed', b.day7Completed === true);
    ok('亲密度/XP/feedStreak 全不变(红线)', b.noScoreChange === true);
    ok('账本零改动(红线)', b.ledgerUntouched === true);
    ok('周期摘要归档(history)', b.historyArchived === true);
    const c = run('expired', 0);
    ok('第8日读取惰性滚转 expired', c.rolledExpired === true, c.crash);
    ok('expired 后 complete 409', c.completeAfterExpiry409 === true);
    ok('重新开始(旧周期已归档)', c.restartOk === true);
    ok('再次漏完→expired,history≤3', c.expiredAgain === true && c.historyCapped === true);
    const d = run('missed', 0);
    ok('漏日不可补填,当日可完成', d.missedNotBackfilled === true, d.crash);
    const e = run('nudge', 0);
    ok('≥3个自然日未访问→回归提示', e.nudgeShown === true, e.crash);
    ok('ack 后同 gap 不再提示', e.noRepeatAfterAck === true);
    ok('旧 gapKey ack 409', e.staleAck409 === true);
    ok('坏 gapKey ack 409', e.badKey409 === true);
    ok('少于3天不提示', e.lessThan3DaysNoNudge === true);
  }

  console.log(`\n========== 结果：${pass} 通过 / ${fail} 失败 ==========`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试崩溃:', e); process.exit(1); });
