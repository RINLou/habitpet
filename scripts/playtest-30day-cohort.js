// playtest-30day-cohort.js — 三章 21 日主线的 30 天 / 15 家庭试玩
// 机制全部走真实代码（lib/adventure.js + lib/engine.js）；只有"孩子今天来不来"是建模概率，
// 且概率与种子写死，保证可复跑、可审计。
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('../lib/adventure.js');
const E = require('../lib/engine.js');
const { speciesById } = require('../lib/species.js');

const SEED = 20260913;
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);

const DAYS = Number(process.env.PLAYTEST_DAYS || 30);
const MISS_DAY = 9; // 刻意漏投喂日（验证零回退）
const BASE = new Date(2026, 8, 1); // 2026-09-01
const pad = n => String(n).padStart(2, '0');
function dayKey(i) { const d = new Date(2026, 8, 1 + i); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function dayDate(i) { return new Date(2026, 8, 1 + i, 20, 0, 0); }

const SPECIES = ['firam', 'volt', 'tidal', 'night', 'luna', 'mount', 'thorn', 'rime'];
const BANDS = [
  { id: '7-9', homes: 5, feed: 0.93, play: 0.92, revisit: 0.80, bias: 0 },
  { id: '10-12', homes: 5, feed: 0.86, play: 0.85, revisit: 0.70, bias: 1 },
  { id: '13-14', homes: 5, feed: 0.76, play: 0.72, revisit: 0.55, bias: 2 }
];

let seq = 0;
function newChild(familyId, name, speciesId, ageBand) {
  const sp = speciesById(speciesId);
  const stats = {};
  for (const k of ['hp', 'atk', 'def', 'spd', 'res']) stats[k] = 10;
  return {
    id: `c${++seq}`, name, ageBand,
    pet: { speciesId, stats, freePoints: 0, maxHpBonus: 0 },
    xp: 0, level: 1, intimacy: 0, intimacyFrac: 0,
    feedDate: null, feedStreak: 0, fainted: false, faintedAt: null, hungerPenaltyDate: '',
    pausedAt: null, complaints: [], weekEarned: 0, pokedex: [], allowanceLocked: null,
    rules: {}, adventure: {}
  };
}
function newFamily(id, band, strict) {
  return {
    id, band: band.id, strict,
    config: {
      absenceMode: strict ? 'strict' : 'mercy', holidayMode: false,
      feedWindow: { startHour: 19, endHour: 21 },
      baseAllowance: 100, weeklyCap: 0
    },
    rules: { feed: 1, streak: 10 },
    ledger: [], children: []
  };
}

// —— 组建 15 个家庭：三档各 5；其中 3 户多孩；1 户严格缺席 ——
const families = [];
let fid = 0;
BANDS.forEach((band, bi) => {
  for (let h = 0; h < band.homes; h++) {
    fid++;
    const strict = (bi === 1 && h === 0); // 10-12 档第 1 户：家长开启严格模式
    const f = newFamily(`f${fid}`, band, strict);
    const nKids = (bi === 0 && h === 0) || (bi === 1 && h === 1) || (bi === 2 && h === 2) ? 2 : 1;
    for (let k = 0; k < nKids; k++) {
      const sp = SPECIES[(fid * 3 + k) % SPECIES.length];
      f.children.push(newChild(f.id, `${band.id}-${fid}-${k + 1}`, sp, band.id));
    }
    families.push(f);
  }
});

// —— 逐日推进 ——
const MISS_DAY_KEY = dayKey(MISS_DAY - 1);
const log = [];
const metrics = { rollbacks: 0, faintEvents: 0, mercyNotices: 0, strictPenalties: 0, wakes: 0, xpFromExplore: 0, intimacyFromExplore: 0, blockedExploreMessages: [], revisitBlocked: [], weeklySnapshots: [], chapterFinishDays: [], campaignFinishDays: [] };

for (let i = 0; i < DAYS; i++) {
  const today = dayKey(i);
  const now = dayDate(i);
  for (const f of families) {
    const band = BANDS.find(b => b.id === f.band);
    for (const c of f.children) {
      // 1) 缺席检查（真实引擎）
      const hc = E.hungerCheck(f, c, now);
      if (hc) {
        if (hc.type === 'faint') { metrics.faintEvents++; metrics.wakes++; E.revivePet(f, c, null, now); log.push(`D${i + 1} ${c.name}: 进入休眠茧并免费唤醒（严格模式）`); }
        else if (hc.type === 'hungry') { metrics.strictPenalties++; log.push(`D${i + 1} ${c.name}: 严格模式 −10 羁绊（第 ${hc.days} 天）`); }
        else if (hc.type === 'absent') metrics.mercyNotices++;
      }
      // 2) 是否投喂
      const skip = (i + 1) === MISS_DAY;
      const fed = !skip && rng() < band.feed;
      if (fed) {
        c.feedStreak = (c.feedDate === dayKey(i - 1)) ? c.feedStreak + 1 : 1;
        c.feedDate = today;
        E.addIntimacy(c, f.rules.feed); E.addXP(c, f.rules.feed);
        if (c.feedStreak > 0 && c.feedStreak % 7 === 0) { E.addIntimacy(c, f.rules.streak); E.addXP(c, f.rules.streak); }
      }
      // 3) 探索（真实 adventure 引擎）
      const view = A.adventureView(c, today);
      const xpBefore = c.xp, intBefore = c.intimacy;
      const doneBefore = view.completedDays.slice();
      const campaignDone = view.campaign && view.campaign.completed;

      let acted = false;
      if (view.available) {
        const isRevisit = view.chapterCompleted;
        const wantPlay = isRevisit ? rng() < band.revisit : rng() < band.play;
        if (wantPlay) {
          let node = null;
          if (!isRevisit) node = view.nodes.find(n => n.status === 'current');
          else {
            const pool = view.nodes.filter(n => n.available);
            node = pool.length ? pool[Math.floor(rng() * pool.length)] : null;
          }
          if (node) {
            const choices = node.choices || [];
            let idx = band.bias;
            if (rng() < 0.25) idx = Math.floor(rng() * choices.length); // 孩子偶尔换选
            if (idx >= choices.length) idx = choices.length - 1;
            const r = A.explore(c, node.id, today, choices[idx] && choices[idx].id);
            acted = !!(r && r.ok);
            if (!r.ok) metrics.blockedExploreMessages.push(`D${i + 1} ${c.name}: ${r.error}`);
          }
        }
      }
      // 4) 跨章推进（真实引擎：完成当天点亮下一章，次日才能出发）
      const v2 = A.adventureView(c, today);
      if (v2.chapterCompleted && v2.campaign && v2.campaign.nextChapter && !acted) {
        const adv = A.advanceChapter(c, today);
        if (adv.ok) log.push(`D${i + 1} ${c.name}: 点亮 ${adv.chapter.title}`);
      }
      // 5) 口径校验
      const after = A.adventureView(c, today);
      if (campaignDone && after.completedDays.length < doneBefore.length) metrics.rollbacks++;
      if (c.xp - xpBefore !== 0 && !fed) metrics.xpFromExplore++;
      if (c.intimacy - intBefore !== 0 && !fed) metrics.intimacyFromExplore++;
      if (after.chapterCompleted && after.campaign && after.campaign.completed) {
        if (!c._campaignLogged) { c._campaignLogged = true; metrics.campaignFinishDays.push(i + 1); }
      }
    }
  }
  // 每日记录一次三章完成户数
  const doneHomes = families.filter(f => f.children.some(c => { const v = A.adventureView(c, today); return v.campaign && v.campaign.completed; })).length;
  if (doneHomes > 0 && !metrics._firstFull) { metrics._firstFull = i + 1; }
}

// —— 终章后专项：回访任务可达性（真实引擎探针）——
const probe = [];
{
  // 探针必须隔离于 15 户模拟样本：以前用样本本人回访会改变后续汇总，
  // 使同一 seed 的 30 天完成率随探针选人漂移。
  const f = newFamily('probe-weekly', BANDS[0], false);
  const c = newChild('probe-weekly', '周常回访探针', 'luna', '7-9');
  f.children.push(c);
  let progressDay = 0;
  for (let chapterIndex = 0; chapterIndex < A.CHAPTERS.length; chapterIndex++) {
    const chapter = A.CHAPTERS[chapterIndex];
    for (const node of chapter.nodes) {
      const today = dayKey(progressDay++);
      c.feedDate = today;
      const r = A.explore(c, node.id, today, node.choices[0].id);
      if (!r.ok) throw new Error(`周常探针无法完成 ${chapter.id}/D${node.day}: ${r.error}`);
    }
    if (chapterIndex < A.CHAPTERS.length - 1) {
      const advanced = A.advanceChapter(c, dayKey(progressDay - 1));
      if (!advanced.ok) throw new Error(`周常探针无法点亮下一章: ${advanced.error}`);
    }
  }
  const today = dayKey(progressDay);
  c.feedDate = today;
  const sigNode = A.SIGNATURE_BY_SPECIES[c.pet.speciesId].nodeId;
  const attempt = A.explore(c, sigNode, today, null); // 试图回访首章签名地点
  probe.push({ item: '回访首章签名地点（伙伴灯火任务）', node: sigNode, ok: !!attempt.ok, error: attempt.error || null });
  const v = A.adventureView(c, today);
  probe.push({ item: '终章后 weeklyQuest 是否可见', visible: !!v.weeklyQuest, quest: v.weeklyQuest ? v.weeklyQuest.tasks.map(t => `${t.title} ${t.progress}/${t.target}`) : null });
  // 连续 7 天回访，记录同一个窗口内达成度最高的一周，不用跨周后的新周空进度覆盖结果。
  let week = null;
  for (let k = 1; k <= 7; k++) {
    const t = dayKey(DAYS + k);
    c.feedDate = t;
    c.adventure.lastPlayedOn = dayKey(DAYS + k - 1);
    const vv = A.adventureView(c, t);
    const pool = vv.nodes.filter(n => n.available);
    if (pool.length) {
      const node = pool[Math.floor(rng() * pool.length)];
      A.explore(c, node.id, t, (node.choices[0] || {}).id);
    }
    const vv2 = A.adventureView(c, t);
    if (vv2.weeklyQuest && (!week || vv2.weeklyQuest.completed >= week.completed)) week = vv2.weeklyQuest;
  }
  probe.push({ item: '7 日随机回访样本进度（非完成率）', quest: week ? week.tasks.map(t => `${t.title} ${t.progress}/${t.target}${t.done ? '✓' : '✗'}`) : null, completed: week ? `${week.completed}/${week.total}` : null });
}

// —— 专项探针 A：严格模式深路径（连续缺席 → 休眠茧 + 免费唤醒）——
{
  const f = newFamily('probe-strict', BANDS[1], true);
  const c = newChild('probe-strict', '严格模式探针', 'firam', '10-12');
  f.children.push(c);
  c.feedDate = dayKey(0);
  c.intimacy = 100; // 给足羁绊，才能看清严格模式"满 3 天 −10"到底扣没扣
  let atFaint = null;
  const before = { level: c.level, intimacy: c.intimacy, xp: c.xp };
  const timeline = [];
  for (let i = 1; i <= 6; i++) {
    const hc = E.hungerCheck(f, c, dayDate(i));
    timeline.push(`D${i + 1}: ${hc ? hc.type + (hc.days ? '(' + hc.days + '天)' : '') : '无'}`);
    if (hc && hc.type === 'faint') {
      atFaint = { level: c.level, intimacy: c.intimacy, xp: c.xp };
      E.revivePet(f, c, null, dayDate(i));
      break;
    }
  }
  probe.push({
    item: '严格模式连续缺席时间线', timeline,
    fainted: c.fainted ? '仍在休眠茧' : '已唤醒',
    strictPenaltyApplied: before.intimacy - (atFaint ? atFaint.intimacy : c.intimacy),
    reviveFree: !!atFaint && c.level === atFaint.level && c.intimacy === atFaint.intimacy && c.xp === atFaint.xp,
    detail: `初始羁绊 ${before.intimacy} → 满3天 ${atFaint ? atFaint.intimacy : '—'} → 唤醒后 ${c.intimacy}；等级 ${before.level}→${c.level}（唤醒不降级）`
  });
}

// —— 专项探针 B：跨章节奏（完成当日点亮下一章，当日不能出发）——
{
  const f = newFamily('probe-advance', BANDS[0], false);
  const c = newChild('probe-advance', '跨章探针', 'luna', '7-9');
  f.children.push(c);
  const steps = [];
  for (let i = 0; i < 7; i++) {
    const t = dayKey(i); c.feedDate = t;
    const v = A.adventureView(c, t);
    const node = v.nodes.find(n => n.status === 'current');
    if (node) A.explore(c, node.id, t, node.choices[Math.min(1, node.choices.length - 1)].id);
  }
  const doneDay = dayKey(6);
  const v = A.adventureView(c, doneDay);
  const adv = A.advanceChapter(c, doneDay);
  steps.push(`D7 完成首章=${v.chapterCompleted} · 点亮下一章=${!!adv.ok} → ${adv.chapter ? adv.chapter.title : adv.error}`);
  const sameDay = A.explore(c, A.CHAPTERS[1].nodes[0].id, doneDay, A.CHAPTERS[1].nodes[0].choices[0].id);
  steps.push(`同日尝试出发第二章：${sameDay.ok ? (sameDay.repeated ? '返回当日结果（幂等，未推进）' : '成功') : sameDay.error}`);
  const nextDay = dayKey(7); c.feedDate = nextDay;
  const ok2 = A.explore(c, A.CHAPTERS[1].nodes[0].id, nextDay, A.CHAPTERS[1].nodes[0].choices[0].id);
  steps.push(`次日出发第二章：${ok2.ok ? '成功' : ok2.error}`);
  probe.push({ item: '跨章节奏（完成→点亮→次日出发）', steps });
}

// —— 专项探针 C：终章后跨章回访（走完三章再回头看首章签名地点）——
{
  const f = newFamily('probe-cross', BANDS[0], false);
  const c = newChild('probe-cross', '跨章回访探针', 'night', '7-9');
  f.children.push(c);
  let d = 0;
  for (let ch = 0; ch < 3; ch++) {
    for (let k = 0; k < 7; k++) {
      const t = dayKey(d); c.feedDate = t;
      const v = A.adventureView(c, t);
      const node = v.nodes.find(n => n.status === 'current');
      if (node) A.explore(c, node.id, t, node.choices[0].id);
      d++;
    }
    const adv = A.advanceChapter(c, dayKey(d));
    if (!adv.ok) break;
  }
  const t = dayKey(d);
  c.feedDate = t;
  const v = A.adventureView(c, t);
  const sig = A.SIGNATURE_BY_SPECIES[c.pet.speciesId].nodeId;
  const r = A.explore(c, sig, t, null);
  const v2 = A.adventureView(c, t);
  probe.push({
    item: '终章后跨章回访（伙伴灯火）',
    campaignCompleted: !!(v.campaign && v.campaign.completed),
    可回访节点数: v.nodes.length,
    签名地点: sig,
    回访结果: r.ok ? '成功' : r.error,
    weeklyQuest: v2.weeklyQuest ? v2.weeklyQuest.tasks.map(x => `${x.title} ${x.progress}/${x.target}${x.done ? '✓' : '✗'}`) : null
  });
}

// —— 汇总 ——
function bandStats(bandId) {
  const fs2 = families.filter(f => f.band === bandId);
  const kids = fs2.flatMap(f => f.children);
  const last = dayKey(DAYS - 1);
  const ch1 = kids.filter(c => (A.adventureView(c, last).completedChapters || []).some(x => x.chapterId === 'first-starlight')).length;
  const ch3 = kids.filter(c => { const v = A.adventureView(c, last); return v.campaign && v.campaign.completed; }).length;
  const arcs = kids.filter(c => (c.adventure.companionBeats || []).length >= 3).length;
  const lore = kids.map(c => (c.adventure.lorePages || []).length);
  const endings = kids.filter(c => (c.adventure.chapterEndings || []).length >= 1).length;
  const revisits = kids.map(c => (c.adventure.revisitNotes || []).length);
  const faints = kids.filter(c => c.fainted).length;
  const avgLore = (lore.reduce((a, b) => a + b, 0) / lore.length).toFixed(1);
  const avgRev = (revisits.reduce((a, b) => a + b, 0) / revisits.length).toFixed(1);
  const finish = metrics.campaignFinishDays.length;
  return { band: bandId, families: fs2.length, children: kids.length, ch1Done: ch1, ch3Done: ch3, arcs3: arcs, endings, avgLore, avgRevisit: avgRev, faintedNow: faints };
}

const out = {
  meta: { seed: SEED, days: DAYS, missDay: MISS_DAY, generatedAt: new Date().toISOString(), note: '机制走真实 lib/adventure.js + lib/engine.js；出席/回访为建模概率' },
  bands: BANDS.map(b => bandStats(b.id)),
  metrics: {
    chapterRollbacks: metrics.rollbacks,
    faintEvents: metrics.faintEvents,
    mercyNotices: metrics.mercyNotices,
    strictPenalties: metrics.strictPenalties,
    xpChangedByExplore: metrics.xpFromExplore,
    intimacyChangedByExplore: metrics.intimacyFromExplore,
    firstCampaignFinishDay: metrics._firstFull || null,
    campaignFinishDays: metrics.campaignFinishDays
  },
  probe,
  sampleLog: log.slice(-12),
  blockedExplore: metrics.blockedExploreMessages.slice(0, 8)
};

const dir = path.join(__dirname, '..', 'tmpdata');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'playtest-30day-result.json'), JSON.stringify(out, null, 2));

