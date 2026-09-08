'use strict';
/**
 * 《灵汐大陆》家庭小样本模拟试玩 · 2026-09-08
 *
 * 口径：每个年龄段 5 个家庭 → 共 10 个家庭；
 *       每档 5 名孩子（每家 1 孩）+ 10 位家长（每家 2 位），满足"每档 ≥5 孩 ≥5 家长"。
 *
 * 机制部分跑真实代码（不假造）：
 *   - lib/adventure.js：7 日章节、回访、签名事件、随机奇遇、每周任务板
 *   - lib/engine.js  ：缺席判定（默认温和模式）
 * 行为概率是建模假设，集中在 ASSUMPTIONS，可审计可调；结论必须标注为"模拟"而非真实用户。
 */
const fs = require('fs');
const path = require('path');
const A = require('../lib/adventure');
const E = require('../lib/engine');

// ——— 建模假设（唯一需要人工校准的地方）———
const ASSUMPTIONS = {
  '7-9': {
    pDailyFeed: 0.92,     // 每天完成真实习惯并投喂的概率（低龄热情高）
    pOpenAlbum: 0.72,     // 冒险后打开星光相册/任务板的概率
    pSameNode: 0.45,      // 回访时回到最常去地点的概率（低龄更易固化）
    pBossFirstWin: 0.72,  // Boss 首战获胜
    pBossRetry: 0.62,     // 首战失败后 72h 内再试
    pParentView: 0.85,    // 家长打开冒险摘要
    pParentReadOnly: 0.86 // 打开后仅阅读/鼓励、不改规则
  },
  '10-12': {
    pDailyFeed: 0.80,     // 高龄日常完成率略低（学业/自主性）
    pOpenAlbum: 0.58,
    pSameNode: 0.28,      // 更愿意换地点探索
    pBossFirstWin: 0.80,
    pBossRetry: 0.70,
    pParentView: 0.70,
    pParentReadOnly: 0.82
  }
};

const BANDS = [
  { id: '7-9', label: '7-9 岁', families: 5, seedBase: 10007 },
  { id: '10-12', label: '10-12 岁', families: 5, seedBase: 20011 }
];
const SPECIES = ['firam', 'volt', 'tidal', 'night', 'luna', 'mount', 'thorn', 'rime'];
const DAYS = 15;
const FORCE_MISS_DAY = 9;          // D9 全员漏投喂：验证"章节零回退 + 不惩罚"
const START = { y: 2026, m: 8, d: 1 };  // 2026-09-01 起算

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function dayDate(d) { return new Date(START.y, START.m, START.d + d - 1); }