console.log('===== 三章 21 日主线 · 30 天 / 15 家庭试玩 =====');
console.log(`种子 ${SEED} · ${DAYS} 天 · 刻意漏投喂日 D${MISS_DAY}\n`);
console.log('档位      家庭  孩子  首章完成  三章完成  关系线3段  结语  平均残页  平均回访');
for (const b of out.bands) {
  console.log(`${b.band.padEnd(8)}  ${String(b.families).padEnd(4)}  ${String(b.children).padEnd(4)}  ${String(b.ch1Done + '/' + b.children).padEnd(8)}  ${String(b.ch3Done + '/' + b.children).padEnd(8)}  ${String(b.arcs3 + '/' + b.children).padEnd(9)}  ${String(b.endings).padEnd(4)}  ${String(b.avgLore).padEnd(8)}  ${b.avgRevisit}`);
}
console.log('\n—— 硬指标 ——');
console.log(`章节回退次数        ${out.metrics.chapterRollbacks}（目标 0）`);
console.log(`休眠茧发生          ${out.metrics.faintEvents} 次 · 温和提醒 ${out.metrics.mercyNotices} 次 · 严格扣分 ${out.metrics.strictPenalties} 次`);
console.log(`探索导致 XP 变化    ${out.metrics.xpChangedByExplore} 次（目标 0）`);
console.log(`探索导致羁绊变化    ${out.metrics.intimacyChangedByExplore} 次（目标 0）`);
console.log(`首个三章完成日      D${out.metrics.firstCampaignFinishDay || '—'}`);
console.log('\n—— 终章后专项探针 ——');
for (const p of probe) console.log(JSON.stringify(p, null, 1));
console.log('\n结果已写入 tmpdata/playtest-30day-result.json');