function simulateBand(band) {
  const as = ASSUMPTIONS[band.id];
  const out = [];
  for (let fi = 0; fi < band.families; fi++) {
    const rng = mulberry32(band.seedBase + fi * 7919);
    const family = { config: { absenceMode: 'mercy', holidayMode: false }, ledger: [] };
    const species = SPECIES[(fi + (band.id === '7-9' ? 0 : 4)) % SPECIES.length];
    const child = {
      id: `child-${band.id}-${fi}`, name: `${band.label}·孩子${fi + 1}`,
      pet: { speciesId: species, nickname: species },
      feedDate: null, fainted: false, pausedAt: null,
      level: 1, xp: 0, intimacy: 100, adventure: {}
    };
    const parents = [
      { id: `p-${band.id}-${fi}-a`, relation: '家长A' },
      { id: `p-${band.id}-${fi}-b`, relation: '家长B' }
    ];
    const rec = {
      band: band.id, familyIndex: fi, childId: child.id, species,
      parentCount: parents.length,
      intimacyStart: child.intimacy, levelStart: child.level,
      exploredDays: [], adventureDays: 0, revisitActions: 0, revisitNodes: {},
      albumOpens: 0, missedDays: [], chapterRollback: 0,
      chapterDoneDay: null, d8Return: false, recoveredAfterMiss: false, nextDayReturn: null,
      questSeen: false, questLast: null, absenceNotices: [],
      bossFirstWin: null, bossRetry: null,
      parentViews: 0, parentReadOnly: 0,
      signatures: 0, randomEvents: 0
    };

    for (let d = 1; d <= DAYS; d++) {
      const nowD = dayDate(d);
      const today = E.dateKey(nowD);
      // —— 是否完成当天习惯并投喂 ——
      const fed = d === FORCE_MISS_DAY ? false : rng() < as.pDailyFeed;
      if (fed) child.feedDate = today; else rec.missedDays.push(d);

      // —— 缺席判定走真实引擎（默认温和模式）——
      const ev = E.hungerCheck(family, child, nowD);
      if (ev) rec.absenceNotices.push({ day: d, type: ev.type, days: ev.days, mercy: !!ev.mercy });

      A.ensureState(child);
      const before = child.adventure.completedDays.slice();
      const view = A.adventureView(child, today);
      if (view.weeklyQuest) {
        rec.questSeen = true;
        rec.questLast = { completed: view.weeklyQuest.completed, total: view.weeklyQuest.total };
      }

      let explored = false;
      if (view.available && !view.completedToday && fed) {
        let nodeId = null;
        if (!view.chapterCompleted) {
          const cur = view.nodes.find(n => n.status === 'current');
          nodeId = cur ? cur.id : null;
        } else {
          const visited = child.adventure.visited || [];
          if (visited.length) {
            if (rng() < as.pSameNode) {
              let best = visited[0], bestN = -1;
              for (const id of Object.keys(rec.revisitNodes)) {
                if (rec.revisitNodes[id] > bestN) { bestN = rec.revisitNodes[id]; best = id; }
              }
              nodeId = best;
            } else {
              nodeId = visited[Math.floor(rng() * visited.length)];
            }
          }
        }
        if (nodeId) {
          const res = A.explore(child, nodeId, today);
          if (res && res.ok && !res.repeated) {
            explored = true;
            rec.exploredDays.push(d); rec.adventureDays++;
            if (res.result.mode === 'revisit') {
              rec.revisitActions++;
              rec.revisitNodes[nodeId] = (rec.revisitNodes[nodeId] || 0) + 1;
            }
            if (res.result.signature) rec.signatures++;
            if (res.result.randomEvent) rec.randomEvents++;
            if (rng() < as.pOpenAlbum) rec.albumOpens++;
          }
        }
      }

      // —— 章节零回退校验 ——
      const after = child.adventure.completedDays.slice();
      for (const dd of before) if (!after.includes(dd)) rec.chapterRollback++;
      if (rec.chapterDoneDay === null && after.length >= 7) rec.chapterDoneDay = d;
      // 毕业后"第一个有机会的日子"是否回访（跳过漏投喂日，避免把 D9 强制漏投喂算成流失）
      if (rec.chapterDoneDay !== null && d > rec.chapterDoneDay && rec.nextDayReturn === null && fed) {
        rec.nextDayReturn = explored;
      }
      if (d === 8 && explored) rec.d8Return = true;
      if ((d === 10 || d === 11) && explored && rec.missedDays.includes(FORCE_MISS_DAY)) rec.recoveredAfterMiss = true;

      // —— 家长侧：查看摘要与"只阅读/鼓励"比例 ——
      for (let pi = 0; pi < parents.length; pi++) {
        if (rng() < as.pParentView) {
          rec.parentViews++;
          if (rng() < as.pParentReadOnly) rec.parentReadOnly++;
        }
      }

      // —— Boss 首战（毕业后触发一次）——
      if (rec.bossFirstWin === null && d >= 8) {
        rec.bossFirstWin = rng() < as.pBossFirstWin;
        if (!rec.bossFirstWin) rec.bossRetry = rng() < as.pBossRetry;
      }
    }

    rec.chapterCompleted = child.adventure.completedDays.length >= 7;
    rec.completedDays = child.adventure.completedDays.length;
    rec.intimacyEnd = child.intimacy; rec.levelEnd = child.level;
    rec.intimacyDelta = child.intimacy - rec.intimacyStart;
    rec.levelDelta = child.level - rec.levelStart;
    rec.fainted = !!child.fainted;
    const rv = Object.values(rec.revisitNodes);
    const totalRv = rv.reduce((a, b) => a + b, 0);
    rec.revisitTotal = totalRv;
    rec.distinctRevisitNodes = rv.length;
    rec.revisitConcentration = totalRv ? Math.max(...rv) / totalRv : 0;
    rec.albumRate = rec.adventureDays ? rec.albumOpens / rec.adventureDays : 0;
    rec.signatureEventsDistinct = (child.adventure.signatureEvents || []).length;
    rec.randomEventsDistinct = (child.adventure.randomEvents || []).length;
    out.push(rec);
  }
  return out;
}

function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 : 0; }
function avg(arr) { return arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : 0; }

function aggregate(band, recs) {
  const n = recs.length;
  const doneByD7 = recs.filter(r => r.chapterDoneDay !== null && r.chapterDoneDay <= 7);
  const concentrated = recs.filter(r => r.revisitTotal > 0 && r.distinctRevisitNodes === 1);
  const bossTried = recs.filter(r => r.bossFirstWin !== null);
  const bossRetried = recs.filter(r => r.bossFirstWin === false && r.bossRetry === true);
  const bossFailed = recs.filter(r => r.bossFirstWin === false);
  const m = {
    band: band.id, label: band.label,
    families: n,
    children: n,
    parents: recs.reduce((a, r) => a + r.parentCount, 0),
    // ① D7 完成者在 D8 再进入冒险 ≥55%
    d7Completers: doneByD7.length,
    d8ReturnRate: pct(doneByD7.filter(r => r.d8Return).length, doneByD7.length),
    // ①b 全部毕业者"毕业后第一个有机会的日子"回访率（跳过漏投喂日，分母更大更稳）
    completers: recs.filter(r => r.chapterDoneDay !== null).length,
    nextDayReturnRate: pct(recs.filter(r => r.nextDayReturn === true).length, recs.filter(r => r.nextDayReturn !== null).length),
    // ② D8-D15 人均回访/收藏行动 ≥4 次
    avgRevisit: avg(recs.map(r => r.revisitActions)),
    // ③ 回访仅集中一个地点 <45%
    concentratedRate: pct(concentrated.length, recs.filter(r => r.revisitTotal > 0).length),
    avgDistinctNodes: avg(recs.map(r => r.distinctRevisitNodes)),
    // ④ 冒险后打开相册/任务板 ≥50%
    albumRate: pct(recs.reduce((a, r) => a + r.albumOpens, 0), recs.reduce((a, r) => a + r.adventureDays, 0)),
    // ⑤ 漏一天 48h 内恢复 ≥60% + 章节零回退
    recoveredRate: pct(recs.filter(r => r.recoveredAfterMiss).length, recs.filter(r => r.missedDays.includes(FORCE_MISS_DAY)).length),
    chapterRollback: recs.reduce((a, r) => a + r.chapterRollback, 0),
    // ⑥ 家长仅阅读/鼓励 ≥80%
    parentReadOnlyRate: pct(recs.reduce((a, r) => a + r.parentReadOnly, 0), recs.reduce((a, r) => a + r.parentViews, 0)),
    // Boss
    bossFirstWinRate: pct(bossTried.filter(r => r.bossFirstWin).length, bossTried.length),
    bossRetryRate: pct(bossRetried.length, bossFailed.length),
    // 温和模式保障
    intimacyDelta: recs.reduce((a, r) => a + r.intimacyDelta, 0),
    levelDelta: recs.reduce((a, r) => a + r.levelDelta, 0),
    faintedCount: recs.filter(r => r.fainted).length,
    // 内容消费
    signatures: recs.reduce((a, r) => a + r.signatures, 0),
    signatureEventsDistinct: recs.reduce((a, r) => a + r.signatureEventsDistinct, 0),
    randomEventsDistinct: recs.reduce((a, r) => a + r.randomEventsDistinct, 0),
    randomEvents: recs.reduce((a, r) => a + r.randomEvents, 0),
    questSeen: recs.filter(r => r.questSeen).length,
    chapterCompleted: recs.filter(r => r.chapterCompleted).length
  };
  return m;
}

const THRESHOLDS = [
  { id: 'd8ReturnRate', label: 'D7 完成者在 D8 再进入冒险', op: '>=', target: 55, unit: '%' },
  { id: 'avgRevisit', label: 'D8-D15 人均回访/收藏行动', op: '>=', target: 4, unit: '次' },
  { id: 'concentratedRate', label: '回访仅集中一个地点的比例', op: '<', target: 45, unit: '%' },
  { id: 'albumRate', label: '冒险后打开相册或任务板', op: '>=', target: 50, unit: '%' },
  { id: 'recoveredRate', label: '漏一天后 48h 内恢复探索', op: '>=', target: 60, unit: '%' },
  { id: 'parentReadOnlyRate', label: '家长仅阅读/鼓励不改规则', op: '>=', target: 80, unit: '%' }
];

function judge(m) {
  return THRESHOLDS.map(t => {
    const v = m[t.id];
    const pass = t.op === '>=' ? v >= t.target : v < t.target;
    return { ...t, value: v, pass };
  });
}

// ——— 执行 ———
const all = {};
const rows = [];
for (const band of BANDS) {
  const recs = simulateBand(band);
  const m = aggregate(band, recs);
  all[band.id] = { metrics: m, records: recs, verdict: judge(m) };
  rows.push({ band, m, verdict: all[band.id].verdict });
}

let out = '';
function log(s) { out += s + '\n'; console.log(s); }

log('===== 家庭小样本模拟试玩（10 个家庭 · 15 天）=====');
log('口径：每年龄段 5 个家庭；每家 1 名孩子 + 2 位家长。');
log('机制走真实代码（lib/adventure.js + lib/engine.js），行为概率为建模假设。\n');
for (const { band, m, verdict } of rows) {
  log(`—— ${m.label}｜家庭 ${m.families} · 孩子 ${m.children} 名 · 家长 ${m.parents} 位 ——`);
  log(`  首章完成 ${m.chapterCompleted}/${m.children}（D7 前完成 ${m.d7Completers}）· 见过回访任务板 ${m.questSeen}/${m.children}`);
  log(`  毕业后次日回访率 ${m.nextDayReturnRate}%（完成者 ${m.completers} 人）· 人均回访 ${m.avgRevisit} 次 · 人均去重回访地点 ${m.avgDistinctNodes} 个`);
  log(`  签名事件 ${m.signatureEventsDistinct} 条（触发 ${m.signatures} 次）· 随机奇遇 ${m.randomEventsDistinct} 条（触发 ${m.randomEvents} 次）`);
  log('  指标对照留存计划验收线：');
  for (const v of verdict) {
    log(`    ${v.pass ? '✅' : '⚠️ '} ${v.label}：${v.value}${v.unit}（目标 ${v.op} ${v.target}${v.unit}）`);
  }
  log(`  Boss 首战胜率 ${m.bossFirstWinRate}% · 失败后 72h 内再试 ${m.bossRetryRate}%`);
  log(`  温和模式保障：亲密度变化 ${m.intimacyDelta} · 等级变化 ${m.levelDelta} · 进入休眠茧 ${m.faintedCount} 人（漏投喂 ${'D' + FORCE_MISS_DAY} 全员）`);
  log(`  章节回退次数：${m.chapterRollback}\n`);
}

const failed = rows.flatMap(r => r.verdict.filter(v => !v.pass).map(v => `${r.m.label} - ${v.label}: ${v.value}${v.unit}`));
log(failed.length ? '未达标项：\n  - ' + failed.join('\n  - ') : '全部指标达到留存计划验收线。');

// 输出 JSON 供报告使用
fs.mkdirSync(path.join(__dirname, '..', 'tmpdata'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'tmpdata', 'cohort-result.json'), JSON.stringify(all, null, 2));
